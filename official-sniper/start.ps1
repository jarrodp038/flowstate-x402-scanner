# ══════════════════════════════════════════════════════════════════
#   GRADUATION SNIPER — Launch Script
#   Usage: .\start.ps1
#   First time? Run .\setup.ps1 first.
# ══════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'

# Enable UTF-8 output (needed for box-drawing characters)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Enable ANSI color support on Windows 10+ consoles
if ($PSVersionTable.PSVersion.Major -ge 5) {
    try {
        # Enable virtual terminal processing for ANSI support
        $kernel32 = Add-Type -MemberDefinition @"
[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
[DllImport("kernel32.dll", SetLastError = true)]
public static extern IntPtr GetStdHandle(int nStdHandle);
"@ -Name "Kernel32" -Namespace "Win32" -PassThru

        $handle = [Win32.Kernel32]::GetStdHandle(-11) # STD_OUTPUT_HANDLE
        $mode   = 0
        [Win32.Kernel32]::GetConsoleMode($handle, [ref]$mode) | Out-Null
        $ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
        [Win32.Kernel32]::SetConsoleMode($handle, $mode -bor $ENABLE_VIRTUAL_TERMINAL_PROCESSING) | Out-Null
    } catch {
        # ANSI not available on this terminal — bot will run without colors
    }
}

# ── Check .env exists ────────────────────────────────────────────────────────
$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "[ERROR] .env file not found. Run setup first:" -ForegroundColor Red
    Write-Host "        .\setup.ps1" -ForegroundColor Yellow
    exit 1
}

# ── Check Node.js ────────────────────────────────────────────────────────────
try {
    node --version | Out-Null
} catch {
    Write-Host "[ERROR] Node.js not found. Download from: https://nodejs.org" -ForegroundColor Red
    exit 1
}

# ── Check node_modules ───────────────────────────────────────────────────────
$modulesDir = Join-Path $PSScriptRoot "node_modules"
if (-not (Test-Path $modulesDir)) {
    Write-Host "node_modules not found — running npm install..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm install failed." -ForegroundColor Red
        exit 1
    }
}

# ── Launch bot ───────────────────────────────────────────────────────────────
Set-Location $PSScriptRoot
node graduation-sniper.js
