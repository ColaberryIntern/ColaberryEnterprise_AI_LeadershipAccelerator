/**
 * Voice AI Studio ticket artifact data, one entry per ticket code. Read by vsRender.js.
 * Never put the test phone number, a full CallSid, a transcript or a secret here: vsRender.assertSafe()
 * refuses to render them, and the repo is public.
 */
const SESSION = 'CC-20261124-2ptc';

module.exports = {
  'VS1.3': {
    code: 'VS1.3', short: 'One call record from any source, and no unsafe redial',
    title: 'R01 Canonical contracts: VoiceEngine, CallState, VoiceRequest, VoiceProvider, CarrierAdapter, ConversationEngine + call-state reducer',
    docName: 'CONTRACTS_AND_REDUCER', date: '2026-11-24', session: SESSION, status: 'PASS 11/12 (verifier attempt 3); closes at the Phase 1 deploy',
    asked: 'Define the versioned contracts every voice provider speaks, and a pure reducer that turns events from any source, in any order, into one call record that never allows a redial after an uncertain dispatch.',
    delivered: 'Zod v1 contracts for every type the directive names (with a stable ContractViolation error), the provider interfaces, and a reducer that derives the record from the de-duplicated event set so arrival order cannot change the outcome. 73 tests plus two independent adversarial harnesses (40 scenarios) all pass.',
    takeaway: 'The rule that matters most in production is enforced in code and proven by attack: once there is ANY sign a call reached the phone network, from the carrier, a live session, the legacy Synthflow webhook or a reconciler, that call can never be redialed automatically. The independent verifier found two real holes on the way; both are closed.',
    cards: [
      { n: '720', k: 'arrival orders, one result', color: '#2e7d32' },
      { n: '40', k: 'adversarial scenarios pass' },
      { n: '0', k: 'redial holes left', color: '#2e7d32' },
      { n: '3', k: 'verifier attempts to pass' },
      { n: '14', k: 'call states, 6 terminal' },
    ],
    decision: 'Nothing to decide. This is the safety core the gateway (VS1.5) and both engines build on.',
    ladder: ['active', 'waiting', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Verifier score by attempt (out of 12; 11 passes)', max: 12, rows: [
      { label: 'Attempt 1 (redial hole)', value: 8, color: '#c62828' }, { label: 'Attempt 2 (legacy evidence)', value: 10, color: '#e0a100' }, { label: 'Attempt 3 (pass)', value: 11, color: '#2e7d32' },
    ] },
    checks: [
      ['Every directive type defined and runtime-validated (ContractViolation on bad input)', true],
      ['Streaming and batch agree in every permutation (720-order lifecycle + adversarial sets)', true],
      ['dispatch_unknown and any evidence of a call are never auto-redialed', true],
      ['No any without justification; baseline 21 suites pass; tsc clean', true],
    ],
    diagramTitle: 'Events from any source become one record',
    mermaid: `flowchart LR
  G[Gateway events] --> S[De-duplicated event set]
  C[Carrier status callbacks] --> S
  X[Live session events] --> S
  L[Legacy Synthflow webhook] --> S
  R[Reconciler] --> S
  S --> D[derive: state, facts, conflicts]
  D --> M{mayRedial}
  M -->|any sign the call existed| N[NO, forever]
  M -->|policy block, nothing sent| Y[yes]`,
    evidenceLine: 'commits f2ed312b9, e706f2d84, 0156c1d84, 4ffcb1252; jest contracts 73/73, now 77/77 with the follow-ups; verifier attempts 8, 10, 11 of 12.',
    sections: [
      { h: 'What the verifier broke, and how it was fixed', rows: [
        ['Attempt 1', 'Streaming and batch disagreed; an earlier-arriving gateway block made an ambiguous dispatch redialable', 'Record derived from the event set; sticky ambiguity flag'],
        ['Attempt 2', 'A human-answered call reported only by the legacy webhook or a reconciler was redialable', 'Sticky callExisted from any source'],
        ['Attempt 3 note', 'An uppercase copy of a call id was silently dropped', 'Ids lowercased at the boundary; foreign events counted'],
      ], head: ['Round', 'Hole found', 'Fix'] },
    ],
    evidence: [
      ['Tests', '77 contract tests; 720-permutation lifecycle; adversarial rounds 1 and 2 permuted on the streaming path'],
      ['Independent harnesses', 'verifier attack.js (18 cases) and attack3.js (22 cases): 0 failures on current code'],
      ['Verifier', '8/12, 10/12, then 11/12 PASS'],
    ],
    notEstablished: [
      'Behavior with real provider payloads: normalizers that turn Twilio and Synthflow callbacks into these events arrive in VS2.1 and VS1.6.',
      'Persistence of the record (voice_calls / voice_call_events) is VS1.4 schema plus later wiring.',
    ],
  },
  'VS1.4': {
    code: 'VS1.4', short: '13 voice tables, additive and proven on real Postgres',
    title: 'R01 Schema: additive ensureVoiceStudioSchema + Sequelize models for profiles, versions, numbers, routes, calls, events, reservations, turns, tool runs, evaluations, usage',
    docName: 'SCHEMA', date: '2026-11-24', session: SESSION, status: 'PASS 11/12 (verifier attempt 2); closes at the Phase 1 deploy',
    asked: 'Add the tables the platform needs, mapped onto what already exists, additive and reversible, with the directive\'s indexes and constraints.',
    delivered: '13 voice_* tables generated from one spec (so the models and the database cannot drift), boot-wired after the multi-tenant schema, fail-soft per statement, plus a reviewed drop script that is never run without approval. CI on real Postgres: 13 tables, re-runnable with zero failed statements, every constraint holds, and deleting a call removes everything about it.',
    takeaway: 'The schema is inert until the feature flag is on, changes no existing table, and never stores a phone number except in one restricted column. CI caught a real bug on the first try (a reserved word that would have silently skipped one table in production); it is fixed and now guarded by a test.',
    cards: [
      { n: '13', k: 'new tables, all voice_*' },
      { n: '0', k: 'existing tables altered', color: '#2e7d32' },
      { n: '7/7', k: 'real Postgres checks in CI', color: '#2e7d32' },
      { n: '1', k: 'column may hold a number (restricted)' },
      { n: '5', k: 'tables wiped with their call (retention)' },
    ],
    decision: 'Nothing to decide. The tables stay unused until a route is cut over after your approvals.',
    ladder: ['active', 'waiting', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Columns per table', max: 30, rows: [
      { label: 'voice_calls', value: 28, color: '#5a6b85' }, { label: 'voice_agent_versions', value: 21, color: '#5a6b85' },
      { label: 'voice_routes', value: 15, color: '#5a6b85' }, { label: 'voice_numbers', value: 14, color: '#5a6b85' },
      { label: 'voice_tool_runs', value: 12, color: '#5a6b85' }, { label: 'voice_dial_reservations', value: 12, color: '#5a6b85' },
    ] },
    checks: [
      ['Ensure runs twice as a no-op with 0 failed statements (CI Postgres)', true],
      ['bootSchemaCreatable passes with the new file wired', true],
      ['Duplicate idempotency key, bad state, bad canary rejected (CI)', true],
      ['Every table tenant-scoped; directive indexes present; model columns equal DDL', true],
    ],
    diagramTitle: 'How the new tables relate',
    mermaid: `flowchart LR
  P[voice_agent_profiles] --> V[voice_agent_versions]
  RT[voice_routes] --> C[voice_calls]
  V --> C
  N[voice_numbers] --> RT
  R[voice_dial_reservations] --> C
  C -->|cascade| E[voice_call_events]
  C -->|cascade| T[voice_turns]
  C -->|cascade| TR[voice_tool_runs]
  C -->|cascade| A[voice_artifacts]
  C -->|cascade| U[voice_usage]
  C -.links.-> CL[communication_logs existing]`,
    evidenceLine: 'commits e0dbb3c02 + c1332af0f; CI on 5116ae1b7: integration tier PASS 7/7; local schema tests 35 passed; verifier 11/12.',
    sections: [
      { h: 'Reuse before adding', ul: [
        'communication_logs stays the cross-channel record; voice_calls links to it.',
        'voice_dial_log stores raw numbers and has no status or lease, so it cannot be an atomic reservation table; it stays for legacy reads and still counts toward caps.',
        'Legacy Synthflow call ids stay searchable through voice_calls.legacy_call_id.',
      ] },
      { h: 'The bug CI caught', p: ['A column named authorization is a reserved word in Postgres. CREATE TABLE voice_tool_runs failed in CI, and because boot schema work is fail-soft, production would have started without that table. Renamed to auth_decision; a unit test now fails on any reserved keyword, and was mutation-checked by planting the old name back.'] },
    ],
    evidence: [
      ['CI Postgres', 'ensureVoiceStudioSchema.integration: 7 passed (twice-safe, 13 tables, constraints, cascade, event dedup)'],
      ['Local', 'schema unit tests 35 passed; baseline 21 voice suites 327 tests; tsc exit 0'],
      ['Verifier', 'attempt 1: 6/12 FAIL; attempt 2: 11/12 PASS'],
    ],
    notEstablished: [
      'Production data: no rows are written until the gateway is wired (VS1.6) and a route is enabled (after M3).',
      'Typed attributes on the generated models: carried to VS3.1, before business logic reads them.',
    ],
  },
  'VS1.1': {
    code: 'VS1.1', short: 'Every voice call goes through one function',
    title: 'R00 Inventory: every caller, consumer, route, cron and config of voice in the repo',
    docName: 'VOICE_INVENTORY', date: '2026-11-24', session: SESSION, status: 'PASS 11/12 (verifier attempt 2); closes at the Phase 1 deploy',
    asked: 'Find every place the codebase places, guards, receives or consumes AI voice calls, so the new gateway can replace Synthflow without missing a caller.',
    delivered: 'A repeatable classifier (npm run voice:inventory, --check fails on drift) over 200 files, a hand-read INVENTORY.md with every caller, guard, cron and consumer, a 12-route migration matrix seed, and 7 findings. Independent verifier: 11 of 12 on attempt 2.',
    takeaway: 'The migration has one choke point: all 11 callers reach a single function, triggerVoiceCall, so the new gateway can replace its body without touching them. But five dial paths skip the shared consent check today, and the voice consent gate is shadow-only, so the gateway must enforce one fail-closed policy for every path.',
    cards: [
      { n: '200', k: 'voice files classified' },
      { n: '1', k: 'function places every call', color: '#2e7d32' },
      { n: '11', k: 'callers' },
      { n: '6', k: 'crons that can dial' },
      { n: '5', k: 'dial paths skip evaluateSend', color: '#c62828' },
    ],
    decision: 'Nothing new to decide here. The findings feed VS1.5 (one fail-closed policy for every path) and VS1.6 (remove the dead runLeadAutomation dial path). Your open decisions are on M0.',
    ladder: ['active', 'waiting', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Files by role (classifier snapshot)', max: 100, rows: [
      { label: 'Mention only', value: 99, color: '#b8c0cc' }, { label: 'Consumer', value: 39, color: '#5a6b85' },
      { label: 'UI', value: 22, color: '#5a6b85' }, { label: 'Config', value: 19, color: '#5a6b85' },
      { label: 'Caller', value: 11, color: '#e0a100' }, { label: 'Guard', value: 6, color: '#2e7d32' },
      { label: 'Ingest', value: 3, color: '#5a6b85' }, { label: 'Dispatch', value: 1, color: '#c62828' },
    ] },
    checks: [
      ['Every hit of the directive search set is classified (0 unclassified of 200)', true],
      ['Each route row records shell vs prohibited-fallback semantics', true],
      ['voice:inventory --check exits 0 twice on a clean tree (idempotent)', true],
      ['Baseline 21 voice suites still pass; tsc clean; no phone digits added', true],
    ],
    diagramTitle: 'All roads lead to one dispatch',
    mermaid: `flowchart LR
  S[Scheduler crons] --> T[triggerVoiceCall]
  CB[Callback hub: flotation, enterprise, CPN] --> T
  M[Maya voice tool] --> T
  I[Internship + SBP discovery] --> T
  A[Alerts to staff] --> T
  Q[Campaign test harnesses] --> T
  T --> G[dial guard + kill switch]
  G --> SF[Synthflow API]
  SF -.webhook.-> W[synthflowWebhookController]`,
    evidenceLine: 'commits 78715717c + 24c7a40f3; voice:inventory --check exit 0 twice; jest 23/23 suites; tsc exit 0; loop-task-verifier 11/12.',
    sections: [
      { h: 'Findings carried into the gateway', rows: [
        ['F-01', 'Your number is on 32 public repo lines (M0 Q5)'],
        ['F-02', 'Five dial paths skip evaluateSend; three staff paths have no consent gate by design'],
        ['F-03', 'alertDeliveryService logs "sent" on a skipped call'],
        ['F-04', 'Unknown callback sources are skipped as no_prompt (training-site callbacks cannot dial)'],
        ['F-05', 'Voice consent gate is shadow-only unless consent_enforcement=enforce (fails open)'],
        ['F-06', 'Dead dial code: runLeadAutomation (no callers, no consent), runAdmissionsSynthflowCall'],
        ['F-07', 'Internal alerts borrow customer-facing sales agents'],
      ], head: ['ID', 'Finding'] },
      { h: 'Crons that can dial', ul: ['ScheduledActionsProcessor every 5 min (campaign and Open House voice steps)', 'HotLeadEscalation (when hot_lead_voice_enabled)', 'SystemHealthMonitor (Cory to the admin alert phone)', 'enterpriseIntakeSweep every 5 min (intake reminder calls)', 'CampaignQAAgent and CampaignSelfHealingAgent (test calls)', 'Indirect: any critical alert to the voice channel'] },
      { h: 'How the verifier caught a real defect', p: ['Attempt 1 scored 7 of 12: the committed snapshot had been generated before the classifier itself was committed, and the classifier matched its own search terms, so --check failed on the committed tree while the session log claimed it passed. The fix excludes the tooling by path, widens the search to the directive\'s full list, and the log now carries the correction with its own evidence.'] },
    ],
    evidence: [
      ['Inventory', '200 files; DISPATCH 1, CALLER 11, GUARD 6, INGEST 3, CONSUMER 39, CONFIG 19, UI 22, MENTION 99'],
      ['Drift check', 'npm run voice:inventory -- --check: exit 0, twice, clean tree'],
      ['Tests', '23 suites / 345 tests (baseline 327 + new)'],
      ['Verifier', 'attempt 1: 7/12 FAIL; attempt 2: 11/12 PASS'],
    ],
    notEstablished: [
      'Runtime behavior: this is a static reading of the code, not a trace of production traffic.',
      'Which Synthflow assistant serves which route: that needs the vendor API (VS5.1).',
      'Callers outside this repo (Kes\'s GHL agent, Cora) are not inventoried here.',
    ],
  },
  'VS1.2': {
    code: 'VS1.2', short: 'Why Synthflow calls fail, and what we already own',
    title: 'R00 Legacy failure root cause, Twilio voice readiness (non-dial), vendor docs and rate cards',
    docName: 'READINESS_AND_COST', date: '2026-11-24', session: SESSION, status: 'PASS 11/12 (verifier attempt 2); closes at the Phase 1 deploy',
    asked: 'Prove why Synthflow calls stopped ringing, check (without dialing) whether we can place calls from numbers we own, and price both engines from official pages.',
    delivered: 'READINESS.md (account, 69 owned numbers by route, caller-ID usability per group and per Synthflow number, a dated call log proving zero dials), COST_MODEL.md (17 cited prices, per-minute and monthly low/base/high), DECISIONS.md vendor facts, and voice:docs-check that fails any uncited price.',
    takeaway: 'The October outage is explained: Synthflow dials Cory-Outbound, ...3242 and Little Ali from numbers that are not on our Twilio account and not verified, which Twilio refuses as error 32204. Our own account is active with 69 voice numbers, so the new platform dials from numbers we own and that error cannot happen. Engine A costs about 0.085 to 0.115 USD per connected minute.',
    cards: [
      { n: '3', k: 'Synthflow numbers not on our account', color: '#c62828' },
      { n: '69', k: 'voice numbers we own' },
      { n: '0', k: 'calls placed by this work', color: '#2e7d32' },
      { n: '0.085-0.115', k: 'USD per min, engine A' },
      { n: '17', k: 'prices, each with URL + date' },
    ],
    decision: 'M0 Q3: reuse one of the 9 idle numbers we own ($0, recommended) or buy one (1.15 USD a month). The cost range narrows after LIVE-01 shows whether ElevenLabs is billed inside ConversationRelay.',
    ladder: ['active', 'waiting', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Engine A monthly cost at 10,000 connected minutes (USD)', max: 1200, rows: [
      { label: 'Low (voice in Relay)', value: 850, color: '#2e7d32' }, { label: 'Base (midpoint)', value: 1000, color: '#5a6b85' }, { label: 'High (ElevenLabs apart)', value: 1150, color: '#e0a100' },
    ] },
    checks: [
      ['Every price and model ID cites an official URL and a read date (voice:docs-check exit 0)', true],
      ['Per-number caller-ID usability: owner, voice-capable, usable yes/no', true],
      ['Zero calls placed: 0 outbound-api calls in the dated window', true],
      ['Synthflow contract comparison', false],
    ],
    diagramTitle: 'Why the Synthflow numbers fail, and the new path',
    mermaid: `flowchart LR
  SF[Synthflow] -->|SIP trunk, From = Synthflow-bought number| TW[Our Twilio account]
  TW -->|From not owned, not verified| X[Refused: error 32204]
  VS[Voice Studio] -->|REST API, From = a number we own| TW
  TW --> OK[Call allowed]`,
    evidenceLine: 'commits e3b5103a5 + 5725bd214; Twilio probes GET-only on 2026-11-24; voice:docs-check exit 0; loop-task-verifier 11/12.',
    sections: [
      { h: 'Caller-ID usability', rows: [
        ['54 numbers on app.colaberry.com', 'usable, but in use'], ['8 numbers on the Twilio placeholder', 'usable and idle (M0 Q3 candidates)'],
        ['5 GoHighLevel numbers (incl. ...2754, ...1028)', 'usable, but in use by GHL'], ['Verified caller ID ...7435', 'usable, not recommended'],
        ['Synthflow ...2568 (Edu: Cory - Outbound)', 'NOT usable: not ours, not verified'], ['Synthflow ...3242', 'NOT usable'], ['Synthflow ...0787 (Little Ali)', 'NOT usable'],
      ], head: ['Number or group', 'Caller ID'] },
      { h: 'Per connected minute', rows: [
        ['Engine A: Twilio voice + ConversationRelay', '0.084 USD (published)'], ['Engine A: Claude Haiku replies', '0.0013 USD (estimate)'],
        ['Engine A: ElevenLabs if billed apart', '0.030 USD (estimate)'], ['Engine B: Twilio voice + Media Streams', '0.0184 USD (published)'], ['Engine B: OpenAI Realtime', 'unmeasured until LIVE-02'],
      ], head: ['Component', 'Cost'] },
      { h: 'A correction to the 23 Nov note', p: ['The ROI Architect number ...2754 IS on our account (through the GHL trunk), so its Synthflow failures need a different explanation; VS5.1 checks each Synthflow number individually.'] },
    ],
    evidence: [
      ['Account', 'active, Full; 69 owned voice-capable numbers; 13 SIP trunks; 1 verified caller ID'],
      ['Call log, 2026-11-24', '69 calls, 0 of direction outbound-api (the only kind a REST dial creates)'],
      ['Prices', 'official Twilio, ElevenLabs, OpenAI and Anthropic pages, read 2026-11-24'],
      ['Verifier', 'attempt 1: 10/12 FAIL; attempt 2: 11/12 PASS'],
    ],
    notEstablished: [
      'Our actual Synthflow contract cost and included minutes (needed for the comparison; VS5.1 / M4).',
      'Whether ElevenLabs is billed inside ConversationRelay, and Engine B per-minute cost: both measured in live tests.',
      'Carrier spam labeling or answer rates of any number.',
    ],
  },
  M0: {
    code: 'M0', short: 'Five calls only you can make before Phase 2 dials anything',
    title: 'Escalations before Phase 2: direction, paid services, a Twilio voice number, the test number, and the public phone-number exposure',
    docName: 'DECISIONS_BRIEF', date: '2026-11-24', session: SESSION, status: 'APPROVAL_REQUIRED (due Wed 26 Nov)',
    asked: 'Decide the governance items the build cannot decide alone: change of direction, new paid vendors, which phone number the engine dials from, where the test number lives, and whether to clean up the existing exposure.',
    delivered: 'Five questions, each with a recommended default, backed by the VS1.1 inventory, the VS1.2 Twilio readiness probe (GET-only) and official prices read today. Phase 1 keeps building while these are open; only Phase 2 live work waits.',
    takeaway: 'We do not need Synthflow, a new carrier or a new number to test. Our own Twilio account is active with 69 voice-capable numbers, 9 of them idle for voice, and dialing from them avoids the caller-ID error that broke the Synthflow numbers. What we do need from you is the go-ahead on direction and two API keys.',
    cards: [
      { n: '69', k: 'voice numbers we own' },
      { n: '9', k: 'idle for inbound voice', color: '#2e7d32' },
      { n: '$0.085-0.115', k: 'per connected minute, engine A' },
      { n: '$0', k: 'number cost if we reuse one', color: '#2e7d32' },
      { n: '32', k: 'public lines with your number', color: '#c62828' },
    ],
    decision: 'Reply on the ticket in one line, e.g. "Q1 A, Q2 A, Q3 A, Q4 A, Q5 A". Defaults apply on Wed 26 Nov for Q1, Q4 and Q5; Q2 and Q3 need your explicit yes because they involve money or a production number.',
    ladder: ['active', 'waiting', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Engine A cost per 10,000 connected minutes (USD)', max: 1200, rows: [
      { label: 'Twilio voice', value: 140, color: '#5a6b85' },
      { label: 'ConversationRelay', value: 700, color: '#5a6b85' },
      { label: 'Claude Haiku (estimate)', value: 13, color: '#e0a100' },
      { label: 'ElevenLabs if billed apart', value: 300, color: '#e0a100' },
    ] },
    checks: [
      ['Q1 Direction: this build supersedes the 23 Nov GHL plan (recommended A)', false],
      ['Q2 Keys: you put ElevenLabs + OpenAI keys into the prod env (recommended A)', false],
      ['Q3 Number: reuse one idle Twilio number we own, $0 (recommended A)', false],
      ['Q4 Test number: Claude sets it in the server env only (recommended A)', false],
      ['Q5 Exposure: small PR moves the 32 lines to env / reserved test numbers (recommended A)', false],
    ],
    diagramTitle: 'What each answer unblocks',
    mermaid: `flowchart LR
  Q1[Q1 direction] --> P2[Phase 2 build]
  Q2[Q2 API keys] --> EA[Engine A + B sessions]
  Q3[Q3 number] --> TW[Twilio dispatch from our number]
  Q4[Q4 test number in env] --> L[LIVE-01 / LIVE-02 on your phone]
  EA --> L
  TW --> L
  Q5[Q5 scrub 32 lines] --> PRIV[Privacy goal met]`,
    evidenceLine: 'READINESS.md and COST_MODEL.md (commit e3b5103a5), INVENTORY.md (24c7a40f3); Twilio probes were GET-only; prices from official pages read 2026-11-24.',
    sections: [
      { h: 'Q1. Direction', p: ['On 23 Nov agent calls were set to move to Kes\'s shared GHL voice agent. This list builds our own platform instead.'], ul: [
        'A. This list supersedes it: build Voice AI Studio; Kes\'s GHL agent stays only as a fallback (recommended)',
        'B. Do both: GHL for agent calls now, Voice Studio for everything later',
        'C. Pause this list',
        'Default on Wed 26 Nov: A'] },
      { h: 'Q2. Paid services and keys (needs your explicit yes)', p: ['Engine A uses Twilio ConversationRelay, which defaults to ElevenLabs voices; neither vendor states whether ElevenLabs is billed separately inside Relay, so the cost is shown both ways. Engine B needs OpenAI Realtime usage (token-priced; measured in LIVE-02).'], ul: [
        'A. You put an OpenAI API key (and an ElevenLabs key if Relay asks for one) into the prod env; Claude never sees them in chat (recommended)',
        'B. Kes provides them',
        'C. Build Engine A only for now'] },
      { h: 'Q3. Which number the engine dials from (needs your explicit yes)', p: ['Nine numbers we already own point their voice webhook at Twilio\'s placeholder (demo.twilio.com), so nothing answers them today. Claude would check one has no SMS use, then point its voice webhook at the Voice Studio test endpoint.'], ul: [
        'A. Reuse one idle number we own: $0 (recommended)',
        'B. Buy one new local number: 1.15 USD per month',
        'C. Not yet'] },
      { h: 'Q4. Where the authorized test number lives', ul: [
        'A. Claude sets VOICE_TEST_ALLOWED_NUMBER on the prod server only; never in git, Basecamp, logs or PDFs (recommended)',
        'B. You set it yourself',
        'Default on Wed 26 Nov: A'] },
      { h: 'Q5. The 32 public lines with your number (finding F-01)', p: ['Two are live values (a test bypass in leadService.ts and a default alert phone in mandrillWebhookController.ts); the rest are test fixtures, comments, logs and .env.example. Git history keeps the old lines either way.'], ul: [
        'A. One small separate PR: live values move to env vars, fixtures switch to reserved 555 numbers (recommended)',
        'B. Leave them',
        'Default on Wed 26 Nov: A'] },
      { h: 'Cost basis (official pages, read 2026-11-24)', rows: [
        ['Twilio outbound voice, US local', '0.014 USD per min'], ['ConversationRelay', '0.07 USD per min, starting at'],
        ['Media Streams', '0.0044 USD per min'], ['Local number', '1.15 USD per month'],
        ['ElevenLabs Flash TTS', '0.04 USD per 1K characters'], ['OpenAI gpt-realtime-2.1-mini audio', '10 in / 20 out USD per 1M tokens'],
        ['Claude Haiku 5.5', '0.10 in / 0.50 out USD per 1M tokens'],
      ], head: ['Item', 'Price'] },
    ],
    evidence: [
      ['Twilio account', 'active, Full; 69 owned voice-capable numbers; 13 SIP trunks'],
      ['Idle voice numbers', '9 point at the demo.twilio.com placeholder (counts only; numbers not listed)'],
      ['Error 32204 meaning', 'From number is neither a Twilio number on the account nor a verified caller ID (twilio.com/docs/api/errors/32204)'],
      ['Every dial in the code', 'one function, triggerVoiceCall (synthflowService.ts:188), 11 callers'],
      ['Calls placed by this work', '0'],
    ],
    notEstablished: [
      'Whether ElevenLabs is billed separately inside ConversationRelay (neither vendor says); LIVE-01 usage settles it.',
      'Engine B per-minute cost (token-priced; measured in LIVE-02).',
      'That a reused number has no SMS use: checked before it is repointed, after your yes.',
      'Anything about Synthflow contract terms or cancellation (M5).',
    ],
  },

  'VS0.1': {
    code: 'VS0.1', short: 'Kit staged, baseline green, one exposure found',
    title: 'Stage the kit: redacted directive, docs/voice-studio/ skeleton, worktree, session, baseline',
    docName: 'KIT_AND_BASELINE', date: '2026-11-24', session: SESSION, status: 'PASS (on branch; closes at the Phase 1 deploy)',
    asked: 'Stand up the build: a clean worktree, the 12 working files the directive requires, the directive itself with the test number redacted, and a baseline of today\'s voice tests so any later failure can be proven ours or pre-existing.',
    delivered: 'Worktree C:\\dev\\wt-voice on workstream/voice-studio-p1 from origin/main 89e6bf3bb; docs/voice-studio/ with 12 working files and MASTER_BUILD_PROMPT.md (3 occurrences of the number redacted); baseline 21 of 21 voice suites and 327 of 327 tests passing; commit 4c450b3d7 (pre-commit secret scan: no leaks).',
    takeaway: 'The build has a clean starting line: every existing voice test passes on the exact snapshot the directive was written against. Separately, your phone number is ALREADY in the public repo on 32 lines (16 test fixtures, 11 source lines in 7 files including a live test bypass and a default alert phone, 4 logs, 1 .env.example). This build adds none, but the directive\'s privacy goal cannot be met until those are scrubbed.',
    cards: [
      { n: '327/327', k: 'baseline voice tests pass', color: '#2e7d32' },
      { n: '21', k: 'voice test suites' },
      { n: '12', k: 'working files created' },
      { n: '0', k: 'test-number hits in new files', color: '#2e7d32' },
      { n: '32', k: 'pre-existing lines on main', color: '#c62828' },
    ],
    decision: 'M0 (due Wed 26 Nov) holds the four calls Phase 2 needs: confirm this build supersedes the 23 Nov GHL plan, who supplies the ElevenLabs and OpenAI keys, approve one Colaberry-owned Twilio voice number, and let Claude set the test number in the server env. Also: should the 32 existing appearances of your number be scrubbed (a separate small PR, recommended) or left?',
    ladder: ['active', 'todo', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Where your number already appears on main (lines)', max: 16, rows: [
      { label: 'Test fixtures', value: 16, color: '#c62828' },
      { label: 'Source files (7)', value: 11, color: '#c62828' },
      { label: 'Session logs / PROGRESS', value: 4, color: '#e0a100' },
      { label: '.env.example', value: 1, color: '#c62828' },
    ] },
    checks: [
      ['docs/voice-studio/ has the 12 working files', true],
      ['REQUIREMENTS.md lists V01-V12 with owner, ticket, test ID, status', true],
      ['No test-number digits in any file this build added', true],
      ['Baseline voice tests recorded with exit code (0)', true],
    ],
    diagramTitle: 'What VS0.1 set up',
    mermaid: `flowchart LR
  A[origin/main 89e6bf3bb] --> W[worktree C:/dev/wt-voice]
  D[Directive from Downloads] -->|number redacted x3| K[docs/voice-studio/MASTER_BUILD_PROMPT.md]
  W --> K
  W --> F[12 working files]
  W --> B[Baseline: 21 suites, 327 tests PASS]
  F --> P[VS0.2 plan + audit]
  B --> P`,
    evidenceLine: 'commit 4c450b3d7 on workstream/voice-studio-p1; jest --ci exit 0 (21/21 suites, 327/327 tests); gitleaks pre-commit: no leaks.',
    sections: [
      { h: 'The 12 working files', rows: [
        ['INVENTORY.md', 'Every caller and route of voice (VS1.1)'], ['REQUIREMENTS.md', 'V01-V12 with ticket and test IDs'],
        ['ARCHITECTURE.md', 'Gateway, carrier, two engines, legacy adapter'], ['TRACEABILITY.md', 'Requirement to code to test to evidence'],
        ['RELEASE_PLAN.md', 'Six phases, one PR and deploy each'], ['DECISIONS.md', 'Dated decisions and M-gate answers'],
        ['TEST_PLAN.md', 'Test pyramid and live protocol'], ['EVIDENCE.md', 'Evidence manifest (commit, command, exit code)'],
        ['MIGRATION_MATRIX.md', 'One row per Synthflow assistant and route'], ['RUNBOOK.md', 'Incident playbooks (VS4.3)'],
        ['COST_MODEL.md', 'Official prices with URL and date (VS1.2)'], ['STATUS.md', 'Readiness from verified requirements only'],
      ], head: ['File', 'Purpose'] },
      { h: 'Baseline suites (all PASS on 89e6bf3bb)', ul: [
        'synthflowAgentResolution, synthflowOpenHouseAgent, synthflowPhoneNormalization, synthflowTimeout, synthflowUnscriptedGuard, synthflowWebhookUrl, synthflowWebhookAgentTool',
        'voiceCallPaths, voiceCallPrompt, voiceDialGuard, voiceDialPolicy, agentCallTool',
        'callbackRequest, communicationSafety, communicationSafetyService.killSwitch, communicationSafetyService.journeyHold, consentGateSmsVoice',
        'mayaVoiceToolHonesty, mayaSmsVoicePosture, explorerVoiceEligibility, schedulerVoiceCountdown',
      ] },
      { h: 'Finding F-01: the test number is already public', p: [
        'git grep on origin/main 89e6bf3bb finds the number on 32 lines: 16 in test fixtures (phone normalization, dial guard, lead bypass, consent normalizePhone, concept generator), 11 in 7 source files (two are live values: leadService.ts TEST_BYPASS_PHONES and the mandrillWebhookController.ts default adminAlertPhone; the rest are comments or a one-shot script), 4 in PROGRESS.md and session logs, and 1 in backend/.env.example (INBOX_COS_SMS_TO).',
        'None of these came from this build. Scrubbing them is outside this ticket (scope lock), so it is raised as an M0 question with a recommendation: one small PR that moves the runtime defaults to env vars and swaps test fixtures to a reserved 555 number. Git history would still hold the old lines.',
      ] },
      { h: 'Repository facts found on the way', ul: [
        'npm workspaces hoist jest to the root node_modules; npx through cmd breaks on a | in a test pattern, so tests run via node ../node_modules/jest/bin/jest.js.',
        'There is no migration framework: schema lands as idempotent backend/src/db/ensure*Schema.ts files awaited from server.ts (190 of them). VS1.4 was rewritten in Basecamp to match.',
        'Session logs now live in docs/sessions/<SessionID>.md; PROGRESS.md is a sealed archive.',
      ] },
    ],
    evidence: [
      ['Baseline commit', '89e6bf3bb (origin/main, 2026-11-24)'],
      ['Kit commit', '4c450b3d7 on workstream/voice-studio-p1'],
      ['Baseline tests', 'jest --ci, 21 suites PASS, 327 tests PASS, exit 0'],
      ['Leak check on new files', 'git grep: 0 hits in docs/voice-studio and the session log'],
      ['Secret scan', 'gitleaks pre-commit: no leaks'],
    ],
    notEstablished: [
      'Nothing about whether Synthflow calls ring today: the baseline is unit tests with mocked providers, not live calls.',
      'Nothing about Twilio voice readiness or prices: that is VS1.2.',
      'The redaction covers this build\'s files only; the number remains in git history and in the 32 pre-existing lines.',
    ],
  },
};
