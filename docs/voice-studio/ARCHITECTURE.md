# Voice AI Studio: Architecture

Target: one Voice Gateway (policy + atomic reservation) in front of a Twilio carrier adapter and two conversation engines; legacy Synthflow adapter during migration only. Diagram in the directive section 2. Detailed design lands with VS1.3-VS1.5.

Source of truth: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md) (authorized test number redacted; it lives only in the prod env var `VOICE_TEST_ALLOWED_NUMBER`). Ticket ladder: [Basecamp list](https://app.basecamp.com/3945211/buckets/7463955/todolists/10542482938). Status words: NOT_STARTED, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, PASS, FAIL, BLOCKED, APPROVAL_REQUIRED, RETIRED.

