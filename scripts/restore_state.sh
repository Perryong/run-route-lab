#!/usr/bin/env bash
set -euo pipefail
mkdir -p .state
remote_ref=$(git ls-remote --heads origin refs/heads/garmin-state)
if [[ -n "$remote_ref" ]]; then
  git fetch --no-tags origin refs/heads/garmin-state
  git show FETCH_HEAD:state.enc > .state/state.enc
  chmod 600 .state/state.enc
fi
