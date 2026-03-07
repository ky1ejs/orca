#!/usr/bin/env bash
#
# Generate slot-specific .env files for a worktree.
#
# Usage:
#   generate-worktree-env.sh <slot> <worktree-path>
#
# Generates:
#   <worktree-path>/backend/.env  — PORT + DATABASE_URL overrides
#   <worktree-path>/web/.env      — VITE_BACKEND_PORT

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: generate-worktree-env.sh <slot> <worktree-path>" >&2
  exit 1
fi

SLOT="$1"
WORKTREE_PATH="$2"
MAIN_REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Calculate slot-specific values
PORT=$((4000 + SLOT * 10))
DB_NAME="orca_wt_${SLOT}"
DATABASE_URL="postgresql://orca:orca@localhost:5432/${DB_NAME}"

# --- Backend .env ---
BACKEND_ENV="$WORKTREE_PATH/backend/.env"
if [[ -f "$MAIN_REPO/backend/.env" ]]; then
  cp "$MAIN_REPO/backend/.env" "$BACKEND_ENV"
else
  touch "$BACKEND_ENV"
fi

# Override PORT
if grep -q '^PORT=' "$BACKEND_ENV" 2>/dev/null; then
  sed -i '' "s|^PORT=.*|PORT=${PORT}|" "$BACKEND_ENV"
else
  echo "PORT=${PORT}" >> "$BACKEND_ENV"
fi

# Override DATABASE_URL
if grep -q '^DATABASE_URL=' "$BACKEND_ENV" 2>/dev/null; then
  sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" "$BACKEND_ENV"
else
  echo "DATABASE_URL=${DATABASE_URL}" >> "$BACKEND_ENV"
fi

echo "Generated $BACKEND_ENV"
echo "  PORT=$PORT"
echo "  DATABASE_URL=$DATABASE_URL"

# --- Web .env ---
WEB_ENV="$WORKTREE_PATH/web/.env"
echo "VITE_BACKEND_PORT=${PORT}" > "$WEB_ENV"

echo "Generated $WEB_ENV"
echo "  VITE_BACKEND_PORT=$PORT"
