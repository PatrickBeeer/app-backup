@echo off
cd /d "%~dp0"
set PORT=9898
.venv\Scripts\python.exe app.py
