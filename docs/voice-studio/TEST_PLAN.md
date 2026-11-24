# Voice AI Studio: Test plan

Pyramid per directive section 8: unit, contract (sanitized fixtures), integration (CI Postgres), E2E (tests/systemV2/voice-studio), load/chaos (mock providers), security, live protocol LIVE-01/02/03 (max 3 attempts, 180 s, $5, never from CI).

Source of truth: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md) (authorized test number redacted; it lives only in the prod env var `VOICE_TEST_ALLOWED_NUMBER`). Ticket ladder: [Basecamp list](https://app.basecamp.com/3945211/buckets/7463955/todolists/10542482938). Status words: NOT_STARTED, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, PASS, FAIL, BLOCKED, APPROVAL_REQUIRED, RETIRED.

