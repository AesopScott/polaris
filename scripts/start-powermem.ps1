# Start PowerMem sidecar service for Polaris
# Usage: & .\scripts\start-powermem.ps1

param(
  [switch]$NoOllama,  # Skip Ollama (use cloud embeddings)
  [switch]$PostgreSQL # Use PostgreSQL instead of SQLite
)

$ErrorActionPreference = "Stop"

Write-Host "🧠 Starting PowerMem sidecar..." -ForegroundColor Cyan

# Check if Docker is running
try {
  docker ps > $null 2>&1
} catch {
  Write-Host "❌ Docker is not running. Please start Docker Desktop and try again." -ForegroundColor Red
  exit 1
}

# Check if .env.powermem exists
$envFile = ".env.powermem"
if (-not (Test-Path $envFile)) {
  Write-Host "⚠️  .env.powermem not found. Creating from template..." -ForegroundColor Yellow
  if (Test-Path ".env.powermem.example") {
    Copy-Item ".env.powermem.example" $envFile
    Write-Host "✅ Created $envFile — please fill in OPENROUTER_API_KEY" -ForegroundColor Green
    Write-Host ""
    Write-Host "Edit .env.powermem and add your OpenRouter API key, then run this script again." -ForegroundColor Yellow
    exit 0
  } else {
    Write-Host "❌ .env.powermem.example not found" -ForegroundColor Red
    exit 1
  }
}

# Load environment variables
Get-Content $envFile | ForEach-Object {
  if ($_ -and -not $_.StartsWith("#")) {
    $key, $value = $_.Split("=", 2)
    if ($key -and $value) {
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
  }
}

# Compose file selection
$composeFile = "docker-compose.powermem.yml"
if (-not (Test-Path $composeFile)) {
  Write-Host "❌ $composeFile not found" -ForegroundColor Red
  exit 1
}

# Build the docker-compose command
$composeCmd = "docker-compose -f $composeFile --env-file $envFile"

# Start services
Write-Host "Starting services..." -ForegroundColor Cyan

if ($NoOllama) {
  Write-Host "⏭️  Skipping Ollama (using cloud embeddings)" -ForegroundColor Yellow
  & docker-compose -f $composeFile --env-file $envFile up -d powermem
} else {
  Write-Host "📦 Starting Ollama and PowerMem..." -ForegroundColor Cyan
  & docker-compose -f $composeFile --env-file $envFile up -d
}

if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Docker-compose failed" -ForegroundColor Red
  exit 1
}

# Wait for PowerMem health check
Write-Host "⏳ Waiting for PowerMem to be ready..." -ForegroundColor Cyan
$maxAttempts = 30
$attempt = 0
while ($attempt -lt $maxAttempts) {
  try {
    $health = Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($health.StatusCode -eq 200) {
      Write-Host "✅ PowerMem is running on http://localhost:8000" -ForegroundColor Green
      Write-Host ""
      Write-Host "Dashboard: http://localhost:8000/dashboard/" -ForegroundColor Cyan
      Write-Host "Health: http://localhost:8000/health" -ForegroundColor Cyan
      Write-Host ""
      Write-Host "View logs: docker logs polaris-powermem" -ForegroundColor Gray
      exit 0
    }
  } catch {}

  $attempt++
  Write-Host "  Attempt $attempt/$maxAttempts..." -NoNewline
  Start-Sleep -Seconds 1
  Write-Host "`r" -NoNewline
}

Write-Host ""
Write-Host "⚠️  PowerMem is not responding after 30 seconds" -ForegroundColor Yellow
Write-Host "Check logs: docker logs polaris-powermem" -ForegroundColor Yellow
exit 1
