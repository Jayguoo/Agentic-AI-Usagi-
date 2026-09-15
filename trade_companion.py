import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


def _normalize_plans(
    plan: Any,
    objective: Any,
    vision: Any,
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


def _normalize_decisions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    decisions = []
    for row in reversed(rows):
        details = row.get("details", {})
        problems = details.get("problems", []) if isinstance(details, dict) else []
        detail = "; ".join(str(item) for item in problems) if isinstance(problems, list) else ""
        decisions.append(
            {
                "time": _first(row, "timestamp", "created_at"),
                "action": str(row.get("action", "decision")).replace("_", " "),
                "mode": str(row.get("mode", "")),
                "ok": bool(row.get("ok", False)),
                "detail": detail or str(_first(row, "reason", "message") or "Recorded by OpenTrade"),
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


def build_snapshot(root: Path, now: datetime | None = None) -> dict[str, Any]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    base = {
        "mode": "READ_ONLY",
        "readOnlyReason": "Usagi observes OpenTrade snapshots. Trading stays in OpenTrade.",
        "generatedAt": now.isoformat(),
        "connected": root.exists(),
        "account": {"status": "UNAVAILABLE", "equity": 0.0, "cash": 0.0, "buyingPower": 0.0, "currency": "USD"},
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
    }
    if not root.exists():
        base["alerts"] = [{"severity": "critical", "title": "OpenTrade is unavailable", "detail": "The configured read-only project folder was not found."}]
        return base

    memory = root / "memory"
    portfolio = _read_json(memory / "PORTFOLIO_STATE.json", {})
    plan = _read_json(memory / "EXECUTION_PLAN.json", _read_json(root / "execution_plan.json", {}))
    vision = _read_json(memory / "MARKET_VISION.json", {})
    lock = _read_json(memory / "DRAWDOWN_LOCK.json", {})
    health = _read_json(memory / "DATA_HEALTH.json", {})
    objective = _read_json(memory / "OBJECTIVE_EVALUATION.json", {})
    walk_forward = _read_json(memory / "WALK_FORWARD_STRESS.json", {})
    paper = _read_json(memory / "PAPER_TEST_STATUS.json", {})
    decision_rows = _read_jsonl(memory / "DECISIONS.jsonl", 12)
    journal_rows = _read_jsonl(root / "journals" / "trades.jsonl", 12)

    account = portfolio.get("account", {}) if isinstance(portfolio, dict) else {}
    clock = portfolio.get("clock", {}) if isinstance(portfolio, dict) else {}
    order_rows = portfolio.get("open_orders", []) if isinstance(portfolio, dict) else []
    orders = _normalize_orders(order_rows)
    positions = _normalize_positions(portfolio.get("positions", []), orders) if isinstance(portfolio, dict) else []
    plans = _normalize_plans(plan, objective, vision)
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

    base["account"] = {
        "status": str(account.get("status", "UNAVAILABLE")),
        "equity": _number(account.get("equity")),
        "cash": _number(account.get("cash")),
        "buyingPower": _number(account.get("buying_power")),
        "currency": str(account.get("currency", "USD")),
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
    base["decisions"] = _normalize_decisions(decision_rows)
    base["journal"] = _normalize_journal(journal_rows)
    base["performance"] = _performance_summary(objective, walk_forward, paper)

    alerts = []
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
