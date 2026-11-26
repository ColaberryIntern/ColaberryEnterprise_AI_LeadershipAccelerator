# Voice AI Studio: go or no-go for retiring Synthflow

The final shutdown checklist of [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md), one row per requirement. `npm run voice:status-check -- --go-no-go` reads it. GO needs every row PASS. APPROVAL_REQUIRED means an owner decision or an owner-run event stands before it, never that it is fine.

| Id | Requirement | Status | Evidence or what is missing |
|---|---|---|---|
| G01 | Every route, number, agent, tool, webhook, campaign, scheduler, alert, integration and fallback inventoried and migrated, retired or replaced with approval | APPROVAL_REQUIRED | INVENTORY.md and MIGRATION_MATRIX.md (14 agents); M4 decides each row |
| G02 | Number ownership and porting done; callers reach the right business; callbacks verified; nothing released without approval | APPROVAL_REQUIRED | Checklist steps 1 and 7 of MIGRATION_MATRIX.md; no number changed |
| G03 | History, transcripts and allowed recordings exported and reconciled within retention | APPROVAL_REQUIRED | voice:history built and rehearsed read-only; waits for the retention period (M4) |
| G04 | Direct engines pass the rubric and critical gates; real calls and side effects verified; voice quality accepted by the owner | BLOCKED | No live call has been made: two provider keys and a call window (M1, M3) |
| G05 | Canary complete, no critical incident, at least 14 days with zero required Synthflow traffic | NOT_STARTED | Follows G04 and M5 |
| G06 | Rollback and incident response rehearsed | IMPLEMENTED_UNVERIFIED | ROLLBACK_DRILL.md and RUNBOOK.md: rehearsed on a local stack with mock providers, not in production |
| G07 | Support staff trained | NOT_STARTED | |
| G08 | Costs and provider invoices checked; contingency independent of Synthflow defined | NOT_STARTED | COST_MODEL.md has estimates; no invoices exist yet |
| G09 | Owner approves the cutover and the contract cancellation; billing terms confirmed | APPROVAL_REQUIRED | M5; checklist step 7 |
| G10 | Legacy dispatch disabled first; archival webhook only as long as needed; legacy keys revoked after drain | NOT_STARTED | Follows M5 |
| G11 | Static scan finds no operational Synthflow reference | FAIL | npm run voice:scan-legacy exits 1 until the sunset release |
| G12 | Full regression green on the sunset release | NOT_STARTED | |
