#!/bin/sh
# Written with AI assistance (Claude); see the README.
# Turns on GitHub Pages for the app and its four data repositories, then checks that every part answers.
# The repositories must be public first (Pages on a private repository needs a paid plan):
#   for r in earthrise earthrise-data earthrise-data-20m earthrise-data-5m-a earthrise-data-5m-b; do
#     gh repo edit Abulkosim/$r --visibility public --accept-visibility-change-consequences; done
# Safe to run again.
set -u
OWNER="${OWNER:-Abulkosim}"
SITE="https://$(echo "$OWNER" | tr '[:upper:]' '[:lower:]').github.io"

for r in earthrise-data earthrise-data-20m earthrise-data-5m-a earthrise-data-5m-b; do
  gh api "repos/$OWNER/$r/pages" >/dev/null 2>&1 \
    || gh api -X POST "repos/$OWNER/$r/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null \
    || echo "could not turn Pages on for $r (is it public?)"
done
gh api "repos/$OWNER/earthrise/pages" >/dev/null 2>&1 \
  || gh api -X POST "repos/$OWNER/earthrise/pages" -f build_type=workflow >/dev/null \
  || echo "could not turn Pages on for earthrise (is it public?)"
gh workflow enable pages.yml -R "$OWNER/earthrise" 2>/dev/null
gh workflow run pages.yml -R "$OWNER/earthrise" --ref main

echo "waiting for the sites (the data can take ten minutes the first time)"
ok=0
for try in $(seq 1 60); do
  ok=1
  for u in "$SITE/earthrise/" "$SITE/earthrise-data/manifest.json" "$SITE/earthrise-data/dem/far.bin.gz" \
           "$SITE/earthrise-data-20m/dem/t20/29_29.bin.gz" "$SITE/earthrise-data-5m-a/dem/t5/38_39.bin.gz" \
           "$SITE/earthrise-data-5m-b/dem/t5/39_39.bin.gz"; do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$u")" = "200" ] || ok=0
  done
  [ "$ok" = 1 ] && break
  sleep 15
done
if [ "$ok" = 1 ]; then echo "live: $SITE/earthrise/"; else echo "not all parts answer yet; run this again in a few minutes"; exit 1; fi
