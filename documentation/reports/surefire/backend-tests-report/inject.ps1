$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$reportHtml = Join-Path $scriptDir 'surefire.html'
$summaryMarker = 'id="backend-skip-note"'
$linkMarker = 'id="backend-skip-note-link"'
$cssMarker = 'href="surefire.css"'
$fontPreconnectMarker = 'href="https://fonts.googleapis.com"'
$fontGstaticMarker = 'href="https://fonts.gstatic.com"'
$fontQuicksandMarker = 'family=Quicksand'

if (-not (Test-Path -LiteralPath $reportHtml)) {
    Write-Error "surefire.html not found at $reportHtml"
    exit 1
}

$content = Get-Content -LiteralPath $reportHtml -Raw
if ($content.Contains($summaryMarker) -and $content.Contains($linkMarker) -and $content.Contains($cssMarker) -and $content.Contains($fontPreconnectMarker) -and $content.Contains($fontGstaticMarker) -and $content.Contains($fontQuicksandMarker)) {
    Write-Host 'Skip explanation, link, CSS override, and font links already exist. No changes made.'
    exit 0
}

$summarySnippet = @'
<section id="backend-skip-note" class="skip-explanation-card">
<h4 class="skip-explanation-title">Why BackendApplicationTests is skipped</h4>
<p class="skip-explanation-text">BackendApplicationTests is intentionally skipped because it is a minimal context-load smoke test, while container-backed integration and characterization tests already validate real runtime behavior against PostgreSQL, security filters, and API flows. Keeping this test disabled avoids redundant execution noise while preserving stronger, behavior-focused coverage.</p>
</section>
'@

$linkSnippet = @'
<p id="backend-skip-note-link" class="skip-explanation-link"><a href="#backend-skip-note">Why this test is skipped</a></p>
'@

if (-not $content.Contains($summaryMarker)) {
    $summaryAnchor = '<p>Note: failures are anticipated and checked for with assertions while errors are unanticipated.</p><br />'
    if (-not $content.Contains($summaryAnchor)) {
        Write-Error 'Could not find Summary note anchor in surefire.html'
        exit 2
    }
    $content = $content.Replace($summaryAnchor, "$summaryAnchor`r`n$summarySnippet")
}

if (-not $content.Contains($linkMarker)) {
    $testAnchor = '<h3>BackendApplicationTests</h3>'
    if (-not $content.Contains($testAnchor)) {
        Write-Error 'Could not find BackendApplicationTests section in surefire.html'
        exit 2
    }
    $content = $content.Replace($testAnchor, "$testAnchor`r`n$linkSnippet")
}

if (-not $content.Contains($cssMarker)) {
    $cssLink = '    <link rel="stylesheet" href="surefire.css" />'
    $printCssAnchor = '<link rel="stylesheet" href="./css/print.css" media="print" />'

    if ($content.Contains($printCssAnchor)) {
        $content = $content.Replace($printCssAnchor, "$printCssAnchor`r`n$cssLink")
    }
    elseif ($content.Contains('</head>')) {
        $content = $content.Replace('</head>', "$cssLink`r`n  </head>")
    }
    else {
        Write-Error 'Could not find a suitable location in <head> to inject surefire.css link'
        exit 2
    }
}

if (-not $content.Contains($fontPreconnectMarker) -or -not $content.Contains($fontGstaticMarker) -or -not $content.Contains($fontQuicksandMarker)) {
    if (-not $content.Contains('</head>')) {
        Write-Error 'Could not find </head> to inject font links'
        exit 2
    }

    $fontBlock = @'
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap" rel="stylesheet" />
'@

    $content = $content.Replace('</head>', "$fontBlock`r`n  </head>")
}

Set-Content -LiteralPath $reportHtml -Value $content -Encoding UTF8

Write-Host 'Inserted skip explanation, link, surefire.css override, and Quicksand font links in surefire.html'
