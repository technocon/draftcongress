#!/usr/bin/env bash
# Run ON the Hostinger server over SSH (hPanel's Node.js hosting has no
# Docker/CI pipeline — this is a manual/SSH-triggered deploy for Phase 1,
# not CI/CD, per the architecture plan §8). Not meant to run locally.
#
# Usage (on the server, inside the app's directory):
#   ./scripts/deploy.sh
set -euo pipefail

echo "==> Pulling latest..."
git pull --ff-only

echo "==> Installing production dependencies..."
npm ci --omit=dev

echo "==> Applying database migrations (app_migrator / DIRECT_DATABASE_URL)..."
npx prisma migrate deploy

echo "==> Building (standalone output)..."
npm run build

# Next.js's standalone output does NOT include public/ or .next/static —
# that's documented, expected behavior (the standalone server.js only
# gets what its own require/import graph traces), not something `next
# build` forgot. Both must be copied alongside server.js by hand. This
# matters for more than static-file niceties now: public/flags/*.svg (the
# league home-state flags) AND public/district-boundaries/*.json (real
# congressional district shapes, read server-side by
# src/app/congress/states/[code]/page.tsx) both live under public/ and
# silently 404/degrade to the plain-grid fallback without this step.
echo "==> Copying public/ and .next/static into the standalone output..."
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next/static
cp -r .next/static/. .next/standalone/.next/static/

echo "==> Build complete."
echo
echo "!! This script does NOT restart the app for you — Hostinger's restart"
echo "!! mechanism varies by plan (a touched restart file vs. an hPanel"
echo "!! action/API call). Confirm the exact mechanism in hPanel once the"
echo "!! app exists there, then either:"
echo "!!   - add the command/file-touch here, or"
echo "!!   - restart manually from hPanel's Node.js app screen."
echo
echo "!! RLS policies (prisma/rls/*.sql) are NOT part of Prisma's migration"
echo "!! history — run them by hand (via Neon's SQL editor or psql) after"
echo "!! any schema change that touches tenant-scoped tables. See README.md."
