#!/usr/bin/env bash
# Publish everything: source -> main, built site -> gh-pages (GitHub Pages).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${PAGES_REPO:-orlev819-dev/planforge-studio}"
cd "$ROOT"
git push "https://github.com/$REPO.git" HEAD:main
bash "$ROOT/scripts/deploy-pages.sh"
