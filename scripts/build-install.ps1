# Polaris: build (dist:fast) + install in one shot
Set-Location "C:\Users\scott\Code\Polaris"

Write-Host "==> Building Polaris (dist:fast)..." -ForegroundColor Cyan
npm run dist:fast
if (-not $?) {
    Write-Host "==> Build failed. Aborting." -ForegroundColor Red
    exit 1
}

$installer = Get-ChildItem "dist\Polaris Setup *.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    Write-Host "==> No installer found in dist\. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "==> Running installer: $($installer.Name)" -ForegroundColor Cyan
Start-Process $installer.FullName -Wait

Write-Host "==> Done." -ForegroundColor Green
