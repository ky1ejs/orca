#!/usr/bin/env bash
#
# Allocate a worktree resource slot (1–15).
# Manages .worktree-registry.json in the main repo root.
#
# Usage:
#   allocate-slot.sh <worktree-name>           # allocate or return existing slot
#   allocate-slot.sh --release <worktree-name> # free a slot

set -euo pipefail

MAIN_REPO="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY="$MAIN_REPO/.worktree-registry.json"
WORKTREE_BASE="$MAIN_REPO/../worktrees/orca"
MAX_SLOTS=15

# Ensure registry exists
if [[ ! -f "$REGISTRY" ]]; then
  echo '{"slots":[]}' > "$REGISTRY"
fi

release_slot() {
  local name="$1"
  local tmp
  tmp=$(mktemp)
  jq --arg name "$name" '.slots = [.slots[] | select(.worktree != $name)]' "$REGISTRY" > "$tmp"
  mv "$tmp" "$REGISTRY"
}

# Handle --release flag
if [[ "${1:-}" == "--release" ]]; then
  if [[ -z "${2:-}" ]]; then
    echo "Usage: allocate-slot.sh --release <worktree-name>" >&2
    exit 1
  fi
  release_slot "$2"
  exit 0
fi

if [[ -z "${1:-}" ]]; then
  echo "Usage: allocate-slot.sh <worktree-name>" >&2
  exit 1
fi

WORKTREE_NAME="$1"

# Check if already registered
existing_slot=$(jq -r --arg name "$WORKTREE_NAME" \
  '.slots[] | select(.worktree == $name) | .slot' "$REGISTRY")

if [[ -n "$existing_slot" ]]; then
  echo "$existing_slot"
  exit 0
fi

# Reclaim stale slots (directory no longer exists)
stale=$(jq -r '.slots[] | "\(.slot) \(.worktree) \(.path)"' "$REGISTRY")
if [[ -n "$stale" ]]; then
  while IFS=' ' read -r slot wt path; do
    full_path="$MAIN_REPO/$path"
    if [[ ! -d "$full_path" ]]; then
      release_slot "$wt"
    fi
  done <<< "$stale"
fi

# Find next available slot
used_slots=$(jq -r '.slots[].slot' "$REGISTRY" | sort -n)
next_slot=""
for i in $(seq 1 $MAX_SLOTS); do
  if ! echo "$used_slots" | grep -qx "$i"; then
    next_slot=$i
    break
  fi
done

if [[ -z "$next_slot" ]]; then
  echo "Error: All $MAX_SLOTS worktree slots are in use." >&2
  echo "Run './scripts/worktree status' to see active worktrees." >&2
  exit 1
fi

# Register the slot
wt_path="../worktrees/orca/$WORKTREE_NAME"
created=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
tmp=$(mktemp)
jq --argjson slot "$next_slot" \
   --arg wt "$WORKTREE_NAME" \
   --arg path "$wt_path" \
   --arg created "$created" \
   '.slots += [{"slot": $slot, "worktree": $wt, "path": $path, "created": $created}]' \
   "$REGISTRY" > "$tmp"
mv "$tmp" "$REGISTRY"

echo "$next_slot"
