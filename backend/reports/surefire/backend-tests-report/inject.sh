#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_HTML="$SCRIPT_DIR/surefire.html"
SUMMARY_MARKER='id="backend-skip-note"'
LINK_MARKER='id="backend-skip-note-link"'
CSS_MARKER='href="surefire.css"'
FONT_PRECONNECT_MARKER='href="https://fonts.googleapis.com"'
FONT_GSTATIC_MARKER='href="https://fonts.gstatic.com"'
FONT_QUICKSAND_MARKER='family=Quicksand'

if [[ ! -f "$REPORT_HTML" ]]; then
  echo "Error: surefire.html not found at $REPORT_HTML"
  exit 1
fi

HAS_SUMMARY=0
HAS_LINK=0
HAS_CSS=0
HAS_FONT_PRECONNECT=0
HAS_FONT_GSTATIC=0
HAS_FONT_QUICKSAND=0
if grep -q "$SUMMARY_MARKER" "$REPORT_HTML"; then
  HAS_SUMMARY=1
fi
if grep -q "$LINK_MARKER" "$REPORT_HTML"; then
  HAS_LINK=1
fi
if grep -q "$CSS_MARKER" "$REPORT_HTML"; then
  HAS_CSS=1
fi
if grep -q "$FONT_PRECONNECT_MARKER" "$REPORT_HTML"; then
  HAS_FONT_PRECONNECT=1
fi
if grep -q "$FONT_GSTATIC_MARKER" "$REPORT_HTML"; then
  HAS_FONT_GSTATIC=1
fi
if grep -q "$FONT_QUICKSAND_MARKER" "$REPORT_HTML"; then
  HAS_FONT_QUICKSAND=1
fi

if [[ "$HAS_SUMMARY" -eq 1 && "$HAS_LINK" -eq 1 && "$HAS_CSS" -eq 1 && "$HAS_FONT_PRECONNECT" -eq 1 && "$HAS_FONT_GSTATIC" -eq 1 && "$HAS_FONT_QUICKSAND" -eq 1 ]]; then
  echo "Skip explanation, link, CSS override, and font links already exist. No changes made."
  exit 0
fi

SUMMARY_SNIPPET=$(cat <<'EOF'
<section id="backend-skip-note" class="skip-explanation-card">
<h4 class="skip-explanation-title">Why BackendApplicationTests is skipped</h4>
<p class="skip-explanation-text">BackendApplicationTests is intentionally skipped because it is a minimal context-load smoke test, while container-backed integration and characterization tests already validate real runtime behavior against PostgreSQL, security filters, and API flows. Keeping this test disabled avoids redundant execution noise while preserving stronger, behavior-focused coverage.</p>
</section>
EOF
)

LINK_SNIPPET=$(cat <<'EOF'
<p id="backend-skip-note-link" class="skip-explanation-link"><a href="#backend-skip-note">Why this test is skipped</a></p>
EOF
)

CSS_LINK='    <link rel="stylesheet" href="surefire.css" />'
FONT_PRECONNECT_LINK='    <link rel="preconnect" href="https://fonts.googleapis.com" />'
FONT_GSTATIC_LINK='    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />'
FONT_QUICKSAND_LINK='    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap" rel="stylesheet" />'

TMP_FILE="$REPORT_HTML.tmp"

awk -v summarySnippet="$SUMMARY_SNIPPET" -v linkSnippet="$LINK_SNIPPET" -v cssLink="$CSS_LINK" -v fontPreconnectLink="$FONT_PRECONNECT_LINK" -v fontGstaticLink="$FONT_GSTATIC_LINK" -v fontQuicksandLink="$FONT_QUICKSAND_LINK" -v hasSummary="$HAS_SUMMARY" -v hasLink="$HAS_LINK" -v hasCss="$HAS_CSS" -v hasFontPreconnect="$HAS_FONT_PRECONNECT" -v hasFontGstatic="$HAS_FONT_GSTATIC" -v hasFontQuicksand="$HAS_FONT_QUICKSAND" '
  {
    if ($0 ~ /<\/head>/) {
      if (hasCss == 0 && !injectedCss) {
        print cssLink
        injectedCss = 1
      }
      if (hasFontPreconnect == 0 && !injectedFontPreconnect) {
        print fontPreconnectLink
        injectedFontPreconnect = 1
      }
      if (hasFontGstatic == 0 && !injectedFontGstatic) {
        print fontGstaticLink
        injectedFontGstatic = 1
      }
      if (hasFontQuicksand == 0 && !injectedFontQuicksand) {
        print fontQuicksandLink
        injectedFontQuicksand = 1
      }
    }
    print
    if (hasCss == 0 && !injectedCss && $0 ~ /print\.css/) {
      print cssLink
      injectedCss = 1
    }
    if (hasSummary == 0 && $0 ~ /<p>Note: failures are anticipated and checked for with assertions while errors are unanticipated.<\/p><br \/>/) {
      print summarySnippet
      injectedSummary = 1
    }
    if (hasLink == 0 && $0 ~ /<h3>BackendApplicationTests<\/h3>/) {
      print linkSnippet
      injectedLink = 1
    }
  }
  END {
    if (hasSummary == 0 && !injectedSummary) {
      exit 2
    }
    if (hasLink == 0 && !injectedLink) {
      exit 2
    }
    if (hasCss == 0 && !injectedCss) {
      exit 2
    }
    if (hasFontPreconnect == 0 && !injectedFontPreconnect) {
      exit 2
    }
    if (hasFontGstatic == 0 && !injectedFontGstatic) {
      exit 2
    }
    if (hasFontQuicksand == 0 && !injectedFontQuicksand) {
      exit 2
    }
  }
' "$REPORT_HTML" > "$TMP_FILE" || {
  status=$?
  rm -f "$TMP_FILE"
  if [[ $status -eq 2 ]]; then
    echo "Error: Could not insert Summary note, BackendApplicationTests link, surefire.css override, or font links in surefire.html"
  fi
  exit $status
}

mv "$TMP_FILE" "$REPORT_HTML"
echo "Inserted skip explanation, link, surefire.css override, and Quicksand font links in surefire.html"
