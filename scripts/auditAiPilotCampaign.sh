#!/usr/bin/env bash
# Cron wrapper for the AI ROI Pilot campaign audit. Runs the audit inside the backend
# container (where MANDRILL_API_KEY lives), syncing the suppression list to/from
# persistent host storage so a container restart never loses opt-outs/bounces.
# Cron (a few times a day during the campaign):
#   0 16,19,22 * * 1-5 /opt/colaberry-accelerator/scripts/auditAiPilotCampaign.sh >> /opt/colaberry-accelerator/tmp/ai-pilot-audit.log 2>&1
set -uo pipefail
C=accelerator-backend
D=/opt/colaberry-accelerator/tmp/ai-pilot
S=/opt/colaberry-accelerator/scripts/auditAiPilotCampaign.js
echo "===== ai-pilot-audit $(date -u +%Y-%m-%dT%H:%M:%SZ) ====="
docker exec "$C" mkdir -p /app/tmp
[ -f "$D/ai-pilot-suppression.json" ] && docker cp "$D/ai-pilot-suppression.json" "$C":/app/tmp/ai-pilot-suppression.json
docker cp "$S" "$C":/app/auditAiPilotCampaign.js
docker exec -e OUT_DIR=/app/tmp -w /app "$C" node auditAiPilotCampaign.js --send
docker cp "$C":/app/tmp/ai-pilot-suppression.json "$D/ai-pilot-suppression.json" 2>/dev/null || true
docker exec "$C" rm -f /app/auditAiPilotCampaign.js
echo "===== done ====="
