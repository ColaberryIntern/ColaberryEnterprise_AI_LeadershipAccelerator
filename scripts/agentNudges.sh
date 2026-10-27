#!/usr/bin/env bash
#
# agentNudges.sh - the weekday nudge to the agent builders.
#
# Ali, 23 Oct 2026: "I want to send out a message M-F but they need to be different each time. We
# can send them out if they aren't sending me issues and I don't detect movement or commits."
#
# The work is in the backend container because the roster comes from Postgres, whose port is not
# published to the host. This wrapper exists only to cross that boundary, exactly as
# scripts/schemaDriftCheck.sh does.
#
# DRY RUN BY DEFAULT. Nothing is mailed unless --apply is passed.
#
#   ./scripts/agentNudges.sh             # print what would go out, send nothing
#   ./scripts/agentNudges.sh --apply     # send
#
# ── INSTALLING THE SCHEDULE (NOT DONE BY THIS SCRIPT) ─────────────────────────────────────
#
# Installing a crontab entry is a production environment change, so it is Ali's call and not
# something a deploy does. When he wants it live, on the VPS host:
#
#   0 13 * * 1-5 /opt/colaberry-accelerator/scripts/agentNudges.sh --apply >> /var/log/agent-nudges.log 2>&1
#
# 13:00 UTC is 8am CDT and 7am CST. Mon-Fri is `1-5`, which is where the M-F lives: putting a
# weekday test inside the script would also block a manager running it deliberately on a Saturday.
# Note the drift across the DST boundary, same as the existing intern nudge at 22:00 UTC, which
# documents the same tradeoff rather than hiding it.
#
# ── THE OVERLAP WORTH KNOWING ABOUT ───────────────────────────────────────────────────────
#
# backend/src/scripts/dailyInternNudges.js already mails interns at YELLOW or worse at 22:00 UTC
# Mon-Fri. The seven agent builders ARE interns, so on a bad week a builder can receive both that
# one and this one. The two are separated by nine hours and say different things - that one is
# about showing up, this one is about the next story - but it is a real overlap and a decision
# rather than an oversight.
#
# ── WHY RE-RUNNING IS SAFE ────────────────────────────────────────────────────────────────
#
# Every send is claimed in email_send_ledger under `agent-nudge-<domain>-<date>`, arbitrated by a
# unique index. A second run on the same day claims nothing and mails nobody, so a hand-run to
# check on it cannot double-nudge anyone.
#
# Env overrides: BACKEND_CONTAINER (default accelerator-backend).
#
set -euo pipefail

BACKEND="${BACKEND_CONTAINER:-accelerator-backend}"
STAMP="$(date -u +%FT%TZ)"

if ! docker ps --format '{{.Names}}' | grep -qx "$BACKEND"; then
  echo "$STAMP agent-nudges: container $BACKEND is not running; sending nothing" >&2
  exit 1
fi

echo "$STAMP agent-nudges: start ($* )"
docker exec "$BACKEND" node dist/scripts/sendAgentNudges.js "$@"
echo "$STAMP agent-nudges: done"
