#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${1:-https://cheeryhub.space}"
API_BASE="${2:-https://api.cheeryhub.space/api}"
API_HEALTH="${API_BASE%/}/health"
page_file="$(mktemp)"
trap 'rm -f "$page_file"' EXIT

printf '== Frontend: GET %s/\n' "$SITE_URL"
site_status="$(curl --silent --show-error --output "$page_file" --write-out '%{http_code}' "$SITE_URL/")"
if [ "$site_status" != "200" ]; then
  echo "GET / -> $site_status (expected 200)" >&2
  exit 1
fi
if ! grep -Eiq '<!doctype html|<html' "$page_file"; then
  echo "Frontend root returned 200 but did not contain an HTML document." >&2
  exit 1
fi
echo "GET / -> 200 (HTML document)"

printf '\n== API health: GET %s\n' "$API_HEALTH"
health_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$API_HEALTH")"
if [ "$health_status" != "200" ]; then
  echo "GET $API_HEALTH -> $health_status (expected 200)" >&2
  exit 1
fi
echo "GET /api/health -> 200"

printf '\n== Repository metadata: GET %s/.git/config\n' "$SITE_URL"
git_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$SITE_URL/.git/config")"
case "$git_status" in
  403|404) echo "GET /.git/config -> $git_status" ;;
  *) echo "GET /.git/config -> $git_status (expected 403 or 404)" >&2; exit 1 ;;
esac
