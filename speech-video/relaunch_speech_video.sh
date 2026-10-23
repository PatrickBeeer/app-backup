#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${APP_ROOT}/../../.." && pwd)"
PORT="${SPEECH_VIDEO_PORT:-9905}"
ASSET_PORT="${SPEECH_VIDEO_ASSET_PORT:-9904}"
mkdir -p "${APP_ROOT}/.run" "${APP_ROOT}/logs"

if [[ ! -x "${APP_ROOT}/node_modules/.bin/tsx" ]]; then
  (cd "${APP_ROOT}" && npm install)
fi
stop_matching() {
  local pid
  while IFS= read -r pid; do
    [[ -z "${pid}" ]] && continue
    kill "${pid}" 2>/dev/null || true
  done < <(pgrep -f "${APP_ROOT}/node_modules/.bin/tsx server/$1.ts" || true)
}
stop_matching server
stop_matching tunnel
rm -f "${APP_ROOT}/.run/public-asset-base-url"
(cd "${APP_ROOT}" && PORT="${PORT}" LOCAL_ASSET_PORT="${ASSET_PORT}" setsid nohup "${APP_ROOT}/node_modules/.bin/tsx" server/server.ts > "${APP_ROOT}/logs/bff.log" 2>&1 < /dev/null &)
if command -v cloudflared >/dev/null 2>&1 && [[ "${START_ASSET_TUNNEL:-1}" == "1" ]]; then
  (cd "${APP_ROOT}" && LOCAL_ASSET_PORT="${ASSET_PORT}" setsid nohup "${APP_ROOT}/node_modules/.bin/tsx" server/tunnel.ts > "${APP_ROOT}/logs/tunnel.log" 2>&1 < /dev/null &)
fi
STANDALONE_APP_IDS=speech-video \
APP_MANAGER_SPEECH_VIDEO_BASE_URL="http://127.0.0.1:${PORT}" \
BUILD_STANDALONE_APPS=1 \
BUILD_BACKEND=1 \
SKIP_UP_APPS=0 \
INSTALL_DEPS=0 \
BACKGROUND=1 \
bash "${REPO_ROOT}/moduls/app-manager/scripts/deploy_local.sh"
