@echo off
setlocal

echo.
echo ========================================
echo   Stop Background Wall Render MVP
echo ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(4795,4796); $pids=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $ports -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if (-not $pids) { Write-Host '[INFO] No MVP service found on ports 4795/4796.'; exit 0 }; foreach ($pid in $pids) { Write-Host ('[STOP] Killing process ' + $pid); Stop-Process -Id $pid -Force }"

echo.
echo Done.
pause
