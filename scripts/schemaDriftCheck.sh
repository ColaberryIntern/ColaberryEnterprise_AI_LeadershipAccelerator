#!/usr/bin/env bash
#
# schemaDriftCheck.sh — nightly alarm: has the dev rehearsal DB drifted from prod?
#
# The app runs no global sequelize.sync, so the dev DB silently falls behind prod
# (a table/column exists on dev only if it has an ensure hook or was synced). That
# is how features "work on dev" then fail on prod, and vice-versa. This is the
# standing guard the manual sync tool couldn't be: it runs the drift detection on
# a schedule and only speaks up when there IS drift.
#
# Detection: reuses syncDevSchemaFromProd.sh in DRY-RUN (read-only — never mutates
# any DB). If it reports missing tables/enums/columns on dev, this emails an alert
# to the DRI via the backend's Mandrill (emailService.sendAlertEmail). QUIET when
# clean — no notification fatigue.
#
# Runs on the VPS host from cron; talks to Postgres + the backend via docker exec,
# so it needs no host DB access. Install (daily 06:00 UTC):
#   0 6 * * * /opt/colaberry-accelerator/scripts/schemaDriftCheck.sh >> /var/log/schema-drift.log 2>&1
#
# Env overrides: SCHEMA_DRIFT_ALERT_TO (default ali@colaberry.com),
# BACKEND_CONTAINER (default accelerator-backend). Passes through the sync tool's
# PG_CONTAINER/PROD_DB/DEV_DB/EXCLUDE_REGEX.
#
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ALERT_TO="${SCHEMA_DRIFT_ALERT_TO:-ali@colaberry.com}"
BACKEND="${BACKEND_CONTAINER:-accelerator-backend}"
STAMP="$(date -u +%FT%TZ)"

# 1) Detect (dry-run, read-only).
REPORT="$(bash "$DIR/syncDevSchemaFromProd.sh" 2>&1 | grep -viE 'collation version' || true)"

# 2) Clean → stay quiet.
if printf '%s' "$REPORT" | grep -q "already schema-faithful"; then
  echo "$STAMP schema-drift: none"
  exit 0
fi

# 3) Drift → log it and alert the DRI via the backend's Mandrill.
echo "$STAMP schema-drift: DETECTED"
echo "$REPORT"

docker exec \
  -e "SCHEMA_DRIFT_ALERT_TO=$ALERT_TO" \
  -e "DRIFT_REPORT=$REPORT" \
  "$BACKEND" node -e '
  (async () => {
    try {
      const { sendAlertEmail } = require("/app/dist/services/emailService");
      await sendAlertEmail(process.env.SCHEMA_DRIFT_ALERT_TO, {
        type: "warning",
        severity: 4,
        source_type: "infra",
        urgency: "normal",
        title: "Schema drift: dev DB has fallen behind prod",
        description:
          "The dev rehearsal database (accelerator_dev1) no longer matches prod. " +
          "Re-sync it: scripts/syncDevSchemaFromProd.sh --apply\n\n" +
          (process.env.DRIFT_REPORT || ""),
      });
      console.log("schema-drift alert sent to", process.env.SCHEMA_DRIFT_ALERT_TO);
    } catch (e) {
      console.error("schema-drift alert FAILED:", (e && e.message) ? e.message : e);
      process.exit(1);
    }
    process.exit(0);
  })();
' 2>&1 | grep -viE 'collation version' || true

exit 0
