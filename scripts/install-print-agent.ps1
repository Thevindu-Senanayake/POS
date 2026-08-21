# =============================================================================
#  POS Print Agent — installer (run ONCE on the Windows till, elevated)
# =============================================================================
#  The print-agent runs NATIVELY on Windows (not in Docker) so it can drive the
#  USB receipt printer through the OS print spooler as well as the network
#  kitchen/bar printers over TCP:9100. It polls the Dockerized API at
#  http://localhost:4000 using PRINT_AGENT_TOKEN — no database access.
#
#  This script:
#    1. checks Node (>= 20; 22 recommended) and activates pnpm via corepack,
#    2. installs deps and builds @pos/shared + @pos/print-agent,
#    3. registers a logon Scheduled Task "POS Print Agent" so the agent starts
#       automatically every time the till user signs in (pairs with Docker
#       Desktop's "start on sign-in"),
#    4. starts the task immediately.
#
#  Run from an ELEVATED PowerShell:
#      powershell -ExecutionPolicy Bypass -File scripts\install-print-agent.ps1
#
#  Prereq: set the printer env in the repo-root .env first (PRINT_AGENT_TOKEN must
#  match docker-compose.yml; PRINTER_RECEIPT_DEVICE = the exact Windows printer
#  name for USB; PRINTER_KITCHEN_IP / PRINTER_BAR_IP for network KOTs). See DEPLOY.md.
# =============================================================================

$ErrorActionPreference = 'Stop'
$TaskName = 'POS Print Agent'
$RepoRoot = Split-Path -Parent $PSScriptRoot   # scripts\ -> repo root

Write-Host "POS Print Agent installer" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot`n"

# --- 0. Elevation (registering a RunLevel Highest task needs admin) ----------
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Error "Please run this from an ELEVATED PowerShell (Run as administrator)."
  exit 1
}

# --- 1. Node + pnpm ----------------------------------------------------------
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js not found. Install Node 22 LTS from https://nodejs.org then re-run."
  exit 1
}
$nodeVersion = (& node --version).TrimStart('v')
$nodeMajor = [int]($nodeVersion.Split('.')[0])
Write-Host "Node $nodeVersion detected."
if ($nodeMajor -lt 20) {
  Write-Error "Node 20+ required (22 recommended). Found $nodeVersion."
  exit 1
}
if ($nodeMajor -lt 22) {
  Write-Warning "Node 22 is recommended; $nodeVersion will probably work."
}

Write-Host "Activating pnpm@9.15.0 via corepack..."
try {
  & corepack enable | Out-Null
  & corepack prepare pnpm@9.15.0 --activate | Out-Null
} catch {
  Write-Warning "corepack failed. Falling back to a global pnpm; install with: npm i -g pnpm@9.15.0"
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Error "pnpm not available. Install it (npm i -g pnpm@9.15.0) and re-run."
  exit 1
}

# --- 2. Install + build (shared is a build-time dep of the agent) ------------
Push-Location $RepoRoot
try {
  Write-Host "`nInstalling dependencies (this also attempts the optional USB module)..."
  & pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "pnpm install failed ($LASTEXITCODE)" }

  Write-Host "Building @pos/shared..."
  & pnpm --filter @pos/shared build
  if ($LASTEXITCODE -ne 0) { throw "@pos/shared build failed ($LASTEXITCODE)" }

  Write-Host "Building @pos/print-agent..."
  & pnpm --filter @pos/print-agent build
  if ($LASTEXITCODE -ne 0) { throw "@pos/print-agent build failed ($LASTEXITCODE)" }
} finally {
  Pop-Location
}

# USB printing needs the optional native module @thiagoelg/node-printer. It is an
# optionalDependency, so `pnpm install` above tried to fetch its prebuilt binary. If
# it's absent (no prebuilt for this Node/OS), USB jobs fall back to stdout while
# NETWORK printing still works. To enable USB: install "Desktop development with C++"
# (VS Build Tools) + Python 3, then re-run `pnpm install`.
$usbModule = Join-Path $RepoRoot 'node_modules\@thiagoelg\node-printer'
if (Test-Path $usbModule) {
  Write-Host "USB print module present (@thiagoelg/node-printer)." -ForegroundColor Green
} else {
  Write-Warning "USB print module NOT installed - network printing works; USB will fall back to stdout."
  Write-Warning "To enable USB: install VS Build Tools (Desktop C++) + Python 3, then re-run 'pnpm install'."
}

# --- 3. Register the logon Scheduled Task ------------------------------------
# The task runs the agent via pnpm's start:svc (dotenv loads the repo-root .env),
# logging to print-agent.log in the repo root. cmd.exe is invoked by its known
# ComSpec path so the task doesn't depend on pnpm being on the service PATH.
$logFile = Join-Path $RepoRoot 'print-agent.log'
$cmdArgs = "/c cd /d ""$RepoRoot"" && pnpm --filter @pos/print-agent run start:svc >> ""$logFile"" 2>&1"

$action = New-ScheduledTaskAction -Execute "$env:ComSpec" -Argument $cmdArgs -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Write-Host "`nRegistering scheduled task '$TaskName' (runs at logon)..."
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null

# --- 4. Start it now ---------------------------------------------------------
Write-Host "Starting '$TaskName'..."
Start-ScheduledTask -TaskName $TaskName

Write-Host "`nDone." -ForegroundColor Green
Write-Host "  - Agent logs:   $logFile"
Write-Host "  - Task status:  Get-ScheduledTask '$TaskName' | Get-ScheduledTaskInfo"
Write-Host "  - Stop/remove:  Unregister-ScheduledTask -TaskName '$TaskName'"
Write-Host "`nEnsure the API stack is running (docker compose up -d) and the printer"
Write-Host "env in .env is set. The agent auto-starts at every sign-in from now on."
