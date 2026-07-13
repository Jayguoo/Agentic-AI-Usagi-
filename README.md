# Usagi 🐇

**Usagi** is a private desktop AIOS — a local AI operating system that lives on your machine. It combines chat, memory, task management, Obsidian integration, knowledge ingestion, skills, and approved actions into one personal, approachable interface.

> Usagi means "rabbit" in Japanese. The mascot is at the center of the product identity — soft, helpful, and personal.

## Features

- **AI Chat** — Conversational agent powered by OpenAI, with web search and tool use
- **Memory** — Persistent memory across sessions (JSON-based, local-only)
- **Obsidian Integration** — Search and interact with an Obsidian vault directly from the agent
- **Tasks & Reminders** — Lightweight task tracking with reminders
- **Approval Tray** — Review and approve agent-proposed actions before they execute
- **Skills System** — Pluggable skill definitions that extend agent capabilities
- **Knowledge Ingestion** — Ingest, wiki, and query personal knowledge from local sources
- **Web Dashboard** — React + Vite frontend with a cute, soft UI (optional, runs alongside the desktop app)
- **Desktop App** — Native window via `pywebview` with full agent UI

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Agent Runtime | Python 3.11+, `openai-agents` |
| Desktop UI | `pywebview` (native webview window) |
| Web Frontend | React 19 + Vite + custom CSS |
| AI Models | OpenAI (configurable), WebSearchTool |
| Persistence | Local JSON / JSONL files |
| Vault Access | Obsidian vault at `C:\Users\Jaygu\Documents\Obsidian Vault` |
| Package Manager | `uv` (Python), `npm` (web) |

## Getting Started

### Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Node.js 20+ (for the web frontend)
- An OpenAI API key in `.env.local`

### Setup

```bash
# Install Python dependencies
uv sync

# (Optional) Install web frontend dependencies
cd web
npm install
cd ..

# Create your environment file
cp .env.local.example .env.local
# Edit .env.local and add your OPENAI_API_KEY
```

### Run

**Desktop app (pywebview):**
```bash
python usagi_app.pyw
```

**Web dashboard:**
```bash
cd web
npm run dev
```

**CLI agent:**
```bash
python usagi.py
```

## Project Structure

```
Usagi/
├── usagi.py              # Core agent loop (CLI)
├── usagi_app.pyw         # Desktop app entry (pywebview)
├── usagi_web.pyw         # Web server entry
├── pyproject.toml        # Python project config
├── PRODUCT.md            # Product requirements
├── skills/               # Agent skill definitions (JSON)
├── knowledge/            # Knowledge base (raw, wiki, outputs)
├── graphics-inbox/       # Incoming graphics / art assets
├── graphify-out/         # Codebase graph / analysis output
├── state/                # Runtime state (memory, tasks, logs) — gitignored
├── web/                  # React + Vite web frontend
│   ├── src/              # React components
│   ├── public/           # Static assets (graphics, icons)
│   └── dist/             # Built frontend
└── .env.local            # Local secrets — gitignored
```

## Brand

- **Personality:** Cute utility, soft, helpful
- **Design principles:** Put Usagi at the center, keep it practical before decorative, make approvals easy to scan, use softness and color to support the mascot
- **Anti-references:** Avoid generic SaaS dashboards, dark terminal-heavy shells, sterile admin panels

## License

Private / personal project.
