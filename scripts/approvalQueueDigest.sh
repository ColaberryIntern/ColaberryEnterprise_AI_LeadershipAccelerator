#!/usr/bin/env bash
#
# approvalQueueDigest.sh - the daily "approvals you owe" digest.
#
# A builder who files a change request and hears nothing has no way to tell a decision from
# silence. This mails each person who can actually decide the list of requests waiting on them.
#
# The work is in the backend container because the queue comes from Postgres, whose port is not
# published to the host. This wrapper exists only to cross that boundary, exactly as
# scripts/agentNudges.sh and scripts/schemaDriftCheck.sh do.
#
# DRY RUN BY DEFAULT. Nothing is mailed unless --apply is passed AND the env gate is open.
#
#   ./scripts/approvalQueueDigest.sh             # print what would go out, send nothing
#   ./scripts/approvalQueueDigest.sh --apply     # send, if AGENT_APPROVAL_DIGEST_SEND=on
#
# ── WHY A SCRIPT AND NOT A JOB IN aiOpsScheduler ──────────────────────────────────────────
#
# The build plan asked for a SCHEDULE_REGISTRY entry. This repository has recorded the opposite
# decision twice, in two independent files, with the reason:
#
#   backend/src/scripts/sendAgentNudges.ts:16   "aiOpsScheduler.ts is 797 lines, well past the
#     500-line ceiling in CLAUDE.md, which means the next change to it has to split it first.
#     Splitting a live scheduler that owns dozens of jobs is a large refactor and its own
#     decision, not something to do in passing while adding a nudge."
#
#   backend/src/scripts/sendApprovalQueueDigest.ts:9   the same conclusion, plus the second cost:
#     a new module under services/scheduling/ "means adding an importer to
#     EXPECTED_CRON_IMPORT_FILES in the pinned cronRegistryBaseline fixture and seeding a registry
#     row. That is a deliberate change to a governance fixture and belongs in its own diff."
#
# aiOpsScheduler.ts is 863 lines today, so the ceiling argument is stronger than when it was
# written, not weaker. Following the recorded convention instead.
#
# ── AND THE KILL SWITCH IS BETTER THIS WAY, WHICH IS NOT A CONSOLATION ────────────────────
#
# The plan wanted the digest disableable through the Governance Center route, which writes
# `enabled: false` on a CronScheduleConfig row. That route 404s when no row exists, so the entry
# would have had to seed its own row at scheduler start just to be switchable.
#
# This path needs none of that. TWO independent gates must both be open to send: `--apply` on the
# command line and AGENT_APPROVAL_DIGEST_SEND=on in the environment. Removing the environment
# variable disables it with no deploy, no database row and no route, and commenting out the
# crontab line disables it without touching the application at all. One flag would be enough to
# make it work; two is what makes a run on the wrong box harmless, and this estate runs THREE
# scheduler instances.
#
# ── INSTALLING THE SCHEDULE (NOT DONE BY THIS SCRIPT) ─────────────────────────────────────
#
# A crontab entry is a production environment change, so it is Ali's call and not something a
# deploy does. When he wants it live, on the VPS host:
#
#   30 13 * * 1-5 AGENT_APPROVAL_DIGEST_SEND=on /opt/colaberry-accelerator/scripts/approvalQueueDigest.sh --apply >> /var/log/approval-digest.log 2>&1
#
# 13:30 UTC is 8:30am CDT and 7:30am CST, half an hour after the agent nudge at 13:00 so the two
# do not arrive together. Mon-Fri is `1-5`, and it lives in the crontab rather than inside the
# script so a manager can still run it deliberately on a Saturday. The schedule matches
# APPROVAL_DIGEST_SCHEDULE in approvalQueueDigestSender.ts, and a test asserts the two agree so
# this comment cannot drift from the constant.
#
# ── WHY RE-RUNNING IS SAFE ────────────────────────────────────────────────────────────────
#
# Every send claims a slot through claimBriefingSlot under `agent_domain_approval_digest` for that
# mailbox and date. A second run on the same day claims nothing and mails nobody, so a hand-run to
# check on it cannot double-send. A DRY RUN deliberately claims no slot, so looking at the output
# does not swallow the real send later the same day.
#
# Env overrides: BACKEND_CONTAINER (default accelerator-backend).
#
set -euo pipefail

BACKEND="${BACKEND_CONTAINER:-accelerator-backend}"
STAMP="$(date -u +%FT%TZ)"

if ! docker ps --format '{{.Names}}' | grep -qx "$BACKEND"; then
  echo "$STAMP approval-digest: container $BACKEND is not running; sending nothing" >&2
  exit 1
fi

echo "$STAMP approval-digest: start ($* )"
# `-e AGENT_APPROVAL_DIGEST_SEND` IS LOAD-BEARING, and leaving it off was a real defect.
#
# `docker exec` does NOT forward the host environment. The first version of this wrapper copied
# `scripts/agentNudges.sh`, which gets away without it because `sendAgentNudges` has only the
# `--apply` gate. This script's send is ALSO gated on an environment variable read INSIDE the
# container, so the documented crontab line set the variable in the host cron shell and the node
# process never saw it. Installed exactly as documented it would have returned
# `status: 'skipped', reason: 'AGENT_APPROVAL_DIGEST_SEND_off'`, sent nothing, forever, and exited
# 0 -- so the disable direction was vacuously true and the ARM direction was unreachable.
#
# The pattern was already in the repo: `scripts/auditAiPilotCampaign.sh:15` forwards with `-e`.
# A test asserts this line carries the flag, with a positive control that fails without it.
docker exec -e AGENT_APPROVAL_DIGEST_SEND="${AGENT_APPROVAL_DIGEST_SEND:-}" \
  "$BACKEND" node dist/scripts/sendApprovalQueueDigest.js "$@"
echo "$STAMP approval-digest: done"
