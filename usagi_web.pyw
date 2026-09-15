import asyncio
import json
import mimetypes
import os
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from openai import OpenAIError

import usagi


ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
DIST_DIR = WEB_DIR / "dist"
HOST = "127.0.0.1"
PORT = int(os.environ.get("USAGI_PORT", "8765"))

# If a production build exists, serve from dist/ instead of raw web/
STATIC_DIR = DIST_DIR if (DIST_DIR / "index.html").exists() else WEB_DIR


def json_response(handler: BaseHTTPRequestHandler, status: int, data: dict) -> None:
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def read_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    if not length:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    return json.loads(raw or "{}")


def status_payload() -> dict:
    usagi.ensure_aios_dirs()
    memory = usagi.read_json(usagi.MEMORY_FILE, {})
    tasks = usagi.read_jsonl(usagi.TASKS_FILE)
    pending = [row for row in usagi.read_jsonl(usagi.ACTIONS_FILE) if row.get("status") == "pending"]
    runs = usagi.read_jsonl(usagi.RUNS_FILE)
    knowledge_counts = {
        area: len(list((usagi.KNOWLEDGE_DIR / area).glob("*.txt")))
        for area in sorted(usagi.KNOWLEDGE_AREAS)
    }
    reminders = usagi.read_jsonl(usagi.REMINDERS_FILE)
    return {
        "memoryFacts": len(memory),
        "openTasks": len([task for task in tasks if task.get("status", "open") == "open"]),
        "pendingActions": len(pending),
        "skills": len(usagi.read_skill_files()),
        "knowledgeFiles": knowledge_counts,
        "recentRuns": runs[-5:],
        "actions": pending,
        "dueReminders": usagi.due_reminder_rows(),
        "scheduledReminders": len([r for r in reminders if r.get("status") == "scheduled"]),
        "email": usagi.email_connection_status(),
        "ready": True,
    }


def trade_payload() -> dict:
    return usagi.build_trade_companion_snapshot()


def connect_email_payload(body: dict) -> dict:
    return usagi.connect_email(
        str(body.get("address", "")),
        str(body.get("appPassword", "")),
    )


class UsagiHandler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            json_response(self, 200, {"ok": True})
            return
        if parsed.path == "/api/status":
            json_response(self, 200, status_payload())
            return
        if parsed.path == "/api/trades":
            json_response(self, 200, trade_payload())
            return
        if parsed.path == "/api/actions":
            json_response(self, 200, {"actions": status_payload()["actions"]})
            return

        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        try:
            body = read_body(self)
            if parsed.path == "/api/email/connect":
                try:
                    email = connect_email_payload(body)
                    json_response(self, 200, {"email": email, "status": status_payload()})
                except usagi.EmailConnectionError as error:
                    json_response(self, 400, {"error": str(error)})
                return

            if parsed.path == "/api/chat":
                message = str(body.get("message", "")).strip()
                if not message:
                    json_response(self, 400, {"error": "Message is empty."})
                    return
                try:
                    answer = asyncio.run(usagi.ask_agent(message))
                    json_response(self, 200, {"answer": answer, "status": status_payload()})
                except OpenAIError as error:
                    json_response(self, 502, {"error": f"OpenAI API error: {error}"})
                except Exception as error:
                    json_response(self, 500, {"error": f"{type(error).__name__}: {error}"})
                return

            if parsed.path == "/api/approve":
                action_id = str(body.get("id", "")).strip()
                if not action_id:
                    json_response(self, 400, {"error": "Missing action id."})
                    return
                result = usagi.approve_action(action_id)
                json_response(self, 200, {"result": result, "status": status_payload()})
                return

            if parsed.path == "/api/reminder":
                reminder_id = str(body.get("id", "")).strip()
                op = str(body.get("op", "")).strip()
                if not reminder_id or op not in ("done", "snooze"):
                    json_response(self, 400, {"error": "Missing reminder id or bad op."})
                    return
                result = usagi.update_reminder(reminder_id, op)
                json_response(self, 200, {"result": result, "status": status_payload()})
                return

            if parsed.path == "/api/open":
                target = str(body.get("target", "")).strip().lower()
                targets = {
                    "vault": usagi.VAULT_DIR,
                    "skills": usagi.SKILLS_DIR,
                    "knowledge": usagi.KNOWLEDGE_DIR,
                    "opentrade": usagi.OPENTRADE_DIR,
                }
                path = targets.get(target)
                if path is None:
                    json_response(self, 400, {"error": "Unknown target."})
                    return
                usagi.ensure_aios_dirs()
                os.startfile(path)
                json_response(self, 200, {"ok": True})
                return

            json_response(self, 404, {"error": "Not found."})
        except json.JSONDecodeError:
            json_response(self, 400, {"error": "Invalid JSON."})

    def serve_static(self, path: str) -> None:
        if path in ("", "/"):
            file_path = STATIC_DIR / "index.html"
        elif path == "/Usagi.png":
            file_path = ROOT / "Usagi.png"
        elif path == "/Usagi.ico":
            file_path = ROOT / "Usagi.ico"
        elif path == "/favicon.ico":
            file_path = ROOT / "Usagi.ico"
        else:
            requested = Path(path.lstrip("/"))
            file_path = (STATIC_DIR / requested).resolve()
            # Allow serving from both STATIC_DIR and root asset files
            allowed = [STATIC_DIR.resolve(), ROOT.resolve()]
            if not any(file_path == a or a in file_path.parents for a in allowed):
                self.send_error(403)
                return

        if not file_path.exists() or not file_path.is_file():
            self.send_error(404)
            return

        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def start_server() -> None:
    try:
        server = ThreadingHTTPServer((HOST, PORT), UsagiHandler)
    except OSError:
        return

    server.serve_forever()


if __name__ == "__main__":
    start_server()
