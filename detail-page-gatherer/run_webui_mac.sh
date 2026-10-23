#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
export PORT=9898

if [ ! -x ".venv/bin/python" ]; then
  echo "Missing .venv. Please run:"
  echo "python3 -m venv .venv"
  echo ".venv/bin/python -m pip install -r requirements.txt"
  exit 1
fi

.venv/bin/python app.py

