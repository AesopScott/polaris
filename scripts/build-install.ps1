# Polaris: build (dist:fast) + install in one shot
Set-Location "C:\Users\scott\Code\Polaris"

# Kill any running Polaris processes before building. If Polaris.exe is running
# it locks files in dist\, causing "Can't open output file" from NSIS. Same
# story for orphaned installer windows. node.exe children are filtered to only
# those running from the Polaris install dir, so dev tooling is left alone.
Write-Host "==> Closing running Polaris processes..." -ForegroundColor Cyan

$killed = 0

Get-Process -Name "Polaris" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "    killing Polaris.exe pid=$($_.Id)" -ForegroundColor DarkGray
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    $script:killed++
}

Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $p = $_.Path
        if ($p -and $p -like "*\Programs\Polaris\*") {
            Write-Host "    killing Polaris node.exe pid=$($_.Id)" -ForegroundColor DarkGray
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            $script:killed++
        }
    } catch {}
}

Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "Polaris Setup*" } | ForEach-Object {
    Write-Host "    killing $($_.ProcessName) pid=$($_.Id)" -ForegroundColor DarkGray
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    $script:killed++
}

if ($killed -gt 0) {
    Start-Sleep -Milliseconds 500  # let Windows release file handles
    Write-Host "    closed $killed process(es)" -ForegroundColor DarkGray
} else {
    Write-Host "    none running" -ForegroundColor DarkGray
}

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
