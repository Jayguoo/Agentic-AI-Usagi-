@echo off
cd /d "%~dp0"
if "%~1"=="" (
  wscript.exe "%~dp0Usagi.vbs"
) else (
  uv run python usagi.py %*
)
