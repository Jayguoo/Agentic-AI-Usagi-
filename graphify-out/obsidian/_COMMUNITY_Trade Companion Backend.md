---
type: community
cohesion: 0.10
members: 60
---

# Trade Companion Backend

**Cohesion:** 0.10 - loosely connected
**Members:** 60 nodes

## Members
- [[dot-test_summarizes_tradingview_charts_and_serves_only_saved_images()]] - code - test_usagi_app.py
- [[Any]] - code
- [[Every Alpaca account OpenTrade is configured for the primary, plus each…]] - rationale - trade_companion.py
- [[Manual approvals live next to the execution plan they apply to, so accounts…]] - rationale - trade_companion.py
- [[Normalize OpenTrade's closed broker round trips, newest first.]] - rationale - trade_companion.py
- [[Path]] - code
- [[Read OpenTrade's env files. Values stay in memory; only file paths and labels…]] - rationale - trade_companion.py
- [[Read OpenTrade's reconciled broker-fill snapshot without opening it for writing.]] - rationale - trade_companion.py
- [[Read each scheduled routine's marker name and steps from its batch file, plus…]] - rationale - trade_companion.py
- [[Read the scheduler log into one record per routine run, newest first. Each run…]] - rationale - trade_companion.py
- [[Read today's manual plan approvals, keyed SYMBOLSIDE. Yesterday's decisions…]] - rationale - trade_companion.py
- [[Resolve one account's files a KEY_suffix override wins, then KEY, then…]] - rationale - trade_companion.py
- [[Summarize OpenTrade's TradingView chart review which charts exist and why any…]] - rationale - trade_companion.py
- [[Summarize what pre-market research found providers, market read, flags, and…]] - rationale - trade_companion.py
- [[The New York calendar date for a moment, used as OpenTrade's trading day.]] - rationale - trade_companion.py
- [[The saved TradingView chart for a symbol, only if it is a real file inside the…]] - rationale - trade_companion.py
- [[_age_minutes()]] - code - trade_companion.py
- [[_clock_minutes()]] - code - trade_companion.py
- [[_decision_detail()]] - code - trade_companion.py
- [[_first()]] - code - trade_companion.py
- [[_format_clock()]] - code - trade_companion.py
- [[_format_et()]] - code - trade_companion.py
- [[_format_window()]] - code - trade_companion.py
- [[_headlines()]] - code - trade_companion.py
- [[_normalize_decisions()]] - code - trade_companion.py
- [[_normalize_journal()]] - code - trade_companion.py
- [[_normalize_orders()]] - code - trade_companion.py
- [[_normalize_plans()]] - code - trade_companion.py
- [[_normalize_positions()]] - code - trade_companion.py
- [[_number()]] - code - trade_companion.py
- [[_parse_routine_log()]] - code - trade_companion.py
- [[_parse_routine_runs()]] - code - trade_companion.py
- [[_parse_time()]] - code - trade_companion.py
- [[_performance_summary()]] - code - trade_companion.py
- [[_read_json()]] - code - trade_companion.py
- [[_read_jsonl()]] - code - trade_companion.py
- [[_routine_definitions()]] - code - trade_companion.py
- [[_scanner_settings()]] - code - trade_companion.py
- [[_scanner_windows()]] - code - trade_companion.py
- [[_trade_evidence()]] - code - trade_companion.py
- [[account_paths()]] - code - trade_companion.py
- [[approvals_path()]] - code - trade_companion.py
- [[build_snapshot()]] - code - trade_companion.py
- [[chart_image_path()]] - code - trade_companion.py
- [[closed_fill_trades()]] - code - trade_companion.py
- [[datetime]] - code
- [[eastern_date()]] - code - trade_companion.py
- [[fills_path()]] - code - trade_companion.py
- [[find_account()]] - code - trade_companion.py
- [[list_accounts()]] - code - trade_companion.py
- [[re]] - concept
- [[read_cli_diagnostics()]] - code - trade_companion.py
- [[read_env_file()]] - code - trade_companion.py
- [[read_fill_journal()]] - code - trade_companion.py
- [[read_manual_approvals()]] - code - trade_companion.py
- [[read_research()]] - code - trade_companion.py
- [[read_tradingview()]] - code - trade_companion.py
- [[sqlite3]] - concept
- [[trade_companion.py]] - code - trade_companion.py
- [[typing]] - concept

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Trade_Companion_Backend
SORT file.name ASC
```

## Connections to other communities
- 17 edges to [[_COMMUNITY_Connection & Email Tests]]
- 13 edges to [[_COMMUNITY_Stdlib Dependencies]]
- 9 edges to [[_COMMUNITY_Trade Review & Approval]]
- 8 edges to [[_COMMUNITY_Desktop Launcher Tests]]
- 1 edge to [[_COMMUNITY_AIOS CLI Core]]
- 1 edge to [[_COMMUNITY_Agent Tools]]
- 1 edge to [[_COMMUNITY_Usagi Check Scripts]]
- 1 edge to [[_COMMUNITY_Model Backends]]

## Top bridge nodes
- [[read_cli_diagnostics()]] - degree 11, connects to 5 communities
- [[trade_companion.py]] - degree 47, connects to 4 communities
- [[list_accounts()]] - degree 11, connects to 4 communities
- [[build_snapshot()]] - degree 25, connects to 3 communities
- [[chart_image_path()]] - degree 8, connects to 3 communities