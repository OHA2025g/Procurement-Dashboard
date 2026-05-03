#!/bin/sh
set -e
# EasyPanel / k8s: set REACT_APP_BACKEND_URL (or BACKEND_URL) on the frontend service
OUT="/usr/share/nginx/html/runtime-env.js"
BACKEND="${REACT_APP_BACKEND_URL:-${BACKEND_URL:-http://localhost:8001}}"
escaped=$(printf '%s' "$BACKEND" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.__RUNTIME_CONFIG__ = { REACT_APP_BACKEND_URL: "%s" };\n' "$escaped" >"$OUT"
