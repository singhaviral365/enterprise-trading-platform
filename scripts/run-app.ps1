# Starts the whole platform, each part in its own terminal:  frontend, auth-service, order-service, executor-service.
#
#   .\scripts\run-app.ps1                  the default: payload encryption and real (prod) email, exactly as config/application.yml says
#   .\scripts\run-app.ps1 --windows        the same, and also starts Kafka (docker compose) on this machine
#   .\scripts\run-app.ps1 --dev-mail       email goes to MailHog (run it yourself, see services.mailhog) instead of a real SMTP account
#   .\scripts\run-app.ps1 --no-email       send no email at all (registration then needs auth.verification-enabled: false)
#   .\scripts\run-app.ps1 --no-encryption  turn payload encryption off for this run
#
# Every URL, port, credential and switch lives in config/application.yml (copy config/application.example.yml; see config/README.md).
# Kafka is expected to be running already (in your Linux environment) unless you pass --windows.
param (
    [switch]$windows,
    [switch]$dual,
    [switch]$devMail,
    [switch]$noEmail,
    [switch]$noEncryption
)

if ($args -contains "--windows") { $windows = $true }
if ($args -contains "--dual") { $dual = $true }   # kept for old habits: it is the default now
if ($args -contains "--dev-mail") { $devMail = $true }
if ($args -contains "--no-email") { $noEmail = $true }
if ($args -contains "--no-encryption") { $noEncryption = $true }

# This file lives in scripts/; the repository root is its parent.
$rootDir = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $rootDir "config\cli.js"

# ---- configuration -----------------------------------------------------------------------------------------------------------

$realConfig = Join-Path $rootDir "config\application.yml"
if (-not (Test-Path $realConfig)) {
    Copy-Item (Join-Path $rootDir "config\application.example.yml") $realConfig
    Write-Host "Created config\application.yml from the example. Fill in the passwords, keys and email account in it, then run this again." -ForegroundColor Yellow
    Write-Host "(Encryption key:  node config\cli.js enc-key)" -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Path (Join-Path $rootDir "config\node_modules"))) {
    Write-Host "Installing the config tool..."
    Push-Location (Join-Path $rootDir "config"); npm install --silent; Pop-Location
}

function Get-Config($key) { (node $cli get $key).Trim() }

# Overrides for this run only (a real environment variable wins over application.yml in every service).
$authEnv = ""
$orderProfile = ""
$emailMode = Get-Config "order.email.mode"
$authEmailMode = Get-Config "auth.email.mode"
if ($noEmail) { $authEmailMode = "off"; $emailMode = "off"; $authEnv += "`$env:AUTH_EMAIL_MODE='off'; `$env:AUTH_EMAIL_VERIFICATION_ENABLED='false'; " }
elseif ($devMail) { $authEmailMode = "dev"; $emailMode = "dev"; $authEnv += "`$env:AUTH_EMAIL_MODE='dev'; " }
if ($noEncryption) { $authEnv += "`$env:ENC_MODE='off'; " }
# Quoted: PowerShell would otherwise split the option at the dot and Maven would see a lifecycle phase called ".run.profiles=prod".
if ($emailMode -ne "off") { $orderProfile = " '-Dspring-boot.run.profiles=$emailMode'" }

# Fail early, with the reason, instead of a service refusing to start later.
if ($noEmail -or $devMail -or $noEncryption) {
    Write-Host "Overrides for this run: email=$authEmailMode, encryption=$(if ($noEncryption) { 'off' } else { Get-Config 'encryption.mode' })"
} else {
    node $cli check
    if ($LASTEXITCODE -ne 0) { Write-Host "Fix config\application.yml (or use --dev-mail / --no-email / --no-encryption for this run)." -ForegroundColor Yellow; exit 1 }
}

Write-Host "Auth-service email: $authEmailMode, order-service email: $emailMode, encryption: $(if ($noEncryption) { 'off' } else { Get-Config 'encryption.mode' })"

# ---- the four services -------------------------------------------------------------------------------------------------------

Write-Host "Starting frontend ($(Get-Config 'services.frontend.url'))..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\frontend'; npm run start"

Write-Host "Starting auth-service ($(Get-Config 'services.auth.url'))..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\services\auth-service'; $authEnv npm run build; npm run start"

Write-Host "Starting order-service ($(Get-Config 'services.order.url'))..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\services\order-service'; mvn spring-boot:run$orderProfile"

Write-Host "Starting executor-service ($(Get-Config 'services.executor.url'))..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\services\executor-service'; mvn spring-boot:run"

if ($windows) {
    Write-Host "Starting Kafka (docker compose)..."
    node $cli env-file
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir'; docker compose up -d kafka kafka-init"
    Write-Host "All 5 parts started in separate terminals."
} else {
    Write-Host "Started 4 services in separate terminals."
    Write-Host "NOTE: Kafka must already be running (see kafka.bootstrap-servers in config\application.yml), or pass --windows to start it here."
}
