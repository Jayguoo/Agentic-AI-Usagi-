---
type: community
cohesion: 0.33
members: 6
---

# Codex Backend Tests

**Cohesion:** 0.33 - loosely connected
**Members:** 6 nodes

## Members
- [[dot-test_codex_runs_usagi_tool_and_returns_answer()]] - code - test_usagi_app.py
- [[dot-test_explicit_codex_selection_uses_account_backend()]] - code - test_usagi_app.py
- [[dot-test_model_picker_excludes_hidden_codex_models()]] - code - test_usagi_app.py
- [[dot-test_model_selection_is_specific_to_each_request()]] - code - test_usagi_app.py
- [[dot-test_rejects_invalid_provider()]] - code - test_usagi_app.py
- [[CodexBackendTests]] - code - test_usagi_app.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Codex_Backend_Tests
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_Desktop Launcher Tests]]

## Top bridge nodes
- [[CodexBackendTests]] - degree 6, connects to 1 community