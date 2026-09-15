# Graph Report - .  (2026-07-16)

## Corpus Check
- 91 files · ~229,388 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 284 nodes · 454 edges · 23 communities (22 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Agent Core and State|Agent Core and State]]
- [[_COMMUNITY_Desktop API and Shell|Desktop API and Shell]]
- [[_COMMUNITY_Fable UI Components|Fable UI Components]]
- [[_COMMUNITY_Fable Build System|Fable Build System]]
- [[_COMMUNITY_Desktop Build System|Desktop Build System]]
- [[_COMMUNITY_Companion UI Components|Companion UI Components]]
- [[_COMMUNITY_OpenTrade Read-Only Bridge|OpenTrade Read-Only Bridge]]
- [[_COMMUNITY_Agent Reliability Tests|Agent Reliability Tests]]
- [[_COMMUNITY_Web Research Tools|Web Research Tools]]
- [[_COMMUNITY_Browser Key Metadata|Browser Key Metadata]]
- [[_COMMUNITY_Browser Preload Metadata|Browser Preload Metadata]]
- [[_COMMUNITY_Browser Privacy Metadata|Browser Privacy Metadata]]
- [[_COMMUNITY_Browser Hyphen Metadata|Browser Hyphen Metadata]]
- [[_COMMUNITY_Browser Helper Metadata|Browser Helper Metadata]]
- [[_COMMUNITY_Usagi Package Root|Usagi Package Root]]

## God Nodes (most connected - your core abstractions)
1. `ensure_aios_dirs()` - 12 edges
2. `approve_action()` - 12 edges
3. `ask_agent()` - 12 edges
4. `read_jsonl()` - 11 edges
5. `stage_action()` - 9 edges
6. `FakeSession` - 8 edges
7. `now_iso()` - 8 edges
8. `read_json()` - 8 edges
9. `append_jsonl()` - 8 edges
10. `_TextExtractor` - 8 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `useAgentAudio()`  [EXTRACTED]
  agent-ui/fable/src/App.jsx → agent-ui/fable/src/hooks/useAgentAudio.js
- `App()` --calls--> `useStatus()`  [EXTRACTED]
  web/src/App.jsx → web/src/hooks/useStatus.js
- `ChatStage()` --calls--> `useChat()`  [EXTRACTED]
  web/src/components/ChatStage.jsx → web/src/hooks/useChat.js

## Import Cycles
- None detected.

## Communities (23 total, 1 thin omitted)

### Community 0 - "Agent Core and State"
Cohesion: 0.06
Nodes (70): Agent, Any, datetime, Namespace, SQLiteSession, aios_status(), append_jsonl(), approve_action() (+62 more)

### Community 1 - "Desktop API and Shell"
Cohesion: 0.08
Nodes (29): api(), approveAction(), getStatus(), openTarget(), reminderAction(), sendMessage(), App(), ASSETS (+21 more)

### Community 2 - "Fable UI Components"
Cohesion: 0.13
Nodes (23): App(), FlatUsagi(), PhaseRail(), ICONS, TaskInspector(), PHASE_FREQUENCIES, useAgentAudio(), DESKTOP_IDENTITY (+15 more)

### Community 3 - "Fable Build System"
Cohesion: 0.10
Nodes (19): dependencies, @phosphor-icons/react, react, react-dom, devDependencies, @playwright/test, vite, @vitejs/plugin-react (+11 more)

### Community 4 - "Desktop Build System"
Cohesion: 0.10
Nodes (19): dependencies, react, react-dom, devDependencies, jsdom, @testing-library/jest-dom, @testing-library/react, vite (+11 more)

### Community 5 - "Companion UI Components"
Cohesion: 0.15
Nodes (11): ApprovalTray(), ChatStage(), suggestions, base, Carrot(), Cloud(), Sparkle(), Star() (+3 more)

### Community 6 - "OpenTrade Read-Only Bridge"
Cohesion: 0.14
Nodes (13): Path, OpenTradeConnectionTests, Read-only search of safe source and documentation files in Jay's OpenTrade proje, Read one safe text file from Jay's OpenTrade project without modifying or execut, Stage a raw/wiki/outputs knowledge file for Jay's approval., read_opentrade_file(), read_opentrade_text(), resolve_knowledge_file() (+5 more)

### Community 7 - "Agent Reliability Tests"
Cohesion: 0.22
Nodes (4): AgentDeliveryTests, FakeSession, load_desktop_app(), LocalBackendStartupTests

### Community 8 - "Web Research Tools"
Cohesion: 0.20
Nodes (6): HTMLParser, fetch_url(), Fetch one web page and return its readable text, e.g. to summarize into a note., Search the web (DuckDuckGo) and return titles, URLs, and snippets., _TextExtractor, web_search()

### Community 9 - "Browser Key Metadata"
Cohesion: 0.29
Nodes (6): description, icons, manifest_version, name, update_url, version

### Community 10 - "Browser Preload Metadata"
Cohesion: 0.40
Nodes (4): is_preloaded, manifest_version, name, version

### Community 11 - "Browser Privacy Metadata"
Cohesion: 0.40
Nodes (4): manifest_version, name, pre_installed, version

### Community 12 - "Browser Hyphen Metadata"
Cohesion: 0.40
Nodes (4): manifest_version, name, pre_installed, version

### Community 13 - "Browser Helper Metadata"
Cohesion: 0.50
Nodes (3): manifest_version, name, version

## Knowledge Gaps
- **73 isolated node(s):** `manifest_version`, `name`, `version`, `is_preloaded`, `name` (+68 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `_TextExtractor` connect `Web Research Tools` to `Agent Core and State`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `Path` (e.g. with `load_desktop_app()` and `.test_desktop_backend_exposes_the_opentrade_folder_target()`) actually correct?**
  _`Path` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `manifest_version`, `name`, `version` to the rest of the system?**
  _97 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Agent Core and State` be split into smaller, more focused modules?**
  _Cohesion score 0.05955734406438632 - nodes in this community are weakly interconnected._
- **Should `Desktop API and Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.08478513356562137 - nodes in this community are weakly interconnected._
- **Should `Fable UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.1268939393939394 - nodes in this community are weakly interconnected._
- **Should `Fable Build System` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._