---
type: community
cohesion: 0.16
members: 26
---

# AIOS CLI Core

**Cohesion:** 0.16 - loosely connected
**Members:** 26 nodes

## Members
- [[Namespace]] - code
- [[Path_3]] - code
- [[Record how a skill or automation run performed so future runs can improve.]] - rationale - usagi.py
- [[Return a compact status report for Usagi's AIOS state.]] - rationale - usagi.py
- [[The latest TradingView chart OpenTrade captured for a symbol, if any.]] - rationale - usagi.py
- [[Turn Trade Companion's read-only lock on or off. Writes stay limited to plan…]] - rationale - usagi.py
- [[aios_status()]] - code - usagi.py
- [[append_jsonl()]] - code - usagi.py
- [[approve_action()]] - code - usagi.py
- [[ask_agent()]] - code - usagi.py
- [[ensure_aios_dirs()]] - code - usagi.py
- [[ensure_state_dir()]] - code - usagi.py
- [[interactive()]] - code - usagi.py
- [[load_env_file()]] - code - usagi.py
- [[main()]] - code - usagi.py
- [[now_iso()]] - code - usagi.py
- [[parse_args()]] - code - usagi.py
- [[read_jsonl()]] - code - usagi.py
- [[record_loop_run()]] - code - usagi.py
- [[resolve_vault_file()]] - code - usagi.py
- [[rewrite_jsonl()]] - code - usagi.py
- [[set_trade_read_only()]] - code - usagi.py
- [[trade_chart_image()]] - code - usagi.py
- [[update_knowledge_index()]] - code - usagi.py
- [[update_reminder()]] - code - usagi.py
- [[write_json()]] - code - usagi.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/AIOS_CLI_Core
SORT file.name ASC
```

## Connections to other communities
- 24 edges to [[_COMMUNITY_Stdlib Dependencies]]
- 22 edges to [[_COMMUNITY_Trade Review & Approval]]
- 15 edges to [[_COMMUNITY_Agent Tools]]
- 4 edges to [[_COMMUNITY_Approval Staging]]
- 1 edge to [[_COMMUNITY_Trade Companion Backend]]
- 1 edge to [[_COMMUNITY_Trading-Day Research]]

## Top bridge nodes
- [[now_iso()]] - degree 13, connects to 3 communities
- [[ask_agent()]] - degree 12, connects to 3 communities
- [[Path_3]] - degree 12, connects to 3 communities
- [[read_jsonl()]] - degree 11, connects to 3 communities
- [[append_jsonl()]] - degree 9, connects to 3 communities