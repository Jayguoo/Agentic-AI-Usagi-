# Graph Report - C:\Users\Jaygu\pp\Usagi  (2026-06-29)

## Corpus Check
- Corpus is ~5,436 words - fits in a single context window. You may not need a graph.

## Summary
- 78 nodes · 162 edges · 10 communities (6 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_State And JSON Helpers|State And JSON Helpers]]
- [[_COMMUNITY_Web Dashboard UI|Web Dashboard UI]]
- [[_COMMUNITY_Agent Tools And Staging|Agent Tools And Staging]]
- [[_COMMUNITY_Status And Actions|Status And Actions]]
- [[_COMMUNITY_Skill Registry|Skill Registry]]
- [[_COMMUNITY_Obsidian Note Reading|Obsidian Note Reading]]
- [[_COMMUNITY_CLI Argument Parsing|CLI Argument Parsing]]
- [[_COMMUNITY_Private Memory Lookup|Private Memory Lookup]]
- [[_COMMUNITY_Knowledge Store Search|Knowledge Store Search]]
- [[_COMMUNITY_Package Root|Package Root]]

## God Nodes (most connected - your core abstractions)
1. `ensure_aios_dirs()` - 12 edges
2. `approve_action()` - 12 edges
3. `ask_agent()` - 9 edges
4. `read_json()` - 8 edges
5. `append_jsonl()` - 8 edges
6. `stage_action()` - 8 edges
7. `now_iso()` - 7 edges
8. `write_json()` - 7 edges
9. `read_jsonl()` - 7 edges
10. `ensure_state_dir()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `read_jsonl()` --references--> `Path`  [EXTRACTED]
  usagi.py →   _Bridges community 0 → community 3_
- `resolve_knowledge_file()` --references--> `Path`  [EXTRACTED]
  usagi.py →   _Bridges community 0 → community 2_
- `resolve_vault_file()` --references--> `Path`  [EXTRACTED]
  usagi.py →   _Bridges community 0 → community 5_
- `list_skills()` --calls--> `ensure_aios_dirs()`  [EXTRACTED]
  usagi.py → usagi.py  _Bridges community 0 → community 4_
- `search_knowledge()` --calls--> `ensure_aios_dirs()`  [EXTRACTED]
  usagi.py → usagi.py  _Bridges community 0 → community 8_

## Import Cycles
- None detected.

## Communities (10 total, 4 thin omitted)

### Community 0 - "State And JSON Helpers"
Cohesion: 0.25
Nodes (19): Any, Path, append_jsonl(), approve_action(), ask_agent(), ensure_aios_dirs(), ensure_state_dir(), interactive() (+11 more)

### Community 1 - "Web Dashboard UI"
Cohesion: 0.19
Nodes (17): actionsList, activity, addActivity(), addMessage(), api(), approveAction(), counters, form (+9 more)

### Community 2 - "Agent Tools And Staging"
Cohesion: 0.16
Nodes (17): Agent, build_agent(), Stage a private memory fact for Jay's approval., Stage a task for Jay's approval., Search Jay's Obsidian vault markdown files for a phrase., Stage a new or appended Obsidian note for Jay's approval., Search non-secret text files in Usagi's local project folder., Stage a raw/wiki/outputs knowledge file for Jay's approval. (+9 more)

### Community 3 - "Status And Actions"
Cohesion: 0.29
Nodes (7): aios_status(), list_pending_actions(), list_tasks(), List saved tasks by status., List staged actions waiting for Jay's approval., Return a compact status report for Usagi's AIOS state., read_jsonl()

### Community 4 - "Skill Registry"
Cohesion: 0.40
Nodes (5): list_skills(), List Usagi AIOS skill definitions., Read one Usagi AIOS skill by name or file., read_skill(), read_skill_files()

### Community 5 - "Obsidian Note Reading"
Cohesion: 0.67
Nodes (3): Read one markdown note from Jay's Obsidian vault., read_obsidian_note(), resolve_vault_file()

## Knowledge Gaps
- **8 isolated node(s):** `usagi`, `messages`, `form`, `input`, `sendButton` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `aios_status()` connect `Status And Actions` to `State And JSON Helpers`, `Agent Tools And Staging`, `Skill Registry`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `usagi`, `Return Usagi's saved private memory facts.`, `Stage a private memory fact for Jay's approval.` to the rest of the system?**
  _24 weakly-connected nodes found - possible documentation gaps or missing edges._