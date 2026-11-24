# Voice AI Studio: Evidence manifest

One row per verified claim: date, ticket, commit, command, exit code, artifact path (sanitized). Provider IDs are restricted and referenced by redacted ID only.

Source of truth: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md) (authorized test number redacted; it lives only in the prod env var `VOICE_TEST_ALLOWED_NUMBER`). Ticket ladder: [Basecamp list](https://app.basecamp.com/3945211/buckets/7463955/todolists/10542482938). Status words: NOT_STARTED, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, PASS, FAIL, BLOCKED, APPROVAL_REQUIRED, RETIRED.

| Date | Ticket | Commit | Command | Exit | Artifact | Result |
|---|---|---|---|---|---|---|
| 2026-11-24 | VS0.1 | 89e6bf3bb (baseline) | jest --ci, 21 voice suites (synthflow, voiceCall, voiceDial, agentCallTool, callbackRequest, communicationSafety, consentGateSmsVoice, mayaVoiceTool, mayaSmsVoice, explorerVoiceEligibility, schedulerVoiceCountdown) | 0 | local log | Baseline: 21/21 suites, 327/327 tests PASS. Any later failure in these suites is a regression, not pre-existing. |
