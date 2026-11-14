#!/usr/bin/env bash
# Written with AI assistance (Claude); see the README.
# Build Earthrise and copy it, with its prepared data, to a server.
#
#   deploy/deploy.sh user@host [/var/www/earthrise]
#
# Needs: pnpm, rsync, ssh access to the host, and the prepared data in app/public/data
# (see the README: pipeline/scripts/build_web_data.py). The site is fully static.
set -euo pipefail

target="${1:?usage: deploy/deploy.sh user@host [/var/www/earthrise]}"
dest="${2:-/var/www/earthrise}"
here="$(cd "$(dirname "$0")/.." && pwd)"

cd "$here/app"
pnpm install --frozen-lockfile
# The data is served from the same host under /data/, so no VITE_DATA_BASE is set.
EARTHRISE_BASE=/ pnpm build

# vite copies public/ into dist/, data included. The two full Goddard maps (61 MB) are only
# used by the developer check page, so they stay behind.
ssh "$target" "mkdir -p '$dest'"
rsync -az --delete --info=progress2 \
  --exclude 'data/validation/avgvisib_sun.bin.gz' \
  --exclude 'data/validation/avgvisib_earth.bin.gz' \
  dist/ "$target:$dest/"

echo "Deployed to $target:$dest"
echo "Serve it with:  DOMAIN=your.domain caddy run --config deploy/Caddyfile   (or any static file server)"
