# Rebuilds Polaris and installs the fresh setup.exe.
# Usage:  Set-Location "C:\Users\scott\Code\Polaris"; .\rebuild-install.ps1
#
# What it does:
#   1. Force-kills any running Polaris processes
#   2. Cleans old installers from dist\
#   3. Runs npm run dist
#   4. Locates the newest setup.exe (and verifies it matches the package.json version)
#   5. Runs the installer
#   6. Force-syncs mockup.html to AppData (D34 workaround)
#   Plus pre/post install timestamps so we can tell if the install actually replaced files.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$srcVersion = $pkg.version

Write-Host ""
Write-Host "Polaris rebuild -> source version: v${srcVersion}" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1/6] Killing any running Polaris processes..." -ForegroundColor Cyan
Get-Process -Name "Polaris" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

Write-Host "[2/6] Cleaning old installers from dist\..." -ForegroundColor Cyan
Get-ChildItem "dist\Polaris Setup*.exe" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem "dist\*.blockmap"          -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[3/6] Building installer (npm run dist)..." -ForegroundColor Cyan
npm run dist
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed - fix errors above before rerunning." -ForegroundColor Red
  exit 1
}

Write-Host "[4/6] Locating newest installer..." -ForegroundColor Cyan
$installer = Get-ChildItem "dist\Polaris Setup*.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $installer) {
  Write-Host "No installer found in dist\ - npm run dist did not produce a setup.exe." -ForegroundColor Red
  exit 1
}
Write-Host "      $($installer.Name)  ($($installer.LastWriteTime))" -ForegroundColor DarkGray

if ($installer.Name -notlike "*${srcVersion}*") {
  Write-Host "      WARN: installer name does not match expected version v${srcVersion}" -ForegroundColor Yellow
  Write-Host "            Found: $($installer.Name)" -ForegroundColor Yellow
}

# Pre-install state
$installAsar   = "$env:LOCALAPPDATA\Programs\Polaris\resources\app.asar"
$installMockup = "$env:LOCALAPPDATA\Programs\Polaris\resources\resources\mockup.html"
$appDataMockup = "$env:APPDATA\.claude\polaris\mockup.html"

$preAsarTime   = if (Test-Path $installAsar)   { (Get-Item $installAsar).LastWriteTime }   else { $null }
$preMockupTime = if (Test-Path $installMockup) { (Get-Item $installMockup).LastWriteTime } else { $null }

Write-Host ""
Write-Host "=== PRE-INSTALL STATE ===" -ForegroundColor Magenta
Write-Host "  install app.asar     : $preAsarTime" -ForegroundColor Gray
Write-Host "  install mockup.html  : $preMockupTime" -ForegroundColor Gray
Write-Host "  setup.exe (about to run): $($installer.LastWriteTime)" -ForegroundColor Gray
Write-Host ""

Write-Host "[5/6] Running installer..." -ForegroundColor Cyan
Start-Process $installer.FullName -Wait

# Post-install state
$postAsarTime   = if (Test-Path $installAsar)   { (Get-Item $installAsar).LastWriteTime }   else { $null }
$postMockupTime = if (Test-Path $installMockup) { (Get-Item $installMockup).LastWriteTime } else { $null }

Write-Host ""
Write-Host "=== POST-INSTALL STATE ===" -ForegroundColor Magenta
$asarChanged   = ($preAsarTime   -ne $postAsarTime)
$mockupChanged = ($preMockupTime -ne $postMockupTime)
$asarFlag   = if ($asarChanged)   { "[CHANGED]"   } else { "[UNCHANGED]" }
$mockupFlag = if ($mockupChanged) { "[CHANGED]"   } else { "[UNCHANGED]" }
$asarColor   = if ($asarChanged)   { "Green" } else { "Red" }
$mockupColor = if ($mockupChanged) { "Green" } else { "Red" }
Write-Host "  install app.asar     : $postAsarTime  $asarFlag" -ForegroundColor $asarColor
Write-Host "  install mockup.html  : $postMockupTime  $mockupFlag" -ForegroundColor $mockupColor

# D34 workaround: force-sync mockup.html to AppData regardless of installer behavior
Write-Host ""
Write-Host "[6/6] Force-syncing AppData (D34 workaround)..." -ForegroundColor Cyan
if (Test-Path $installMockup) {
  Copy-Item $installMockup $appDataMockup -Force
  Write-Host "      mockup.html copied to AppData (refreshed from install dir)" -ForegroundColor DarkGray
} else {
  Write-Host "      WARN: install mockup.html not found - installer likely failed" -ForegroundColor Yellow
}

Write-Host ""
if (-not $asarChanged) {
  Write-Host "WARNING: app.asar timestamp did NOT change - installer did not replace it." -ForegroundColor Red
  Write-Host "         Server.js and bundled package.json are STALE." -ForegroundColor Red
  Write-Host "         Header version, app-update event, and server-side changes will not reflect." -ForegroundColor Red
  Write-Host "         Try: close ALL Polaris processes via Task Manager, then rerun this script." -ForegroundColor Red
} else {
  Write-Host "Done. Polaris should now show v${srcVersion}. Launch it from Start menu." -ForegroundColor Green
}
Write-Host ""
