param (
    [switch]$windows,
    [switch]$dual,
    [switch]$mail
)

if ($args -contains "--windows") { $windows = $true }
if ($args -contains "--dual") { $dual = $true }
if ($args -contains "--mail") { $mail = $true }

if (-not $windows -and -not $dual) {
    Write-Host "Please specify either --windows or --dual"
    Write-Host "Usage: .\run-app.ps1 --windows"
    Write-Host "       .\run-app.ps1 --dual"
    Write-Host "Add --mail to also start MailHog (http://localhost:8025) and run the order-service with the dev profile,"
    Write-Host "so notification emails land there. Development only; without it no email is sent."
    exit 1
}

$rootDir = $PSScriptRoot

Write-Host "Starting frontend..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\frontend'; npm run start"

Write-Host "Starting auth-service..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\services\auth-service'; npm run build; npm run start"

Write-Host "Starting order-service..."
$orderServiceRun = "mvn spring-boot:run"
if ($mail) {
    Write-Host "Starting MailHog (dev only)..."
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\services'; docker compose --env-file .env -f docker-compose.yml --profile dev-mail up -d mailhog"
    $orderServiceRun = "mvn spring-boot:run -Dspring-boot.run.profiles=dev"
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\services\order-service'; $orderServiceRun"

Write-Host "Starting executor-service..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\services\executor-service'; mvn spring-boot:run"

if ($windows) {
    Write-Host "Starting Docker services (windows config)..."
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\services'; docker compose --env-file .env -f docker-compose.yml up -d kafka kafka-init"
    Write-Host "All 5 services started in separate terminals."
}

if ($dual) {
    Write-Host "Started 4 services in separate terminals."
    Write-Host "NOTE: You must manually start Kafka in your Linux environment for the dual setup."
}
