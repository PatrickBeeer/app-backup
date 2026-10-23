@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo FFmpeg is required in PATH.
  pause
  exit /b 1
)

if not exist node_modules (
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist .env copy .env.example .env >nul
start "" http://127.0.0.1:3013
call npm start
