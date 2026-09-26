#!/usr/bin/env bash
# Post-deployment checks. Run from anywhere:
#   bash deploy/verify.sh
#   bash deploy/verify.sh http://127.0.0.1:4000     # local only
set -euo pipefail

API="${1:-https://api.cheeryhub.space}"
ORIGIN="${ORIGIN:-https://cheerysaaru.github.io}"

echo "== 1. Health check: $API/api/health"
curl -fsS "$API/api/health"
echo -e "\n"

echo "== 2. CORS preflight from the GitHub Pages origin"
curl -fsS -D - -o /dev/null -X OPTIONS "$API/api/auth/login" \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" | grep -Ei 'HTTP/|access-control'
echo

echo "== 3. Protected route must answer 401 (means auth middleware is alive)"
code=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/tasks")
echo "GET /api/tasks -> $code (expected 401)"
echo

if [ "$API" != "http://127.0.0.1:4000" ]; then
  echo "== 4. Placeholder page must be gone (404 on / means OK)"
  code=$(curl -s -o /dev/null -w '%{http_code}' "$API/")
  echo "GET / -> $code (200 with 'CyberPanel Installed' = reverse proxy NOT attached)"
fi

echo
echo "If all checks pass, open https://cheerysaaru.github.io/cheeryhub-manager/"
