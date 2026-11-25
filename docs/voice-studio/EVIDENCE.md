# Voice AI Studio: Evidence manifest

One row per verified claim: date, ticket, commit, command, exit code, artifact path (sanitized). Provider IDs are restricted and referenced by redacted ID only.

Source of truth: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md) (authorized test number redacted; it lives only in the prod env var `VOICE_TEST_ALLOWED_NUMBER`). Ticket ladder: [Basecamp list](https://app.basecamp.com/3945211/buckets/7463955/todolists/10542482938). Status words: NOT_STARTED, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, PASS, FAIL, BLOCKED, APPROVAL_REQUIRED, RETIRED.

| Date | Ticket | Commit | Command | Exit | Artifact | Result |
|---|---|---|---|---|---|---|
| 2026-11-24 | VS0.1 | 89e6bf3bb (baseline) | jest --ci, 21 voice suites (synthflow, voiceCall, voiceDial, agentCallTool, callbackRequest, communicationSafety, consentGateSmsVoice, mayaVoiceTool, mayaSmsVoice, explorerVoiceEligibility, schedulerVoiceCountdown) | 0 | local log | Baseline: 21/21 suites, 327/327 tests PASS. Any later failure in these suites is a regression, not pre-existing. |
| 2026-11-25 | VS3.8 | c5ed9c441 | loop-production-verifier | PASS | deployment log | Phase 3 live and switched off; cycle 1 failed only the rollback note, cycle 2 10/10 |
| 2026-11-25 | VS4.1 | 7eb2908b2 | npm run voice:load -- --mock; verifier | 0 | vs41-load.json (local) | PASS 11/12; 100 concurrent synthetic callers, 0 leaks |
| 2026-11-25 | VS4.2 | 8377775e1 | jest voice/security and voice integration tier; verifier attempt 2 | 0 | verifier report | PASS 11/12 |
| 2026-11-25 | VS4.3 | 218c34a47 | jest voice/ops and drills on Postgres; verifier attempt 2 | 0 | RUNBOOK.md | PASS 11/12 |
| 2026-11-25 | VS4.5 | 008d56296 | rollout integration 27/27; npm run voice:rollback:drill; verifier attempt 3 | 0 | ROLLBACK_DRILL.md | PASS 11/12 |
