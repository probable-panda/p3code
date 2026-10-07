#!/usr/bin/env bash
set -euo pipefail

# Prepare in the runner's checkout; publish only after the workflow's checks pass.
case "${1:-}" in
  prepare)
    git fetch origin main p3
    git fetch "${P3_UPSTREAM_URL:-https://github.com/pingdotgg/t3code.git}" main
    upstream_sha=$(git rev-parse FETCH_HEAD)
    git merge-base --is-ancestor origin/main "$upstream_sha" || {
      echo "Fork main has diverged from upstream. Refusing to overwrite it." >&2
      exit 1
    }
    echo "upstream_sha=$upstream_sha" >> "$GITHUB_OUTPUT"
    if git merge-base --is-ancestor "$upstream_sha" HEAD && [[ $(git rev-parse origin/main) == "$upstream_sha" ]]; then
      echo 'changed=false' >> "$GITHUB_OUTPUT"
    else
      git -c user.name='P3 sync' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
        merge --no-edit "$upstream_sha"
      echo 'changed=true' >> "$GITHUB_OUTPUT"
    fi
    ;;
  publish)
    : "${P3_UPSTREAM_SHA:?Missing the upstream commit validated by this run}"
    git merge-base --is-ancestor "$P3_UPSTREAM_SHA" HEAD
    # Both updates must fast-forward. A concurrent push rejects the whole transaction.
    git push --atomic origin "$P3_UPSTREAM_SHA:refs/heads/main" HEAD:refs/heads/p3
    ;;
  *)
    echo 'Usage: p3-sync-upstream.sh prepare|publish' >&2
    exit 2
    ;;
esac
