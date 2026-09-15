#!/usr/bin/env bash
# Store exactly one encrypted blob on a separate branch. No source checkout changes.
set -euo pipefail
state_file="${1:-.state/state.enc}"
[[ -s "$state_file" ]] || { echo 'No encrypted state to persist.'; exit 0; }
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
remote_ref=$(git ls-remote --heads origin refs/heads/garmin-state)
parents=()
if [[ -n "$remote_ref" ]]; then
  git fetch --no-tags origin refs/heads/garmin-state
  previous=$(git rev-parse FETCH_HEAD)
  parents=(-p "$previous")
fi
blob=$(git hash-object -w "$state_file")
tree=$(printf '100644 blob %s\tstate.enc\n' "$blob" | git mktree)
commit=$(git commit-tree "$tree" "${parents[@]}" -m 'Update encrypted Garmin state')
git push origin "$commit:refs/heads/garmin-state"
