# ─────────────────────────────────────────────────────────────────────────────
# backend/start-paysimple-test.ps1
# Launches the backend for PaySimple webhook integration testing.
#
# No external CLI tool required. Run the test script to fire a signed webhook:
#   node backend/scripts/testPaySimpleWebhook.js
#
# Steps:
#   1. Run this script from the repo root or backend/ dir:
#        pwsh ./backend/start-paysimple-test.ps1
#   2. In another terminal, seed a test enrollment (first time only):
#        docker exec accelerator-db psql "postgresql://accelerator:accelerator@localhost/accelerator_dev" -c `
#          "INSERT INTO enrollments (id,full_name,email,company,cohort_id,paysimple_external_id,payment_status,payment_method) `
#           SELECT gen_random_uuid(),'Test User','webhook-test@colaberry-test.local','TestCo', `
#                  id,'CB-TEST-1234567890','pending','credit_card' `
#           FROM cohorts WHERE status='open' ORDER BY created_at ASC LIMIT 1 `
#           ON CONFLICT DO NOTHING;"
#   3. Fire the test webhook:
#        node backend/scripts/testPaySimpleWebhook.js
#   4. Verify the DB (queries printed by the test script)
# ─────────────────────────────────────────────────────────────────────────────

# PaySimple webhook secret — must match testPaySimpleWebhook.js WEBHOOK_SECRET
$env:PAYSIMPLE_WEBHOOK_SECRET = "local-test-secret-paysimple"

# PaySimple API credentials (not needed for webhook-only test — leave blank)
$env:PAYSIMPLE_API_USER = ""
$env:PAYSIMPLE_API_KEY  = ""
$env:PAYSIMPLE_ENV      = "sandbox"
$env:PAYMENT_MODE       = "test"

# Disable background jobs that would fail without full credentials
$env:ENABLE_FOLLOWUP_SCHEDULER = "false"
$env:ENABLE_AUTO_EMAIL         = "false"
$env:ENABLE_VOICE_CALLS        = "false"
$env:ENABLE_VISITOR_TRACKING   = "false"
$env:VERBOSE                   = "true"

Write-Host "Starting backend in PaySimple-test mode..." -ForegroundColor Cyan
Write-Host "  PAYSIMPLE_WEBHOOK_SECRET: local-test-secret-paysimple" -ForegroundColor Gray
Write-Host "  Payment mode: test (sandbox)" -ForegroundColor Gray
Write-Host ""
Write-Host "Once running, fire a test webhook with:" -ForegroundColor Yellow
Write-Host "  node backend/scripts/testPaySimpleWebhook.js" -ForegroundColor Yellow
Write-Host ""

Set-Location "$PSScriptRoot"
npx ts-node-dev --respawn --transpile-only src/server.ts
