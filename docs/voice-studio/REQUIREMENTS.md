# Voice AI Studio: Requirements

Mandatory functional requirements V01-V12 (directive section 2). Owner for all: Claude Code (build), Ali (approval).

Source of truth: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md) (authorized test number redacted; it lives only in the prod env var `VOICE_TEST_ALLOWED_NUMBER`). Ticket ladder: [Basecamp list](https://app.basecamp.com/3945211/buckets/7463955/todolists/10542482938). Status words: NOT_STARTED, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, PASS, FAIL, BLOCKED, APPROVAL_REQUIRED, RETIRED.

| ID | Requirement | Story (ticket) | Test ID | Evidence | Status |
|---|---|---|---|---|---|
| V01 | Inbound and outbound calls, per-brand caller IDs, number inventory, routing, time-based fallback | VS2.1, VS3.4, VS3.6 | T-V01 | none yet | NOT_STARTED |
| V02 | Two real engines behind one interface: Conversation Relay + ElevenLabs + streaming LLM; Media Streams + OpenAI Realtime | VS2.3, VS2.4 | T-V02 | none yet | NOT_STARTED |
| V03 | Natural licensed voice, language, pronunciation lexicon, pacing, interruptions; preview and comparison | VS2.3, VS3.4 | T-V03 | none yet | NOT_STARTED |
| V04 | Versioned prompts and agent profiles: KB refs, context, first message, end rules, tools, escalation, limits | VS3.1 | T-V04 | none yet | NOT_STARTED |
| V05 | Caller verification; consent, suppression, dedup, scheduling, caps, opt-out, kill switch, AI disclosure, recording consent | VS1.5, VS3.6, VS4.2 | T-V05 | none yet | NOT_STARTED |
| V06 | Tool calling, retrieval, agent workflow handoff, idempotent writes, human approval for sensitive actions | VS3.1, VS3.2 | T-V06 | none yet | NOT_STARTED |
| V07 | Transcripts, status, errors, structured outcome, summaries, follow-ups, timeline, cost and latency; downstream preserved | VS3.2, VS3.5 | T-V07 | none yet | NOT_STARTED |
| V08 | Admin test lab, scenario runner, voice A/B, rubric, evidence-based promotion and rollback | VS2.5, VS3.4, VS4.4 | T-V08 | none yet | NOT_STARTED |
| V09 | Monitoring, rate limits, circuit breakers, alerts, queue visibility, replay/reconciliation; never drop or blind-redial | VS4.3, VS4.5 | T-V09 | none yet | NOT_STARTED |
| V10 | Safe legacy migration, per-route flags, staged rollout, number plan, history import, Synthflow sunset | VS1.6, VS5.1-VS5.4 | T-V10 | none yet | NOT_STARTED |
| V11 | Tenant/brand isolation, RBAC, secrets, retention, accessibility, responsive | VS1.4, VS3.7, VS4.2 | T-V11 | none yet | NOT_STARTED |
| V12 | Docs, automated tests, deploy scripts, audit evidence, cost model, reusable commercial package | VS1.2, VS6.1-VS6.3 | T-V12 | none yet | NOT_STARTED |
