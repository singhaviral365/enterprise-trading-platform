#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_HTML="$SCRIPT_DIR/surefire.html"
CSS_MARKER='href="surefire.css"'
FONT_PRECONNECT_MARKER='href="https://fonts.googleapis.com"'
FONT_GSTATIC_MARKER='href="https://fonts.gstatic.com"'
FONT_QUICKSAND_MARKER='family=Quicksand'

if [[ ! -f "$REPORT_HTML" ]]; then
  echo "Error: surefire.html not found at $REPORT_HTML"
  exit 1
fi

if grep -q "$CSS_MARKER" "$REPORT_HTML" && grep -q "$FONT_PRECONNECT_MARKER" "$REPORT_HTML" && grep -q "$FONT_GSTATIC_MARKER" "$REPORT_HTML" && grep -q "$FONT_QUICKSAND_MARKER" "$REPORT_HTML"; then
  echo "CSS override and font links already exist. No changes made."
  exit 0
fi

if ! grep -q '</head>' "$REPORT_HTML"; then
  echo "Error: Could not find </head> to inject CSS/font links"
  exit 2
fi

TMP_FILE="$REPORT_HTML.tmp"
awk '
  {
    if ($0 ~ /<\/head>/) {
      print "    <link rel=\"stylesheet\" href=\"surefire.css\" />"
      print "    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\" />"
      print "    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin />"
      print "    <link href=\"https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap\" rel=\"stylesheet\" />"
    }
    print
  }
' "$REPORT_HTML" > "$TMP_FILE"

mv "$TMP_FILE" "$REPORT_HTML"
echo "Inserted surefire.css override and Quicksand font links in surefire.html"
