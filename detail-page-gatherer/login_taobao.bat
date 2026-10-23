@echo off
cd /d "%~dp0"
.venv\Scripts\python.exe scripts\save_taobao_state.py
pause

