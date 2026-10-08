---
type: community
cohesion: 0.22
members: 13
---

# Model Backends

**Cohesion:** 0.22 - loosely connected
**Members:** 13 nodes

## Members
- [[agents]] - concept
- [[agents_items]] - concept
- [[agents_models_interface]] - concept
- [[agents_usage]] - concept
- [[asyncio]] - concept
- [[claude_model.py]] - code - claude_model.py
- [[codex_model.py]] - code - codex_model.py
- [[openai_types_responses]] - concept
- [[pathlib]] - concept
- [[shutil]] - concept
- [[subprocess]] - concept
- [[tempfile]] - concept
- [[uuid]] - concept

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Model_Backends
SORT file.name ASC
```

## Connections to other communities
- 5 edges to [[_COMMUNITY_Desktop Launcher Tests]]
- 5 edges to [[_COMMUNITY_Stdlib Dependencies]]
- 3 edges to [[_COMMUNITY_Claude Code Backend]]
- 2 edges to [[_COMMUNITY_Codex Backend]]
- 2 edges to [[_COMMUNITY_Usagi Check Scripts]]
- 1 edge to [[_COMMUNITY_Trade Companion Backend]]

## Top bridge nodes
- [[codex_model.py]] - degree 12, connects to 5 communities
- [[claude_model.py]] - degree 17, connects to 4 communities
- [[pathlib]] - degree 5, connects to 3 communities
- [[asyncio]] - degree 3, connects to 1 community
- [[subprocess]] - degree 3, connects to 1 community