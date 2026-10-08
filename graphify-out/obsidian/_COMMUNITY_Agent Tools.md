---
type: community
cohesion: 0.08
members: 38
---

# Agent Tools

**Cohesion:** 0.08 - loosely connected
**Members:** 38 nodes

## Members
- [[Agent]] - code
- [[Fetch one web page and return its readable text, e.g. to summarize into a note.]] - rationale - usagi.py
- [[Gather everything for Jay's daily briefing tasks, approvals, reminders,…]] - rationale - usagi.py
- [[List Jay's reminders. Scheduled only by default; include_done adds history.]] - rationale - usagi.py
- [[List Usagi AIOS skill definitions.]] - rationale - usagi.py
- [[List rawwikioutputs knowledge indexes.]] - rationale - usagi.py
- [[List saved tasks by status.]] - rationale - usagi.py
- [[List staged actions waiting for Jay's approval.]] - rationale - usagi.py
- [[Read one Usagi AIOS skill by name or file.]] - rationale - usagi.py
- [[Read one markdown note from Jay's Obsidian vault.]] - rationale - usagi.py
- [[Read the latest primary paper account CLI verification report; never execute…]] - rationale - usagi.py
- [[Read-only search of safe source and documentation files in Jay's OpenTrade…]] - rationale - usagi.py
- [[Read-only triage of unread inbox mail sender, subject, date. Never marks read,…]] - rationale - usagi.py
- [[Return Usagi's saved private memory facts.]] - rationale - usagi.py
- [[Search Jay's Obsidian vault markdown files for a phrase.]] - rationale - usagi.py
- [[Search Usagi's structured rawwikioutputs knowledge store.]] - rationale - usagi.py
- [[Search non-secret text files in Usagi's local project folder.]] - rationale - usagi.py
- [[Stage a task for Jay's approval.]] - rationale - usagi.py
- [[build_agent()]] - code - usagi.py
- [[check_email()]] - code - usagi.py
- [[fetch_url()]] - code - usagi.py
- [[function_tool]] - code
- [[get_alpaca_diagnostics()]] - code - usagi.py
- [[get_briefing_data()]] - code - usagi.py
- [[get_memory()]] - code - usagi.py
- [[list_knowledge_indexes()]] - code - usagi.py
- [[list_pending_actions()]] - code - usagi.py
- [[list_reminders()]] - code - usagi.py
- [[list_skills()]] - code - usagi.py
- [[list_tasks()]] - code - usagi.py
- [[read_obsidian_note()]] - code - usagi.py
- [[read_skill()]] - code - usagi.py
- [[read_skill_files()]] - code - usagi.py
- [[search_knowledge()]] - code - usagi.py
- [[search_obsidian()]] - code - usagi.py
- [[search_opentrade()]] - code - usagi.py
- [[search_workspace()]] - code - usagi.py
- [[stage_task()]] - code - usagi.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Agent_Tools
SORT file.name ASC
```

## Connections to other communities
- 24 edges to [[_COMMUNITY_Stdlib Dependencies]]
- 15 edges to [[_COMMUNITY_AIOS CLI Core]]
- 9 edges to [[_COMMUNITY_Approval Staging]]
- 4 edges to [[_COMMUNITY_Trade Review & Approval]]
- 2 edges to [[_COMMUNITY_Trading-Day Research]]
- 1 edge to [[_COMMUNITY_Claude Code Backend]]
- 1 edge to [[_COMMUNITY_HTML Text Extraction]]
- 1 edge to [[_COMMUNITY_Codex Backend]]
- 1 edge to [[_COMMUNITY_Trade Companion Backend]]

## Top bridge nodes
- [[build_agent()]] - degree 31, connects to 7 communities
- [[function_tool]] - degree 25, connects to 4 communities
- [[list_knowledge_indexes()]] - degree 6, connects to 3 communities
- [[read_skill_files()]] - degree 5, connects to 3 communities
- [[get_briefing_data()]] - degree 6, connects to 2 communities