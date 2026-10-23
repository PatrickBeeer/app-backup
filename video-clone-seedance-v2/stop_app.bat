@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Stopping JiMeng Video Clone services...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":9896 " ^| findstr /I "LISTENING"') do (
  echo   killing BFF   pid %%a
  taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":9897 " ^| findstr /I "LISTENING"') do (
  echo   killing ASSET pid %%a
  taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr /I "LISTENING"') do (
  echo   killing VITE  pid %%a
  taskkill /PID %%a /F >nul 2>&1
)

echo   killing cloudflared tunnel
taskkill /IM cloudflared.exe /F >nul 2>&1

echo.
echo Stopped. Run start_app.bat to start again.
timeout /t 5 >nul
