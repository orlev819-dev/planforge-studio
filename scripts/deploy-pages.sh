#!/usr/bin/env bash
# Build the web app and publish it to GitHub Pages (`gh-pages` branch of the repo; source is on `main`).
set -euo pipefail
REPO="${PAGES_REPO:-orlev819-dev/planforge-studio}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${PAGES_DIR:-/tmp/planforge-pages}"
node "$ROOT/scripts/build.mjs" >/dev/null
rm -rf "$OUT"; mkdir -p "$OUT"
( cd "$ROOT/apps/web/dist" && find . -type f ! -name '*.map' -exec cp --parents {} "$OUT" \; )
touch "$OUT/.nojekyll"
REV="$(git -C "$ROOT" rev-parse --short HEAD)"
cat > "$OUT/README.md" <<MD
# PlanForge Studio — live app

Built site for GitHub Pages: https://${REPO%%/*}.github.io/${REPO##*/}/

Source revision: \`$REV\`. Projects are stored only in each browser (IndexedDB); nothing is uploaded.
MD
cd "$OUT"
git init -q -b main
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-PlanForge}" -c user.email="${GIT_AUTHOR_EMAIL:-noreply@anthropic.com}" commit -qm "Deploy PlanForge Studio ($REV)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GNuFAyWp26jvzzzgaUTMdX"
git push -f "https://github.com/$REPO.git" main:gh-pages
echo "deployed $REV to $REPO"
