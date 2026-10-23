#!/usr/bin/env bash
set -euo pipefail

PROFILE_DIR="$HOME/Library/Application Support/Google/Chrome"

if [ ! -d "/Applications/Google Chrome.app" ]; then
  echo "Google Chrome was not found in /Applications."
  echo "Please install Google Chrome first."
  exit 1
fi

open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE_DIR" \
  "https://www.taobao.com"

echo "Chrome started with remote debugging port 9222."
echo "Log in to Taobao in Chrome, then return to WebUI and choose: Connect my Chrome."

