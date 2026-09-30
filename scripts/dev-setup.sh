#!/usr/bin/env bash
# dev-setup.sh — one-command local dev environment bootstrap
#
# Usage:
#   bash scripts/dev-setup.sh                          # admin + student tokens only
#   bash scripts/dev-setup.sh --github <pat>           # also inject GitHub PAT for warm student
#   bash scripts/dev-setup.sh --github <pat> owner/repo # also pre-connect a repo
#
# What it does:
#   1. Starts Postgres (docker-compose.yml) if not already running
#   2. Seeds local admin user (idempotent)
#   3. Seeds cold + warm test students (idempotent) → prints portal URLs
#   4. Optionally injects a GitHub PAT for the warm student (bypasses OAuth)
#
# What it does NOT do:
#   - Start the backend  (run: cd backend && npm run dev  → localhost:3002)
#   - Start the frontend (run: cd frontend && npm start   → localhost:3003)
#   - Touch production or send any emails

set -e

ADMIN_EMAIL="kes@colaberry.com"
ADMIN_PASS="admin123"
GITHUB_PAT=""
GITHUB_REPO=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --github)
      GITHUB_PAT="$2"; shift 2 ;;
    *)
      if [[ -n "$GITHUB_PAT" && -z "$GITHUB_REPO" ]]; then
        GITHUB_REPO="$1"; shift
      else
        shift
      fi ;;
  esac
done

# ── 1. Postgres ──────────────────────────────────────────────────────
echo ""
echo "==> [1/4] Ensuring Postgres is running..."
if ! docker ps --format '{{.Names}}' | grep -q "^accelerator-db$"; then
  docker compose up -d postgres
  echo "    Postgres starting..."
  until docker exec accelerator-db pg_isready -U accelerator -q 2>/dev/null; do
    sleep 1
  done
  echo "    Postgres ready."
else
  echo "    Postgres already running."
fi

# ── 2. Admin user ────────────────────────────────────────────────────
echo ""
echo "==> [2/4] Seeding admin user ($ADMIN_EMAIL)..."
cd backend
npm run seed:admin -- "$ADMIN_EMAIL" "$ADMIN_PASS" 2>&1
cd ..

# ── 3. Test students ─────────────────────────────────────────────────
echo ""
echo "==> [3/4] Seeding test students (cold + warm)..."
cd backend
npm run seed:students 2>&1
cd ..

# ── 4. GitHub PAT (optional) ─────────────────────────────────────────
if [[ -n "$GITHUB_PAT" ]]; then
  echo ""
  echo "==> [4/4] Injecting GitHub PAT for warm test student..."
  cd backend
  if [[ -n "$GITHUB_REPO" ]]; then
    npm run seed:github -- "$GITHUB_PAT" "$GITHUB_REPO" 2>&1
  else
    npm run seed:github -- "$GITHUB_PAT" 2>&1
  fi
  cd ..
else
  echo ""
  echo "==> [4/4] GitHub PAT skipped (pass --github <pat> to inject one)"
  echo "    Or run manually: cd backend && npm run seed:github -- <pat> [owner/repo]"
fi

# ── Summary ──────────────────────────────────────────────────────────
echo ""
echo "==> Done. To start the app:"
echo ""
echo "    Terminal 1:  cd backend && npm run dev     # API on localhost:3002"
echo "    Terminal 2:  cd frontend && npm start      # UI  on localhost:3003"
echo ""
echo "    Admin:       http://localhost:3003/admin/login"
echo "    Email:       $ADMIN_EMAIL"
echo "    Password:    $ADMIN_PASS"
echo ""
echo "    Student portal URLs were printed above (step 3)."
echo "    GitHub OAuth full flow: fill in GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET in .env"
echo "    GitHub webhooks (optional): ngrok http 3002 → set GITHUB_WEBHOOK_URL in .env"
echo ""
