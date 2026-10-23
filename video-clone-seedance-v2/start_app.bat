@echo off
chcp 65001 >nul
set "NODE_EXE=C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\node.exe"
cd /d "%~dp0"

echo Starting JiMeng Video Clone (detached services)...
echo.
"%NODE_EXE%" start_detached.mjs
echo.

echo Opening browser...
start "" http://localhost:5173/standalone/video-clone-seedance/
echo.
echo Done.
echo   - Services run in background (no console window to keep open).
echo   - Logs: .run\bff.log / .run\vite.log / .run\tunnel.log
echo   - Stop: run stop_app.bat
echo   - Tunnel URL regenerates on every restart: .run\public-asset-base-url
timeout /t 8 >nul
