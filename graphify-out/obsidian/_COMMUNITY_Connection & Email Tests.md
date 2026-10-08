---
type: community
cohesion: 0.06
members: 51
---

# Connection & Email Tests

**Cohesion:** 0.06 - loosely connected
**Members:** 51 nodes

## Members
- [[dot-_review_trades()]] - code - test_usagi_app.py
- [[dot-test_accepts_model_json_wrapped_in_prose_or_trailing_commas()]] - code - test_usagi_app.py
- [[dot-test_automation_history_includes_copy_and_options_logs_and_schedule_days()]] - code - test_usagi_app.py
- [[dot-test_automation_log_reports_failed_market_session_steps()]] - code - test_usagi_app.py
- [[dot-test_automations_degrade_when_opentrade_has_no_scheduler_log()]] - code - test_usagi_app.py
- [[dot-test_builds_a_normalized_read_only_trade_companion_snapshot()]] - code - test_usagi_app.py
- [[dot-test_cli_report_reader_tool_is_registered_and_does_not_expose_cli_execution()]] - code - test_usagi_app.py
- [[dot-test_desktop_api_connects_email_through_the_verified_backend()]] - code - test_usagi_app.py
- [[dot-test_desktop_api_exposes_only_a_read_only_trade_snapshot()]] - code - test_usagi_app.py
- [[dot-test_desktop_api_serves_tradingview_chart_images()]] - code - test_usagi_app.py
- [[dot-test_desktop_backend_exposes_the_opentrade_folder_target()]] - code - test_usagi_app.py
- [[dot-test_desktop_status_reports_the_local_email_connection()]] - code - test_usagi_app.py
- [[dot-test_does_not_store_credentials_when_gmail_rejects_login()]] - code - test_usagi_app.py
- [[dot-test_each_account_approves_into_its_own_plan()]] - code - test_usagi_app.py
- [[dot-test_empty_options_skip_lists_are_not_automation_warnings()]] - code - test_usagi_app.py
- [[dot-test_lists_every_configured_alpaca_account_without_exposing_keys()]] - code - test_usagi_app.py
- [[dot-test_long_trading_log_does_not_hide_premarket_and_risk_is_managed_in_session()]] - code - test_usagi_app.py
- [[dot-test_observes_cli_report_for_primary_without_executing_any_process()]] - code - test_usagi_app.py
- [[dot-test_optional_warning_keeps_history_and_marks_later_recovery()]] - code - test_usagi_app.py
- [[dot-test_plan_approval_is_refused_while_trade_companion_is_read_only()]] - code - test_usagi_app.py
- [[dot-test_reads_a_contained_opentrade_source_file()]] - code - test_usagi_app.py
- [[dot-test_records_trade_research_failures_for_display()]] - code - test_usagi_app.py
- [[dot-test_registers_only_read_only_opentrade_agent_tools()]] - code - test_usagi_app.py
- [[dot-test_rejects_secrets_and_paths_outside_opentrade()]] - code - test_usagi_app.py
- [[dot-test_reports_scheduled_automation_runs_and_what_failed()]] - code - test_usagi_app.py
- [[dot-test_rereviews_trades_researched_before_psychology_and_rejects_missing_psychology()]] - code - test_usagi_app.py
- [[dot-test_researches_each_symbol_day_once_and_explains_every_win_and_loss()]] - code - test_usagi_app.py
- [[dot-test_saves_email_credentials_encrypted_for_the_current_windows_user()]] - code - test_usagi_app.py
- [[dot-test_searches_safe_opentrade_files_without_indexing_secrets()]] - code - test_usagi_app.py
- [[dot-test_summarizes_what_pre_market_research_found()]] - code - test_usagi_app.py
- [[dot-test_swaps_trade_companion_between_accounts()]] - code - test_usagi_app.py
- [[dot-test_trade_companion_degrades_safely_when_snapshots_are_missing()]] - code - test_usagi_app.py
- [[dot-test_trade_companion_explains_empty_plan_from_closed_scanner_windows()]] - code - test_usagi_app.py
- [[dot-test_trade_companion_explains_other_recorded_decision_types()]] - code - test_usagi_app.py
- [[dot-test_trade_journal_logs_broker_fills_with_loss_reviews()]] - code - test_usagi_app.py
- [[dot-test_trade_route_does_not_break_the_existing_status_payload()]] - code - test_usagi_app.py
- [[dot-test_tradingview_summary_explains_a_missing_cli_or_closed_desktop()]] - code - test_usagi_app.py
- [[dot-test_turning_off_read_only_lets_approvals_reach_opentrade()]] - code - test_usagi_app.py
- [[dot-test_verifies_read_only_gmail_access_before_saving_credentials()]] - code - test_usagi_app.py
- [[dot-test_write_mode_and_approvals_require_the_alpaca_paper_endpoint()]] - code - test_usagi_app.py
- [[dot-test_yesterdays_approvals_do_not_apply_today()]] - code - test_usagi_app.py
- [[dot-trade_write_patches()]] - code - test_usagi_app.py
- [[dot-write_fill_journal()]] - code - test_usagi_app.py
- [[dot-write_plan_project()]] - code - test_usagi_app.py
- [[dot-write_two_account_project()]] - code - test_usagi_app.py
- [[EmailConnectionTests]] - code - test_usagi_app.py
- [[OpenTradeConnectionTests]] - code - test_usagi_app.py
- [[Path_1]] - code
- [[Scheduled routines with their last run, plus the recent run history.]] - rationale - trade_companion.py
- [[load_web_app()]] - code - test_usagi_app.py
- [[read_automations()]] - code - trade_companion.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Connection__Email_Tests
SORT file.name ASC
```

## Connections to other communities
- 17 edges to [[_COMMUNITY_Trade Companion Backend]]
- 4 edges to [[_COMMUNITY_Desktop Launcher Tests]]

## Top bridge nodes
- [[OpenTradeConnectionTests]] - degree 42, connects to 2 communities
- [[read_automations()]] - degree 19, connects to 2 communities
- [[EmailConnectionTests]] - degree 6, connects to 1 community
- [[load_web_app()]] - degree 5, connects to 1 community
- [[dot-test_lists_every_configured_alpaca_account_without_exposing_keys()]] - degree 3, connects to 1 community