@echo off
cd /d "%~dp0"
if "%~1"=="" (
  if not exist ".venv\Scripts\pythonw.exe" uv sync
  start "Usagi" ".venv\Scripts\pythonw.exe" "usagi_app.pyw"
) else (
  uv run python usagi.py %*
)
