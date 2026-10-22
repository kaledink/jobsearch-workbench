#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -f vendor/manifest.json ]; then
  python3 prepare_assets.py
fi
exec python3 server.py "$@"
