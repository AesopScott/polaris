# Launches the installed Polaris with stdout/stderr visible in this terminal.
# Use this when you need to see [polaris], [github], [ws] etc. logs from server.js
# while you click around in the UI.
#
# Run from PowerShell:   .\dev-launch.ps1

$exe = "$env:LOCALAPPDATA\Programs\Polaris\Polaris.exe"
if (-not (Test-Path $exe)) {
  Write-Host "Polaris not found at $exe" -ForegroundColor Red
  Write-Host "Install it via dist\Polaris Setup 1.0.0.exe first." -ForegroundColor Yellow
  exit 1
}

Write-Host "Launching Polaris with logs streaming to this terminal..." -ForegroundColor Cyan
Write-Host "(close Polaris or press Ctrl+C here to stop)" -ForegroundColor DarkGray
Write-Host ""

& $exe
