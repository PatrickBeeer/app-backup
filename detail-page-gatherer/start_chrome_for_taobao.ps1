$ErrorActionPreference = "Stop"

$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)

$chrome = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
  Write-Host "Chrome was not found. Please install Google Chrome first." -ForegroundColor Red
  exit 1
}

$profileDir = Join-Path $env:LocalAppData "Google\Chrome\User Data"

Write-Host "Chrome path: $chrome" -ForegroundColor Green
Write-Host "Starting Chrome with remote debugging port 9222..." -ForegroundColor Green

Start-Process -FilePath $chrome -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$profileDir",
  "https://www.taobao.com"
)

Write-Host ""
Write-Host "If Chrome was already open and WebUI cannot connect, close all Chrome windows and run this script again." -ForegroundColor Yellow
Write-Host "After logging in to Taobao, return to WebUI and choose: Connect my Chrome." -ForegroundColor Cyan
