$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$reportHtml = Join-Path $scriptDir 'surefire.html'
$cssMarker = 'href="surefire.css"'
$fontPreconnectMarker = 'href="https://fonts.googleapis.com"'
$fontGstaticMarker = 'href="https://fonts.gstatic.com"'
$fontQuicksandMarker = 'family=Quicksand'

if (-not (Test-Path -LiteralPath $reportHtml)) {
    Write-Error "surefire.html not found at $reportHtml"
    exit 1
}

$content = Get-Content -LiteralPath $reportHtml -Raw
if ($content.Contains($cssMarker) -and $content.Contains($fontPreconnectMarker) -and $content.Contains($fontGstaticMarker) -and $content.Contains($fontQuicksandMarker)) {
    Write-Host 'CSS override and font links already exist. No changes made.'
    exit 0
}

if (-not $content.Contains('</head>')) {
    Write-Error 'Could not find </head> to inject CSS/font links'
    exit 2
}

$injectedHeadBlock = @'
    <link rel="stylesheet" href="surefire.css" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap" rel="stylesheet" />
'@

$content = $content.Replace('</head>', "$injectedHeadBlock`r`n  </head>")
Set-Content -LiteralPath $reportHtml -Value $content -Encoding UTF8

Write-Host 'Inserted surefire.css override and Quicksand font links in surefire.html'
