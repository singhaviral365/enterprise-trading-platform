param (
    [switch]$windows,
    [switch]$dual
)

if (-not $windows -and -not $dual) {
    Write-Host "Please specify either --windows or --dual"
    Write-Host "Usage: .\run-app.ps1 --windows"
    Write-Host "       .\run-app.ps1 --dual"
    exit 1
}

$rootDir = $PSScriptRoot

Write-Host "Starting frontend..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$rootDir\frontend`"; ng serve"

Write-Host "Starting auth-service..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$rootDir\services\auth-service`"; ; npm run build; npm run start:dev"

Write-Host "Starting order-service..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$rootDir\services\order-service`"; mvn spring-boot:run"

Write-Host "Starting executor-service..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$rootDir\services\executor-service`"; mvn spring-boot:run"

if ($windows) {
    Write-Host "Starting Docker services (windows config)..."
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$rootDir\services`"; docker compose --env-file .env -f docker-compose.yml up -d kafka kafka-init"
    Write-Host "All 5 services started in separate terminals."
}

if ($dual) {
    Write-Host "Started 4 services in separate terminals."
    Write-Host "NOTE: You must manually start Kafka in your Linux environment for the dual setup."
}
