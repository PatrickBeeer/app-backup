@echo off
setlocal

cd /d "%~dp0"
set "PORT=4797"
set "URL=http://localhost:%PORT%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$client = New-Object Net.Sockets.TcpClient; try { $client.Connect('127.0.0.1', %PORT%); exit 0 } catch { exit 1 } finally { $client.Close() }" >nul 2>nul
if %errorlevel%==0 (
  echo Server is already running: %URL%
  start "" "%URL%"
  pause
  exit /b 0
)

if not exist ".env.local" (
  echo Missing .env.local. Copy .env.example to .env.local and set 147_API_KEY.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process '%URL%'"

echo Starting Packaging Design Workbench...
echo URL: %URL%
call npm run dev

pause
