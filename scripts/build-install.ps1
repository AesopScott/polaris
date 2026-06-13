# Polaris-lab: build (dist:fast) + install in one shot
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

# Kill any running Polaris-lab processes before building. If Polaris-lab.exe is running
# it locks files in dist\, causing "Can't open output file" from NSIS. Same
# story for orphaned installer windows. node.exe children are filtered to only
# those running from the Polaris-lab install dir, so dev tooling is left alone.
Write-Host "==> Closing running Polaris-lab processes..." -ForegroundColor Cyan

$killed = 0
$productName = "Polaris-lab"
$runtimeDir = "$env:APPDATA\.claude\polaris-lab"

Get-Process -Name $productName -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "    killing $productName.exe pid=$($_.Id)" -ForegroundColor DarkGray
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    $script:killed++
}

Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $p = $_.Path
        if ($p -and $p -like "*\Programs\$productName\*") {
            Write-Host "    killing $productName node.exe pid=$($_.Id)" -ForegroundColor DarkGray
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            $script:killed++
        }
    } catch {}
}

Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "$productName Setup*" } | ForEach-Object {
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

$newVersion = node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)"
Write-Host "==> Building $productName v$newVersion (dist:fast)..." -ForegroundColor Cyan
npm run dist:fast
if (-not $?) {
    Write-Host "==> Build failed. Aborting." -ForegroundColor Red
    exit 1
}

$installer = Get-ChildItem "dist\$productName Setup *.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    Write-Host "==> No installer found in dist\. Aborting." -ForegroundColor Red
    exit 1
}

$privateName = $installer.FullName -replace "$productName Setup", "$productName Private Setup"
if (Test-Path $privateName) { Remove-Item $privateName -Force }
Rename-Item $installer.FullName $privateName -Force
Write-Host "    renamed → $(Split-Path $privateName -Leaf)" -ForegroundColor DarkGray

Write-Host "==> Running installer: $(Split-Path $privateName -Leaf)" -ForegroundColor Cyan
Start-Process $privateName -Wait

Write-Host "==> Done." -ForegroundColor Green

$head = (git rev-parse HEAD).Trim()
$builtAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
if (-not (Test-Path $runtimeDir)) { New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null }
$stateFile = "$runtimeDir\last-build-head.json"
$json = "{`"head`":`"$head`",`"builtAt`":`"$builtAt`",`"version`":`"$newVersion`"}"
[System.IO.File]::WriteAllText($stateFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "==> Notified ${productName}: HEAD $($head.Substring(0,7)) v$newVersion marked as built." -ForegroundColor Green
