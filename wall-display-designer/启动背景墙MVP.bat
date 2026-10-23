@echo off
setlocal

cd /d "%~dp0"

echo.
echo ========================================
echo   Image Wall Render Designer
echo ========================================
echo.

if not exist "package.json" (
  echo [ERROR] package.json not found. Put this BAT in the project root.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [SETUP] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$frontend=(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 4795 -ErrorAction SilentlyContinue); $backend=(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 4796 -ErrorAction SilentlyContinue); if ($frontend -and $backend) { Write-Host '[INFO] App is already running.'; Start-Process 'http://127.0.0.1:4795'; exit 10 }"
if %errorlevel%==10 (
  echo.
  echo [INFO] Opened existing app: http://127.0.0.1:4795
  echo [INFO] If you need a fresh restart, run: stop-wall-mvp.bat
  pause
  exit /b 0
)

if not exist ".env" (
  echo [WARN] .env not found.
  echo [WARN] API image generation needs AI_API_KEY / AI_API_BASE_URL / AI_IMAGE_MODEL.
  echo [WARN] Local preview, prompt generation and PNG export can still work.
  echo.
)

echo [START] Frontend: http://127.0.0.1:4795
echo [START] Backend : http://127.0.0.1:4796
echo [START] Browser will open automatically.
echo.
echo Close this window to stop services.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Job -ScriptBlock { Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:4795' } | Out-Null"

call npm run dev

pause
