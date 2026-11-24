# Voice AI Studio: Decisions

Dated decisions, vendor facts (with URL and read date), and Ali's milestone answers.

Source of truth: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md) (authorized test number redacted; it lives only in the prod env var `VOICE_TEST_ALLOWED_NUMBER`). Ticket ladder: [Basecamp list](https://app.basecamp.com/3945211/buckets/7463955/todolists/10542482938). Status words: NOT_STARTED, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, PASS, FAIL, BLOCKED, APPROVAL_REQUIRED, RETIRED.

- 2026-11-24: Ladder built as Basecamp list 10542482938 (47 tickets, 6 phases, M0-M6). One PR + one deploy per phase (Ali).
- 2026-11-24: Baseline commit origin/main 89e6bf3bb (same snapshot the directive cites).
- 2026-11-24: OPEN (M0 Q1): this build supersedes the 2026-11-23 plan to route agent calls via Kes's shared GHL voice agent, pending Ali's confirmation.
- 2026-11-24: Ali authorized a 5th plan-audit cycle after 4 FAILs; cycle 5 scored 18/20 PASS.
- 2026-11-24: READINESS.md: our Twilio account is Full/active with 69 voice-capable numbers; 9 have no real inbound voice route, so testing likely needs no purchase (choice is M0's).

## Vendor facts

| Vendor | Fact | URL | Read date |
|---|---|---|---|
| Twilio | ConversationRelay ttsProvider: Google, Amazon, ElevenLabs; ElevenLabs is the default | https://www.twilio.com/docs/voice/twiml/connect/conversationrelay | 2026-11-24 |
| Twilio | ConversationRelay transcriptionProvider: Deepgram (default, nova-3-general) or Google | https://www.twilio.com/docs/voice/twiml/connect/conversationrelay | 2026-11-24 |
| Twilio | ElevenLabs voice string [VoiceID]-[Model]-[Speed]_[Stability]_[Similarity]; models v4 (recommended), v4_turbo, v3, v3_conversational; speed must be 1.0 on v3/v4 | https://www.twilio.com/docs/voice/conversationrelay/voice-configuration | 2026-11-24 |
| Twilio | Stream LLM tokens to Relay as they arrive; elevenlabsTextNormalization off lowers latency; interruptible defaults to any | https://www.twilio.com/docs/voice/conversationrelay/best-practices | 2026-11-24 |
| Twilio | Media Streams audio is audio/x-mulaw 8000 Hz both ways, base64; bidirectional needs Connect Stream, one per call | https://www.twilio.com/docs/voice/media-streams/websocket-messages | 2026-11-24 |
| Twilio | Error 32204: From number is neither a Twilio number on the account nor a verified Outgoing Caller ID | https://www.twilio.com/docs/api/errors/32204 | 2026-11-24 |
| OpenAI | Realtime models gpt-realtime-2.1 and gpt-realtime-2.1-mini; session audio format audio/pcmu supported (rate field to be confirmed against the live API) | https://developers.openai.com/api/docs/guides/realtime-conversations | 2026-11-24 |
| Anthropic | Streaming LLM for Engine A: claude-haiku-5-5 (fastest), claude-sonnet-5-5 (fast) | https://platform.claude.com/docs/en/models/overview | 2026-11-24 |
