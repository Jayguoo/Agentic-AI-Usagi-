import argparse
import asyncio
import base64
import ctypes
import imaplib
import json
import os
import re
import secrets
import urllib.request
from datetime import datetime, timedelta, timezone
from ctypes import wintypes
from email import message_from_bytes
from email.header import decode_header
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from agents import (
    Agent,
    OpenAIChatCompletionsModel,
    Runner,
    SessionSettings,
    SQLiteSession,
    WebSearchTool,
    function_tool,
    set_tracing_disabled,
)
from openai import AsyncOpenAI, OpenAIError

from trade_companion import build_snapshot as _build_trade_companion_snapshot


ROOT = Path(__file__).resolve().parent
STATE_DIR = ROOT / "state"
MEMORY_FILE = STATE_DIR / "memory.json"
TASKS_FILE = STATE_DIR / "tasks.jsonl"
ACTIONS_FILE = STATE_DIR / "pending_actions.jsonl"
RUNS_FILE = STATE_DIR / "loop_runs.jsonl"
REMINDERS_FILE = STATE_DIR / "reminders.jsonl"
EMAIL_CREDENTIAL_FILE = STATE_DIR / "email_credentials.json"
SKILLS_DIR = ROOT / "skills"
KNOWLEDGE_DIR = ROOT / "knowledge"
KNOWLEDGE_AREAS = {"raw", "wiki", "outputs"}
VAULT_DIR = Path(r"C:\Users\Jaygu\Documents\Obsidian Vault")
OPENTRADE_DIR = Path(r"C:\Users\Jaygu\pp\OpenTrade")
SESSION_HISTORY_LIMIT = 12
SESSION_STORAGE_SCAN_LIMIT = 1_000_000
OPENTRADE_ALLOWED_SUFFIXES = {
    ".cfg",
    ".cmd",
    ".css",
    ".html",
    ".ini",
    ".js",
    ".json",
    ".jsonl",
    ".jsx",
    ".md",
    ".ps1",
    ".py",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}
OPENTRADE_SKIPPED_DIRS = {
    ".git",
    ".playwright-mcp",
    ".uv-cache",
    ".venv",
    "__pycache__",
    "graphify-out",
    "logs",
}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_state_dir() -> None:
    STATE_DIR.mkdir(exist_ok=True)


def ensure_aios_dirs() -> None:
    ensure_state_dir()
    SKILLS_DIR.mkdir(exist_ok=True)
    for area in KNOWLEDGE_AREAS:
        area_dir = KNOWLEDGE_DIR / area
        area_dir.mkdir(parents=True, exist_ok=True)
        index_file = area_dir / "index.json"
        if not index_file.exists():
            write_json(index_file, {"area": area, "items": [], "updated_at": now_iso()})


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    ensure_state_dir()
    path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def append_jsonl(path: Path, item: dict[str, Any]) -> None:
    ensure_state_dir()
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(item, sort_keys=True) + "\n")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []

    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def rewrite_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    ensure_state_dir()
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, sort_keys=True) + "\n")


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9 _-]+", "", value).strip()
    slug = re.sub(r"\s+", " ", slug)
    return slug or "Untitled"


def read_skill_files() -> list[dict[str, Any]]:
    if not SKILLS_DIR.exists():
        return []

    skills: list[dict[str, Any]] = []
    for path in sorted(SKILLS_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        data["file"] = path.name
        skills.append(data)
    return skills


def resolve_knowledge_file(area: str, title: str) -> Path:
    clean_area = area.strip().lower()
    if clean_area not in KNOWLEDGE_AREAS:
        raise ValueError("Knowledge area must be raw, wiki, or outputs.")

    return KNOWLEDGE_DIR / clean_area / f"{safe_slug(title)}.txt"


def update_knowledge_index(path: Path, title: str, summary: str) -> None:
    index_file = path.parent / "index.json"
    index = read_json(index_file, {"area": path.parent.name, "items": []})
    items = [item for item in index.get("items", []) if item.get("file") != path.name]
    items.append(
        {
            "file": path.name,
            "title": title,
            "summary": summary,
            "updated_at": now_iso(),
        }
    )
    write_json(index_file, {"area": path.parent.name, "items": items, "updated_at": now_iso()})


def resolve_vault_file(relative_path: str) -> Path:
    cleaned = relative_path.strip().replace("/", "\\")
    path = (VAULT_DIR / cleaned).resolve()
    vault = VAULT_DIR.resolve()
    if vault != path and vault not in path.parents:
        raise ValueError("Path must stay inside the Obsidian vault.")
    return path


def stage_action(kind: str, payload: dict[str, Any], summary: str) -> str:
    action = {
        "id": secrets.token_hex(4),
        "kind": kind,
        "payload": payload,
        "status": "pending",
        "summary": summary,
        "created_at": now_iso(),
    }
    append_jsonl(ACTIONS_FILE, action)
    return (
        f"Staged action {action['id']}: {summary}\n"
        f"Jay can approve it with: approve {action['id']}"
    )


@function_tool
def get_memory() -> str:
    """Return Usagi's saved private memory facts."""
    memory = read_json(MEMORY_FILE, {})
    if not memory:
        return "No saved memory yet."
    return json.dumps(memory, indent=2, sort_keys=True)


@function_tool
def stage_memory_fact(key: str, value: str, reason: str = "") -> str:
    """Stage a private memory fact for Jay's approval."""
    clean_key = key.strip()
    clean_value = value.strip()
    if not clean_key or not clean_value:
        return "A memory fact needs both a key and a value."

    return stage_action(
        "memory_fact",
        {"key": clean_key, "value": clean_value, "reason": reason.strip()},
        f"remember {clean_key!r}",
    )


@function_tool
def list_tasks(status: str = "open") -> str:
    """List saved tasks by status."""
    requested = status.strip().lower()
    tasks = [
        task
        for task in read_jsonl(TASKS_FILE)
        if requested in ("all", task.get("status", "open").lower())
    ]
    if not tasks:
        return f"No {requested} tasks."
    return json.dumps(tasks[-30:], indent=2, sort_keys=True)


@function_tool
def stage_task(title: str, project: str = "", due: str = "", notes: str = "") -> str:
    """Stage a task for Jay's approval."""
    clean_title = title.strip()
    if not clean_title:
        return "A task needs a title."

    return stage_action(
        "task",
        {
            "title": clean_title,
            "project": project.strip(),
            "due": due.strip(),
            "notes": notes.strip(),
        },
        f"add task {clean_title!r}",
    )


@function_tool
def search_obsidian(query: str, max_results: int = 8) -> str:
    """Search Jay's Obsidian vault markdown files for a phrase."""
    needle = query.strip().lower()
    if not needle:
        return "Search query was empty."
    if not VAULT_DIR.exists():
        return f"Vault not found: {VAULT_DIR}"

    results: list[dict[str, Any]] = []
    for path in VAULT_DIR.rglob("*.md"):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        index = text.lower().find(needle)
        if index == -1:
            continue

        start = max(0, index - 140)
        end = min(len(text), index + len(needle) + 240)
        results.append(
            {
                "path": str(path.relative_to(VAULT_DIR)),
                "snippet": text[start:end].replace("\n", " ").strip(),
            }
        )
        if len(results) >= max(1, min(max_results, 20)):
            break

    if not results:
        return "No matching Obsidian notes found."
    return json.dumps(results, indent=2, sort_keys=True)


@function_tool
def read_obsidian_note(relative_path: str, max_chars: int = 6000) -> str:
    """Read one markdown note from Jay's Obsidian vault."""
    try:
        path = resolve_vault_file(relative_path)
    except ValueError as error:
        return str(error)

    if not path.exists() or not path.is_file():
        return f"Note not found: {relative_path}"

    text = path.read_text(encoding="utf-8", errors="ignore")
    return text[: max(500, min(max_chars, 20000))]


@function_tool
def stage_obsidian_note(title: str, body: str, folder: str = "Inbox") -> str:
    """Stage a new or appended Obsidian note for Jay's approval."""
    clean_title = safe_slug(title)
    clean_folder = safe_slug(folder).replace("\\", "").replace("/", "") or "Inbox"
    relative_path = f"{clean_folder}\\{clean_title}.md"

    return stage_action(
        "obsidian_note",
        {"relative_path": relative_path, "title": clean_title, "body": body.strip()},
        f"write Obsidian note {relative_path!r}",
    )


@function_tool
def search_workspace(query: str, max_results: int = 12) -> str:
    """Search non-secret text files in Usagi's local project folder."""
    needle = query.strip().lower()
    if not needle:
        return "Search query was empty."

    allowed_suffixes = {".py", ".toml", ".txt", ".json", ".jsonl", ".cmd"}
    skipped_dirs = {".venv", "state", "__pycache__"}
    results: list[dict[str, Any]] = []

    for path in ROOT.rglob("*"):
        if any(part in skipped_dirs for part in path.relative_to(ROOT).parts):
            continue
        if not path.is_file() or path.name.startswith(".env") or path.suffix not in allowed_suffixes:
            continue

        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        index = text.lower().find(needle)
        if index == -1:
            continue

        start = max(0, index - 120)
        end = min(len(text), index + len(needle) + 220)
        results.append(
            {
                "path": str(path.relative_to(ROOT)),
                "snippet": text[start:end].replace("\n", " ").strip(),
            }
        )
        if len(results) >= max(1, min(max_results, 20)):
            break

    if not results:
        return "No matching workspace files found."
    return json.dumps(results, indent=2, sort_keys=True)


def resolve_opentrade_file(relative_path: str) -> Path:
    root = OPENTRADE_DIR.resolve()
    path = (root / relative_path).resolve()
    if root != path and root not in path.parents:
        raise ValueError("Path must stay inside the OpenTrade project.")

    parts = [part.lower() for part in path.relative_to(root).parts]
    if any(part in OPENTRADE_SKIPPED_DIRS for part in parts[:-1]):
        raise ValueError("That OpenTrade directory is not available to Usagi.")
    if any(part.startswith(".env") for part in parts):
        raise ValueError("OpenTrade environment files are not available to Usagi.")
    if path.suffix.lower() not in OPENTRADE_ALLOWED_SUFFIXES:
        raise ValueError("That OpenTrade file type is not available to Usagi.")
    return path


def read_opentrade_text(relative_path: str, max_chars: int = 12000) -> str:
    path = resolve_opentrade_file(relative_path)
    if not path.exists() or not path.is_file():
        return f"OpenTrade file not found: {relative_path}"
    return path.read_text(encoding="utf-8", errors="ignore")[: max(500, min(max_chars, 30000))]


def build_trade_companion_snapshot(now: datetime | None = None) -> dict[str, Any]:
    return _build_trade_companion_snapshot(OPENTRADE_DIR, now=now)


def search_opentrade_files(query: str, max_results: int = 12) -> list[dict[str, str]]:
    needle = query.strip().lower()
    if not needle or not OPENTRADE_DIR.exists():
        return []

    results: list[dict[str, str]] = []
    for directory, child_dirs, filenames in os.walk(OPENTRADE_DIR):
        child_dirs[:] = [
            name for name in child_dirs if name.lower() not in OPENTRADE_SKIPPED_DIRS
        ]
        for filename in filenames:
            path = Path(directory) / filename
            try:
                if path.stat().st_size > 2_000_000:
                    continue
                safe_path = resolve_opentrade_file(str(path.relative_to(OPENTRADE_DIR)))
                text = safe_path.read_text(encoding="utf-8", errors="ignore")
            except (OSError, ValueError):
                continue
            index = text.lower().find(needle)
            if index == -1:
                continue
            start = max(0, index - 120)
            end = min(len(text), index + len(needle) + 220)
            results.append(
                {
                    "path": str(safe_path.relative_to(OPENTRADE_DIR)),
                    "snippet": text[start:end].replace("\n", " ").strip(),
                }
            )
            if len(results) >= max(1, min(max_results, 20)):
                return results
    return results


@function_tool
def search_opentrade(query: str, max_results: int = 12) -> str:
    """Read-only search of safe source and documentation files in Jay's OpenTrade project."""
    if not query.strip():
        return "Search query was empty."
    results = search_opentrade_files(query, max_results)
    if not results:
        return "No matching OpenTrade files found."
    return json.dumps(results, indent=2, sort_keys=True)


@function_tool
def read_opentrade_file(relative_path: str, max_chars: int = 12000) -> str:
    """Read one safe text file from Jay's OpenTrade project without modifying or executing it."""
    try:
        return read_opentrade_text(relative_path, max_chars)
    except (OSError, ValueError) as error:
        return str(error)


@function_tool
def list_pending_actions() -> str:
    """List staged actions waiting for Jay's approval."""
    pending = [row for row in read_jsonl(ACTIONS_FILE) if row.get("status") == "pending"]
    if not pending:
        return "No pending actions."
    return json.dumps(pending, indent=2, sort_keys=True)


@function_tool
def list_skills() -> str:
    """List Usagi AIOS skill definitions."""
    ensure_aios_dirs()
    skills = read_skill_files()
    if not skills:
        return "No skills found."
    return json.dumps(
        [
            {
                "name": skill.get("name"),
                "purpose": skill.get("purpose"),
                "triggers": skill.get("triggers", []),
            }
            for skill in skills
        ],
        indent=2,
        sort_keys=True,
    )


@function_tool
def read_skill(name: str) -> str:
    """Read one Usagi AIOS skill by name or file."""
    ensure_aios_dirs()
    needle = name.strip().lower()
    for skill in read_skill_files():
        skill_name = str(skill.get("name", "")).lower()
        file_name = str(skill.get("file", "")).lower()
        if needle in {skill_name, file_name}:
            return json.dumps(skill, indent=2, sort_keys=True)
    return f"No skill found for {name!r}."


@function_tool
def list_knowledge_indexes() -> str:
    """List raw/wiki/outputs knowledge indexes."""
    ensure_aios_dirs()
    indexes: dict[str, Any] = {}
    for area in sorted(KNOWLEDGE_AREAS):
        indexes[area] = read_json(KNOWLEDGE_DIR / area / "index.json", {"items": []})
    return json.dumps(indexes, indent=2, sort_keys=True)


@function_tool
def search_knowledge(query: str, max_results: int = 8) -> str:
    """Search Usagi's structured raw/wiki/outputs knowledge store."""
    ensure_aios_dirs()
    needle = query.strip().lower()
    if not needle:
        return "Search query was empty."

    results: list[dict[str, Any]] = []
    for area in sorted(KNOWLEDGE_AREAS):
        for path in sorted((KNOWLEDGE_DIR / area).glob("*.txt")):
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue

            index = text.lower().find(needle)
            if index == -1:
                continue

            start = max(0, index - 140)
            end = min(len(text), index + len(needle) + 240)
            results.append(
                {
                    "area": area,
                    "path": str(path.relative_to(KNOWLEDGE_DIR)),
                    "snippet": text[start:end].replace("\n", " ").strip(),
                }
            )
            if len(results) >= max(1, min(max_results, 20)):
                return json.dumps(results, indent=2, sort_keys=True)

    if not results:
        return "No matching structured knowledge found."
    return json.dumps(results, indent=2, sort_keys=True)


@function_tool
def stage_knowledge_file(area: str, title: str, body: str, summary: str = "") -> str:
    """Stage a raw/wiki/outputs knowledge file for Jay's approval."""
    try:
        path = resolve_knowledge_file(area, title)
    except ValueError as error:
        return str(error)

    clean_body = body.strip()
    if not clean_body:
        return "A knowledge file needs a body."

    return stage_action(
        "knowledge_file",
        {
            "area": area.strip().lower(),
            "title": safe_slug(title),
            "relative_path": str(path.relative_to(KNOWLEDGE_DIR)),
            "body": clean_body,
            "summary": summary.strip(),
        },
        f"write {area.strip().lower()} knowledge {safe_slug(title)!r}",
    )


@function_tool
def record_loop_run(skill_name: str, outcome: str, improvement: str = "", score: int = 0) -> str:
    """Record how a skill or automation run performed so future runs can improve."""
    ensure_aios_dirs()
    clean_skill = skill_name.strip() or "general"
    item = {
        "id": secrets.token_hex(4),
        "skill": clean_skill,
        "outcome": outcome.strip(),
        "improvement": improvement.strip(),
        "score": max(0, min(score, 10)),
        "created_at": now_iso(),
    }
    append_jsonl(RUNS_FILE, item)
    return f"Recorded loop run {item['id']} for {clean_skill}."


@function_tool
def aios_status() -> str:
    """Return a compact status report for Usagi's AIOS state."""
    ensure_aios_dirs()
    memory = read_json(MEMORY_FILE, {})
    tasks = read_jsonl(TASKS_FILE)
    pending = [row for row in read_jsonl(ACTIONS_FILE) if row.get("status") == "pending"]
    runs = read_jsonl(RUNS_FILE)
    knowledge_counts = {
        area: len(list((KNOWLEDGE_DIR / area).glob("*.txt"))) for area in sorted(KNOWLEDGE_AREAS)
    }
    status = {
        "skills": len(read_skill_files()),
        "memory_facts": len(memory),
        "open_tasks": len([task for task in tasks if task.get("status", "open") == "open"]),
        "pending_actions": len(pending),
        "knowledge_files": knowledge_counts,
        "recent_loop_runs": runs[-5:],
    }
    return json.dumps(status, indent=2, sort_keys=True)


class _TextExtractor(HTMLParser):
    _SKIP = {"script", "style", "noscript", "template"}

    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in self._SKIP:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip_depth and data.strip():
            self._chunks.append(data.strip())

    def text(self) -> str:
        return "\n".join(self._chunks)


@function_tool
def fetch_url(url: str, max_chars: int = 6000) -> str:
    """Fetch one web page and return its readable text, e.g. to summarize into a note."""
    if not url.lower().startswith(("http://", "https://")):
        return "Only http(s) URLs are allowed."
    request = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (Usagi personal agent)"}
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            content_type = response.headers.get("Content-Type", "")
            raw = response.read(1_500_000)
    except OSError as error:
        return f"Could not fetch {url}: {error}"

    text = raw.decode("utf-8", errors="ignore")
    if "html" in content_type or "<html" in text[:500].lower():
        extractor = _TextExtractor()
        extractor.feed(text)
        text = extractor.text()
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return f"No readable text found at {url}."
    return text[:max_chars]


@function_tool
def web_search(query: str, max_results: int = 5) -> str:
    """Search the web (DuckDuckGo) and return titles, URLs, and snippets."""
    try:
        from ddgs import DDGS

        rows = DDGS().text(query.strip(), max_results=max_results)
    except Exception as error:
        return f"Search failed: {error}"
    if not rows:
        return f"No results for: {query}"
    return "\n".join(
        f"- {row.get('title', '')}\n  {row.get('href', '')}\n  {row.get('body', '')}"
        for row in rows
    )


def parse_reminder_time(when: str) -> datetime:
    cleaned = when.strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    raise ValueError("Reminder time must be local time formatted as YYYY-MM-DD HH:MM.")


@function_tool
def stage_reminder(text: str, when: str) -> str:
    """Stage a reminder for Jay's approval. `when` is local time, formatted YYYY-MM-DD HH:MM."""
    clean_text = text.strip()
    if not clean_text:
        return "Reminder text is empty."
    try:
        due = parse_reminder_time(when)
    except ValueError as error:
        return str(error)
    due_str = due.strftime("%Y-%m-%d %H:%M")
    return stage_action(
        "reminder",
        {"text": clean_text, "due_at": due_str},
        f"Reminder {due_str}: {clean_text[:80]}",
    )


@function_tool
def list_reminders(include_done: bool = False) -> str:
    """List Jay's reminders. Scheduled only by default; include_done adds history."""
    rows = read_jsonl(REMINDERS_FILE)
    if not include_done:
        rows = [row for row in rows if row.get("status") == "scheduled"]
    if not rows:
        return "No reminders."
    rows.sort(key=lambda row: row.get("due_at", ""))
    return "\n".join(
        f"- [{row.get('status')}] {row.get('due_at')} {row.get('text')} (id {row.get('id')})"
        for row in rows
    )


def due_reminder_rows() -> list[dict[str, Any]]:
    now_local = datetime.now().strftime("%Y-%m-%d %H:%M")
    return [
        row
        for row in read_jsonl(REMINDERS_FILE)
        if row.get("status") == "scheduled" and row.get("due_at", "") <= now_local
    ]


def update_reminder(reminder_id: str, op: str) -> str:
    rows = read_jsonl(REMINDERS_FILE)
    for row in rows:
        if row.get("id") != reminder_id:
            continue
        if op == "done":
            row["status"] = "done"
            row["completed_at"] = now_iso()
        elif op == "snooze":
            try:
                due = parse_reminder_time(row.get("due_at", ""))
            except ValueError:
                due = datetime.now()
            base = max(due, datetime.now())
            row["due_at"] = (base + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M")
        else:
            return f"Unknown reminder op: {op}"
        rewrite_jsonl(REMINDERS_FILE, rows)
        done_msg = "completed" if op == "done" else "snoozed for 1 hour"
        return f"Reminder {reminder_id} {done_msg}."
    return f"No reminder found with id {reminder_id}."


class EmailConnectionError(RuntimeError):
    pass


class _DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_ubyte)),
    ]


def _data_blob(data: bytes) -> tuple[_DataBlob, ctypes.Array]:
    buffer = ctypes.create_string_buffer(data)
    return (
        _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte))),
        buffer,
    )


def _protect_for_current_user(data: bytes) -> str:
    input_blob, _buffer = _data_blob(data)
    output_blob = _DataBlob()
    crypt32 = ctypes.windll.crypt32
    crypt32.CryptProtectData.restype = wintypes.BOOL
    if not crypt32.CryptProtectData(
        ctypes.byref(input_blob),
        "Usagi Gmail credentials",
        None,
        None,
        None,
        0x01,
        ctypes.byref(output_blob),
    ):
        raise ctypes.WinError()
    try:
        encrypted = ctypes.string_at(output_blob.pbData, output_blob.cbData)
        return base64.b64encode(encrypted).decode("ascii")
    finally:
        ctypes.windll.kernel32.LocalFree(output_blob.pbData)


def _unprotect_for_current_user(token: str) -> bytes:
    encrypted = base64.b64decode(token.encode("ascii"), validate=True)
    input_blob, _buffer = _data_blob(encrypted)
    output_blob = _DataBlob()
    crypt32 = ctypes.windll.crypt32
    crypt32.CryptUnprotectData.restype = wintypes.BOOL
    if not crypt32.CryptUnprotectData(
        ctypes.byref(input_blob),
        None,
        None,
        None,
        None,
        0x01,
        ctypes.byref(output_blob),
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(output_blob.pbData)


def save_email_credentials(address: str, password: str, host: str = "imap.gmail.com") -> None:
    payload = json.dumps(
        {
            "address": address.strip(),
            "password": password,
            "host": host.strip() or "imap.gmail.com",
        },
        separators=(",", ":"),
    ).encode("utf-8")
    protected = _protect_for_current_user(payload)
    ensure_state_dir()
    EMAIL_CREDENTIAL_FILE.write_text(
        json.dumps({"version": 1, "protected": protected}),
        encoding="utf-8",
    )


def _stored_email_settings() -> dict[str, str] | None:
    try:
        envelope = json.loads(EMAIL_CREDENTIAL_FILE.read_text(encoding="utf-8"))
        payload = json.loads(_unprotect_for_current_user(envelope["protected"]).decode("utf-8"))
        address = str(payload.get("address", "")).strip()
        password = str(payload.get("password", ""))
        host = str(payload.get("host", "imap.gmail.com")).strip() or "imap.gmail.com"
    except (OSError, KeyError, ValueError, TypeError, json.JSONDecodeError):
        return None
    if not address or not password:
        return None
    return {"host": host, "address": address, "password": password}


def email_settings() -> dict[str, str] | None:
    address = os.environ.get("USAGI_EMAIL", "").strip()
    password = os.environ.get("USAGI_EMAIL_PASSWORD", "").strip()
    if address and password:
        return {
            "host": os.environ.get("USAGI_IMAP_HOST", "imap.gmail.com").strip()
            or "imap.gmail.com",
            "address": address,
            "password": password,
        }
    return _stored_email_settings()


def email_connection_status() -> dict[str, Any]:
    settings = email_settings()
    return {
        "connected": settings is not None,
        "address": settings["address"] if settings else "",
        "provider": "Gmail",
        "readOnly": True,
    }


def connect_email(
    address: str,
    app_password: str,
    host: str = "imap.gmail.com",
) -> dict[str, Any]:
    clean_address = address.strip()
    clean_password = "".join(app_password.split())
    clean_host = host.strip() or "imap.gmail.com"
    if not clean_address or "@" not in clean_address:
        raise EmailConnectionError("Enter a valid Gmail address.")
    if not clean_password:
        raise EmailConnectionError("Enter a Gmail app password.")

    try:
        client = imaplib.IMAP4_SSL(clean_host, timeout=15)
        client.login(clean_address, clean_password)
        status, _data = client.select("INBOX", readonly=True)
        if status != "OK":
            raise EmailConnectionError("Gmail connected, but the inbox could not be opened read-only.")
        client.logout()
    except imaplib.IMAP4.error as error:
        raise EmailConnectionError(
            "Gmail rejected the app password. Check the address and create a new app password."
        ) from error
    except OSError as error:
        raise EmailConnectionError("Gmail could not be reached. Check the network and try again.") from error

    save_email_credentials(clean_address, clean_password, clean_host)
    return {
        "connected": True,
        "address": clean_address,
        "provider": "Gmail",
        "readOnly": True,
    }


def decode_mime(value: str) -> str:
    parts: list[str] = []
    for chunk, charset in decode_header(value or ""):
        if isinstance(chunk, bytes):
            parts.append(chunk.decode(charset or "utf-8", errors="ignore"))
        else:
            parts.append(chunk)
    return "".join(parts).strip()


def fetch_unread_email(limit: int = 15) -> list[dict[str, str]] | str:
    settings = email_settings()
    if settings is None:
        return (
            "Email is not configured. Add USAGI_EMAIL and USAGI_EMAIL_PASSWORD "
            "(an app password, never the real account password) to .env.local. "
            "USAGI_IMAP_HOST defaults to imap.gmail.com."
        )
    try:
        client = imaplib.IMAP4_SSL(settings["host"], timeout=15)
        client.login(settings["address"], settings["password"])
        client.select("INBOX", readonly=True)
        _status, data = client.search(None, "UNSEEN")
        ids = data[0].split()
        messages: list[dict[str, str]] = []
        for msg_id in reversed(ids[-limit:]):
            _status, msg_data = client.fetch(
                msg_id, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])"
            )
            for part in msg_data:
                if not isinstance(part, tuple):
                    continue
                headers = message_from_bytes(part[1])
                messages.append(
                    {
                        "from": decode_mime(headers.get("From", "")),
                        "subject": decode_mime(headers.get("Subject", "")) or "(no subject)",
                        "date": decode_mime(headers.get("Date", "")),
                    }
                )
        client.logout()
        return messages
    except (imaplib.IMAP4.error, OSError) as error:
        return f"Email check failed: {error}"


@function_tool
def check_email(limit: int = 15) -> str:
    """Read-only triage of unread inbox mail: sender, subject, date. Never marks read, never sends."""
    result = fetch_unread_email(limit)
    if isinstance(result, str):
        return result
    if not result:
        return "Inbox zero — no unread mail."
    lines = [f"- {row['from']} | {row['subject']} | {row['date']}" for row in result]
    return f"{len(result)} unread message(s), newest first:\n" + "\n".join(lines)


@function_tool
def get_briefing_data() -> str:
    """Gather everything for Jay's daily briefing: tasks, approvals, reminders, today's Daily note, unread mail."""
    today = datetime.now()
    sections = [f"Now: {today.strftime('%A, %B %d, %Y %H:%M')}"]

    tasks = [row for row in read_jsonl(TASKS_FILE) if row.get("status", "open") == "open"]
    if tasks:
        task_lines = [
            f"- {row.get('title')}" + (f" (due {row['due']})" if row.get("due") else "")
            for row in tasks
        ]
        sections.append("Open tasks:\n" + "\n".join(task_lines))
    else:
        sections.append("Open tasks: none")

    pending = [row for row in read_jsonl(ACTIONS_FILE) if row.get("status") == "pending"]
    if pending:
        sections.append(
            "Pending approvals:\n"
            + "\n".join(f"- {row.get('summary')} (id {row.get('id')})" for row in pending)
        )
    else:
        sections.append("Pending approvals: none")

    reminders = [row for row in read_jsonl(REMINDERS_FILE) if row.get("status") == "scheduled"]
    reminders.sort(key=lambda row: row.get("due_at", ""))
    if reminders:
        sections.append(
            "Reminders:\n"
            + "\n".join(f"- {row.get('due_at')} {row.get('text')}" for row in reminders[:8])
        )
    else:
        sections.append("Reminders: none")

    daily_note = VAULT_DIR / "Daily" / f"{today.strftime('%Y-%m-%d')}.md"
    if daily_note.exists():
        body = daily_note.read_text(encoding="utf-8", errors="ignore").strip()
        sections.append(f"Today's Daily note ({daily_note.name}):\n{body[:2000]}")
    else:
        sections.append("Today's Daily note: not created yet.")

    mail = fetch_unread_email(5)
    if isinstance(mail, str):
        sections.append(f"Email: {mail}")
    elif not mail:
        sections.append("Email: inbox zero.")
    else:
        subjects = "; ".join(row["subject"] for row in mail[:3])
        sections.append(f"Email: {len(mail)} unread shown (newest: {subjects})")

    return "\n\n".join(sections)


def approve_action(action_id: str) -> str:
    actions = read_jsonl(ACTIONS_FILE)
    for action in actions:
        if action.get("id") != action_id:
            continue
        if action.get("status") != "pending":
            return f"Action {action_id} is already {action.get('status')}."

        payload = action["payload"]
        kind = action["kind"]
        if kind == "memory_fact":
            memory = read_json(MEMORY_FILE, {})
            memory[payload["key"]] = {
                "value": payload["value"],
                "reason": payload.get("reason", ""),
                "updated_at": now_iso(),
            }
            write_json(MEMORY_FILE, memory)
        elif kind == "task":
            append_jsonl(
                TASKS_FILE,
                {
                    "id": secrets.token_hex(4),
                    "status": "open",
                    "created_at": now_iso(),
                    **payload,
                },
            )
        elif kind == "obsidian_note":
            path = resolve_vault_file(payload["relative_path"])
            path.parent.mkdir(parents=True, exist_ok=True)
            existing = ""
            if path.exists():
                existing = path.read_text(encoding="utf-8", errors="ignore").rstrip()
                existing = existing + "\n\n" if existing else ""
            path.write_text(existing + payload["body"].strip() + "\n", encoding="utf-8")
        elif kind == "knowledge_file":
            ensure_aios_dirs()
            path = KNOWLEDGE_DIR / payload["relative_path"]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(payload["body"].strip() + "\n", encoding="utf-8")
            update_knowledge_index(
                path,
                payload["title"],
                payload.get("summary") or payload["body"].strip()[:180],
            )
        elif kind == "reminder":
            append_jsonl(
                REMINDERS_FILE,
                {
                    "id": secrets.token_hex(4),
                    "status": "scheduled",
                    "created_at": now_iso(),
                    **payload,
                },
            )
        else:
            return f"Unknown action kind: {kind}"

        action["status"] = "approved"
        action["approved_at"] = now_iso()
        rewrite_jsonl(ACTIONS_FILE, actions)
        return f"Approved action {action_id}: {action['summary']}"

    return f"No pending action found with id {action_id}."


def build_agent() -> Agent:
    instructions = f"""
You are Usagi, Jay's private personal agent.

Work style:
- Lead with the answer and stay concise.
- Use tools before guessing about Jay's notes, tasks, memory, or this workspace.
- For OpenTrade questions, use search_opentrade and read_opentrade_file before answering.
- OpenTrade access is strictly read-only. Never read its environment files, modify its files, run its commands, import it, or execute trading actions.
- Search the Obsidian vault when Jay mentions notes, tasks, people, projects, Helix, MCP, autogen, RisingWave, pwndbg, bug bounty, Breadcrumb, or Voyager.
- Use AIOS skills for repeated workflows. Read the matching skill before running or improving a workflow.
- Check structured knowledge indexes before deep searches: raw is source material, wiki is cleaned knowledge, outputs are final deliverables.
- Record loop runs when Jay asks for a repeated workflow, audit, or automation improvement.
- Never reveal secrets or environment values.
- For side effects, stage changes and ask Jay to approve them. Do not claim a memory, task, or note was saved until it is approved.
- Use Obsidian [[wikilinks]] and #tags when drafting notes.
- For current events or anything outside Jay's local files, use web search and cite source URLs.
- Use fetch_url to read a specific page; offer to save summaries with stage_obsidian_note or stage_knowledge_file.
- When Jay asks for his daily briefing, call get_briefing_data and present a short, organized brief; lead with what needs action today.
- check_email is read-only triage. Never claim to send, reply to, delete, or mark mail.
- Reminders go through stage_reminder with local time YYYY-MM-DD HH:MM and need approval like any side effect.

Paths:
- Usagi project: {ROOT}
- Skills: {SKILLS_DIR}
- Structured knowledge: {KNOWLEDGE_DIR}
- Obsidian vault: {VAULT_DIR}
- OpenTrade project (read-only): {OPENTRADE_DIR}

Approval flow:
- To remember a fact, use stage_memory_fact.
- To add a task, use stage_task.
- To write an Obsidian note, use stage_obsidian_note.
- To write raw/wiki/output knowledge, use stage_knowledge_file.
- Tell Jay to type approve <id> after staging an action.
""".strip()

    tools = [
        get_memory,
        stage_memory_fact,
        list_tasks,
        stage_task,
        search_obsidian,
        read_obsidian_note,
        stage_obsidian_note,
        search_workspace,
        search_opentrade,
        read_opentrade_file,
        list_pending_actions,
        list_skills,
        read_skill,
        list_knowledge_indexes,
        search_knowledge,
        stage_knowledge_file,
        record_loop_run,
        aios_status,
        fetch_url,
        web_search,
        stage_reminder,
        list_reminders,
        check_email,
        get_briefing_data,
    ]

    model_name = os.environ.get("USAGI_MODEL", "gpt-4.1-mini")
    base_url = os.environ.get("USAGI_BASE_URL", "").strip()
    if base_url:
        # Local / OpenAI-compatible server (e.g. Ollama). No hosted tools,
        # no tracing uploads.
        set_tracing_disabled(True)
        model = OpenAIChatCompletionsModel(
            model=model_name,
            openai_client=AsyncOpenAI(
                base_url=base_url,
                api_key=os.environ.get("OPENAI_API_KEY") or "local",
            ),
        )
    else:
        model = model_name
        tools.append(WebSearchTool())

    return Agent(
        name="Usagi",
        instructions=instructions,
        model=model,
        tools=tools,
    )


async def trim_unanswered_session_tail(session: SQLiteSession) -> None:
    items = await session.get_items(limit=SESSION_STORAGE_SCAN_LIMIT)
    while items and items[-1].get("role") == "user":
        await session.pop_item()
        items.pop()


async def rollback_session_to(session: SQLiteSession, item_count: int) -> None:
    items = await session.get_items(limit=SESSION_STORAGE_SCAN_LIMIT)
    while len(items) > item_count:
        await session.pop_item()
        items.pop()


async def ask_agent(message: str) -> str:
    load_env_file(ROOT / ".env.local")
    if not os.environ.get("USAGI_BASE_URL") and not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError(
            "No model backend configured. Add OPENAI_API_KEY or USAGI_BASE_URL to .env.local."
        )

    ensure_aios_dirs()
    ensure_state_dir()
    session = SQLiteSession(
        "jay",
        str(STATE_DIR / "conversation.db"),
        session_settings=SessionSettings(limit=SESSION_HISTORY_LIMIT),
    )
    agent = build_agent()
    await trim_unanswered_session_tail(session)
    session_item_count = len(
        await session.get_items(limit=SESSION_STORAGE_SCAN_LIMIT)
    )
    try:
        result = await Runner.run(agent, message, session=session)
        output = str(result.final_output or "").strip()
        if not output:
            await rollback_session_to(session, session_item_count)
            result = await Runner.run(
                agent,
                f"{message}\n\nProvide a concise final answer. Do not return an empty response.",
                session=session,
            )
            output = str(result.final_output or "").strip()
        if not output:
            raise RuntimeError("The model returned an empty response twice.")
    except Exception:
        await rollback_session_to(session, session_item_count)
        append_jsonl(
            RUNS_FILE,
            {
                "kind": "chat",
                "status": "error",
                "message_preview": message[:240],
                "created_at": now_iso(),
            },
        )
        raise

    append_jsonl(
        RUNS_FILE,
        {
            "kind": "chat",
            "status": "ok",
            "message_preview": message[:240],
            "output_preview": output[:240],
            "created_at": now_iso(),
        },
    )
    return output


async def interactive() -> None:
    print("Usagi ready. Type exit to quit, or approve <id> to apply a staged action.")
    while True:
        try:
            message = input("\nJay> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return

        if not message:
            continue
        if message.lower() in {"exit", "quit"}:
            return
        if message.lower().startswith("approve "):
            print(approve_action(message.split(maxsplit=1)[1].strip()))
            continue

        print(await ask_agent(message))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Usagi personal agent")
    parser.add_argument("message", nargs="*", help="Ask Usagi one message, or omit for chat mode.")
    parser.add_argument("--approve", help="Approve a staged action id.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.approve:
        print(approve_action(args.approve))
        return

    try:
        if args.message:
            print(asyncio.run(ask_agent(" ".join(args.message))))
            return

        asyncio.run(interactive())
    except OpenAIError as error:
        raise SystemExit(f"OpenAI API error: {error}") from error


if __name__ == "__main__":
    main()
