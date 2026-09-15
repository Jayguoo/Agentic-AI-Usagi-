import importlib.util
import os
import subprocess
import unittest
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
        self.assertTrue(any(alert["title"] == "Drawdown lock active" for alert in snapshot["alerts"]))
        self.assertNotIn("execute", snapshot)
        self.assertNotIn("commands", snapshot)

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


class AgentDeliveryTests(unittest.IsolatedAsyncioTestCase):
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
