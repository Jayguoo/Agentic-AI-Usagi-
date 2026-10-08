# Graph Report - Agentic-AI-Usagi-  (2026-10-08)

## Corpus Check
- 96 files · ~267,826 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 591 nodes · 1205 edges · 39 communities (27 shown, 12 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 50 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Desktop API and Shell
- Trade Companion Backend
- Connection & Email Tests
- Performance Graph UI
- Agent Tools
- Fable Agent UI
- Stdlib Dependencies
- Trade Review & Approval
- AIOS CLI Core
- Brand & Design Guidance
- Fable Package Manifest
- Model Backends
- Web Package Manifest
- Approval Staging
- Desktop Launcher Tests
- Agent Delivery Tests
- Trading-Day Research
- Web App Tests
- Claude Code Backend
- HTML Text Extraction
- Fable Dev Dependencies
- Fable Build Scripts
- Codex Backend Tests
- Web Dev Dependencies
- Codex Backend
- Web Build Scripts
- Web Runtime Dependencies
- Vite Configs
- Usagi Check Scripts
- Claude Backend Tests
- Research Tests
- Chat Agent Runtime
- Memory & Tasks State
- Knowledge & Obsidian
- Path Type
- Usagi Package Root
- Skills System
- Any Type
- Datetime Module

## God Nodes (most connected - your core abstractions)
1. `OpenTradeConnectionTests` - 42 edges
2. `build_agent()` - 31 edges
3. `build_snapshot()` - 25 edges
4. `read_automations()` - 19 edges
5. `read_json()` - 15 edges
6. `App()` - 14 edges
7. `set_plan_approval()` - 14 edges
8. `PerformanceGraph()` - 13 edges
9. `now_iso()` - 13 edges
10. `review_new_trades()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Fable Agent UI Entry (USAGI / Desktop Agent)` --semantically_similar_to--> `Web Dashboard Entry (Usagi)`  [INFERRED] [semantically similar]
  agent-ui/fable/index.html → web/index.html
- `Desktop App (pywebview, usagi_app.pyw)` --conceptually_related_to--> `Fable Agent UI Entry (USAGI / Desktop Agent)`  [AMBIGUOUS]
  README.md → agent-ui/fable/index.html
- `Web Dashboard (React 19 + Vite)` --implements--> `Web Dashboard Entry (Usagi)`  [INFERRED]
  README.md → web/index.html
- `Web Server Entry (usagi_web.pyw)` --references--> `Web Dashboard Entry (Usagi)`  [INFERRED]
  README.md → web/index.html
- `Theme Bootstrap Script (usagi.theme localStorage)` --conceptually_related_to--> `Anti-references (no generic SaaS / dark terminal / sterile admin)`  [AMBIGUOUS]
  web/index.html → PRODUCT.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Usagi AIOS Feature Set** — product_private_desktop_aios, readme_ai_chat, readme_memory, readme_obsidian_integration, readme_tasks_reminders, readme_approval_tray, readme_skills_system, readme_knowledge_ingestion [EXTRACTED 1.00]
- **Usagi Brand Identity Guidance** — product_brand_personality, product_anti_references, product_design_principles, product_accessibility, product_usagi_mascot [EXTRACTED 1.00]
- **Usagi Entry Points (CLI, Desktop, Web)** — readme_cli_agent, readme_desktop_app, readme_web_server_entry, readme_web_dashboard [EXTRACTED 1.00]

## Communities (39 total, 12 thin omitted)

### Community 0 - "Desktop API and Shell"
Cohesion: 0.06
Nodes (52): ref_react, api(), approveAction(), connectEmail(), getStatus(), getTradeSnapshot(), openTarget(), reminderAction() (+44 more)

### Community 1 - "Trade Companion Backend"
Cohesion: 0.10
Nodes (58): Any, datetime, re, sqlite3, account_paths(), _age_minutes(), approvals_path(), build_snapshot() (+50 more)

### Community 2 - "Connection & Email Tests"
Cohesion: 0.06
Nodes (6): EmailConnectionTests, load_web_app(), OpenTradeConnectionTests, Path, Scheduled routines with their last run, plus the recent run history., read_automations()

### Community 3 - "Performance Graph UI"
Cohesion: 0.09
Nodes (37): ref_react_dom, buildSeries(), chartUrl(), formatDate(), formatMoney(), formatScaled(), linePath(), PerformanceGraph() (+29 more)

### Community 4 - "Agent Tools"
Cohesion: 0.08
Nodes (38): Agent, function_tool, build_agent(), check_email(), fetch_url(), get_alpaca_diagnostics(), get_briefing_data(), get_memory() (+30 more)

### Community 5 - "Fable Agent UI"
Cohesion: 0.12
Nodes (28): App(), agent_ui_fable_src_assets_usagi, FlatUsagi(), PhaseRail(), ICONS, TaskInspector(), PHASE_FREQUENCIES, useAgentAudio() (+20 more)

### Community 6 - "Stdlib Dependencies"
Cohesion: 0.08
Nodes (36): argparse, Array, base64, ctypes, email, email_header, html_parser, imaplib (+28 more)

### Community 7 - "Trade Review & Approval"
Cohesion: 0.13
Nodes (28): _apply_approval_to_plan(), build_trade_companion_snapshot(), due_reminder_rows(), opentrade_is_paper(), parse_model_json_object(), Any, Summarize the trades around this one so the analyst can spot behavioral…, Explain one closed OpenTrade round trip: why it lost or made money, how the… (+20 more)

### Community 8 - "AIOS CLI Core"
Cohesion: 0.16
Nodes (26): Namespace, aios_status(), append_jsonl(), approve_action(), ask_agent(), ensure_aios_dirs(), ensure_state_dir(), interactive() (+18 more)

### Community 9 - "Brand & Design Guidance"
Cohesion: 0.14
Nodes (17): Fable Agent UI Entry (USAGI / Desktop Agent), #root mount (fable), Accessibility & Inclusion (no decorative motion), Anti-references (no generic SaaS / dark terminal / sterile admin), Brand Personality: Cute Utility, Soft, Helpful, Design Principles (mascot-centered, practical before decorative), Private Desktop AIOS, Usagi Mascot (+9 more)

### Community 10 - "Fable Package Manifest"
Cohesion: 0.15
Nodes (10): react, vite, vitest, name, private, type, version, @playwright/test (+2 more)

### Community 11 - "Model Backends"
Cohesion: 0.22
Nodes (11): agents, agents_items, agents_models_interface, agents_usage, asyncio, openai_types_responses, pathlib, shutil (+3 more)

### Community 12 - "Web Package Manifest"
Cohesion: 0.15
Nodes (12): jsdom, @testing-library/jest-dom, dependencies, react, react-dom, react, vite, vitest (+4 more)

### Community 13 - "Approval Staging"
Cohesion: 0.18
Nodes (13): parse_reminder_time(), datetime, Stage a reminder for Jay's approval. `when` is local time, formatted YYYY-MM-DD…, Stage a private memory fact for Jay's approval., Stage a new or appended Obsidian note for Jay's approval., Stage a raw/wiki/outputs knowledge file for Jay's approval., resolve_knowledge_file(), safe_slug() (+5 more)

### Community 14 - "Desktop Launcher Tests"
Cohesion: 0.18
Nodes (9): contextlib, importlib_util, os, load_desktop_app(), LocalBackendStartupTests, SilentDesktopLauncherTests, types, unittest (+1 more)

### Community 15 - "Agent Delivery Tests"
Cohesion: 0.24
Nodes (3): AgentDeliveryTests, run_turn(), FakeSession

### Community 16 - "Trading-Day Research"
Cohesion: 0.18
Nodes (9): Research one symbol's trading day once: what moved it, how the public saw it,…, Search the web (DuckDuckGo) and return titles, URLs, and snippets., Port of Simplicity's code-driven query planner and research loop. Original:…, research_trading_day(), run_research(), search(), retrieve(), search_web_rows() (+1 more)

### Community 17 - "Web App Tests"
Cohesion: 0.20
Nodes (8): ref_node_fs, ref_node_path, ref_testing_library_jest_dom_vitest, @testing-library/react, api, appState, storageMock, TRADE_FIXTURE

### Community 18 - "Claude Code Backend"
Cohesion: 0.29
Nodes (4): claude_command(), ClaudeCodeModel, Use the same signed-in Claude CLI connection as Simplicity., Model

### Community 20 - "Fable Dev Dependencies"
Cohesion: 0.29
Nodes (7): devDependencies, jsdom, @testing-library/jest-dom, @testing-library/react, vite, @vitejs/plugin-react, vitest

### Community 21 - "Fable Build Scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, preview, test, test:e2e

### Community 23 - "Web Dev Dependencies"
Cohesion: 0.40
Nodes (5): devDependencies, @playwright/test, vite, @vitejs/plugin-react, vitest

### Community 24 - "Codex Backend"
Cohesion: 0.40
Nodes (3): codex_command(), CodexModel, Use Codex account authentication with the shared Usagi tool protocol.

### Community 25 - "Web Build Scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, preview, test

### Community 26 - "Web Runtime Dependencies"
Cohesion: 0.50
Nodes (4): dependencies, @phosphor-icons/react, react, react-dom

### Community 31 - "Chat Agent Runtime"
Cohesion: 0.67
Nodes (3): AI Chat (OpenAI, web search, tool use), CLI Agent Loop (usagi.py), openai-agents Runtime

### Community 32 - "Memory & Tasks State"
Cohesion: 0.67
Nodes (3): Memory (local JSON persistence), state/ Runtime State (memory, tasks, logs), Tasks & Reminders

## Ambiguous Edges - Review These
- `Fable Agent UI Entry (USAGI / Desktop Agent)` → `Desktop App (pywebview, usagi_app.pyw)`  [AMBIGUOUS]
  agent-ui/fable/index.html · relation: conceptually_related_to
- `Theme Bootstrap Script (usagi.theme localStorage)` → `Anti-references (no generic SaaS / dark terminal / sterile admin)`  [AMBIGUOUS]
  web/index.html · relation: conceptually_related_to

## Knowledge Gaps
- **80 isolated node(s):** `ASSETS`, `INSPECTOR_TABS`, `PHASE_ASSETS`, `PHASE_COPY`, `PHASES` (+75 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 231 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Fable Agent UI Entry (USAGI / Desktop Agent)` and `Desktop App (pywebview, usagi_app.pyw)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Theme Bootstrap Script (usagi.theme localStorage)` and `Anti-references (no generic SaaS / dark terminal / sterile admin)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `OpenTradeConnectionTests` connect `Connection & Email Tests` to `Trade Companion Backend`, `Desktop Launcher Tests`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `@phosphor-icons/react` connect `Fable Agent UI` to `Fable Package Manifest`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `@testing-library/react` connect `Web App Tests` to `Web Package Manifest`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 25 inferred relationships involving `build_agent()` (e.g. with `aios_status()` and `check_email()`) actually correct?**
  _`build_agent()` has 25 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ASSETS`, `INSPECTOR_TABS`, `PHASE_ASSETS` to the rest of the system?**
  _80 weakly-connected nodes found - possible documentation gaps or missing edges._