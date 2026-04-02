# ══════════════════════════════════════════════════════════════════
#   GRADUATION SNIPER — First-Time Setup Script
#   Run this ONCE before launching the bot.
#   Usage:  .\setup.ps1
# ══════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   GRADUATION SNIPER BOT — Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Node.js ────────────────────────────────────────────────────────
Write-Host "Checking Node.js..." -NoNewline
try {
    $nodeVersion = node --version 2>&1
    $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($major -lt 18) {
        Write-Host " FAIL" -ForegroundColor Red
        Write-Host "[ERROR] Node.js v18 or higher is required. You have $nodeVersion" -ForegroundColor Red
        Write-Host "        Download from: https://nodejs.org" -ForegroundColor Yellow
        exit 1
    }
    Write-Host " OK ($nodeVersion)" -ForegroundColor Green
} catch {
    Write-Host " NOT FOUND" -ForegroundColor Red
    Write-Host "[ERROR] Node.js is not installed." -ForegroundColor Red
    Write-Host "        Download from: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# ── 2. Install dependencies ─────────────────────────────────────────────────
Write-Host "Installing dependencies..." -NoNewline
npm install --silent 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host "[ERROR] npm install failed. Run 'npm install' manually and check the error." -ForegroundColor Red
    exit 1
}
Write-Host " OK" -ForegroundColor Green

# ── 3. Create .env file ─────────────────────────────────────────────────────
$envFile = Join-Path $PSScriptRoot ".env"

if (Test-Path $envFile) {
    Write-Host ".env already exists — skipping creation." -ForegroundColor Yellow
    Write-Host "  Edit $envFile to change settings." -ForegroundColor DarkGray
} else {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "   Configuration" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""

    # PumpDev API Key
    Write-Host "Get your FREE API key at: https://pumpdev.io" -ForegroundColor Yellow
    $apiKey = Read-Host "Enter your PumpDev API key (leave blank to use TEST MODE only)"
    if ([string]::IsNullOrWhiteSpace($apiKey)) { $apiKey = "your_api_key_here" }

    # Solana RPC
    Write-Host ""
    Write-Host "Solana RPC URL (press Enter to use free public RPC, or enter Helius/QuickNode URL):"
    $rpcUrl = Read-Host "RPC URL"
    if ([string]::IsNullOrWhiteSpace($rpcUrl)) {
        $rpcUrl = "https://api.mainnet-beta.solana.com"
        Write-Host "  Using public RPC. Consider upgrading to Helius (https://helius.dev) for better speed." -ForegroundColor Yellow
    }

    # Test mode
    Write-Host ""
    $testInput = Read-Host "Enable TEST MODE / paper trading? (Y/n, default Y)"
    $testMode  = if ($testInput -eq 'n' -or $testInput -eq 'N') { "false" } else { "true" }
    if ($testMode -eq "true") {
        Write-Host "  TEST MODE ON — no real funds will be used." -ForegroundColor Green
    } else {
        Write-Host "  LIVE MODE — real SOL will be traded!" -ForegroundColor Red
    }

    # Buy amount
    Write-Host ""
    $buyInput = Read-Host "SOL per snipe (default 0.05)"
    $buyAmount = if ([string]::IsNullOrWhiteSpace($buyInput)) { "0.05" } else { $buyInput }

    # Write .env
    $envContent = @"
# ══════════════════════════════════════════════════════
#   GRADUATION SNIPER BOT — Configuration
#   Edit any value then restart the bot.
# ══════════════════════════════════════════════════════

# PumpDev API (get key at https://pumpdev.io)
PUMPDEV_API_KEY=$apiKey

# Solana RPC
SOLANA_RPC_URL=$rpcUrl

# Mode: true = paper trading (safe), false = live trading
TEST_MODE=$testMode

# Entry
BUY_AMOUNT_SOL=$buyAmount
ENTRY_THRESHOLD_PCT=96
SLIPPAGE_PCT=25

# Exit
TRAILING_STOP_PCT=15
HARD_STOP_LOSS_PCT=30
GRADUATION_DELAY_MS=5000

# Risk limits
MAX_POSITIONS=3
DAILY_LOSS_LIMIT_SOL=0.15

# Monitoring
SCAN_INTERVAL_MS=30000
DISCOVERY_MIN_PCT=85
DASHBOARD_REFRESH_MS=2000
"@
    Set-Content -Path $envFile -Value $envContent -Encoding UTF8
    Write-Host ""
    Write-Host ".env created at: $envFile" -ForegroundColor Green
}

# ── 4. Done ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "   Setup complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  To start the bot, run:" -ForegroundColor White
Write-Host "    .\start.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To edit settings:" -ForegroundColor White
Write-Host "    notepad .env" -ForegroundColor Cyan
Write-Host ""
