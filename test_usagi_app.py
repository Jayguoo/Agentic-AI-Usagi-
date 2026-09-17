import importlib.util
import json
import os
import subprocess
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import usagi


class FakeSession:
    def __init__(self, items=None, default_limit=None):
        self.items = list(items or [])
        self.default_limit = default_limit

    async def get_items(self, limit=None):
        effective_limit = limit if limit is not None else self.default_limit
        if effective_limit is None:
            return list(self.items)
        return list(self.items[-effective_limit:])

    async def pop_item(self):
        return self.items.pop() if self.items else None


def load_desktop_app():
    path = Path(__file__).with_name("usagi_app.pyw")
    spec = importlib.util.spec_from_file_location("usagi_app", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_web_app():
    path = Path(__file__).with_name("usagi_web.pyw")
    spec = importlib.util.spec_from_file_location("usagi_web", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LocalBackendStartupTests(unittest.TestCase):
    def test_starts_configured_local_ollama_when_its_port_is_closed(self):
        app = load_desktop_app()
        self.assertTrue(
            hasattr(app, "ensure_local_ollama"),
            "desktop launcher does not auto-start the configured Ollama backend",
        )

        with (
            patch.object(app, "port_is_open", side_effect=[False, True]),
            patch.object(app.shutil, "which", return_value=r"C:\Ollama\ollama.exe"),
            patch.object(app.subprocess, "Popen") as launch,
        ):
            self.assertTrue(app.ensure_local_ollama("http://127.0.0.1:11434/v1"))

        launch.assert_called_once_with(
            [r"C:\Ollama\ollama.exe", "serve"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )


class SilentDesktopLauncherTests(unittest.TestCase):
    def test_command_launcher_delegates_gui_starts_to_the_windowless_launcher(self):
        source = Path("usagi.cmd").read_text(encoding="utf-8")

        self.assertIn('wscript.exe "%~dp0Usagi.vbs"', source)
        self.assertNotIn('start "Usagi" ".venv\\Scripts\\pythonw.exe"', source)


class EmailConnectionTests(unittest.TestCase):
    def test_saves_email_credentials_encrypted_for_the_current_windows_user(self):
        save_credentials = getattr(usagi, "save_email_credentials", None)
        self.assertIsNotNone(save_credentials)

        with TemporaryDirectory() as directory:
            credential_file = Path(directory) / "email_credentials.json"
            with (
                patch.object(usagi, "EMAIL_CREDENTIAL_FILE", credential_file, create=True),
                patch.dict(
                    os.environ,
                    {"USAGI_EMAIL": "", "USAGI_EMAIL_PASSWORD": "", "USAGI_IMAP_HOST": ""},
                ),
            ):
                save_credentials("jay@example.com", "abcd efgh ijkl mnop", "imap.gmail.com")
                stored = credential_file.read_text(encoding="utf-8")
                settings = usagi.email_settings()

        self.assertNotIn("jay@example.com", stored)
        self.assertNotIn("abcd efgh ijkl mnop", stored)
        self.assertEqual(
            settings,
            {
                "host": "imap.gmail.com",
                "address": "jay@example.com",
                "password": "abcd efgh ijkl mnop",
            },
        )

    def test_verifies_read_only_gmail_access_before_saving_credentials(self):
        connect_email = getattr(usagi, "connect_email", None)
        self.assertIsNotNone(connect_email)
        client = MagicMock()
        client.select.return_value = ("OK", [b"1"])

        with (
            patch.object(usagi.imaplib, "IMAP4_SSL", return_value=client) as imap,
            patch.object(usagi, "save_email_credentials") as save,
        ):
            result = connect_email("jay@example.com", "app-password", "imap.gmail.com")

        imap.assert_called_once_with("imap.gmail.com", timeout=15)
        client.login.assert_called_once_with("jay@example.com", "app-password")
        client.select.assert_called_once_with("INBOX", readonly=True)
        client.logout.assert_called_once_with()
        save.assert_called_once_with("jay@example.com", "app-password", "imap.gmail.com")
        self.assertEqual(
            result,
            {"connected": True, "address": "jay@example.com", "provider": "Gmail", "readOnly": True},
        )

    def test_does_not_store_credentials_when_gmail_rejects_login(self):
        connect_email = getattr(usagi, "connect_email", None)
        self.assertIsNotNone(connect_email)
        client = MagicMock()
        client.login.side_effect = usagi.imaplib.IMAP4.error("authentication failed")

        with (
            patch.object(usagi.imaplib, "IMAP4_SSL", return_value=client),
            patch.object(usagi, "save_email_credentials") as save,
            self.assertRaisesRegex(Exception, "Gmail rejected the app password"),
        ):
            connect_email("jay@example.com", "bad-password", "imap.gmail.com")

        save.assert_not_called()

    def test_desktop_status_reports_the_local_email_connection(self):
        web = load_web_app()
        email = {
            "connected": True,
            "address": "jay@example.com",
            "provider": "Gmail",
            "readOnly": True,
        }

        with patch.object(web.usagi, "email_connection_status", return_value=email):
            payload = web.status_payload()

        self.assertEqual(payload["email"], email)

    def test_desktop_api_connects_email_through_the_verified_backend(self):
        web = load_web_app()
        connect_payload = getattr(web, "connect_email_payload", None)
        self.assertIsNotNone(connect_payload)
        connected = {
            "connected": True,
            "address": "jay@example.com",
            "provider": "Gmail",
            "readOnly": True,
        }

        with patch.object(web.usagi, "connect_email", return_value=connected) as connect:
            payload = connect_payload(
                {
                    "address": "jay@example.com",
                    "appPassword": "abcd efgh ijkl mnop",
                }
            )

        connect.assert_called_once_with("jay@example.com", "abcd efgh ijkl mnop")
        self.assertEqual(payload, connected)
        source = Path("usagi_web.pyw").read_text(encoding="utf-8")
        self.assertIn('parsed.path == "/api/email/connect"', source)


class OpenTradeConnectionTests(unittest.TestCase):
    def test_desktop_backend_exposes_the_opentrade_folder_target(self):
        source = Path("usagi_web.pyw").read_text(encoding="utf-8")

        self.assertIn('"opentrade": usagi.OPENTRADE_DIR', source)

    def test_reads_a_contained_opentrade_source_file(self):
        reader = getattr(usagi, "read_opentrade_text", None)
        self.assertIsNotNone(reader)

        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "strategy.py"
            source.write_text("def signal():\n    return 'hold'\n", encoding="utf-8")

            with patch.object(usagi, "OPENTRADE_DIR", root, create=True):
                self.assertEqual(reader("strategy.py"), source.read_text(encoding="utf-8"))

    def test_rejects_secrets_and_paths_outside_opentrade(self):
        resolver = getattr(usagi, "resolve_opentrade_file", None)
        self.assertIsNotNone(resolver)

        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text("TOKEN=secret", encoding="utf-8")
            (root / ".venv").mkdir()
            (root / ".venv" / "cached.py").write_text("secret", encoding="utf-8")

            with patch.object(usagi, "OPENTRADE_DIR", root, create=True):
                with self.assertRaises(ValueError):
                    resolver(".env")
                with self.assertRaises(ValueError):
                    resolver(".venv/cached.py")
                with self.assertRaises(ValueError):
                    resolver("../outside.py")

    def test_searches_safe_opentrade_files_without_indexing_secrets(self):
        search = getattr(usagi, "search_opentrade_files", None)
        self.assertIsNotNone(search)

        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "strategy.py").write_text("momentum signal", encoding="utf-8")
            (root / ".env").write_text("momentum secret", encoding="utf-8")
            (root / "logs").mkdir()
            (root / "logs" / "orders.txt").write_text("momentum order", encoding="utf-8")

            with patch.object(usagi, "OPENTRADE_DIR", root, create=True):
                results = search("momentum")

        self.assertEqual([row["path"] for row in results], ["strategy.py"])

    def test_registers_only_read_only_opentrade_agent_tools(self):
        with patch.dict(
            os.environ,
            {"USAGI_BASE_URL": "http://127.0.0.1:11434/v1", "USAGI_MODEL": "test"},
        ):
            names = {tool.name for tool in usagi.build_agent().tools}

        self.assertIn("search_opentrade", names)
        self.assertIn("read_opentrade_file", names)
        self.assertFalse(any("write_opentrade" in name or "run_opentrade" in name for name in names))

    def test_builds_a_normalized_read_only_trade_companion_snapshot(self):
        builder = getattr(usagi, "build_trade_companion_snapshot", None)
        self.assertIsNotNone(builder)

        with TemporaryDirectory() as directory:
            root = Path(directory)
            memory = root / "memory"
            journals = root / "journals"
            memory.mkdir()
            journals.mkdir()
            (memory / "PORTFOLIO_STATE.json").write_text(
                """{
                  "account": {"status": "ACTIVE", "equity": "10000", "cash": "6200", "buying_power": "12400", "currency": "USD"},
                  "clock": {"is_open": true, "timestamp": "2026-07-16T14:30:00+00:00", "next_close": "2026-07-16T20:00:00+00:00"},
                  "positions": [{"symbol": "AAPL", "side": "long", "qty": "4", "avg_entry_price": "210", "current_price": "216", "market_value": "864", "unrealized_pl": "24", "unrealized_plpc": "0.02857"}],
                  "open_orders": [{"id": "order-1", "symbol": "AAPL", "side": "sell", "type": "stop", "status": "new", "qty": "4", "stop_price": "204"}],
                  "source": "alpaca_paper", "synced_at": "2026-07-16T14:29:00+00:00"
                }""",
                encoding="utf-8",
            )
            (memory / "EXECUTION_PLAN.json").write_text(
                """{"date": "2026-07-16", "candidates": [{"symbol": "AAPL", "side": "BUY", "approved": false, "entry": 216, "stop": 204, "target": 240, "reason": "Breakout watch"}]}""",
                encoding="utf-8",
            )
            (memory / "MARKET_VISION.json").write_text(
                """{"generated_at": "2026-07-16T14:20:00+00:00", "market_regime": {"state": "constructive", "score": 0.75, "position_size_multiplier": 0.75, "price_components": [{"symbol": "SPY", "latest": 620, "sma50": 610, "sma200": 580}]}, "risk_flags": ["AAPL earnings soon"], "symbol_context": {"AAPL": {"news_count": 2, "filing_count": 1, "headlines": [{"source": "sec_edgar", "title": "AAPL 8-K", "url": ""}]}}}""",
                encoding="utf-8",
            )
            (memory / "DRAWDOWN_LOCK.json").write_text(
                """{"created_at": "2026-07-16T13:00:00+00:00", "reason": "max_drawdown_lock", "details": {"equity": 72.1, "peak_equity": 100, "max_drawdown": 0.279}}""",
                encoding="utf-8",
            )
            (memory / "DATA_HEALTH.json").write_text(
                """{"generated_at": "2026-07-16T14:25:00+00:00", "ok": false, "checks": {"providers": {"ok": true}, "walk_forward_file": {"ok": false, "reason": "older than 168h"}}}""",
                encoding="utf-8",
            )
            (memory / "OBJECTIVE_EVALUATION.json").write_text(
                """{"generated_at": "2026-07-16T14:26:00+00:00", "summary": {"candidate_count": 1, "passed": 0, "failed": 1, "auto_approval": false}}""",
                encoding="utf-8",
            )
            (memory / "DECISIONS.jsonl").write_text(
                """{"timestamp":"2026-07-16T14:27:00+00:00","action":"preflight_failed","ok":false,"details":{"problems":["drawdown guard blocked trading"]}}\n""",
                encoding="utf-8",
            )
            (journals / "trades.jsonl").write_text(
                """{"symbol":"AAPL","side":"buy","entry_at":"2026-07-15T14:00:00+00:00","exit_at":"2026-07-15T18:00:00+00:00","net_pnl":42.5,"return_pct":0.012,"exit_reason":"take_profit","strategy":"breakout"}\n""",
                encoding="utf-8",
            )

            with patch.object(usagi, "OPENTRADE_DIR", root):
                snapshot = builder(now=datetime(2026, 7, 16, 14, 30, tzinfo=timezone.utc))

        self.assertEqual(snapshot["mode"], "READ_ONLY")
        self.assertTrue(snapshot["connected"])
        self.assertEqual(snapshot["account"]["equity"], 10000.0)
        self.assertEqual(snapshot["positions"][0]["symbol"], "AAPL")
        self.assertEqual(snapshot["positions"][0]["unrealizedPnl"], 24.0)
        self.assertEqual(snapshot["orders"][0]["stopPrice"], 204.0)
        self.assertEqual(snapshot["plans"][0]["riskReward"], 2.0)
        self.assertTrue(snapshot["risk"]["locked"])
        self.assertEqual(snapshot["market"]["regime"], "constructive")
        self.assertEqual(snapshot["journal"][0]["pnl"], 42.5)
        self.assertEqual(snapshot["decisions"][0]["title"], "Preflight checks blocked the run")
        self.assertEqual(
            snapshot["decisions"][0]["explanation"],
            "OpenTrade stopped before order submission because a required safety check failed.",
        )
        self.assertIn(
            {"label": "Failed check", "value": "drawdown guard blocked trading"},
            snapshot["decisions"][0]["evidence"],
        )
        self.assertTrue(any(alert["title"] == "Drawdown lock active" for alert in snapshot["alerts"]))
        self.assertNotIn("execute", snapshot)
        self.assertNotIn("commands", snapshot)

    @staticmethod
    def write_fill_journal(root: Path) -> None:
        import json
        import sqlite3

        memory = root / "memory"
        memory.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema_version": 1,
            "closed_trades": [
                {"id": "SPY:win", "symbol": "SPY", "side": "long", "entry_at": "2026-09-15T18:38:10+00:00", "exit_at": "2026-09-15T18:38:39+00:00", "qty": "0.002641", "entry_price": 757.238, "exit_price": 757.264, "gross_pnl": 0.0000687, "net_pnl": None, "entry_order_ids": ["entry-win"], "exit_order_ids": ["exit-win"]},
                {"id": "SPY:loss", "symbol": "SPY", "side": "long", "entry_at": "2026-09-15T18:42:12+00:00", "exit_at": "2026-09-15T18:43:08+00:00", "qty": "0.00264", "entry_price": 757.366, "exit_price": 757.236, "gross_pnl": -0.000343, "net_pnl": None, "entry_order_ids": ["entry-loss"], "exit_order_ids": ["exit-loss"]},
            ],
            "loss_reviews": [{"trade_id": "SPY:loss", "held_minutes": 0.92, "finding": "The long position closed below entry."}],
        }
        connection = sqlite3.connect(memory / "DECISIONS.fills.sqlite3")
        connection.execute("CREATE TABLE snapshot (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL)")
        connection.execute("INSERT INTO snapshot (id, payload) VALUES (1, ?)", (json.dumps(payload),))
        connection.commit()
        connection.close()
        (memory / "DECISIONS.jsonl").write_text(
            '{"timestamp":"2026-09-15T18:42:12+00:00","action":"submit_volume_order","mode":"paper-volume","ok":true,"details":{"broker_order_id":"entry-loss","signal_independent":true,"symbol":"SPY"}}\n',
            encoding="utf-8",
        )

    def test_trade_journal_logs_broker_fills_with_loss_reviews(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_fill_journal(root)
            (root / "journals").mkdir()
            (root / "journals" / "trades.jsonl").write_text('{"symbol":"OLD","net_pnl":1}\n', encoding="utf-8")
            reviews = root / "reviews.json"
            reviews.write_text('{"SPY:loss": {"status": "done", "explanation": "Spread noise."}}', encoding="utf-8")

            with patch.object(usagi, "OPENTRADE_DIR", root), patch.object(usagi, "TRADE_REVIEWS_FILE", reviews):
                journal = usagi.build_trade_companion_snapshot(now=datetime(2026, 9, 15, 19, tzinfo=timezone.utc))["journal"]

        self.assertEqual([trade["id"] for trade in journal], ["SPY:loss", "SPY:win"])
        loss, win = journal
        self.assertEqual(loss["outcome"], "loss")
        self.assertEqual(loss["strategy"], "paper-volume")
        self.assertEqual(loss["entryPrice"], 757.366)
        self.assertAlmostEqual(loss["returnPct"], (757.236 - 757.366) / 757.366)
        self.assertEqual(loss["review"], {"status": "done", "explanation": "Spread noise."})
        self.assertIn({"label": "Entry reason", "value": "Signal-independent test order (no trade thesis)"}, loss["evidence"])
        self.assertIn({"label": "Exit order", "value": "Not found in OpenTrade's decision log"}, loss["evidence"])
        self.assertEqual(loss["notes"], ["The long position closed below entry."])
        self.assertNotIn("entryOrder", str(loss["evidence"]))
        self.assertEqual(win["outcome"], "profit")
        self.assertEqual(win["review"], {"status": "pending"})

    async def _review_trades(self, root: Path, reviews: Path, runner):
        research = AsyncMock(return_value={
            "queries": ["SPY September 15 2026"],
            "sources": [{"title": "Market wrap", "url": "https://example.com/wrap", "content": "Stocks were flat."}],
            "warnings": [],
        })
        with (
            patch.object(usagi, "OPENTRADE_DIR", root),
            patch.object(usagi, "TRADE_REVIEWS_FILE", reviews),
            patch.object(usagi, "load_env_file"),
            patch.object(usagi, "build_agent", return_value=SimpleNamespace(model="test")),
            patch.object(usagi, "run_research", new=research),
            patch.object(usagi.Runner, "run", new=runner),
        ):
            count = await usagi.review_new_trades()
        return count, research

    ANALYST_OUTPUT = {
        "explanation": "SPY slipped 0.02% in under a minute with no news; the loss was spread noise.",
        "sentiment": {"stance": "Bearish", "summary": "Coverage was cautious as yields rose, but it did not drive a one-minute move."},
        "psychology": {
            "market": "Fear rose into the Fed decision as the VIX climbed.",
            "decision": "The system re-entered within a minute of a loss, a pattern that resembles overtrading.",
            "biases": ["Overtrading", " ", "Recency bias"],
        },
        "lesson": "Check the spread before signal-independent test orders.",
        "sources": ["https://example.com/wrap", "https://invented.example"],
    }

    def test_researches_each_symbol_day_once_and_explains_every_win_and_loss(self):
        import asyncio
        import json

        with TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_fill_journal(root)
            reviews = root / "reviews.json"
            runner = AsyncMock(return_value=SimpleNamespace(final_output=json.dumps(self.ANALYST_OUTPUT)))

            count, research = asyncio.run(self._review_trades(root, reviews, runner))
            again, research_again = asyncio.run(self._review_trades(root, reviews, runner))
            stored = json.loads(reviews.read_text(encoding="utf-8"))

        self.assertEqual((count, again), (2, 0))
        questions = [call.args[0] for call in research.call_args_list]
        self.assertIn("What moved SPY on September 15, 2026", questions[0])
        self.assertIn("How did the public and investors view SPY around September 15, 2026", questions[1])
        self.assertIn("social media sentiment", questions[1])
        self.assertIn("investor psychology and market mood around September 15, 2026", questions[2])
        self.assertIn("Fear and greed index", questions[2])
        self.assertEqual(len(questions), 3, "both trades share one SPY research day")
        self.assertIn("this closed trade made money", runner.call_args_list[0].args[0].instructions)
        self.assertIn("this closed trade lost money", runner.call_args_list[1].args[0].instructions)
        self.assertIn("exited around 2:43 PM ET", runner.call_args_list[1].args[0].instructions)
        self.assertIn("public perceived SPY", runner.call_args_list[1].args[0].instructions)
        self.assertIn("never as feelings the system had", runner.call_args_list[1].args[0].instructions)
        research_again.assert_not_called()
        analyst_input = json.loads(runner.call_args.args[1])
        self.assertIn("sentiment_research", analyst_input)
        self.assertIn("psychology_research", analyst_input)
        self.assertEqual(analyst_input["behavior_context"]["tradesEnteredSameDay"], 2)
        self.assertEqual(analyst_input["behavior_context"]["previousTrades"][0]["outcome"], "profit")
        self.assertEqual(analyst_input["behavior_context"]["consecutiveLossesBeforeEntry"], 0)
        self.assertTrue(analyst_input["trade"]["evidence"]["entryOrder"]["details"]["signal_independent"])
        self.assertEqual(stored["SPY:loss"]["status"], "done")
        self.assertIn("spread noise", stored["SPY:loss"]["explanation"])
        self.assertEqual(stored["SPY:loss"]["sentiment"]["stance"], "bearish")
        self.assertIn("yields rose", stored["SPY:loss"]["sentiment"]["summary"])
        self.assertEqual(stored["SPY:loss"]["sources"], [{"title": "Market wrap", "url": "https://example.com/wrap"}])
        self.assertEqual(len(stored["SPY:loss"]["queries"]), 3)
        self.assertEqual(stored["SPY:loss"]["psychology"]["biases"], ["Overtrading", "Recency bias"])
        self.assertIn("VIX climbed", stored["SPY:loss"]["psychology"]["market"])
        self.assertEqual(stored["SPY:win"]["status"], "done")

    def test_accepts_model_json_wrapped_in_prose_or_trailing_commas(self):
        import json

        parsed = usagi.parse_model_json_object('Here you go:\n```json\n{"explanation": "a", "biases": ["x",],}\n```')

        self.assertEqual(parsed, {"explanation": "a", "biases": ["x"]})
        with self.assertRaises(ValueError):
            usagi.parse_model_json_object("no object here")
        with self.assertRaises(json.JSONDecodeError):
            usagi.parse_model_json_object('{"explanation": "a" "lesson": "b"}')

    def test_rereviews_trades_researched_before_psychology_and_rejects_missing_psychology(self):
        import asyncio
        import json

        with TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_fill_journal(root)
            reviews = root / "reviews.json"
            reviews.write_text(json.dumps({
                "SPY:win": {"status": "done", "explanation": "Old review.", "sentiment": {"stance": "mixed", "summary": "Mixed."}},
                "SPY:loss": {"status": "done", "explanation": "Current review.", "sentiment": {"stance": "mixed", "summary": "Mixed."}, "psychology": {"market": "Calm.", "decision": "Test order.", "biases": []}},
            }), encoding="utf-8")
            no_psychology = {key: value for key, value in self.ANALYST_OUTPUT.items() if key != "psychology"}
            runner = AsyncMock(return_value=SimpleNamespace(final_output=json.dumps(no_psychology)))

            count, _ = asyncio.run(self._review_trades(root, reviews, runner))
            stored = json.loads(reviews.read_text(encoding="utf-8"))

        self.assertEqual(count, 1)
        self.assertEqual(stored["SPY:win"]["status"], "error")
        self.assertIn("no market and decision psychology", stored["SPY:win"]["error"])
        self.assertEqual(stored["SPY:loss"]["explanation"], "Current review.")

    def test_records_trade_research_failures_for_display(self):
        import asyncio
        import json

        with TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_fill_journal(root)
            reviews = root / "reviews.json"
            runner = AsyncMock(side_effect=RuntimeError("Claude Code failed"))

            asyncio.run(self._review_trades(root, reviews, runner))
            again, _ = asyncio.run(self._review_trades(root, reviews, runner))
            stored = json.loads(reviews.read_text(encoding="utf-8"))

        self.assertEqual(again, 0)
        self.assertEqual(stored["SPY:win"]["status"], "error")
        self.assertEqual(stored["SPY:loss"]["status"], "error")
        self.assertIn("Claude Code failed", stored["SPY:loss"]["error"])

    def write_plan_project(self, root: Path, trading_url: str = "https://paper-api.alpaca.markets") -> None:
        import json

        (root / "memory").mkdir(parents=True, exist_ok=True)
        (root / ".env").write_text(f"ALPACA_TRADING_URL={trading_url}\nALPACA_API_KEY=secret\n", encoding="utf-8")
        (root / "memory" / "PORTFOLIO_STATE.json").write_text(
            '{"account": {}, "clock": {"is_open": true}, "positions": [], "open_orders": []}', encoding="utf-8"
        )
        (root / "memory" / "EXECUTION_PLAN.json").write_text(json.dumps({
            "generated_at": "2026-09-15T18:34:12+00:00",
            "candidates": [
                {"symbol": "AAPL", "side": "BUY", "approved": False, "reason": "Breakout",
                 "objective_evaluation": {"passed": True}},
                {"symbol": "NVDA", "side": "BUY", "approved": False, "reason": "Watch",
                 "objective_evaluation": {"passed": False, "failure_conditions": ["spread too wide"]}},
            ],
        }), encoding="utf-8")

    @contextmanager
    def trade_write_patches(self, root: Path, settings: Path, runs: Path):
        with (
            patch.object(usagi, "OPENTRADE_DIR", root),
            patch.object(usagi, "TRADE_SETTINGS_FILE", settings),
            patch.object(usagi, "RUNS_FILE", runs),
        ):
            yield

    def test_plan_approval_is_refused_while_trade_companion_is_read_only(self):
        with TemporaryDirectory() as directory:
            root = Path(directory) / "opentrade"
            self.write_plan_project(root)
            settings, runs = Path(directory) / "settings.json", Path(directory) / "runs.jsonl"

            with self.trade_write_patches(root, settings, runs):
                self.assertTrue(usagi.trade_read_only())
                with self.assertRaises(usagi.TradeWriteError) as refusal:
                    usagi.set_plan_approval("AAPL", "BUY", "approve")
                snapshot = usagi.build_trade_companion_snapshot(now=datetime(2026, 9, 15, 18, 40, tzinfo=timezone.utc))
            wrote_approvals = (root / "memory" / "EXECUTION_PLAN.approvals.json").exists()

            self.assertIn("read-only", str(refusal.exception))
            self.assertFalse(wrote_approvals)
            self.assertEqual(snapshot["mode"], "READ_ONLY")
            self.assertTrue(snapshot["readOnly"])

    def test_turning_off_read_only_lets_approvals_reach_opentrade(self):
        import json

        with TemporaryDirectory() as directory:
            root = Path(directory) / "opentrade"
            self.write_plan_project(root)
            settings, runs = Path(directory) / "settings.json", Path(directory) / "runs.jsonl"
            now = datetime(2026, 9, 15, 18, 40, tzinfo=timezone.utc)

            with self.trade_write_patches(root, settings, runs), patch.object(usagi, "eastern_date", return_value="2026-09-15"):
                usagi.set_trade_read_only(False)
                approved = usagi.set_plan_approval("aapl", "buy", "approve")
                blocked = usagi.set_plan_approval("NVDA", "BUY", "approve")
                snapshot = usagi.build_trade_companion_snapshot(now=now)
                approvals = json.loads((root / "memory" / "EXECUTION_PLAN.approvals.json").read_text(encoding="utf-8"))
                plan = json.loads((root / "memory" / "EXECUTION_PLAN.json").read_text(encoding="utf-8"))
                rejected = usagi.set_plan_approval("AAPL", "BUY", "reject")
                after_reject = usagi.build_trade_companion_snapshot(now=now)
                usagi.set_trade_read_only(True)
                locked_again = usagi.build_trade_companion_snapshot(now=now)

        candidates = {row["symbol"]: row for row in plan["candidates"]}
        plans = {row["symbol"]: row for row in snapshot["plans"]}
        self.assertEqual(approvals["trading_day"], "2026-09-15")
        self.assertEqual(approvals["approvals"]["AAPL:BUY"]["decision"], "approve")
        self.assertTrue(candidates["AAPL"]["approved"])
        self.assertIn("approved", approved["detail"])
        self.assertFalse(candidates["NVDA"]["approved"])
        self.assertEqual(candidates["NVDA"]["approval_blocked_reason"], "objective evaluation failed")
        self.assertIn("objective evaluation failed", blocked["detail"])
        self.assertEqual(snapshot["mode"], "PLAN_APPROVALS")
        self.assertFalse(snapshot["readOnly"])
        self.assertEqual(plans["AAPL"]["approvalDecision"], "approve")
        self.assertTrue(plans["AAPL"]["approved"])
        self.assertEqual(plans["NVDA"]["approvalBlockedReason"], "objective evaluation failed")
        self.assertIn("rejected", rejected["detail"])
        after = {row["symbol"]: row for row in after_reject["plans"]}
        self.assertEqual(after["AAPL"]["approvalDecision"], "reject")
        self.assertFalse(after["AAPL"]["approved"])
        self.assertTrue(locked_again["readOnly"])

    def test_write_mode_and_approvals_require_the_alpaca_paper_endpoint(self):
        with TemporaryDirectory() as directory:
            root = Path(directory) / "opentrade"
            self.write_plan_project(root, trading_url="https://api.alpaca.markets")
            settings, runs = Path(directory) / "settings.json", Path(directory) / "runs.jsonl"

            with self.trade_write_patches(root, settings, runs):
                self.assertFalse(usagi.opentrade_is_paper())
                with self.assertRaises(usagi.TradeWriteError) as refusal:
                    usagi.set_trade_read_only(False)
                usagi.write_json(settings, {"readOnly": False})
                with self.assertRaises(usagi.TradeWriteError) as approval_refusal:
                    usagi.set_plan_approval("AAPL", "BUY", "approve")
            wrote_approvals = (root / "memory" / "EXECUTION_PLAN.approvals.json").exists()

            self.assertIn("paper endpoint", str(refusal.exception))
            self.assertIn("paper endpoint", str(approval_refusal.exception))
            self.assertFalse(wrote_approvals)

    def test_yesterdays_approvals_do_not_apply_today(self):
        from trade_companion import read_manual_approvals

        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "memory").mkdir()
            (root / "memory" / "EXECUTION_PLAN.approvals.json").write_text(
                '{"trading_day": "2026-09-14", "approvals": {"AAPL:BUY": {"decision": "approve"}}}', encoding="utf-8"
            )
            stale = read_manual_approvals(root, datetime(2026, 9, 15, 18, 40, tzinfo=timezone.utc))
            same_day = read_manual_approvals(root, datetime(2026, 9, 14, 18, 40, tzinfo=timezone.utc))

        self.assertEqual(stale, {})
        self.assertEqual(same_day, {"AAPL:BUY": "approve"})

    def test_reports_scheduled_automation_runs_and_what_failed(self):
        from trade_companion import read_automations

        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            (root / "logs").mkdir()
            (root / "scripts" / "scheduled_pre_market_research.bat").write_text(
                "echo ==== %DATE% %TIME% pre-market-research ====>> logs\\scheduler.log\n"
                "python scripts\\run_command.py cloud-preflight\n"
                "python scripts\\run_command.py research-market\n",
                encoding="utf-8",
            )
            (root / "scripts" / "scheduled_end_of_day_review.bat").write_text(
                "echo ==== %DATE% %TIME% end-of-day-review ====>> logs\\scheduler.log\n"
                "python scripts\\run_command.py sync-state\n",
                encoding="utf-8",
            )
            (root / "scripts" / "install_scheduled_tasks.ps1").write_text(
                '$tasks = @(\n'
                '    @{\n        Name = "OpenTrade PreMarket Research"\n        Script = "scheduled_pre_market_research.bat"\n        Time = "07:30"\n    },\n'
                '    @{\n        Name = "OpenTrade End Of Day Review"\n        Script = "scheduled_end_of_day_review.bat"\n        Time = "15:05"\n    }\n)\n',
                encoding="utf-8",
            )
            (root / "logs" / "scheduler.log").write_text(
                "==== Tue 09/15/2026  7:30:00.32 pre-market-research ====\n"
                '{\n  "ok": true,\n  "path": "C:\\\\OpenTrade\\\\memory\\\\MARKET_VISION.json"\n}\n'
                '{\n  "ok": false,\n  "skipped": "missing Telegram credentials"\n}\n'
                "exit_code=0\n"
                "==== Tue 09/15/2026 15:05:00.29 end-of-day-review ====\n"
                '{\n  "ok": false,\n  "skipped": "TradingView tv CLI not found"\n}\n'
                "exit_code=1\n",
                encoding="utf-8",
            )

            automations = read_automations(root, datetime(2026, 9, 15, 20, 5, tzinfo=timezone.utc))

        routines = {row["name"]: row for row in automations["routines"]}
        premarket = routines["pre-market-research"]
        review = routines["end-of-day-review"]
        self.assertEqual(premarket["label"], "OpenTrade PreMarket Research")
        self.assertEqual(premarket["scheduledAt"], "07:30")
        self.assertEqual(premarket["steps"], ["cloud-preflight", "research-market"])
        self.assertEqual(premarket["lastRun"]["status"], "warning")
        self.assertEqual(premarket["lastRun"]["warnings"], ["missing Telegram credentials"])
        self.assertEqual(premarket["lastRun"]["failures"], [])
        self.assertEqual(premarket["lastRun"]["artifacts"], ["MARKET_VISION.json"])
        self.assertEqual(review["lastRun"]["status"], "failed")
        self.assertEqual(review["lastRun"]["warnings"], ["TradingView tv CLI not found"])
        self.assertEqual([run["name"] for run in automations["recentRuns"]], ["end-of-day-review", "pre-market-research"])

    def test_automations_degrade_when_opentrade_has_no_scheduler_log(self):
        from trade_companion import read_automations

        with TemporaryDirectory() as directory:
            automations = read_automations(Path(directory), datetime(2026, 9, 15, tzinfo=timezone.utc))

        self.assertEqual(automations, {"routines": [], "recentRuns": [], "logAgeMinutes": None})

    def test_long_trading_log_does_not_hide_premarket_and_risk_is_managed_in_session(self):
        from trade_companion import read_automations

        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            (root / "logs").mkdir()
            for name, command in [("pre-market-research", "research-market"),
                                   ("paper-test-execute", "market-session-execute"),
                                   ("midday-risk-execute", "midday-risk-execute")]:
                (root / "scripts" / f"scheduled_{name}.bat").write_text(
                    f"echo ==== %DATE% %TIME% {name} ====\npython scripts\\run_command.py {command}\n", encoding="utf-8")
            (root / "scripts" / "market_session.py").write_text('steps = [("risk", ["midday"])]', encoding="utf-8")
            (root / "logs" / "scheduler.log").write_text(
                "==== Wed 09/16/2026  7:30:00.44 pre-market-research ====\nexit_code=0\n"
                "==== Wed 09/16/2026  8:25:00.33 paper-test-execute ====\n"
                + '{"event": "step", "name": "risk", "ok": true}\n' * 6500
                + "exit_code=0\n", encoding="utf-8")
            result = read_automations(root, datetime(2026, 9, 16, 22, tzinfo=timezone.utc))
        routines = {row["name"]: row for row in result["routines"]}
        self.assertEqual(routines["pre-market-research"]["lastRun"]["status"], "completed")
        self.assertTrue(routines["midday-risk-execute"]["managedBy"])
        self.assertEqual(routines["midday-risk-execute"]["managedRun"]["riskChecks"], 6500)

    def test_optional_warning_keeps_history_and_marks_later_recovery(self):
        from trade_companion import read_automations

        with TemporaryDirectory() as directory:
            root = Path(directory)
            for folder in ("scripts", "logs", "memory"):
                (root / folder).mkdir()
            (root / "scripts" / "scheduled_review.bat").write_text(
                "echo ==== %DATE% %TIME% end-of-day-review ====\n", encoding="utf-8")
            (root / "logs" / "scheduler.log").write_text(
                '==== Wed 09/16/2026 15:05:00.40 end-of-day-review ====\n'
                '  "skipped": "TradingView tv CLI not found"\n'
                '  "skipped": "missing Telegram credentials"\n'
                '  "skipped": "no notification integration configured"\nexit_code=0\n', encoding="utf-8")
            for filename in ("TRADINGVIEW_REVIEW.json", "NOTIFICATION_STATUS.json"):
                (root / "memory" / filename).write_text(
                    '{"ok": true, "generated_at": "2026-09-18T03:00:00+00:00"}', encoding="utf-8")
            result = read_automations(root, datetime(2026, 9, 18, 4, tzinfo=timezone.utc))
        routine = result["routines"][0]
        self.assertEqual(routine["lastRun"]["status"], "warning")
        self.assertEqual(routine["resolvedWarnings"], routine["lastRun"]["warnings"])

    def test_summarizes_what_pre_market_research_found(self):
        from trade_companion import read_research

        research = read_research(
            {
                "generated_at": "2026-09-15T18:30:05+00:00",
                "market_regime": {"state": "neutral", "score": 0.25, "notes": ["realized volatility calm at 8.8%"]},
                "provider_status": [
                    {"provider": "alpaca_news", "state": "ok", "detail": "10 articles", "items": 10},
                    {"provider": "fred_macro", "state": "skipped", "detail": "missing FRED_API_KEY", "items": 0},
                ],
                "risk_flags": ["NVDA: heavy news flow (9 items); reduce confidence until reviewed."],
                "symbol_context": {
                    "NVDA": {"news_count": 9, "filing_count": 0, "headlines": [
                        {"title": "SK Hynix ships HBM4", "url": "https://example.com/nvda", "source": "alpaca_news"},
                    ]},
                },
            },
            {
                "generated_at": "2026-09-15T17:46:52+00:00",
                "person": "Nancy Pelosi",
                "research_only": True,
                "new_items": 1,
                "symbol_context": {"NVDA": {"actions": ["buy"], "max_leader_signal_score": 0.8, "headlines": [
                    {"title": "Pelosi disclosure", "url": "https://example.com/leader", "source": "google_news_rss"},
                ]}},
            },
        )

        self.assertEqual(research["regime"]["state"], "neutral")
        self.assertEqual([row["state"] for row in research["providers"]], ["ok", "skipped"])
        self.assertEqual(research["providers"][1]["detail"], "missing FRED_API_KEY")
        self.assertEqual(research["symbols"][0]["symbol"], "NVDA")
        self.assertEqual(research["symbols"][0]["headlines"][0]["url"], "https://example.com/nvda")
        self.assertEqual(research["leaderWatch"]["person"], "Nancy Pelosi")
        self.assertTrue(research["leaderWatch"]["researchOnly"])
        self.assertEqual(research["leaderWatch"]["symbols"][0]["actions"], ["buy"])
        self.assertEqual(read_research({}, {})["providers"], [])

    def write_two_account_project(self, root: Path) -> None:
        import json

        (root / "memory").mkdir(parents=True, exist_ok=True)
        (root / ".env").write_text(
            "ALPACA_API_KEY_ID=primary-key\n"
            "ALPACA_API_SECRET_KEY=primary-secret\n"
            "ALPACA_TRADING_URL=https://paper-api.alpaca.markets\n"
            "ALPACA_API_KEY_ID_2=second-key\n"
            "ALPACA_API_SECRET_KEY_2=second-secret\n"
            "ALPACA_ACCOUNT_LABEL_2=Small $100 account\n"
            "PORTFOLIO_STATE_FILE_2=memory/PORTFOLIO_STATE_2.json\n"
            "ALPACA_AUTOTRADE_ACTION_LOG_2=memory/DECISIONS_2.jsonl\n"
            "ALPACA_AUTOTRADE_PLAN_FILE_2=memory/EXECUTION_PLAN_2.json\n",
            encoding="utf-8",
        )
        for name, equity in (("PORTFOLIO_STATE.json", "10000"), ("PORTFOLIO_STATE_2.json", "100")):
            (root / "memory" / name).write_text(json.dumps({
                "account": {"status": "ACTIVE", "equity": equity, "currency": "USD"},
                "clock": {"is_open": True}, "positions": [], "open_orders": [],
            }), encoding="utf-8")

    def test_lists_every_configured_alpaca_account_without_exposing_keys(self):
        from trade_companion import list_accounts

        with TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_two_account_project(root)
            accounts = list_accounts(root)

        self.assertEqual([account["id"] for account in accounts], ["primary", "2"])
        second = accounts[1]
        self.assertEqual(second["label"], "Small $100 account")
        self.assertTrue(second["paperOnly"])
        self.assertEqual(second["paths"]["portfolio"], "memory/PORTFOLIO_STATE_2.json")
        self.assertEqual(second["paths"]["decisions"], "memory/DECISIONS_2.jsonl")
        self.assertIn("vision", second["sharedWithPrimary"], "research files are shared unless overridden")
        self.assertNotIn("portfolio", second["sharedWithPrimary"])
        self.assertNotIn("second-key", json.dumps(accounts))
        self.assertNotIn("second-secret", json.dumps(accounts))

    def test_swaps_trade_companion_between_accounts(self):
        with TemporaryDirectory() as directory:
            root = Path(directory) / "opentrade"
            self.write_two_account_project(root)
            settings, runs = Path(directory) / "settings.json", Path(directory) / "runs.jsonl"
            now = datetime(2026, 9, 15, 18, 40, tzinfo=timezone.utc)

            with self.trade_write_patches(root, settings, runs):
                primary = usagi.build_trade_companion_snapshot(now=now)
                switched = usagi.set_trade_account("2")
                second = usagi.build_trade_companion_snapshot(now=now)
                with self.assertRaises(usagi.TradeWriteError):
                    usagi.set_trade_account("missing")
                usagi.set_trade_account("primary")
                back = usagi.build_trade_companion_snapshot(now=now)

        self.assertEqual(primary["accountId"], "primary")
        self.assertEqual(primary["account"]["equity"], 10000.0)
        self.assertEqual(switched, {"id": "2", "label": "Small $100 account"})
        self.assertEqual(second["accountId"], "2")
        self.assertEqual(second["account"]["label"], "Small $100 account")
        self.assertEqual(second["account"]["equity"], 100.0)
        self.assertEqual([row["id"] for row in second["accounts"]], ["primary", "2"])
        self.assertEqual(back["account"]["equity"], 10000.0)

    def test_each_account_approves_into_its_own_plan(self):
        import json

        with TemporaryDirectory() as directory:
            root = Path(directory) / "opentrade"
            self.write_two_account_project(root)
            for name in ("EXECUTION_PLAN.json", "EXECUTION_PLAN_2.json"):
                (root / "memory" / name).write_text(json.dumps({
                    "generated_at": "2026-09-15T18:34:12+00:00",
                    "candidates": [{"symbol": "AAPL", "side": "BUY", "approved": False,
                                    "objective_evaluation": {"passed": True}}],
                }), encoding="utf-8")
            settings, runs = Path(directory) / "settings.json", Path(directory) / "runs.jsonl"

            with self.trade_write_patches(root, settings, runs), patch.object(usagi, "eastern_date", return_value="2026-09-15"):
                usagi.set_trade_read_only(False)
                usagi.set_trade_account("2")
                result = usagi.set_plan_approval("AAPL", "BUY", "approve")
                second_plan = json.loads((root / "memory" / "EXECUTION_PLAN_2.json").read_text(encoding="utf-8"))
                primary_plan = json.loads((root / "memory" / "EXECUTION_PLAN.json").read_text(encoding="utf-8"))
                usagi.set_trade_account("primary")
                usagi.set_trade_read_only(True)
            approval_files = sorted(item.name for item in (root / "memory").glob("*.approvals.json"))

        self.assertEqual(result["account"], "2")
        self.assertTrue(second_plan["candidates"][0]["approved"])
        self.assertFalse(primary_plan["candidates"][0]["approved"], "the primary plan is untouched")
        self.assertEqual(approval_files, ["EXECUTION_PLAN_2.approvals.json"])

    def test_summarizes_tradingview_charts_and_serves_only_saved_images(self):
        from trade_companion import chart_image_path, read_tradingview

        with TemporaryDirectory() as directory:
            root = Path(directory)
            charts = root / "memory" / "tradingview"
            charts.mkdir(parents=True)
            (charts / "SPY.png").write_bytes(b"\x89PNG spy")
            (root / ".env").write_text("ALPACA_API_SECRET_KEY=secret\n", encoding="utf-8")
            (root / "memory" / "TRADINGVIEW_REVIEW.json").write_text(json.dumps({
                "generated_at": "2026-09-16T20:05:00+00:00",
                "connected": True,
                "timeframe": "5",
                "reviews": [
                    {"symbol": "SPY", "image": "memory/tradingview/SPY.png", "captured_at": "2026-09-16T20:05:10+00:00", "error": None},
                    {"symbol": "QQQ", "image": None, "captured_at": None, "error": "Chart pane not found"},
                ],
            }), encoding="utf-8")

            summary = read_tradingview(root)
            spy = chart_image_path(root, "SPY")
            with patch.object(usagi, "OPENTRADE_DIR", root):
                served = usagi.trade_chart_image(" spy ")
                traversal = [usagi.trade_chart_image(value) for value in ("../.env", "..", "SPY/../../.env", "")]
            missing = chart_image_path(root, "QQQ")

        self.assertTrue(summary["connected"])
        self.assertEqual(summary["problem"], "")
        self.assertEqual(
            [(chart["symbol"], chart["available"]) for chart in summary["charts"]],
            [("SPY", True), ("QQQ", False)],
        )
        self.assertEqual(summary["charts"][1]["error"], "Chart pane not found")
        self.assertEqual(spy.name, "SPY.png")
        self.assertEqual(served, spy)
        self.assertEqual(traversal, [None, None, None, None])
        self.assertIsNone(missing)

    def test_tradingview_summary_explains_a_missing_cli_or_closed_desktop(self):
        from trade_companion import read_tradingview

        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "memory").mkdir()
            never_run = read_tradingview(root)
            (root / "memory" / "TRADINGVIEW_REVIEW.json").write_text(json.dumps({
                "generated_at": "2026-09-16T20:05:00+00:00", "ok": False,
                "skipped": "TradingView tv CLI not found",
                "expected": "Install tradingview-mcp and make its `tv` command available, or set TRADINGVIEW_TV_CLI.",
            }), encoding="utf-8")
            no_cli = read_tradingview(root)
            (root / "memory" / "TRADINGVIEW_REVIEW.json").write_text(json.dumps({
                "generated_at": "2026-09-16T20:05:00+00:00", "connected": False,
                "reviews": [{"symbol": "SPY", "image": None, "error": "TradingView Desktop is not reachable; launch it with --remote-debugging-port=9222"}],
            }), encoding="utf-8")
            closed = read_tradingview(root)

        self.assertEqual(never_run["problem"], "OpenTrade has not run a TradingView review yet.")
        self.assertIn("TradingView tv CLI not found", no_cli["problem"])
        self.assertIn("TRADINGVIEW_TV_CLI", no_cli["problem"])
        self.assertIn("--remote-debugging-port=9222", closed["problem"])
        self.assertFalse(closed["connected"])

    def test_desktop_api_serves_tradingview_chart_images(self):
        source = Path("usagi_web.pyw").read_text(encoding="utf-8")

        self.assertIn('parsed.path == "/api/trades/chart"', source)
        self.assertIn("usagi.trade_chart_image(symbol)", source)
        self.assertIn('"Content-Type", "image/png"', source)

    def test_trade_companion_degrades_safely_when_snapshots_are_missing(self):
        builder = getattr(usagi, "build_trade_companion_snapshot", None)
        self.assertIsNotNone(builder)

        with TemporaryDirectory() as directory:
            missing = Path(directory) / "missing"
            with patch.object(usagi, "OPENTRADE_DIR", missing):
                snapshot = builder(now=datetime(2026, 7, 16, tzinfo=timezone.utc))

        self.assertFalse(snapshot["connected"])
        self.assertEqual(snapshot["positions"], [])
        self.assertEqual(snapshot["orders"], [])
        self.assertEqual(snapshot["plans"], [])
        self.assertEqual(snapshot["alerts"][0]["severity"], "critical")

    def test_trade_companion_explains_empty_plan_from_closed_scanner_windows(self):
        builder = getattr(usagi, "build_trade_companion_snapshot", None)
        self.assertIsNotNone(builder)

        with TemporaryDirectory() as directory:
            root = Path(directory)
            memory = root / "memory"
            memory.mkdir()
            (root / ".env").write_text(
                "STOCK_SCANNER_PROFILE=riley_reversal,tony_pdh_pdl\n"
                "RILEY_CORE_TIMES_ET=09:45,10:00\n"
                "RILEY_TIMING_WINDOW_MINUTES=8\n"
                "TONY_FIRST_MINUTES=60\n",
                encoding="utf-8",
            )
            (memory / "PORTFOLIO_STATE.json").write_text(
                '{"account": {}, "clock": {"is_open": true}, "positions": [], "open_orders": []}',
                encoding="utf-8",
            )
            (memory / "EXECUTION_PLAN.json").write_text(
                '{"generated_at":"2026-09-15T18:34:12+00:00","candidates":[]}',
                encoding="utf-8",
            )
            (memory / "DATA_HEALTH.json").write_text(
                '{"generated_at":"2026-09-15T18:34:00+00:00","ok":true}',
                encoding="utf-8",
            )
            (memory / "OBJECTIVE_EVALUATION.json").write_text(
                '{"generated_at":"2026-09-15T18:34:13+00:00","summary":{"candidate_count":0,"passed":0,"failed":0,"auto_approval":false}}',
                encoding="utf-8",
            )
            (memory / "DECISIONS.jsonl").write_text(
                '{"timestamp":"2026-09-15T18:34:13+00:00","action":"no_approved_plan_candidates","mode":"market-open","ok":false,"details":{"plan_file":"memory/EXECUTION_PLAN.json"}}\n',
                encoding="utf-8",
            )

            with patch.object(usagi, "OPENTRADE_DIR", root):
                snapshot = builder(now=datetime(2026, 9, 15, 18, 35, tzinfo=timezone.utc))

        decision = snapshot["decisions"][0]
        self.assertEqual(decision["title"], "Scanner windows were closed")
        self.assertIn("2:34 PM ET", decision["detail"])
        self.assertIn("outside every enabled scanner window", decision["detail"])
        self.assertEqual(decision["explanation"], "OpenTrade produced zero plan candidates, so none could be approved or executed.")
        self.assertIn({"label": "Riley reversal", "value": "9:37–10:08 AM ET"}, decision["evidence"])
        self.assertIn({"label": "Tony PDH/PDL", "value": "9:30–10:30 AM ET"}, decision["evidence"])
        self.assertIn({"label": "Plan candidates", "value": "0"}, decision["evidence"])
        self.assertIn({"label": "Data health", "value": "Passed"}, decision["evidence"])
        self.assertIn({"label": "Risk lock", "value": "Clear"}, decision["evidence"])

    def test_trade_companion_explains_other_recorded_decision_types(self):
        from trade_companion import _normalize_decisions

        rows = [
            {"timestamp": "2026-09-15T18:40:00+00:00", "action": "notify_skipped", "ok": False, "details": {"ok": False, "skipped": "no notification integration configured"}},
            {"timestamp": "2026-09-15T18:41:00+00:00", "action": "existing_open_position", "mode": "market-open", "ok": False, "details": {"positions": ["QQQ"]}},
            {"timestamp": "2026-09-15T18:42:00+00:00", "action": "risk_limit", "mode": "market-open", "ok": False, "details": {"loss_cooldown": {"blocked": True, "consecutive_losses": 2, "cooldown_until": "2026-09-15T22:43:48+00:00", "warnings": ["2 consecutive losing filled round trips before fees (limit 2)"]}}},
        ]
        context = {
            "plan": {},
            "health": {},
            "lock": {},
            "settings": {
                "STOCK_SCANNER_PROFILE": "riley_reversal,tony_pdh_pdl",
                "RILEY_CORE_TIMES_ET": "09:45,10:00",
                "RILEY_TIMING_WINDOW_MINUTES": 8,
                "TONY_FIRST_MINUTES": 60,
            },
        }

        decisions = {row["action"]: row for row in _normalize_decisions(rows, context)}
        self.assertEqual(decisions["notify skipped"]["title"], "Notification was skipped")
        self.assertIn("no notification integration configured", decisions["notify skipped"]["detail"])
        self.assertEqual(decisions["existing open position"]["title"], "Existing QQQ position prevented a new entry")
        self.assertIn("already open", decisions["existing open position"]["detail"])
        self.assertEqual(decisions["risk limit"]["title"], "Loss cooldown blocked trading")
        self.assertIn("2 consecutive losing filled round trips", decisions["risk limit"]["detail"])

    def test_desktop_api_exposes_only_a_read_only_trade_snapshot(self):
        web = load_web_app()
        payload = {"mode": "READ_ONLY", "connected": True}
        trade_payload = getattr(web, "trade_payload", None)
        self.assertIsNotNone(trade_payload)

        with patch.object(web.usagi, "build_trade_companion_snapshot", return_value=payload) as build:
            self.assertEqual(trade_payload(), payload)

        build.assert_called_once_with()
        source = Path("usagi_web.pyw").read_text(encoding="utf-8")
        self.assertIn('parsed.path == "/api/trades"', source)
        self.assertNotIn('parsed.path == "/api/trades/execute"', source)

    def test_trade_route_does_not_break_the_existing_status_payload(self):
        web = load_web_app()

        payload = web.status_payload()

        self.assertIsInstance(payload, dict)
        self.assertIn("actions", payload)
        self.assertIn("dueReminders", payload)
        self.assertTrue(payload["ready"])


class CodexBackendTests(unittest.IsolatedAsyncioTestCase):
    async def test_model_selection_is_specific_to_each_request(self):
        first = usagi.build_agent("codex", "gpt-5.5")
        second = usagi.build_agent("codex", "gpt-6-astra")
        claude = usagi.build_agent("claude", "opus")
        self.assertEqual(first.model.model_name, "gpt-5.5")
        self.assertEqual(second.model.model_name, "gpt-6-astra")
        self.assertEqual(claude.model.model_name, "opus")

    async def test_model_picker_excludes_hidden_codex_models(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "models_cache.json").write_text(
                '{"models":[{"slug":"visible","display_name":"Visible","visibility":"list"},'
                '{"slug":"hidden","visibility":"hide"}]}', encoding="utf-8"
            )
            with patch.dict(os.environ, {"CODEX_HOME": directory}):
                options = usagi.model_options()
        self.assertEqual(options["codex"], [{"id": "visible", "name": "Visible"}])

    async def test_explicit_codex_selection_uses_account_backend(self):
        from codex_model import CodexModel

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test"}):
            agent = usagi.build_agent("codex")
        self.assertIsInstance(agent.model, CodexModel)
        self.assertFalse(any(isinstance(tool, usagi.WebSearchTool) for tool in agent.tools))

    async def test_codex_runs_usagi_tool_and_returns_answer(self):
        from codex_model import CodexModel

        model = CodexModel()
        with patch.object(model, "complete", new=AsyncMock(side_effect=[
            {"tool_calls": [{"name": "get_memory", "arguments": {}}], "answer": ""},
            {"tool_calls": [], "answer": "No saved facts."},
        ])), patch.object(usagi, "read_json", return_value={}):
            result = await usagi.Runner.run(
                usagi.Agent(name="Test", model=model, tools=[usagi.get_memory]), "Recall my facts"
            )
        self.assertEqual(result.final_output, "No saved facts.")

    async def test_rejects_invalid_provider(self):
        with self.assertRaisesRegex(ValueError, "connection"):
            usagi.build_agent("unknown")


class ClaudeBackendTests(unittest.IsolatedAsyncioTestCase):
    async def test_defaults_to_claude_without_api_configuration(self):
        from claude_model import ClaudeCodeModel

        with patch.dict(os.environ, {"USAGI_BASE_URL": "", "OPENAI_API_KEY": ""}):
            agent = usagi.build_agent()
        self.assertIsInstance(agent.model, ClaudeCodeModel)
        self.assertFalse(any(isinstance(tool, usagi.WebSearchTool) for tool in agent.tools))

    async def test_claude_can_call_usagi_tools_and_answer(self):
        from claude_model import ClaudeCodeModel

        model = ClaudeCodeModel()
        with patch.object(model, "complete", new=AsyncMock(side_effect=[
            {"tool_calls": [{"name": "get_memory", "arguments": {}}], "answer": ""},
            {"tool_calls": [], "answer": "No saved facts."},
        ])) as complete, patch.object(usagi, "read_json", return_value={}):
            result = await usagi.Runner.run(
                usagi.Agent(name="Test", model=model, tools=[usagi.get_memory]),
                "What do you remember?",
            )
        self.assertEqual(result.final_output, "No saved facts.")
        self.assertIn("function_call_output", complete.call_args.args[0])

    async def test_rejects_unknown_tool_calls(self):
        from claude_model import ClaudeCodeModel

        model = ClaudeCodeModel()
        with patch.object(model, "complete", new=AsyncMock(return_value={
            "tool_calls": [{"name": "run_shell", "arguments": {}}], "answer": ""
        })):
            with self.assertRaisesRegex(RuntimeError, "unknown tool"):
                await usagi.Runner.run(
                    usagi.Agent(name="Test", model=model, tools=[usagi.get_memory]), "test"
                )


class ResearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_planning_failure_still_searches_original_question(self):
        with (
            patch.object(usagi.Runner, "run", side_effect=RuntimeError("planner unavailable")),
            patch.object(usagi, "search_web_rows", return_value=[
                {"title": "Source", "href": "https://example.com", "body": "Evidence"}
            ]) as search,
        ):
            result = await usagi.run_research("my question", "test", mode="speed")
        search.assert_called_once_with("my question", 5)
        self.assertEqual(result["sources"][0]["url"], "https://example.com")
        self.assertIn("planner unavailable", result["warnings"][0])

    async def test_refines_queries_and_merges_duplicate_sources(self):
        with (
            patch.object(usagi.Runner, "run", new=AsyncMock(side_effect=[
                SimpleNamespace(final_output='{"queries": [" first ", "FIRST"]}'),
                SimpleNamespace(final_output='{"sufficient": false, "queries": ["FIRST", "second"]}'),
            ])),
            patch.object(usagi, "search_web_rows", side_effect=[
                [{"title": "Source", "href": "https://example.com", "body": "First evidence"}],
                [{"title": "Source", "href": "https://example.com", "body": "Second evidence"}],
            ]) as search,
        ):
            result = await usagi.run_research("question", "test")
        self.assertEqual([call.args[0] for call in search.call_args_list], ["first", "second"])
        self.assertEqual(len(result["sources"]), 1)
        self.assertIn("Second evidence", result["sources"][0]["content"])

    async def test_empty_results_retry_raw_question(self):
        with (
            patch.object(usagi.Runner, "run", new=AsyncMock(return_value=
                SimpleNamespace(final_output='{"queries": ["planned"]}'))),
            patch.object(usagi, "search_web_rows", return_value=[]) as search,
        ):
            result = await usagi.run_research("question", "test", mode="speed")
        self.assertEqual([call.args[0] for call in search.call_args_list], ["planned", "question"])
        self.assertEqual(result["sources"], [])


class AgentDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_research_action_gathers_sources_before_answering(self):
        agent = SimpleNamespace(model="test", instructions="Usagi")
        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "test"}),
            patch.object(usagi, "load_env_file"),
            patch.object(usagi, "ensure_aios_dirs"),
            patch.object(usagi, "ensure_state_dir"),
            patch.object(usagi, "SQLiteSession", return_value=FakeSession()),
            patch.object(usagi, "build_agent", return_value=agent),
            patch.object(usagi, "run_research", new=AsyncMock(return_value={"sources": []})) as research,
            patch.object(usagi.Runner, "run", new=AsyncMock(return_value=SimpleNamespace(final_output="No sources found."))),
            patch.object(usagi, "append_jsonl"),
        ):
            await usagi.ask_agent("Research the web for: batteries")
        self.assertEqual(research.call_args.args[:2], ("batteries", "test"))
        self.assertIn("sources", agent.instructions)

    async def test_limits_persistent_history_for_the_local_model(self):
        session = FakeSession()

        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "test"}),
            patch.object(usagi, "load_env_file"),
            patch.object(usagi, "ensure_aios_dirs"),
            patch.object(usagi, "ensure_state_dir"),
            patch.object(usagi, "SQLiteSession", return_value=session) as session_factory,
            patch.object(usagi, "build_agent", return_value=object()),
            patch.object(
                usagi.Runner,
                "run",
                new=AsyncMock(return_value=SimpleNamespace(final_output="Daily briefing ready.")),
            ),
            patch.object(usagi, "append_jsonl"),
        ):
            await usagi.ask_agent("Give me my daily briefing.")

        settings = session_factory.call_args.kwargs.get("session_settings")
        self.assertIsNotNone(settings)
        self.assertEqual(settings.limit, 12)

    async def test_removes_unanswered_session_tail_before_a_new_turn(self):
        completed = {"type": "message", "role": "assistant", "content": []}
        session = FakeSession([completed, {"role": "user", "content": "failed request"}])
        histories = []

        async def run_turn(*_args, **_kwargs):
            histories.append(await session.get_items())
            return SimpleNamespace(final_output="Daily briefing ready.")

        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "test"}),
            patch.object(usagi, "load_env_file"),
            patch.object(usagi, "ensure_aios_dirs"),
            patch.object(usagi, "ensure_state_dir"),
            patch.object(usagi, "SQLiteSession", return_value=session),
            patch.object(usagi, "build_agent", return_value=object()),
            patch.object(usagi.Runner, "run", side_effect=run_turn),
            patch.object(usagi, "append_jsonl"),
        ):
            result = await usagi.ask_agent("Give me my daily briefing.")

        self.assertEqual(result, "Daily briefing ready.")
        self.assertEqual(histories, [[completed]])

    async def test_rolls_back_an_empty_turn_before_retrying(self):
        completed = [
            {"type": "message", "role": "assistant", "content": [], "id": index}
            for index in range(13)
        ]
        session = FakeSession(completed, default_limit=12)
        histories = []

        async def run_turn(_agent, prompt, **_kwargs):
            histories.append(await session.get_items())
            session.items.append({"role": "user", "content": prompt})
            output = "" if len(histories) == 1 else "Daily briefing ready."
            return SimpleNamespace(final_output=output)

        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "test"}),
            patch.object(usagi, "load_env_file"),
            patch.object(usagi, "ensure_aios_dirs"),
            patch.object(usagi, "ensure_state_dir"),
            patch.object(usagi, "SQLiteSession", return_value=session),
            patch.object(usagi, "build_agent", return_value=object()),
            patch.object(usagi.Runner, "run", side_effect=run_turn),
            patch.object(usagi, "append_jsonl"),
        ):
            result = await usagi.ask_agent("Give me my daily briefing.")

        self.assertEqual(result, "Daily briefing ready.")
        self.assertEqual(histories, [completed[-12:], completed[-12:]])

    async def test_retries_once_when_the_model_returns_an_empty_delivery(self):
        run = AsyncMock(
            side_effect=[
                SimpleNamespace(final_output=""),
                SimpleNamespace(final_output="Email setup is required."),
            ]
        )

        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "test"}),
            patch.object(usagi, "load_env_file"),
            patch.object(usagi, "ensure_aios_dirs"),
            patch.object(usagi, "ensure_state_dir"),
            patch.object(usagi, "SQLiteSession", return_value=FakeSession()),
            patch.object(usagi, "build_agent", return_value=object()),
            patch.object(usagi.Runner, "run", run),
            patch.object(usagi, "append_jsonl"),
        ):
            result = await usagi.ask_agent("Check my email")

        self.assertEqual(result, "Email setup is required.")
        self.assertEqual(run.await_count, 2)


if __name__ == "__main__":
    unittest.main()
