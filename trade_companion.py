import json
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

JOURNAL_LIMIT = 50
ACCOUNT_FILE_KEYS = {
    "portfolio": ("PORTFOLIO_STATE_FILE", "memory/PORTFOLIO_STATE.json"),
    "plan": ("ALPACA_AUTOTRADE_PLAN_FILE", "memory/EXECUTION_PLAN.json"),
    "decisions": ("ALPACA_AUTOTRADE_ACTION_LOG", "memory/DECISIONS.jsonl"),
    "lock": ("DRAWDOWN_LOCK_FILE", "memory/DRAWDOWN_LOCK.json"),
    "peakEquity": ("PEAK_EQUITY_FILE", "memory/PEAK_EQUITY.json"),
    "paper": ("PAPER_TEST_STATUS_FILE", "memory/PAPER_TEST_STATUS.json"),
    "objective": ("OBJECTIVE_OUTPUT_FILE", "memory/OBJECTIVE_EVALUATION.json"),
    "vision": ("MARKET_VISION_JSON", "memory/MARKET_VISION.json"),
    "health": ("DATA_HEALTH_OUTPUT_FILE", "memory/DATA_HEALTH.json"),
    "walkForward": ("WALK_FORWARD_OUTPUT_FILE", "memory/WALK_FORWARD_STRESS.json"),
    "journal": ("JOURNAL_FILE", "journals/trades.jsonl"),
    "leaders": ("PELOSI_OUTPUT_FILE", "memory/PELOSI_DISCLOSURES.json"),
}
PAPER_TRADING_URL = "https://paper-api.alpaca.markets"
TRADINGVIEW_REVIEW_PATH = ("memory", "TRADINGVIEW_REVIEW.json")
TRADINGVIEW_CHART_DIR = ("memory", "tradingview")
CHART_SYMBOL = re.compile(r"[A-Z][A-Z0-9.\-]{0,9}")
SCHEDULER_LOG_PATH = ("logs", "scheduler.log")
ROUTINE_RUN_LIMIT = 12
APPROVAL_DECISIONS = {"approve", "reject"}


def _number(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return default


def _read_jsonl(path: Path, limit: int) -> list[dict[str, Any]]:
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return []
    rows = []
    for line in lines[-limit:]:
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            rows.append(value)
    return rows


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _age_minutes(value: Any, now: datetime) -> int | None:
    parsed = _parse_time(value)
    if parsed is None:
        return None
    return max(0, round((now - parsed).total_seconds() / 60))


def _first(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value is not None and value != "":
            return value
    return None


def _normalize_orders(rows: Any) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    orders = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        orders.append(
            {
                "id": str(row.get("id", "")),
                "symbol": str(row.get("symbol", "")).upper(),
                "side": str(row.get("side", "")).upper(),
                "type": str(row.get("type", row.get("order_type", ""))).upper(),
                "status": str(row.get("status", "UNKNOWN")).upper(),
                "quantity": _number(_first(row, "qty", "quantity")),
                "limitPrice": _number(_first(row, "limit_price", "limit")) or None,
                "stopPrice": _number(_first(row, "stop_price", "stop")) or None,
                "submittedAt": _first(row, "submitted_at", "created_at"),
                "orderClass": str(row.get("order_class", "")).upper(),
            }
        )
    return orders


def _normalize_positions(rows: Any, orders: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    positions = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol", "")).upper()
        side = str(row.get("side", "")).upper()
        closing_side = "SELL" if side == "LONG" else "BUY"
        protected = any(
            order["symbol"] == symbol
            and order["side"] == closing_side
            and order["type"] in {"STOP", "STOP_LIMIT", "TRAILING_STOP"}
            and order["status"] not in {"CANCELED", "EXPIRED", "REJECTED"}
            for order in orders
        )
        positions.append(
            {
                "symbol": symbol,
                "side": side,
                "quantity": _number(_first(row, "qty", "quantity")),
                "entryPrice": _number(_first(row, "avg_entry_price", "entry_price")),
                "currentPrice": _number(_first(row, "current_price", "mark_price")),
                "marketValue": _number(row.get("market_value")),
                "unrealizedPnl": _number(_first(row, "unrealized_pl", "unrealized_pnl")),
                "unrealizedPct": _number(_first(row, "unrealized_plpc", "unrealized_pct")),
                "protected": protected,
            }
        )
    return positions


def read_env_file(root: Path) -> dict[str, str]:
    """Read OpenTrade's env files. Values stay in memory; only file paths and labels are ever exposed."""
    values: dict[str, str] = {}
    for filename in (".env", ".env.local"):
        try:
            lines = (root / filename).read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue
        for line in lines:
            entry = line.strip()
            if entry.startswith("#") or "=" not in entry:
                continue
            key, value = entry.split("=", 1)
            values[key.removeprefix("export ").strip()] = value.strip().strip('"').strip("'")
    return values


def account_paths(env: dict[str, str], suffix: str = "") -> dict[str, str]:
    """Resolve one account's files: a KEY_<suffix> override wins, then KEY, then OpenTrade's default."""
    paths = {}
    for name, (key, default) in ACCOUNT_FILE_KEYS.items():
        paths[name] = (env.get(f"{key}_{suffix}") if suffix else None) or env.get(key) or default
    return paths


def list_accounts(root: Path) -> list[dict[str, Any]]:
    """Every Alpaca account OpenTrade is configured for: the primary, plus each _<suffix> account."""
    env = read_env_file(root)
    primary = account_paths(env)
    accounts = [{
        "id": "primary",
        "suffix": "",
        "label": env.get("ALPACA_ACCOUNT_LABEL") or "Primary account",
        "paperOnly": (env.get("ALPACA_TRADING_URL") or PAPER_TRADING_URL) == PAPER_TRADING_URL,
        "paths": primary,
        "sharedWithPrimary": [],
    }]
    for key in sorted(env):
        match = re.fullmatch(r"ALPACA_API_KEY_ID_([A-Za-z0-9]+)", key)
        if not match or not env[key]:
            continue
        suffix = match.group(1)
        paths = account_paths(env, suffix)
        accounts.append({
            "id": suffix,
            "suffix": suffix,
            "label": env.get(f"ALPACA_ACCOUNT_LABEL_{suffix}") or f"Account {suffix}",
            "paperOnly": (env.get(f"ALPACA_TRADING_URL_{suffix}") or env.get("ALPACA_TRADING_URL") or PAPER_TRADING_URL) == PAPER_TRADING_URL,
            "paths": paths,
            "sharedWithPrimary": sorted(name for name, value in paths.items() if value == primary[name]),
        })
    return accounts


def find_account(root: Path, account_id: str) -> dict[str, Any]:
    accounts = list_accounts(root)
    return next((account for account in accounts if account["id"] == account_id), accounts[0])


def approvals_path(root: Path, account: dict[str, Any] | None = None) -> Path:
    """Manual approvals live next to the execution plan they apply to, so accounts never share them."""
    plan = (account or {}).get("paths", {}).get("plan") or ACCOUNT_FILE_KEYS["plan"][1]
    return (root / plan).with_suffix(".approvals.json")


def eastern_date(value: Any = None) -> str:
    """The New York calendar date for a moment, used as OpenTrade's trading day."""
    moment = _parse_time(value) if value is not None else datetime.now(timezone.utc)
    if moment is None:
        moment = datetime.now(timezone.utc)
    year = moment.year
    march_first = datetime(year, 3, 1, tzinfo=timezone.utc)
    second_sunday = 1 + (6 - march_first.weekday()) % 7 + 7
    november_first = datetime(year, 11, 1, tzinfo=timezone.utc)
    first_sunday = 1 + (6 - november_first.weekday()) % 7
    daylight_start = datetime(year, 3, second_sunday, 7, tzinfo=timezone.utc)
    daylight_end = datetime(year, 11, first_sunday, 6, tzinfo=timezone.utc)
    offset = -4 if daylight_start <= moment < daylight_end else -5
    return (moment + timedelta(hours=offset)).date().isoformat()


def read_manual_approvals(root: Path, now: Any = None, account: dict[str, Any] | None = None) -> dict[str, str]:
    """Read today's manual plan approvals, keyed SYMBOL:SIDE. Yesterday's decisions never carry over."""
    payload = _read_json(approvals_path(root, account), {})
    if not isinstance(payload, dict) or payload.get("trading_day") != eastern_date(now):
        return {}
    approvals = payload.get("approvals")
    if not isinstance(approvals, dict):
        return {}
    decisions = {}
    for key, value in approvals.items():
        decision = value.get("decision") if isinstance(value, dict) else value
        symbol, _, side = str(key).partition(":")
        if str(decision) in APPROVAL_DECISIONS and symbol and side:
            decisions[f"{symbol.upper()}:{side.upper()}"] = str(decision)
    return decisions


def _normalize_plans(
    plan: Any,
    objective: Any,
    vision: Any,
    approvals: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    candidates = plan.get("candidates", []) if isinstance(plan, dict) else []
    objective_candidates = objective.get("candidates", []) if isinstance(objective, dict) else []
    objective_by_symbol = {
        str(row.get("symbol", "")).upper(): row
        for row in objective_candidates
        if isinstance(row, dict)
    }
    symbol_context = vision.get("symbol_context", {}) if isinstance(vision, dict) else {}
    plans = []
    for row in candidates if isinstance(candidates, list) else []:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol", "")).upper()
        review = objective_by_symbol.get(symbol, {})
        evaluation = review.get("objective_evaluation", {}) if isinstance(review, dict) else {}
        metrics = evaluation.get("metrics", {}) if isinstance(evaluation, dict) else {}
        context = symbol_context.get(symbol, {}) if isinstance(symbol_context, dict) else {}
        headlines = context.get("headlines", []) if isinstance(context, dict) else []
        entry = _number(_first(row, "entry", "entry_price", "planned_entry")) or None
        stop = _number(_first(row, "stop", "stop_loss", "invalidates_below")) or None
        target = _number(_first(row, "target", "take_profit")) or None
        quantity = _number(_first(row, "qty", "quantity", "shares")) or None
        risk_reward = _number(_first(row, "risk_reward", "riskReward")) or None
        if risk_reward is None and entry and stop and target and entry != stop:
            risk_reward = round(abs(target - entry) / abs(entry - stop), 2)
        max_loss = round(abs(entry - stop) * quantity, 2) if entry and stop and quantity else None
        headline = headlines[0] if isinstance(headlines, list) and headlines else {}
        plans.append(
            {
                "symbol": symbol,
                "side": str(row.get("side", "WATCH")).upper(),
                "approved": bool(row.get("approved", False)),
                "thesis": str(_first(row, "reason", "thesis", "setup") or "Review candidate"),
                "entry": entry,
                "stop": stop,
                "target": target,
                "quantity": quantity,
                "maxLoss": max_loss,
                "riskReward": risk_reward,
                "score": _number(_first(row, "score") or metrics.get("score")) or None,
                "spreadPct": _number(metrics.get("spread_pct")) or None,
                "objectivePassed": bool(evaluation.get("passed", False)),
                "failureConditions": evaluation.get("failure_conditions", []),
                "approvalDecision": (approvals or {}).get(f"{symbol}:{str(row.get('side', '')).upper()}", ""),
                "approvalBlockedReason": str(row.get("approval_blocked_reason", "")),
                "newsCount": int(_number(context.get("news_count"))) if isinstance(context, dict) else 0,
                "filingCount": int(_number(context.get("filing_count"))) if isinstance(context, dict) else 0,
                "headline": str(headline.get("title", "")) if isinstance(headline, dict) else "",
            }
        )
    return plans


def _normalize_journal(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "symbol": str(row.get("symbol", "")).upper(),
            "side": str(row.get("side", "")).upper(),
            "strategy": str(row.get("strategy", "")),
            "enteredAt": row.get("entry_at"),
            "exitedAt": row.get("exit_at"),
            "pnl": _number(_first(row, "net_pnl", "pnl")),
            "returnPct": _number(row.get("return_pct")),
            "outcome": str(_first(row, "exit_reason", "reason") or "recorded"),
        }
        for row in reversed(rows)
    ]


def fills_path(root: Path, account: dict[str, Any] | None = None) -> Path:
    decisions = (account or {}).get("paths", {}).get("decisions") or ACCOUNT_FILE_KEYS["decisions"][1]
    return (root / decisions).with_suffix(".fills.sqlite3")


def read_fill_journal(root: Path, account: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Read OpenTrade's reconciled broker-fill snapshot without opening it for writing."""
    path = fills_path(root, account)
    if not path.exists():
        return None
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
    try:
        row = connection.execute("SELECT payload FROM snapshot WHERE id = 1").fetchone()
    finally:
        connection.close()
    payload = json.loads(row[0]) if row else None
    return payload if isinstance(payload, dict) else None


def closed_fill_trades(root: Path, fills: dict[str, Any], account: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Normalize OpenTrade's closed broker round trips, newest first."""
    decisions = (account or {}).get("paths", {}).get("decisions") or ACCOUNT_FILE_KEYS["decisions"][1]
    orders: dict[str, dict[str, Any]] = {}
    for record in _read_jsonl(root / decisions, 1_000_000):
        details = record.get("details")
        if isinstance(details, dict) and details.get("broker_order_id"):
            orders.setdefault(str(details["broker_order_id"]), record)
    reviews = {
        str(row.get("trade_id")): row
        for row in fills.get("loss_reviews", [])
        if isinstance(row, dict)
    }
    trades = []
    for row in fills.get("closed_trades", []):
        if not isinstance(row, dict) or not row.get("id"):
            continue
        entry_price = _number(row.get("entry_price"))
        exit_price = _number(row.get("exit_price"))
        side = str(row.get("side", "")).upper()
        direction = -1 if side == "SHORT" else 1
        pnl = _number(row["net_pnl"] if row.get("net_pnl") is not None else row.get("gross_pnl"))
        entry_ids = [str(item) for item in row.get("entry_order_ids", [])]
        exit_ids = [str(item) for item in row.get("exit_order_ids", [])]
        entry_record = next((orders[item] for item in entry_ids if item in orders), {})
        exit_record = next((orders[item] for item in exit_ids if item in orders), {})
        review = reviews.get(str(row["id"]), {})
        trades.append(
            {
                "id": str(row["id"]),
                "symbol": str(row.get("symbol", "")).upper(),
                "side": side,
                "strategy": str(entry_record.get("mode") or row.get("source") or ""),
                "enteredAt": row.get("entry_at"),
                "exitedAt": row.get("exit_at"),
                "quantity": _number(row.get("qty")),
                "entryPrice": entry_price,
                "exitPrice": exit_price,
                "pnl": pnl,
                "returnPct": direction * (exit_price - entry_price) / entry_price if entry_price else 0.0,
                "outcome": "loss" if pnl < 0 else "profit" if pnl > 0 else "breakeven",
                "feesAllocated": row.get("net_pnl") is not None,
                "evidence": {
                    "entryOrder": entry_record,
                    "exitOrder": exit_record,
                    "heldMinutes": review.get("held_minutes"),
                    "entryDriftPct": review.get("entry_drift_pct"),
                    "exitBeyondPlannedStop": review.get("exit_beyond_planned_stop"),
                    "openTradeFinding": review.get("finding"),
                    "openTradeUnknowns": review.get("unknowns", []),
                },
            }
        )
    trades.sort(key=lambda trade: _parse_time(trade["exitedAt"]) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return trades


def _trade_evidence(trade: dict[str, Any]) -> list[dict[str, str]]:
    evidence = trade["evidence"]
    entry, exit_record = evidence["entryOrder"], evidence["exitOrder"]
    details = entry.get("details") if isinstance(entry.get("details"), dict) else {}
    payload = details.get("payload") if isinstance(details.get("payload"), dict) else {}
    missing = "Not found in OpenTrade's decision log"
    order = " ".join(str(payload.get(key, "")).upper() for key in ("side", "type")).strip() or "Order"
    rows = [{"label": "Entry order", "value": f"{order} · {entry.get('mode') or 'unspecified mode'}" if entry else missing}]
    if details.get("signal_independent"):
        rows.append({"label": "Entry reason", "value": "Signal-independent test order (no trade thesis)"})
    elif isinstance(details.get("signal_reasons"), list) and details["signal_reasons"]:
        rows.append({"label": "Entry reason", "value": "; ".join(str(item) for item in details["signal_reasons"])})
    for label, key in (("Planned entry", "signal_entry"), ("Planned stop", "signal_stop"), ("Planned target", "signal_target")):
        if details.get(key) is not None:
            rows.append({"label": label, "value": f"${_number(details[key]):,.2f}"})
    if details.get("planned_r_multiple"):
        rows.append({"label": "Planned reward/risk", "value": f"{_number(details['planned_r_multiple']):.2f}R"})
    exit_action = str(exit_record.get("action", "")).replace("_", " ").capitalize()
    rows.append({"label": "Exit order", "value": f"{exit_action} · {exit_record.get('mode') or 'unspecified mode'}" if exit_record else missing})
    if evidence["entryDriftPct"] is not None:
        rows.append({"label": "Entry drift vs plan", "value": f"{_number(evidence['entryDriftPct']) * 100:+.3f}%"})
    if evidence["exitBeyondPlannedStop"] is not None:
        rows.append({"label": "Exit beyond planned stop", "value": "Yes" if evidence["exitBeyondPlannedStop"] else "No"})
    return rows


def _routine_definitions(root: Path) -> list[dict[str, Any]]:
    """Read each scheduled routine's marker name and steps from its batch file, plus its clock time."""
    schedule = {}
    try:
        installer = (root / "scripts" / "install_scheduled_tasks.ps1").read_text(encoding="utf-8", errors="ignore")
    except OSError:
        installer = ""
    for block in installer.split("@{")[1:]:
        script = re.search(r'Script\s*=\s*"([^"]+)"', block)
        clock = re.search(r'Time\s*=\s*"([^"]+)"', block)
        label = re.search(r'Name\s*=\s*"([^"]+)"', block)
        if script:
            schedule[script.group(1)] = {
                "scheduledAt": clock.group(1) if clock else "",
                "label": label.group(1) if label else "",
            }

    routines = []
    for batch in sorted((root / "scripts").glob("scheduled_*.bat")) if (root / "scripts").exists() else []:
        try:
            text = batch.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        marker = re.search(r"echo ==== .*? ([A-Za-z0-9_-]+) ====", text)
        if not marker:
            continue
        task = schedule.get(batch.name, {})
        routines.append(
            {
                "name": marker.group(1),
                "label": task.get("label") or marker.group(1).replace("-", " ").capitalize(),
                "scheduledAt": task.get("scheduledAt", ""),
                "steps": re.findall(r"run_command\.py\s+([A-Za-z0-9_-]+)", text),
                "installed": batch.name in schedule,
            }
        )
    session = next((routine for routine in routines if "market-session-execute" in routine["steps"]), None)
    session_source = root / "scripts" / "market_session.py"
    if session and session_source.exists() and '"midday"' in session_source.read_text(encoding="utf-8"):
        for routine in routines:
            if routine["name"] == "midday-risk-execute" and not routine["installed"]:
                routine["managedBy"] = session["label"]
                routine["managedRoutine"] = session["name"]
    return routines


def _parse_routine_runs(root: Path) -> list[dict[str, Any]]:
    """Read the scheduler log into one record per routine run, newest first.

    Each run block holds the step output OpenTrade's commands print, so a run reports both whether it
    finished and which steps failed or were skipped.
    """
    try:
        lines = (root.joinpath(*SCHEDULER_LOG_PATH)).read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return []
    runs: list[dict[str, Any]] = []
    for line in lines:
        marker = re.match(r"==== \w+ (\d{2})/(\d{2})/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})[.\d]*\s+([A-Za-z0-9_-]+) ====", line.strip())
        if marker:
            month, day, year, hour, minute, second, name = marker.groups()
            started = datetime(int(year), int(month), int(day), int(hour), int(minute), int(second))
            runs.append({
                "name": name,
                "startedAt": started.astimezone().astimezone(timezone.utc).isoformat(),
                "exitCode": None,
                "failures": [],
                "warnings": [],
                "artifacts": [],
                "riskChecks": 0,
                "lines": 0,
            })
            continue
        if not runs:
            continue
        current = runs[-1]
        current["lines"] += 1
        exit_code = re.match(r"exit_code=(\d*)", line.strip())
        if exit_code:
            current["exitCode"] = int(exit_code.group(1)) if exit_code.group(1) else None
            continue
        stripped = line.strip()
        if stripped.startswith('{') and '"name": "risk"' in stripped:
            try:
                event = json.loads(stripped)
            except json.JSONDecodeError:
                event = {}
            if event.get("event") == "step" and event.get("name") == "risk":
                current["riskChecks"] += 1
                if event.get("ok") is False and "Market-session risk check failed" not in current["failures"]:
                    current["failures"].append("Market-session risk check failed")
        if stripped.startswith('"skipped"') or stripped.startswith('"error"') or stripped.startswith('"blocked"'):
            detail = stripped.split(":", 1)[1].strip().strip(",").strip('"')
            category = "failures" if stripped.startswith('"error"') else "warnings"
            expected = {"disabled", "no new items", "daily_target_reached", "daily_entry_limit"}
            if detail and detail not in expected and detail not in current[category] and len(current[category]) < 6:
                current[category].append(detail)
        elif stripped.startswith('"path"'):
            artifact = stripped.split(":", 1)[1].strip().strip(",").strip('"').replace("\\\\", "/").split("/")[-1]
            if artifact and artifact not in current["artifacts"]:
                current["artifacts"].append(artifact)
    for run in runs:
        run["status"] = (
            "running" if run["exitCode"] is None and run is runs[-1]
            else "unknown" if run["exitCode"] is None
            else "failed" if run["failures"]
            else "warning" if run["exitCode"] == 0 and run["warnings"]
            else "completed" if run["exitCode"] == 0
            else "failed"
        )
        run["failures"] = run["failures"][:6]
        run["artifacts"] = run["artifacts"][:8]
        run.pop("lines", None)
    runs.reverse()
    return runs


def read_automations(root: Path, now: datetime) -> dict[str, Any]:
    """Scheduled routines with their last run, plus the recent run history."""
    runs = _parse_routine_runs(root)
    routines = []
    for routine in _routine_definitions(root):
        last = next((run for run in runs if run["name"] == routine["name"]), None)
        managed = next((run for run in runs if run["name"] == routine.get("managedRoutine") and run["riskChecks"]), None)
        resolved = []
        if last:
            for warning in last["warnings"]:
                report_path = TRADINGVIEW_REVIEW_PATH if warning.startswith("TradingView") else (
                    ("memory", "NOTIFICATION_STATUS.json") if "notification integration" in warning or warning == "missing Telegram credentials" else ()
                )
                report = _read_json(root.joinpath(*report_path), {}) if report_path else {}
                checked = _parse_time(report.get("generated_at"))
                if report.get("ok") and checked and checked > _parse_time(last["startedAt"]):
                    resolved.append(warning)
        routines.append({
            **routine,
            "lastRun": last,
            "managedRun": managed,
            "resolvedWarnings": resolved,
            "ageMinutes": _age_minutes(last["startedAt"], now) if last else None,
        })
    result = {
        "routines": routines,
        "recentRuns": runs[:ROUTINE_RUN_LIMIT],
        "logAgeMinutes": _age_minutes(runs[0]["startedAt"], now) if runs else None,
    }
    notification = _read_json(root / "memory" / "NOTIFICATION_STATUS.json", {})
    if notification:
        result["notifications"] = notification
    return result


def chart_image_path(root: Path, symbol: str) -> Path | None:
    """The saved TradingView chart for a symbol, only if it is a real file inside the chart folder."""
    if not CHART_SYMBOL.fullmatch(str(symbol or "")):
        return None
    folder = root.joinpath(*TRADINGVIEW_CHART_DIR).resolve()
    image = (folder / f"{symbol}.png").resolve()
    return image if image.parent == folder and image.is_file() else None


def read_tradingview(root: Path) -> dict[str, Any]:
    """Summarize OpenTrade's TradingView chart review: which charts exist and why any are missing."""
    review = _read_json(root.joinpath(*TRADINGVIEW_REVIEW_PATH), {})
    if not isinstance(review, dict) or not review:
        return {"generatedAt": None, "connected": False, "timeframe": "", "problem": "OpenTrade has not run a TradingView review yet.", "charts": []}
    charts = []
    for row in review.get("reviews", []) if isinstance(review.get("reviews"), list) else []:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol", "")).upper()
        charts.append({
            "symbol": symbol,
            "available": bool(row.get("image")) and chart_image_path(root, symbol) is not None,
            "capturedAt": row.get("captured_at"),
            "error": str(row.get("error") or ""),
        })
    problem = str(review.get("skipped") or "")
    if problem and review.get("expected"):
        problem = f"{problem}. {review['expected']}"
    if not problem and review.get("connected") is False:
        problem = next((chart["error"] for chart in charts if chart["error"]), "TradingView Desktop is not reachable.")
    return {
        "generatedAt": review.get("generated_at"),
        "connected": bool(review.get("connected")),
        "timeframe": str(review.get("timeframe") or ""),
        "problem": problem,
        "charts": charts,
    }


def _headlines(context: Any, limit: int = 4) -> list[dict[str, str]]:
    rows = context.get("headlines", []) if isinstance(context, dict) else []
    return [
        {
            "title": str(row.get("title", "")),
            "url": str(row.get("url", "")),
            "source": str(row.get("source", "")),
        }
        for row in rows[:limit] if isinstance(row, dict) and row.get("title")
    ]


def read_research(vision: Any, leaders: Any) -> dict[str, Any]:
    """Summarize what pre-market research found: providers, market read, flags, and per-symbol news."""
    vision = vision if isinstance(vision, dict) else {}
    leaders = leaders if isinstance(leaders, dict) else {}
    regime = vision.get("market_regime", {}) if isinstance(vision.get("market_regime"), dict) else {}
    symbol_context = vision.get("symbol_context", {}) if isinstance(vision.get("symbol_context"), dict) else {}
    leader_context = leaders.get("symbol_context", {}) if isinstance(leaders.get("symbol_context"), dict) else {}
    return {
        "generatedAt": vision.get("generated_at"),
        "regime": {
            "state": str(regime.get("state", "unknown")),
            "score": _number(regime.get("score")),
            "notes": [str(note) for note in regime.get("notes", [])][:4] if isinstance(regime.get("notes"), list) else [],
            "macroNotes": [str(note) for note in regime.get("macro_notes", [])][:4] if isinstance(regime.get("macro_notes"), list) else [],
        },
        "providers": [
            {
                "provider": str(row.get("provider", "")),
                "state": str(row.get("state", "")),
                "detail": str(row.get("detail", "")),
                "items": int(_number(row.get("items"))),
            }
            for row in vision.get("provider_status", []) if isinstance(row, dict)
        ],
        "riskFlags": [str(flag) for flag in vision.get("risk_flags", [])][:6] if isinstance(vision.get("risk_flags"), list) else [],
        "symbols": [
            {
                "symbol": str(symbol).upper(),
                "newsCount": int(_number(context.get("news_count"))) if isinstance(context, dict) else 0,
                "filingCount": int(_number(context.get("filing_count"))) if isinstance(context, dict) else 0,
                "headlines": _headlines(context),
            }
            for symbol, context in symbol_context.items()
        ],
        "leaderWatch": {
            "generatedAt": leaders.get("generated_at"),
            "person": str(leaders.get("person", "")),
            "researchOnly": bool(leaders.get("research_only", True)),
            "newItems": int(_number(leaders.get("new_items"))),
            "symbols": [
                {
                    "symbol": str(symbol).upper(),
                    "actions": [str(action) for action in context.get("actions", [])] if isinstance(context, dict) else [],
                    "score": _number(context.get("max_leader_signal_score")) if isinstance(context, dict) else 0.0,
                    "headlines": _headlines(context, 2),
                }
                for symbol, context in leader_context.items()
            ],
        },
    }


def _scanner_settings(root: Path) -> dict[str, Any]:
    settings: dict[str, Any] = {
        "STOCK_SCANNER_PROFILE": "riley_reversal,tony_pdh_pdl",
        "RILEY_CORE_TIMES_ET": "09:45,10:00",
        "RILEY_TIMING_WINDOW_MINUTES": 8,
        "TONY_FIRST_MINUTES": 60,
    }
    allowed = set(settings)
    for filename in (".env", ".env.local"):
        try:
            lines = (root / filename).read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue
        for line in lines:
            entry = line.strip()
            if not entry or entry.startswith("#") or "=" not in entry:
                continue
            key, value = entry.split("=", 1)
            key = key.removeprefix("export ").strip()
            if key not in allowed:
                continue
            settings[key] = value.strip().strip('"').strip("'")
    for key in ("RILEY_TIMING_WINDOW_MINUTES", "TONY_FIRST_MINUTES"):
        try:
            settings[key] = int(settings[key])
        except (TypeError, ValueError):
            settings[key] = 8 if key == "RILEY_TIMING_WINDOW_MINUTES" else 60
    return settings


def _clock_minutes(value: str) -> int | None:
    try:
        hour, minute = value.strip().split(":", 1)
        hour_value, minute_value = int(hour), int(minute)
    except (AttributeError, TypeError, ValueError):
        return None
    if not 0 <= hour_value <= 23 or not 0 <= minute_value <= 59:
        return None
    return hour_value * 60 + minute_value


def _format_clock(minutes: int) -> str:
    minutes = max(0, min(23 * 60 + 59, minutes))
    hour, minute = divmod(minutes, 60)
    suffix = "AM" if hour < 12 else "PM"
    display_hour = hour % 12 or 12
    return f"{display_hour}:{minute:02d} {suffix}"


def _format_window(start: int, end: int) -> str:
    start_text, end_text = _format_clock(start), _format_clock(end)
    if start_text[-2:] == end_text[-2:]:
        start_text = start_text[:-3]
    return f"{start_text}–{end_text} ET"


def _format_et(value: Any) -> tuple[str, int | None]:
    parsed = _parse_time(value)
    if parsed is None:
        return "Unknown time", None
    year = parsed.year
    march_first = datetime(year, 3, 1, tzinfo=timezone.utc)
    second_sunday = 1 + (6 - march_first.weekday()) % 7 + 7
    november_first = datetime(year, 11, 1, tzinfo=timezone.utc)
    first_sunday = 1 + (6 - november_first.weekday()) % 7
    daylight_start = datetime(year, 3, second_sunday, 7, tzinfo=timezone.utc)
    daylight_end = datetime(year, 11, first_sunday, 6, tzinfo=timezone.utc)
    offset = -4 if daylight_start <= parsed < daylight_end else -5
    eastern = parsed + timedelta(hours=offset)
    return f"{_format_clock(eastern.hour * 60 + eastern.minute)} ET", eastern.hour * 60 + eastern.minute


def _scanner_windows(settings: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
    aliases = {
        "riley": "riley_reversal",
        "intraday_reversal": "riley_reversal",
        "tony": "tony_pdh_pdl",
        "scarface": "tony_pdh_pdl",
        "pdh_pdl": "tony_pdh_pdl",
        "previous_day_levels": "tony_pdh_pdl",
        "tony_momentum": "tony_pdh_pdl",
        "daily_flag": "tony_flag",
    }
    profiles = {
        aliases.get(item.strip().lower(), item.strip().lower())
        for item in str(settings["STOCK_SCANNER_PROFILE"]).replace("+", ",").split(",")
        if item.strip()
    }
    if "high_probability" in profiles:
        profiles = {"riley_reversal", "tony_pdh_pdl"}
    if "all" in profiles:
        profiles = {"riley_reversal", "tony_pdh_pdl", "tony_flag", "trend", "trend_join_long"}

    windows = []
    if "riley_reversal" in profiles:
        targets = [
            value for value in (
                _clock_minutes(item) for item in str(settings["RILEY_CORE_TIMES_ET"]).split(",")
            ) if value is not None
        ]
        if targets:
            radius = max(0, int(settings["RILEY_TIMING_WINDOW_MINUTES"]))
            start, end = min(targets) - radius, max(targets) + radius
            windows.append({"label": "Riley reversal", "start": start, "end": end})
    if profiles.intersection({"tony_pdh_pdl", "tony_flag"}):
        windows.append({"label": "Tony PDH/PDL", "start": 9 * 60 + 30, "end": 9 * 60 + 30 + max(1, int(settings["TONY_FIRST_MINUTES"]))})
    time_boxed = {"riley_reversal", "tony_pdh_pdl", "tony_flag"}
    return windows, bool(profiles) and profiles.issubset(time_boxed)


def _decision_detail(row: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    action = str(row.get("action", "decision"))
    details = row.get("details", {})
    if not isinstance(details, dict):
        details = {}
    problems = details.get("problems", [])
    if not isinstance(problems, list):
        problems = []
    event_time, event_minutes = _format_et(_first(row, "timestamp", "created_at"))
    mode = str(row.get("mode", "")) or "unspecified"
    outcome = "Completed" if bool(row.get("ok", False)) else "No order submitted"

    if action == "no_approved_plan_candidates":
        windows, all_time_boxed = _scanner_windows(context["settings"])
        outside_windows = event_minutes is not None and windows and all(
            not window["start"] <= event_minutes <= window["end"] for window in windows
        )
        plan = context["plan"] if isinstance(context["plan"], dict) else {}
        candidates = plan.get("candidates", [])
        candidate_count = len(candidates) if isinstance(candidates, list) else 0
        health = context["health"] if isinstance(context["health"], dict) else {}
        evidence = [{"label": "Decision time", "value": event_time}]
        evidence.extend(
            {"label": window["label"], "value": _format_window(window["start"], window["end"])}
            for window in windows
        )
        evidence.extend(
            [
                {"label": "Plan candidates", "value": str(candidate_count)},
                {"label": "Data health", "value": "Passed" if health.get("ok", False) else "Needs attention"},
                {"label": "Risk lock", "value": "Active" if context["lock"] else "Clear"},
                {"label": "Outcome", "value": "No order submitted"},
            ]
        )
        if outside_windows and all_time_boxed:
            return {
                "title": "Scanner windows were closed",
                "detail": f"{event_time} was outside every enabled scanner window.",
                "explanation": "OpenTrade produced zero plan candidates, so none could be approved or executed.",
                "evidence": evidence,
                "basis": "Derived from the decision timestamp, execution plan, data-health snapshot, risk state, and scanner configuration.",
            }
        return {
            "title": "No plan candidate was approved",
            "detail": f"The {event_time} execution plan contained {candidate_count} candidate{'s' if candidate_count != 1 else ''} and none were approved.",
            "explanation": "OpenTrade requires an approved plan candidate before it can submit an order.",
            "evidence": evidence,
            "basis": "Derived from the recorded decision and the associated OpenTrade snapshots.",
        }

    if action == "preflight_failed":
        detail = "; ".join(str(item) for item in problems) or str(_first(row, "reason", "message") or "A required safety check failed")
        return {
            "title": "Preflight checks blocked the run",
            "detail": detail.rstrip(".") + ".",
            "explanation": "OpenTrade stopped before order submission because a required safety check failed.",
            "evidence": [
                *({"label": "Failed check", "value": str(item)} for item in problems),
                {"label": "Decision time", "value": event_time},
                {"label": "Mode", "value": mode},
                {"label": "Outcome", "value": outcome},
            ],
            "basis": "Reported directly by OpenTrade's preflight checks.",
        }

    payload = details.get("payload", {})
    if not isinstance(payload, dict):
        payload = {}
    symbol = str(details.get("symbol") or payload.get("symbol") or "the position").upper()
    if action in {"submit_volume_order", "submit_bracket_order", "submit_learning_order"}:
        side = str(payload.get("side", "order")).upper()
        quantity = str(payload.get("qty", "unspecified quantity"))
        order_type = str(payload.get("type", "order")).replace("_", " ")
        status = str(_first(details, "broker_status", "status") or "submitted").replace("_", " ")
        return {
            "title": f"{symbol} order submitted",
            "detail": f"Submitted {side} {quantity} {symbol} as a {order_type} order; broker status: {status}.",
            "explanation": "OpenTrade sent the recorded order payload to the configured broker.",
            "evidence": [
                {"label": "Decision time", "value": event_time},
                {"label": "Mode", "value": mode},
                {"label": "Broker status", "value": status},
                {"label": "Outcome", "value": outcome},
            ],
            "basis": "Reported directly by the broker submission record.",
        }
    if action in {"restore_protective_stop", "submit_learning_stop"}:
        stop_price = _first(details, "stop_price") or payload.get("stop_price")
        stop_text = f" at ${_number(stop_price):,.2f}" if stop_price is not None else ""
        return {
            "title": f"{symbol} protective stop restored",
            "detail": f"OpenTrade placed a protective stop for {symbol}{stop_text}.",
            "explanation": "The stop was added to limit downside while the position remained open.",
            "evidence": [
                {"label": "Decision time", "value": event_time},
                {"label": "Mode", "value": mode},
                {"label": "Stop price", "value": f"${_number(stop_price):,.2f}" if stop_price is not None else "Not recorded"},
                {"label": "Outcome", "value": outcome},
            ],
            "basis": "Reported directly by OpenTrade's protective-order record.",
        }
    if action == "close_position":
        return {
            "title": f"{symbol} position close submitted",
            "detail": f"OpenTrade submitted a broker request to close the {symbol} position.",
            "explanation": "The recorded close action ended or attempted to end the open position.",
            "evidence": [
                {"label": "Decision time", "value": event_time},
                {"label": "Mode", "value": mode},
                {"label": "Outcome", "value": outcome},
            ],
            "basis": "Reported directly by OpenTrade's close-position record.",
        }
    if action == "notify_skipped":
        reason = str(details.get("skipped") or "no notification reason was recorded")
        return {
            "title": "Notification was skipped",
            "detail": f"OpenTrade did not send a notification because {reason}.",
            "explanation": "This affects the notification only; it does not change the recorded trading decision.",
            "evidence": [
                {"label": "Decision time", "value": event_time},
                {"label": "Reason", "value": reason},
                {"label": "Outcome", "value": "No notification sent"},
            ],
            "basis": "Reported directly by OpenTrade's notification result.",
        }
    if action == "existing_open_position":
        positions = details.get("positions", [])
        symbols = ", ".join(str(item).upper() for item in positions) if isinstance(positions, list) else str(positions)
        symbols = symbols or "Unknown"
        return {
            "title": f"Existing {symbols} position prevented a new entry",
            "detail": f"A {symbols} position was already open, so OpenTrade did not open another position.",
            "explanation": "OpenTrade avoids overlapping entries when the account already holds the recorded symbol.",
            "evidence": [
                {"label": "Decision time", "value": event_time},
                {"label": "Existing position", "value": symbols},
                {"label": "Outcome", "value": "No new order submitted"},
            ],
            "basis": "Reported directly by OpenTrade's open-position check.",
        }
    if action == "risk_limit":
        cooldown = details.get("loss_cooldown", {})
        if not isinstance(cooldown, dict):
            cooldown = {}
        warnings = cooldown.get("warnings", [])
        if not isinstance(warnings, list):
            warnings = []
        blocked = bool(cooldown.get("blocked", False))
        detail = "; ".join(str(item) for item in warnings) or "A configured account-risk limit blocked trading"
        return {
            "title": "Loss cooldown blocked trading" if blocked else "Risk limit changed position sizing",
            "detail": detail.rstrip(".") + ".",
            "explanation": "OpenTrade applied its loss-streak and drawdown rules before allowing another entry.",
            "evidence": [
                {"label": "Decision time", "value": event_time},
                {"label": "Consecutive losses", "value": str(int(_number(cooldown.get("consecutive_losses"))))},
                {"label": "Cooldown until", "value": str(cooldown.get("cooldown_until") or "Not active")},
                {"label": "Outcome", "value": outcome},
            ],
            "basis": "Reported directly by OpenTrade's risk-limit check.",
        }

    recorded = str(_first(row, "reason", "message") or "OpenTrade recorded this decision without an additional reason")
    return {
        "title": str(action).replace("_", " ").capitalize(),
        "detail": recorded.rstrip(".") + ".",
        "explanation": "This is the most specific explanation available in the recorded decision.",
        "evidence": [
            {"label": "Decision time", "value": event_time},
            {"label": "Mode", "value": mode},
            {"label": "Outcome", "value": outcome},
        ],
        "basis": "Reported from the fields stored in OpenTrade's decision log.",
    }


def _normalize_decisions(rows: list[dict[str, Any]], context: dict[str, Any]) -> list[dict[str, Any]]:
    decisions = []
    for row in reversed(rows):
        explanation = _decision_detail(row, context)
        decisions.append(
            {
                "time": _first(row, "timestamp", "created_at"),
                "action": str(row.get("action", "decision")).replace("_", " "),
                "mode": str(row.get("mode", "")),
                "ok": bool(row.get("ok", False)),
                **explanation,
            }
        )
    return decisions


def _performance_summary(objective: Any, walk_forward: Any, paper: Any) -> dict[str, Any]:
    objective_summary = objective.get("summary", {}) if isinstance(objective, dict) else {}
    results = walk_forward.get("results", []) if isinstance(walk_forward, dict) else []
    strategies = []
    for row in results if isinstance(results, list) else []:
        if not isinstance(row, dict):
            continue
        summary = row.get("summary", {})
        if not isinstance(summary, dict):
            summary = {}
        strategies.append(
            {
                "symbol": str(row.get("symbol", "")).upper(),
                "returnPct": _number(_first(summary, "avg_base_return_pct", "return_pct")),
                "maxDrawdown": _number(_first(summary, "worst_base_drawdown", "max_drawdown")),
                "stressDrawdown": _number(summary.get("worst_stress_drawdown")),
                "windows": int(_number(summary.get("windows"))),
            }
        )
    return {
        "objective": {
            "candidates": int(_number(objective_summary.get("candidate_count"))),
            "passed": int(_number(objective_summary.get("passed"))),
            "failed": int(_number(objective_summary.get("failed"))),
            "autoApproval": bool(objective_summary.get("auto_approval", False)),
        },
        "walkForward": strategies,
        "paper": {
            "ok": bool(paper.get("ok", False)) if isinstance(paper, dict) else False,
            "blocked": bool(paper.get("blocked", False)) if isinstance(paper, dict) else False,
            "mode": str(paper.get("mode", "unknown")) if isinstance(paper, dict) else "unknown",
            "submitted": int(_number(paper.get("submitted_count"))) if isinstance(paper, dict) else 0,
        },
    }


def build_snapshot(root: Path, now: datetime | None = None, account: dict[str, Any] | None = None) -> dict[str, Any]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    base = {
        "mode": "READ_ONLY",
        "readOnlyReason": "Usagi observes OpenTrade snapshots. Trading stays in OpenTrade.",
        "generatedAt": now.isoformat(),
        "connected": root.exists(),
        "account": {"id": "primary", "label": "Primary account", "status": "UNAVAILABLE", "equity": 0.0, "cash": 0.0, "buyingPower": 0.0, "currency": "USD"},
        "market": {"isOpen": False, "regime": "unknown", "score": 0.0, "sizeMultiplier": 0.0, "benchmarks": []},
        "risk": {"locked": False, "reason": "", "drawdown": 0.0, "peakEquity": 0.0, "lockEquity": 0.0, "unprotected": 0},
        "positions": [],
        "orders": [],
        "plans": [],
        "alerts": [],
        "decisions": [],
        "journal": [],
        "performance": {"objective": {"candidates": 0, "passed": 0, "failed": 0, "autoApproval": False}, "walkForward": [], "paper": {"ok": False, "blocked": False, "mode": "unknown", "submitted": 0}},
        "freshness": {"status": "missing", "syncedAt": None, "ageMinutes": None, "files": []},
        "automations": {"routines": [], "recentRuns": [], "logAgeMinutes": None},
        "tradingview": {"generatedAt": None, "connected": False, "timeframe": "", "problem": "", "charts": []},
        "research": {"generatedAt": None, "regime": {}, "providers": [], "riskFlags": [], "symbols": [], "leaderWatch": {}},
    }
    if not root.exists():
        base["alerts"] = [{"severity": "critical", "title": "OpenTrade is unavailable", "detail": "The configured read-only project folder was not found."}]
        return base

    account = account or find_account(root, "primary")
    paths = account["paths"]
    base["account"] = {**base["account"], "id": account["id"], "label": account["label"]}
    portfolio = _read_json(root / paths["portfolio"], {})
    plan = _read_json(root / paths["plan"], _read_json(root / "execution_plan.json", {}))
    vision = _read_json(root / paths["vision"], {})
    lock = _read_json(root / paths["lock"], {})
    health = _read_json(root / paths["health"], {})
    objective = _read_json(root / paths["objective"], {})
    walk_forward = _read_json(root / paths["walkForward"], {})
    paper = _read_json(root / paths["paper"], {})
    decision_rows = _read_jsonl(root / paths["decisions"], 12)
    journal_rows = _read_jsonl(root / paths["journal"], 12)

    clock = portfolio.get("clock", {}) if isinstance(portfolio, dict) else {}
    order_rows = portfolio.get("open_orders", []) if isinstance(portfolio, dict) else []
    orders = _normalize_orders(order_rows)
    positions = _normalize_positions(portfolio.get("positions", []), orders) if isinstance(portfolio, dict) else []
    plans = _normalize_plans(plan, objective, vision, read_manual_approvals(root, now, account))
    regime = vision.get("market_regime", {}) if isinstance(vision, dict) else {}
    components = regime.get("price_components", []) if isinstance(regime, dict) else []
    benchmarks = [
        {
            "symbol": str(row.get("symbol", "")).upper(),
            "latest": _number(row.get("latest")),
            "sma50": _number(row.get("sma50")),
            "sma200": _number(row.get("sma200")),
            "volatility": _number(row.get("realized_vol")),
        }
        for row in components if isinstance(row, dict)
    ]
    lock_details = lock.get("details", {}) if isinstance(lock, dict) else {}
    synced_at = portfolio.get("synced_at") if isinstance(portfolio, dict) else None
    age = _age_minutes(synced_at, now)
    freshness_status = "fresh" if age is not None and age <= 15 else "aging" if age is not None and age <= 60 else "stale"

    broker = portfolio.get("account", {}) if isinstance(portfolio, dict) else {}
    base["account"] = {
        **base["account"],
        "status": str(broker.get("status", "UNAVAILABLE")),
        "equity": _number(broker.get("equity")),
        "cash": _number(broker.get("cash")),
        "buyingPower": _number(broker.get("buying_power")),
        "currency": str(broker.get("currency", "USD")),
    }
    base["market"] = {
        "isOpen": bool(clock.get("is_open", False)),
        "timestamp": clock.get("timestamp"),
        "nextOpen": clock.get("next_open"),
        "nextClose": clock.get("next_close"),
        "regime": str(regime.get("state", "unknown")) if isinstance(regime, dict) else "unknown",
        "score": _number(regime.get("score")) if isinstance(regime, dict) else 0.0,
        "sizeMultiplier": _number(regime.get("position_size_multiplier")) if isinstance(regime, dict) else 0.0,
        "benchmarks": benchmarks,
    }
    base["positions"] = positions
    base["orders"] = orders
    base["plans"] = plans
    base["risk"] = {
        "locked": bool(lock),
        "reason": str(lock.get("reason", "")) if isinstance(lock, dict) else "",
        "drawdown": _number(lock_details.get("max_drawdown")) if isinstance(lock_details, dict) else 0.0,
        "peakEquity": _number(lock_details.get("peak_equity")) if isinstance(lock_details, dict) else 0.0,
        "lockEquity": _number(lock_details.get("equity")) if isinstance(lock_details, dict) else 0.0,
        "unprotected": len([position for position in positions if not position["protected"]]),
    }
    file_times = [
        ("Portfolio", synced_at),
        ("Market vision", vision.get("generated_at") if isinstance(vision, dict) else None),
        ("Data health", health.get("generated_at") if isinstance(health, dict) else None),
        ("Objective review", objective.get("generated_at") if isinstance(objective, dict) else None),
        ("Walk-forward", walk_forward.get("generated_at") if isinstance(walk_forward, dict) else None),
    ]
    base["freshness"] = {
        "status": freshness_status,
        "syncedAt": synced_at,
        "ageMinutes": age,
        "files": [
            {"label": label, "updatedAt": timestamp, "ageMinutes": _age_minutes(timestamp, now)}
            for label, timestamp in file_times
        ],
    }
    base["decisions"] = _normalize_decisions(
        decision_rows,
        {"plan": plan, "health": health, "lock": lock, "settings": _scanner_settings(root)},
    )
    alerts = []
    try:
        fills = read_fill_journal(root, account)
    except (sqlite3.Error, json.JSONDecodeError, OSError) as error:
        fills = None
        alerts.append({"severity": "warning", "title": "Broker fill journal is unreadable", "detail": f"{type(error).__name__}: {error}"})
    if fills is not None:
        base["journal"] = [
            {
                **{key: value for key, value in trade.items() if key != "evidence"},
                "evidence": _trade_evidence(trade),
                "notes": [
                    str(note)
                    for note in [trade["evidence"]["openTradeFinding"], *trade["evidence"]["openTradeUnknowns"]]
                    if note
                ],
            }
            for trade in closed_fill_trades(root, fills, account)[:JOURNAL_LIMIT]
        ]
    else:
        base["journal"] = _normalize_journal(journal_rows)
    base["performance"] = _performance_summary(objective, walk_forward, paper)
    base["automations"] = read_automations(root, now)
    base["tradingview"] = read_tradingview(root)
    base["research"] = read_research(vision, _read_json(root / paths["leaders"], {}))

    if lock:
        alerts.append({"severity": "critical", "title": "Drawdown lock active", "detail": str(lock.get("reason", "Risk guard blocked trading")).replace("_", " ")})
    for position in positions:
        if not position["protected"]:
            alerts.append({"severity": "critical", "title": f"{position['symbol']} has no visible stop", "detail": "No active protective stop was found in the portfolio snapshot."})
    if freshness_status == "stale":
        alerts.append({"severity": "warning", "title": "Portfolio snapshot is stale", "detail": "Refresh OpenTrade before relying on account, position, or order values."})
    if isinstance(health, dict) and health and not health.get("ok", False):
        alerts.append({"severity": "warning", "title": "Data-health checks need attention", "detail": "One or more OpenTrade data sources or validation artifacts are unhealthy."})
    risk_flags = vision.get("risk_flags", []) if isinstance(vision, dict) else []
    for flag in risk_flags[:4] if isinstance(risk_flags, list) else []:
        alerts.append({"severity": "notice", "title": "Market context flag", "detail": str(flag)})
    base["alerts"] = alerts
    return base
