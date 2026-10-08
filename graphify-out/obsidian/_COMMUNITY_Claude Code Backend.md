---
type: community
cohesion: 0.29
members: 8
---

# Claude Code Backend

**Cohesion:** 0.29 - loosely connected
**Members:** 8 nodes

## Members
- [[dot-__init__()_1]] - code - claude_model.py
- [[dot-complete()]] - code - claude_model.py
- [[dot-get_response()]] - code - claude_model.py
- [[dot-stream_response()]] - code - claude_model.py
- [[ClaudeCodeModel]] - code - claude_model.py
- [[Model]] - code
- [[Use the same signed-in Claude CLI connection as Simplicity.]] - rationale - claude_model.py
- [[claude_command()]] - code - claude_model.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Claude_Code_Backend
SORT file.name ASC
```

## Connections to other communities
- 3 edges to [[_COMMUNITY_Model Backends]]
- 1 edge to [[_COMMUNITY_Agent Tools]]
- 1 edge to [[_COMMUNITY_Stdlib Dependencies]]
- 1 edge to [[_COMMUNITY_Codex Backend]]

## Top bridge nodes
- [[ClaudeCodeModel]] - degree 11, connects to 4 communities
- [[claude_command()]] - degree 2, connects to 1 community