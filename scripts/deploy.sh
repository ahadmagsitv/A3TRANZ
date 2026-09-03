#!/usr/bin/env bash
#
# Runs ON THE SERVER, piped in over SSH by .github/workflows/deploy.yml.
# Safe to run by hand too: `bash scripts/deploy.sh`.
set -euo pipefail

REPO=/home/ubuntu/A3TRANZ
cd "$REPO"

# --ff-only, never `reset --hard`: the server has been edited directly before
# (that is where PORT 4001 came from). A dirty tree must stop the deploy and
# say so, not have its changes silently thrown away.
echo "==> pulling"
git pull --ff-only origin backend

# api is a workspace and resolves @a3/domain from the root tree; admin-web is
# not in the workspace list and installs on its own.
echo "==> installing"
npm ci
(cd admin-web && npm ci)

echo "==> migrating"
(cd api && npm run migrate)

# NEXT_PUBLIC_* is inlined at BUILD time. The value lives in
# admin-web/.env.production on the server (gitignored) so this script never
# needs to know the address, and CI never needs the production IP.
echo "==> building admin console"
(cd admin-web && npm run build)

# The ecosystem file is the argument, so PM2 re-reads it. `pm2 restart <name>`
# reuses PM2's cached process definition and would keep launching the old
# script path — that is how a stale entry point survived a restart before.
echo "==> restarting"
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

# The port comes from the same config PM2 just read, so the check cannot drift
# out of step with what is actually running.
PORT=$(node -e "console.log(require('$REPO/ecosystem.config.cjs').apps.find(a => a.name === 'a3tranz-api').env.PORT)")

# `pm2 online` is not evidence: the API has twice come up, logged nothing, and
# never bound. Only a 200 from /health ends this script happily.
echo "==> waiting for :$PORT/health"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
    echo "deploy ok — api healthy on :$PORT"
    exit 0
  fi
  sleep 2
done

echo "DEPLOY FAILED: api never answered /health on :$PORT" >&2
pm2 logs a3tranz-api --lines 40 --nostream >&2 || true
exit 1
