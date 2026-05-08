# Polaris: build public distributable (only public: true features)
# Output: dist\Polaris Setup *.exe — does NOT auto-install.
Set-Location "C:\Users\scott\Code\Polaris"

$buildFlagsPath = "resources\build-flags.json"
$originalFlags  = Get-Content $buildFlagsPath -Raw

function Restore-Flags {
    Set-Content $buildFlagsPath $originalFlags -NoNewline
    Write-Host "==> build-flags.json restored." -ForegroundColor DarkGray
}

Write-Host "==> Setting publicBuild = true..." -ForegroundColor Cyan
Set-Content $buildFlagsPath '{"publicBuild":true}'

Write-Host "==> Building Polaris (public, dist)..." -ForegroundColor Cyan
npm run dist:public
if (-not $?) {
    Write-Host "==> Build failed. Restoring flags and aborting." -ForegroundColor Red
    Restore-Flags
    exit 1
}

Restore-Flags

$installer = Get-ChildItem "dist\Polaris Setup *.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    Write-Host "==> No installer found in dist\." -ForegroundColor Red
    exit 1
}

$publicName = $installer.FullName -replace 'Polaris Setup', 'Polaris Public Setup'
Rename-Item $installer.FullName $publicName -Force
Write-Host "    renamed → $(Split-Path $publicName -Leaf)" -ForegroundColor DarkGray

Write-Host "==> Public installer ready: $publicName" -ForegroundColor Green
