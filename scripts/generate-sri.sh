#!/usr/bin/env bash
# Run this before deploying to production to get SRI hashes for CDN scripts.
# Paste the integrity="sha384-..." value into the corresponding <script> tags in all HTML files.
set -euo pipefail

sri() {
  local url="$1"
  local hash
  hash=$(curl -fsSL "$url" | openssl dgst -sha384 -binary | openssl base64 -A)
  echo "sha384-${hash}  ${url}"
}

echo "=== CDN SRI Hashes ==="
sri "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"
sri "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
sri "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
sri "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"
sri "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"
sri "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"
echo ""
echo "Add each hash as: integrity=\"<hash above>\" crossorigin=\"anonymous\""
echo "on the matching <script> tag in app.html, index.html, profile.html, pricing.html, faq.html"
