# One command for the whole platform: run every test suite with coverage, then send everything to SonarQube as one project.
#
#   .\scripts\sonar-scan.ps1                 tests with coverage in all four parts, then the scan
#   .\scripts\sonar-scan.ps1 -SkipTests      scan only (the coverage files from the last run are reused)
#   .\scripts\sonar-scan.ps1 -QualityGate    also wait for the server's quality gate and fail if it fails
#
# The server and the token come from config/application.yml (sonar.host-url, sonar.token). What is analysed is in sonar-project.properties.
# Needs: Node 20+, JDK 21+, and a SonarQube server that is up (documentation/readme/SONARQUBE.md).
param(
    [switch]$SkipTests,
    [switch]$QualityGate
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $root 'config\cli.js'

$hostUrl = (node $cli get sonar.host-url).Trim()
$token = (node $cli get sonar.token).Trim()
if (-not $hostUrl -or -not $token) {
    Write-Host 'Set sonar.host-url and sonar.token in config\application.yml first (a token: SonarQube > My Account > Security).' -ForegroundColor Yellow
    exit 1
}

function Step($name) { Write-Host "`n=== $name ===" -ForegroundColor Cyan }

if (-not $SkipTests) {
    # A failing test must not stop the report: coverage of what ran is still worth sending. The exit codes are printed, not hidden.
    Step 'frontend: unit tests with coverage'
    Push-Location (Join-Path $root 'frontend'); npm run test:ci; $frontendExit = $LASTEXITCODE; Pop-Location

    Step 'auth-service: unit tests with coverage'
    Push-Location (Join-Path $root 'services\auth-service'); npx jest --coverage; $authExit = $LASTEXITCODE; Pop-Location

    Step 'order-service: tests and JaCoCo report'
    Push-Location (Join-Path $root 'services\order-service'); .\mvnw.cmd clean verify '-Dmaven.test.failure.ignore=true'; $orderExit = $LASTEXITCODE; Pop-Location

    Step 'executor-service: tests and JaCoCo report'
    Push-Location (Join-Path $root 'services\executor-service'); .\mvnw.cmd clean verify '-Dmaven.test.failure.ignore=true'; $executorExit = $LASTEXITCODE; Pop-Location

    Write-Host "`nexit codes: frontend=$frontendExit auth=$authExit order=$orderExit executor=$executorExit (a non-zero frontend or auth code can be a coverage threshold, not a missing report)"
}

# The one number for the whole platform, worked out from the four reports (no server needed).
Step 'Coverage of the whole platform'
node (Join-Path $PSScriptRoot 'coverage-summary.js')

$missing = @(
    'frontend\coverage\frontend\lcov.info',
    'services\auth-service\coverage\lcov.info',
    'services\order-service\target\site\jacoco\jacoco.xml',
    'services\executor-service\target\site\jacoco\jacoco.xml'
) | Where-Object { -not (Test-Path (Join-Path $root $_)) }
if ($missing) {
    Write-Host "These coverage reports are missing, so those parts would show no coverage:`n  $($missing -join "`n  ")" -ForegroundColor Yellow
}

Step 'SonarQube scan (whole platform)'
Push-Location $root
$env:SONAR_HOST_URL = $hostUrl
$env:SONAR_TOKEN = $token
$extra = @()
if ($QualityGate) { $extra += '-Dsonar.qualitygate.wait=true' }
npx --yes sonarqube-scanner @extra
$scanExit = $LASTEXITCODE
Remove-Item Env:SONAR_TOKEN
Pop-Location
if ($scanExit -eq 0) { Write-Host "`nDone. Open $hostUrl/dashboard?id=enterprise-trading-platform" -ForegroundColor Green } else { exit $scanExit }
