/**
 * Voice AI Studio ticket artifact data, one entry per ticket code. Read by vsRender.js.
 * Never put the test phone number, a full CallSid, a transcript or a secret here: vsRender.assertSafe()
 * refuses to render them, and the repo is public.
 */
const SESSION = 'CC-20261124-2ptc';

module.exports = {
  'VS1.8': {
    code: 'VS1.8', short: 'Phase 1 is live, verified, and changed nothing for callers',
    title: 'Ship Phase 1: full quality gate, ONE PR, deploy, independent production verification',
    docName: 'PHASE1_SHIP', date: '2026-11-24', session: SESSION, status: 'PASS: deployed 1b01fce0c, production verifier PASS',
    asked: 'Ship Phase 1 as one PR and one deploy, with every flag off, and prove on the live system that production behaves exactly as before.',
    delivered: 'PR #4397 (all 10 CI jobs green) merged by Ali; the post-merge image build confirmed before deploying; deploy-prod.sh exit 0 with a new-code marker; an independent production verifier confirmed the running image digest matches the merge, all 13 voice tables exist and are empty, every voice switch is off, the legacy call path is unchanged and no new route is reachable.',
    takeaway: 'The foundation for replacing Synthflow is live and dormant: tables, gateway, contracts and safety tests are in production, nothing writes to them and no caller behaves differently. The next visible step is a real call to your phone, which needs your M0 answers.',
    cards: [
      { n: '10/10', k: 'CI jobs green on the PR', color: '#2e7d32' },
      { n: '13', k: 'voice tables live, all empty' },
      { n: '0', k: 'schema failures in 723 log lines', color: '#2e7d32' },
      { n: 'OFF', k: 'every voice switch in production' },
      { n: 'PASS', k: 'independent production verifier', color: '#2e7d32' },
    ],
    decision: 'Answer M0 (direction, API keys, reuse an idle Twilio number, test number in the server env, the public-number scrub) to start Phase 2 and the first live calls.',
    ladder: ['done', 'waiting', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Phase 1 tickets by verifier score (out of 12)', max: 12, rows: [
      { label: 'VS1.1 inventory', value: 11, color: '#2e7d32' }, { label: 'VS1.2 readiness + cost', value: 11, color: '#2e7d32' },
      { label: 'VS1.3 contracts', value: 11, color: '#2e7d32' }, { label: 'VS1.4 schema', value: 11, color: '#2e7d32' },
      { label: 'VS1.5 gateway', value: 11, color: '#2e7d32' }, { label: 'VS1.6 facade', value: 12, color: '#2e7d32' }, { label: 'VS1.7 config', value: 12, color: '#2e7d32' },
    ] },
    checks: [
      ['All CI checks green on the PR', true],
      ['Ali merged it', true],
      ['deploy-prod.sh exit 0 and prod HEAD contains the merge', true],
      ['loop-production-verifier PASS against the live release', true],
    ],
    diagramTitle: 'How Phase 1 shipped',
    mermaid: `flowchart LR
  P[PR 4397: 10 CI jobs green] --> M[Ali merged]
  M --> B[Build images success after merge]
  B --> D[deploy-prod.sh backend, marker found]
  D --> V[Independent production verifier]
  V --> OK[PASS: digest match, 13 empty tables, switches OFF]`,
    evidenceLine: 'merge 1b01fce0c; Build images success 19:16Z; deploy exit 0; production verifier PASS 19:20Z; container restarts 0.',
    sections: [
      { h: 'Rollback (corrected after verification)', p: ['Immediate: every switch is already off. Code rollback: revert the merge through a PR and deploy the new main tip, or, in an emergency, check out the previous main on the host and deploy with DEPLOY_MODE=build. Registry mode cannot redeploy an image that is not the current main tip; the first version of this note said otherwise and was corrected after the verifier flagged it.'] },
      { h: 'Health endpoint note', p: ['/api/health is not a real route; it returns the app\'s normal 401 catch-all. The real health checks /health and /health/full both return 200.'] },
    ],
    evidence: [
      ['Release', 'host HEAD 1b01fce0c; running image digest equals the registry sha-1b01fce0c tag'],
      ['Schema', '13 voice_* tables, COUNT(*) = 0 each (read-only session)'],
      ['Behavior', 'voice_config_loaded: valid, all switches off; ENABLE_VOICE_CALLS false; legacy dist path unchanged'],
      ['Errors', 'no voice-related error lines since start; unrelated pre-existing warnings only'],
    ],
    notEstablished: [
      'Anything about real calls: Phase 1 places none. Live calls start in Phase 2 after M0.',
      'Behavior with VOICE_GATEWAY_LEGACY_ENABLED on in production: not turned on; a separate decision.',
    ],
  },
  'VS0.2': {
    code: 'VS0.2', short: 'A 40-task plan an independent auditor approved',
    title: 'Execution contract and plan.md (one plan task per ticket), audited by loop-plan-auditor',
    docName: 'PLAN_AUDIT', date: '2026-11-24', session: SESSION, status: 'PASS 18/20 (cycle 5, authorized by Ali)',
    asked: 'Write the execution contract and a plan with one task per AI ticket, and get it graded by an independent auditor before any code is written.',
    delivered: 'An execution contract (scope, repo facts, hard stops, rollback) and a 40-task plan in dependency order with machine-checkable acceptance per task. The auditor scored it 16, 17, 17 and 17 out of 20 (pass is 18); after the fourth failure the loop stopped and asked Ali, who authorized a fifth cycle, which passed at 18.',
    takeaway: 'The audit paid for itself before a line of product code: it caught a test runner the repo does not have, a staging environment that does not exist, CLI flags no task built, and live-call prerequisites missing from the dependency graph. Each would have stalled a later phase.',
    cards: [
      { n: '18/20', k: 'final plan score', color: '#2e7d32' },
      { n: '5', k: 'audit cycles (5th authorized by Ali)' },
      { n: '40', k: 'plan tasks, one per AI ticket' },
      { n: '22', k: 'tickets revised (37 updates)' },
      { n: '0', k: 'dimensions scored zero', color: '#2e7d32' },
    ],
    decision: 'Nothing to decide. The plan and contract govern every later phase; carries recorded in it (typed models before VS3.1, Phase 5 writes on deployed code) are tracked there.',
    ladder: ['done', 'waiting', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Plan audit score by cycle (pass = 18)', max: 20, rows: [
      { label: 'Cycle 1', value: 16, color: '#c62828' }, { label: 'Cycle 2', value: 17, color: '#e0a100' }, { label: 'Cycle 3', value: 17, color: '#e0a100' },
      { label: 'Cycle 4 (retry)', value: 17, color: '#e0a100' }, { label: 'Cycle 5 (authorized)', value: 18, color: '#2e7d32' },
    ] },
    checks: [
      ['loop-plan-auditor PASS at 18 of 20 or better with no zero', true],
      ['One plan task per AI ticket, dependency ordered', true],
      ['Every ship task has deploy, rollback and live-verification steps', true],
      ['Human milestones M0-M6 declared as external gates', true],
    ],
    diagramTitle: 'How the plan gate worked',
    mermaid: `flowchart LR
  C[Contract + plan] --> A{Independent auditor}
  A -->|16, 17, 17| F[Fix findings]
  F --> A
  A -->|4th fail| S[Loop stopped: asked Ali]
  S -->|one more cycle| A
  A -->|18/20| GO[Build Phase 1]`,
    evidenceLine: 'run directory verification-log.md cycles 1-5; Ali authorized cycle 5 on 2026-11-24.',
    sections: [
      { h: 'What the audit found', rows: [
        ['Cycle 1', 'Handoff task had no checkable criteria; migration step that does not exist in this repo; a script no task built'],
        ['Cycle 2', 'Live-call and human-gate prerequisites missing from the dependency graph; staging assumed'],
        ['Cycle 3', 'E2E named a test runner the repo does not have'],
        ['Cycle 4', 'A frontend test command that would hang in watch mode; two CLI flags no task built'],
      ], head: ['Cycle', 'Findings'] },
    ],
    evidence: [
      ['Scores', '16, 17, 17, 17, 18 of 20'],
      ['Decision', 'Ali chose "One more audit first" after cycle 4'],
    ],
    notEstablished: ['That the plan is complete for Phases 2 to 6 in every detail: each later phase is verified task by task as it runs.'],
  },
  'VS1.5': {
    code: 'VS1.5', short: 'One fail-closed gate for every call, admitted atomically',
    title: 'R01 Voice Gateway + atomic dial reservation shared by every provider',
    docName: 'VOICE_GATEWAY', date: '2026-11-24', session: SESSION, status: 'PASS 11/12 (verifier attempt 2); closes at the Phase 1 deploy',
    asked: 'Replace each caller\'s own guards with one gateway: kill switch, consent, suppression, hours and caps in one ordered policy, and an atomic reservation so concurrent dials cannot race past the cap.',
    delivered: 'A pure policy (legacy mode keeps today\'s 10 AM to 8 PM Central window; direct mode adds the recipient\'s local hours and fails closed on an unknown time zone), a keyed destination hash, a transactional reservation under advisory locks, and a gateway that mints the only authorized dispatch. On real Postgres, 20 simultaneous requests for one number admit exactly 2.',
    takeaway: 'Every future call passes one gate that never treats "unknown" as "allow": an unreadable kill switch, consent or suppression blocks the call. A dial that times out is recorded as ambiguous and never retried. The verifier found staff numbers skipping consent; now only their call-hours exemption remains, with a finite budget.',
    cards: [
      { n: '2 of 20', k: 'simultaneous dials admitted (cap 2)', color: '#2e7d32' },
      { n: '1,512', k: 'policy combinations, 0 wrong' },
      { n: '0', k: 'unknowns that allow a call', color: '#2e7d32' },
      { n: '48 / 3', k: 'staff / test daily budgets' },
      { n: '67', k: 'tests (61 unit + 6 Postgres)' },
    ],
    decision: 'Nothing to decide now. The gateway stays dormant until VOICE_GATEWAY_LEGACY_ENABLED is turned on, which is a separate choice after the Phase 1 deploy.',
    ladder: ['active', 'waiting', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Per-destination budget in 24 hours', max: 50, rows: [
      { label: 'Staff alert phones', value: 48, color: '#5a6b85' }, { label: 'Admin test number', value: 3, color: '#e0a100' }, { label: 'Everyone else (today\'s cap)', value: 2, color: '#2e7d32' },
    ] },
    checks: [
      ['20 concurrent requests for one destination admit exactly the cap (CI Postgres)', true],
      ['Kill switch flipped during reservation blocks dispatch', true],
      ['Ambiguous timeout keeps the reservation held, never retried', true],
      ['Legacy 10 AM to 8 PM Central and 2 per 24 h preserved', true],
    ],
    diagramTitle: 'From request to dial',
    mermaid: `flowchart LR
  Q[Voice request] --> P{Policy: kill switch, flag, path, consent, suppression, hours}
  P -->|any unknown| B[Blocked]
  P -->|ok| R{Atomic reservation, advisory locks}
  R -->|over cap| B
  R -->|held| K{Kill switch re-check}
  K --> D[Provider dial]
  D -->|accepted| A[accepted]
  D -->|refused| L[released]
  D -->|timeout or throw| U[ambiguous, never retried]`,
    evidenceLine: 'commits 62ca48e4c, 5116ae1b7, 4ca09c06a, 397d405bd; CI Postgres reservation suite 6/6; verifier 9/12 then 11/12; 1,512-combination matrix 0 wrong.',
    sections: [
      { h: 'What the verifier and CI caught', rows: [
        ['CI', 'On a fresh database every reservation failed closed (a query referenced a not-yet-created legacy table at parse time)', 'Existence checked first; regression test'],
        ['Attempt 1', 'Staff numbers skipped consent entirely, even when revoked', 'Consent applies to everyone; staff keep only the call-hours exemption'],
        ['Attempt 2 note', 'Unexpected values (GRANTED, empty, undefined) allowed a call', 'Allowlists: only exactly-known-good values allow'],
      ], head: ['Found by', 'Problem', 'Fix'] },
    ],
    evidence: [
      ['Concurrency', 'CI Postgres: 20 concurrent requests, exactly 2 reserved, 18 destination_cap'],
      ['Policy sweep', 'verifier matrix: 1,512 combinations, 0 wrongly allowed, 0 wrongly blocked'],
      ['Tests', 'voicePolicy 41, voiceGateway 20, voiceReservation integration 6'],
    ],
    notEstablished: [
      'Consent records are not yet read by the gateway for legacy calls: in legacy mode each caller still owns consent, as today (moved per route in Phases 3 and 5).',
      'Recipient time zones for direct-engine calls come from lead data wired in Phase 2.',
    ],
  },
  'VS1.6': {
    code: 'VS1.6', short: 'Every existing call can route through the gateway, unchanged',
    title: 'R01 Legacy Synthflow adapter + triggerVoiceCall compatibility facade + static no-direct-dispatch test',
    docName: 'LEGACY_FACADE', date: '2026-11-24', session: SESSION, status: 'PASS 12/12 (verifier attempt 2); closes at the Phase 1 deploy',
    asked: 'Put today\'s Synthflow dial behind the gateway without changing what any caller sees, and make the build fail if anything dials around it.',
    delivered: 'A legacy Synthflow provider and a facade behind one switch (off by default). With it off, today\'s code path runs unchanged; with it on, the same checks run first and the dial goes through the atomic reservation, returning the exact result shapes callers read. A static test fails the build on any direct dial or any provider import outside the gateway.',
    takeaway: 'Turning the gateway on later will not change what any of the 9 call routes sends to Synthflow: the verifier mutation-tested that, breaking the body three ways and watching the contract tests fail each time. And nobody can quietly add a dial that skips the safety checks: the build fails first.',
    cards: [
      { n: '9 of 9', k: 'routes send an identical request', color: '#2e7d32' },
      { n: '2', k: 'files allowed to dial' },
      { n: '343', k: 'existing voice tests pass, flag off', color: '#2e7d32' },
      { n: '12/12', k: 'verifier score' },
      { n: 'OFF', k: 'gateway switch by default' },
    ],
    decision: 'Later, not now: whether to turn VOICE_GATEWAY_LEGACY_ENABLED on in production for today\'s Synthflow calls (it fixes the dial-count race). Recommended only after Phase 1 is deployed and verified.',
    ladder: ['active', 'waiting', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Tests guarding this change', max: 30, rows: [
      { label: 'Architecture (no direct dial)', value: 27, color: '#5a6b85' }, { label: 'Flag on/off + 9 route contracts', value: 16, color: '#2e7d32' }, { label: 'Facade outcomes', value: 11, color: '#5a6b85' },
    ] },
    checks: [
      ['All pre-existing voice tests still pass with the flag off', true],
      ['Architecture test fails on a planted direct dial and a planted provider import', true],
      ['10-digit US number still normalized to +1, never +682', true],
      ['Flag on: every earlier check runs first; results keep the legacy shape', true],
    ],
    diagramTitle: 'One switch, two paths, same result',
    mermaid: `flowchart LR
  C[Any of 11 callers] --> T[triggerVoiceCall: same checks, same order]
  T -->|switch OFF default| S[Synthflow, exactly as today]
  T -->|switch ON| G[Gateway: atomic reservation]
  G --> L[Legacy Synthflow provider]
  S --> R[Same result shape to the caller]
  L --> R`,
    evidenceLine: 'commits 7488a072c, 4b36acda7, 568cc04d5, 422844f18; verifier 10/12 then 12/12 with planted imports and body mutations.',
    sections: [
      { h: 'What stays the same on purpose', ul: [
        'Each caller still owns consent and suppression in legacy mode, as today; the facade logs that provenance. Moving consent into the gateway is per-route work in Phases 3 and 5.',
        'The dead runLeadAutomation path stays, but can now only dial through this facade.',
      ] },
    ],
    evidence: [
      ['Flag off', 'baseline voice suites 22/22, 343 tests'],
      ['Contracts', '9 routes: flag-on Synthflow body equals flag-off body; mutation-checked by the verifier'],
      ['Architecture', '27 tests: direct dials (incl. other vendors) and provider imports caught; unrelated providers folders not flagged'],
    ],
    notEstablished: [
      'Production behavior with the switch on: it ships off; turning it on is a later, separate step.',
      'URLs assembled at runtime are a documented limit of the static check; the import rule covers the likely path.',
    ],
  },
  'VS2.5': {
    code: 'VS2.5', short: 'The only way to place a live test call, and it can only ring your phone',
    title: 'R02 Test Lab backend: allowlisted live test call, budget and attempt caps, voice:test:live, voice:grade skeleton',
    docName: 'TEST_LAB', date: '2026-11-24', session: SESSION, status: 'PASS 11/12 (verifier attempt 1); closes at the Phase 2 deploy',
    asked: 'Build the controlled way to place live test calls: an admin endpoint that never accepts a phone number, hard caps on attempts, time and spend, one call at a time, no automatic retry, never from CI, plus a command to run a test and a grader that scores the evidence.',
    delivered: 'POST /api/admin/voice-studio/tests (admin only, absent unless test mode is on) takes a server-side destination id, never a number; the server resolves it to the authorized number in the prod settings. Every call still passes the gateway: kill switch, consent, calling hours, the atomic reservation and the 24-hour cap. Max 3 attempts per run, one call in flight, worst case about $1.04 per run, one dial per request. voice:test:live refuses in CI; voice:grade scores a run with visible math and fails it on any critical gate; voice:numbers:register registers the idle Twilio number we are reusing.',
    takeaway: 'There is exactly one way to place a live test call, and the only phone it can ring is the one you authorized; a number typed into a request is rejected outright. The independent verifier probed every route a number could sneak through (request, command line, gateway, carrier) and found none.',
    cards: [
      { n: '1', k: 'phone it can ring: yours', color: '#2e7d32' },
      { n: '3', k: 'attempts per run; the 4th is refused' },
      { n: '$1.04', k: 'worst case of a full run (ceiling $5)' },
      { n: '0', k: 'automatic retries', color: '#2e7d32' },
      { n: '15 of 15', k: 'planted bugs caught (7 mine + 8 the verifier\'s)', color: '#2e7d32' },
    ],
    decision: 'Nothing new now. At the deploy: register the idle Twilio number (one command, $0) and turn test mode on.',
    ladder: ['done', 'active', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Every live test call passes these gates', max: 8, rows: [
      { label: 'Test Lab checks', value: 5, color: '#2e7d32' },
      { label: 'Gateway checks', value: 5, color: '#2e7d32' },
    ] },
    checks: [
      ['The 4th attempt in a run is refused', true],
      ['A request with a raw phone number is rejected (400)', true],
      ['voice:grade on an empty manifest fails and lists every missing artifact', true],
      ['voice:test:live refuses in CI', true],
      ['A second concurrent test is refused; only one dials', true],
    ],
    diagramTitle: 'One live test call',
    mermaid: `flowchart LR
  A[Admin: run id + 'test-allowed'] --> P{Test Lab checks}
  P -->|refuse| R[400 / 403 / 409 / 429]
  P --> G{Gateway checks}
  G -->|refuse| R
  G --> C[Call row written]
  C --> D[ONE dial via Twilio]
  D --> Y[Your phone only]`,
    evidenceLine: 'commits 4ef4b11ca, e054d4c41 and the dial-time 403 fix; verifier 11/12; testlab suites 34 passed; CI refusal exit 3.',
    sections: [
      { h: 'What testing caught', p: ['A run name containing a date (run-20261124) was being rejected as a phone number; the check now flags only values made entirely of phone characters. The verifier\'s one deduction: adminRoutes.ts was already over the 500-line limit and got a 2-line mount instead of being split first; that is recorded as a known deviation in the phase PR.'] },
    ],
    evidence: [
      ['Tests', '34 Test Lab tests, including route tests through Express and the real request policy'],
      ['Security', 'verifier probed body, CLI, gateway deps and provider: no path for a typed number to reach the carrier'],
      ['Caps', '3 attempts, 180 s, $5 per run are schema ceilings; settings cannot raise them'],
    ],
    notEstablished: [
      'No live call has been placed yet; that is LIVE-01/02, after the deploy and your two keys.',
      'If the database fails between the reservation and the call row, that run refuses further attempts (fail closed) and one 24-hour test slot is used; not covered by a test.',
    ],
  },
  'VS2.4': {
    code: 'VS2.4', short: 'Engine B: OpenAI hears and speaks directly, and stops at the exact word you interrupted',
    title: 'R03 Engine B: Media Streams + OpenAI Realtime bridge (mu-law, marks, barge-in truncation)',
    docName: 'ENGINE_B_REALTIME', date: '2026-11-24', session: SESSION, status: 'PASS 12/12 (verifier attempt 2); closes at the Phase 2 deploy',
    asked: 'Build the second engine: the phone call\'s raw audio goes straight to OpenAI\'s speech-to-speech model and back, with playback tracked so that when the caller interrupts, the model forgets exactly the part the caller never heard. Same tool contract as Engine A.',
    delivered: 'A bridge between Twilio Media Streams and OpenAI Realtime with no audio conversion (both speak 8 kHz mu-law), a bounded buffer while the model connects, a playback marker after every chunk, and barge-in that stops playback, cuts the model\'s memory at the last millisecond actually played and cancels the answer. Tools use the same broker as Engine A; every tool call gets its result back; a follow-up answer is only requested while it is still current.',
    takeaway: 'Interrupt Engine B and it stops at once; the model remembers only what you actually heard, to the millisecond, because the cut is based on Twilio confirming playback, not on what was sent. The verifier caught a real-world ordering problem on attempt 1 (a calendar lookup would have ended in silence); it is fixed and tested in the real event order.',
    cards: [
      { n: '0', k: 'audio conversions on a live call', color: '#2e7d32' },
      { n: 'to the ms', k: 'memory cut at audio actually played', color: '#2e7d32' },
      { n: '33', k: 'bridge tests (mock Twilio + mock OpenAI)' },
      { n: '2', k: 'real bugs caught before any live call' },
      { n: 'gpt-realtime-2.1', k: 'default model, one setting to change' },
    ],
    decision: 'Nothing new. Engine B uses the OpenAI key already in production.',
    ladder: ['done', 'active', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Barge-in: what is cut (example from the tests)', max: 60, rows: [
      { label: 'ms of answer sent to Twilio', value: 60, color: '#e0a100' }, { label: 'ms confirmed played = cut point', value: 40, color: '#2e7d32' },
    ] },
    checks: [
      ['Delayed marks, repeated interrupts, silence, noise, disconnect, teardown pass in fixtures', true],
      ['Truncation offset equals audio actually played', true],
      ['A calendar lookup that outlasts the model\'s turn still gets answered', true],
      ['A canceled or superseded answer is never played', true],
    ],
    diagramTitle: 'Barge-in on Engine B',
    mermaid: `flowchart LR
  M[OpenAI audio chunk] --> T[Twilio plays it]
  T -->|mark back = played| P[Played-ms counter]
  C[Caller starts talking] --> X[Clear Twilio buffer]
  C --> U[Cut model memory at played ms]
  C --> K[Cancel the answer]`,
    evidenceLine: 'commits 422279716, a8a926270, 81d310ecf; verifier 7/12 then 12/12; realtime suites 33 passed; voice baseline 25 suites passed.',
    sections: [
      { h: 'What the verifier caught', p: ['On the real wire OpenAI reports a tool-calling answer as finished before a real calendar lookup returns. The bridge took that as the end of the answer, so the follow-up was never requested and the caller would have heard silence. Tool calls are now registered before the lookup starts, and the tests run in the real event order with held-open lookups. Earlier, testing also caught a duplicated tool event being recorded twice.'] },
    ],
    evidence: [
      ['Tests', '33 bridge and protocol tests; reintroducing the verifier\'s bug fails 2'],
      ['Protocol', 'Twilio Media Streams docs and the OpenAI SDK\'s own type definitions (read 2026-11-24)'],
      ['Safety', 'same single-use session reference, account and call checks as Engine A; the OpenAI key stays on the server; no audio or transcript in logs'],
    ],
    notEstablished: [
      'Real latency, OpenAI\'s voice activity detection on a phone line, and Twilio\'s real handshake are only proven in LIVE-02.',
      'Cost per minute is measured in LIVE-02, not estimated here.',
    ],
  },
  'VS2.3': {
    code: 'VS2.3', short: 'Engine A: a real conversation, with a voice, that stops the moment you talk',
    title: 'R02 Engine A: Conversation Relay + ElevenLabs voice + streaming Claude, with interruption and one read-only tool',
    docName: 'ENGINE_A_RELAY', date: '2026-11-24', session: SESSION, status: 'PASS 12/12 (verifier attempt 2); closes at the Phase 2 deploy',
    asked: 'Build the first voice engine: Twilio ConversationRelay handles listening and the ElevenLabs voice, Claude streams the answers, the caller can interrupt at any time, and the agent can use one read-only tool.',
    delivered: 'A WebSocket endpoint that only Twilio can open, a session that starts only after a single-use reference, our account and the right call all check out, answers streamed token by token from Claude and cut off the instant the caller speaks, history that keeps only what the caller actually heard, a calendar lookup that offers up to three strategy-call times and never books, keypad presses, language switching, and safe spoken lines for failures and refusals. Every call opens with "I\'m an AI, not a person".',
    takeaway: 'Talk over the agent and it stops and listens; nothing from the cut-off answer is ever spoken later or remembered as said. Check the calendar and get interrupted mid-lookup, and the conversation still carries on cleanly. The verifier caught exactly that last case breaking on attempt 1; it is fixed and now tested the way the real API checks it.',
    cards: [
      { n: '46', k: 'protocol tests (mock Twilio + mock model)', color: '#2e7d32' },
      { n: '0', k: 'words from a canceled answer ever spoken', color: '#2e7d32' },
      { n: '1', k: 'tool run per request, even on replay', color: '#2e7d32' },
      { n: '3', k: 'real bugs caught before any live call' },
      { n: '2', k: 'keys you add before LIVE-01', color: '#e0a100' },
    ],
    decision: 'Before LIVE-01: put ANTHROPIC_API_KEY and TWILIO_AUTH_TOKEN in the prod .env (never in chat). Optional: Engine A uses Claude Opus 5.5 by default; if the first calls feel slow, a faster model is one setting, your call.',
    ladder: ['done', 'active', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'What the tests caught before any live call', max: 3, rows: [
      { label: 'unheard words kept in memory', value: 1, color: '#2e7d32' }, { label: 'tool result split from request', value: 1, color: '#2e7d32' },
      { label: 'frames processed after close', value: 1, color: '#2e7d32' },
    ] },
    checks: [
      ['Greeting discloses the AI before anything else', true],
      ['Interrupt mid-sentence: the canceled answer never resumes', true],
      ['The read-only tool runs once per request', true],
      ['Call ends cleanly (hang-up, time limit, server restart)', true],
      ['Malformed and oversized messages are rejected', true],
    ],
    diagramTitle: 'One live call on Engine A',
    mermaid: `flowchart LR
  P[Caller speaks] --> R[Twilio Relay: speech to text]
  R --> E[Engine A session]
  E --> C[Claude streams the answer]
  C --> E --> V[Relay: ElevenLabs voice]
  P -. talks over .-> X[Cancel: never resumes]
  E --> T[Calendar lookup, read-only]`,
    evidenceLine: 'commits f4809eac1, 86f827ab8, 0e07cf441, dec8e3bbc; verifier 10/12 then 12/12; relay suites 46 passed; voice baseline 23 suites passed.',
    sections: [
      { h: 'What testing caught', p: ['Mutation testing: the model finishes writing faster than Twilio finishes speaking, so most interrupts arrive after the answer is complete; the full unheard answer was staying in memory. The verifier: a caller speaking while the calendar lookup ran left the conversation malformed, so every later turn would have failed. Both are fixed and pinned by tests; the mock model now rejects bad conversations exactly like the real API.'] },
    ],
    evidence: [
      ['Tests', '46 protocol tests; reintroducing the verifier\'s bug fails 2 of them'],
      ['Safety', 'single-use session reference, account and call checked before a session opens; Twilio-signed WebSocket only; no transcript or number in any log'],
      ['Model', 'Claude Opus 5.5 by default (Claude API guidance), low effort, 15 s timeout, server-side fallback on a refusal'],
    ],
    notEstablished: [
      'Real speech, real latency and Twilio\'s real handshake are only proven in LIVE-01 (needs your two keys and a call window).',
      'Language switching sends the right message, but whether Relay ever reports a new language mid-call is only provable live.',
    ],
  },
  'VS2.2': {
    code: 'VS2.2', short: 'One brain for every live call: it can be interrupted, and never talks over itself',
    title: 'R02 Shared realtime session state machine and session worker module',
    docName: 'SESSION_ENGINE', date: '2026-11-24', session: SESSION, status: 'PASS 12/12 (verifier attempt 2); closes at the Phase 2 deploy',
    asked: 'Build the session logic both voice engines share: the states of a live call, turn and answer identity so a late answer can never be spoken into the wrong moment, cancellation, timeouts, limits, per-agent concurrency, tool bookkeeping, and a clean shutdown.',
    delivered: 'A pure state machine (9 states, every allowed and forbidden move in one table) and a session worker that owns every live call: a cancel token per answer, a bounded outbound queue that pushes back instead of dropping, per-state and whole-call timeouts on a monotonic clock, response-length cut-off, concurrency caps, and a shutdown that refuses new calls, waits for live ones, then force-closes and reconciles the rest.',
    takeaway: 'When a caller interrupts, the answer in progress is canceled and nothing from it can be spoken afterwards, whatever order the network delivers things in. If the caller hangs up while the agent is booking something, the booking is still recorded. A server restart ends calls cleanly instead of cutting them mid-word.',
    cards: [
      { n: '99 of 99', k: 'state x event moves checked against the table', color: '#2e7d32' },
      { n: '0', k: 'sessions or timers left after 1,000 calls', color: '#2e7d32' },
      { n: '8 of 8', k: "verifier's planted bugs caught" },
      { n: '1', k: 'real bug the tests found (shutdown count)' },
      { n: '3 min', k: 'test call ceiling, enforced here too' },
    ],
    decision: 'Nothing new.',
    ladder: ['done', 'active', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'What ends a turn early', max: 4, rows: [
      { label: 'caller interrupts', value: 1, color: '#2e7d32' }, { label: 'caller speaks again', value: 1, color: '#2e7d32' },
      { label: 'model too slow (12 s)', value: 1, color: '#e0a100' }, { label: 'answer too long', value: 1, color: '#e0a100' },
    ] },
    checks: [
      ['Transition table test covers every allowed and forbidden move', true],
      ['No leaked sessions after 1,000 connect/disconnect cycles', true],
      ['A late answer never speaks into a newer turn or a closed call', true],
      ['Hang-up during a tool: the committed action is still recorded', true],
      ['SIGTERM: refuse new calls, drain to a deadline, reconcile the rest', true],
    ],
    diagramTitle: 'A live call, one turn at a time',
    mermaid: `flowchart LR
  C[connecting] --> G[greeting] --> L[listening]
  L -->|caller speaks| T[thinking] -->|answer starts| S[speaking]
  S -->|answer done| L
  S -->|interrupt| I[interrupted] --> L
  T -->|too slow| L
  L & T & S --> E[ending] --> X[closed]`,
    evidenceLine: 'commits f85021c6c, 0124d16b1, bf9f48ba3; verifier 9/12 then 12/12; session suites 138 passed; voice baseline 21 suites passed.',
    sections: [
      { h: 'What the verifier caught', p: ['Attempt 1: I had not refreshed the committed voice inventory after adding the worker, so one existing voice test broke; refreshed. One planted bug survived (an interrupt while the model is still thinking); a test now pins it. On my side, the shutdown test caught a real bug: calls that were force-closed were being counted as finished cleanly.'] },
    ],
    evidence: [
      ['Tests', 'stateMachine and sessionWorker: 138 tests, including all 99 state x event pairs'],
      ['Leaks', '1,000 synthetic calls: 0 sessions, no timer, bounded orphan-tool list'],
      ['Mutation', "verifier's 8 planted bugs all caught; my 4 caught"],
    ],
    notEstablished: [
      'No real call has run through this yet; the engines (VS2.3, VS2.4) connect it to Twilio.',
      'A tool result that fails to save after a hang-up is logged, not retried; durable retry comes with the database writer in VS2.3.',
    ],
  },
  'VS2.1': {
    code: 'VS2.1', short: 'Our own Twilio line, and only Twilio can talk to it',
    title: 'R02 Twilio carrier adapter: outbound REST + status callbacks, inbound TwiML, signature validation, replay rejection',
    docName: 'TWILIO_CARRIER', date: '2026-11-24', session: SESSION, status: 'PASS 12/12 (verifier attempt 3); closes at the Phase 2 deploy',
    asked: 'Connect Voice AI Studio to our own Twilio account: place and end calls, take Twilio\'s status updates and answer requests, prove every request really came from Twilio, and refuse replays, with no prompt or personal data in any URL.',
    delivered: 'A Twilio carrier adapter that places calls through the REST API with status callbacks and a hard time limit, never retries a create, and treats any uncertain outcome as "may exist, reconcile, never redial". Three webhooks (status, answer, inbound) that do not exist while voice is off, check Twilio\'s signature against our own public address, check the account, check our signed single-use reference, and store events idempotently. A WebSocket location in nginx for the voice engines.',
    takeaway: 'Nothing can drive a call through these webhooks except Twilio itself, a replayed request ends the call instead of restarting it, and no phone number is stored or logged. One thing is missing before the first real call: the Twilio auth token, which Twilio uses to sign its requests. Until it is set, every webhook refuses (fail closed).',
    cards: [
      { n: '1 of 1', k: "Twilio's own signature example reproduced", color: '#2e7d32' },
      { n: '0', k: 'phone numbers stored or logged', color: '#2e7d32' },
      { n: '0', k: 'automatic redials on an uncertain create', color: '#2e7d32' },
      { n: '8 of 8', k: 'planted bugs caught by the tests' },
      { n: '1', k: 'setting still needed: TWILIO_AUTH_TOKEN', color: '#e0a100' },
    ],
    decision: 'One key for you to add before LIVE-01 (not now): TWILIO_AUTH_TOKEN from the Twilio console, into the prod .env, never in chat. Same for ANTHROPIC_API_KEY.',
    ladder: ['done', 'active', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Outcomes the carrier returns', max: 7, rows: [
      { label: 'refused (Twilio created nothing)', value: 7, color: '#2e7d32' }, { label: 'unknown (reconcile, never redial)', value: 5, color: '#e0a100' },
    ] },
    checks: [
      ['Invalid signature returns 403 and logs error_class', true],
      ['Duplicate and out-of-order status callbacks give the same final state', true],
      ['Route table: every route Twilio-signed; none takes a destination number', true],
      ['Replay of a single-use answer request hangs up', true],
      ['Only a number we own (active in voice_numbers) is accepted', true],
    ],
    diagramTitle: 'Every Twilio request, five locks',
    mermaid: `flowchart LR
  T[Twilio request] --> G{Voice flag on?}
  G -->|no| N[Route does not exist]
  G -->|yes| S{Signature valid?}
  S -->|no| F[403 + error_class]
  S -->|yes| A{Our account?}
  A -->|no| F
  A -->|yes| O{Our own number?}
  O -->|no| F
  O -->|yes| R{Signed ref valid, unused?}
  R -->|no| H[Refuse or hang up]
  R -->|yes| E[Idempotent event store]`,
    evidenceLine: 'commits 517fd976c, e11a4ae00, 340c1ff87; verifier 9/12, 10/12, 12/12; 6 new suites; voice + db suites 167 passed (8 DB-only skipped locally, run in CI); 8 mutations caught.',
    sections: [
      { h: 'What the verifier caught', p: ['Attempt 1: the spec asked us to check the called number, and we had not; requests now count only if the number on our side is an active Twilio number we own. A route check could never fail; it was replaced with real ones. Attempt 2: on this Windows machine one safety test was silently scanning almost nothing (line endings); it now works on both and fails loudly if it cannot find what it checks.'] },
      { h: 'Why "no phone number" is read the way it is', p: ['Twilio\'s own requests always carry To and From. Those fields arrive signed and are used only to validate; they are never stored or logged, and the tests check that. No route accepts a number to dial from whoever calls it: a destination only ever comes from the server-side allowlist.'] },
    ],
    evidence: [
      ['Signature', "Twilio security page worked example: L/OH5YylLD5NRKLltdqwSvS0BnU= reproduced; tamper, wrong token, missing token all refused"],
      ['Carrier', '4xx -> refused with stable classes (caller-ID error 32204 -> TwilioInvalidFrom); timeout, network, 5xx, shapeless success -> unknown; never retried'],
      ['Webhooks', 'off = route absent; unsigned 403; foreign account 403; replay -> hang-up; database failure 500 so Twilio redelivers into idempotent writes'],
      ['Schema', 'voice_token_uses added (14th voice table, additive); rollback script updated'],
    ],
    notEstablished: [
      'No live Twilio request has hit these routes yet; that happens after the Phase 2 deploy, once TWILIO_AUTH_TOKEN is set.',
      'The Postgres store test runs in CI, not locally.',
      'The WebSocket server itself arrives in VS2.2; nginx only forwards to it.',
    ],
  },
  'VS1.7': {
    code: 'VS1.7', short: 'A bad setting turns voice off, never on',
    title: 'R01 Feature flags, startup config validation, mock provider, and the voice:* CLI (dry run by default)',
    docName: 'CONFIG_AND_CLI', date: '2026-11-24', session: SESSION, status: 'PASS 12/12 (verifier attempt 2); closes at the Phase 1 deploy',
    asked: 'Add the switches disabled by default, validate them at startup without ever crashing the server, a mock provider that proves zero real calls, and the preflight and mock-test commands.',
    delivered: 'A validated config that is the single source of truth for every voice switch: any invalid value turns everything off and is logged; the live-test ceilings (3 attempts, 180 seconds, 5 USD) cannot be raised. voice:preflight reports readiness, redacted, and never dials; voice:test:mock runs four scenarios through the real gateway with zero network attempts.',
    takeaway: 'With nothing set, the system behaves exactly as today. A typo in a voice setting can only switch voice off. The readiness check now reports exactly what the running code will do, which the verifier proved with a live control run.',
    cards: [
      { n: '0', k: 'network calls in the mock run', color: '#2e7d32' },
      { n: '4 of 4', k: 'mock scenarios as expected', color: '#2e7d32' },
      { n: '3 / 180 s / $5', k: 'test ceilings, not raisable' },
      { n: '$1.04', k: 'worst case of one test run' },
      { n: '34', k: 'tests (config, agreement, CLI)' },
    ],
    decision: 'Nothing new. M0 Q4 (Claude sets the test number in the server env) is what turns the readiness check from NOT READY to READY for Phase 2.',
    ladder: ['active', 'waiting', 'todo', 'todo', 'todo', 'todo'],
    bars: { title: 'Readiness today (preflight --mode test)', max: 3, rows: [
      { label: 'Blockers named', value: 3, color: '#e0a100' }, { label: 'Dials placed', value: 0, color: '#2e7d32' },
    ] },
    checks: [
      ['voice:preflight prints a redacted report and places no call', true],
      ['Startup with all voice env unset behaves exactly as today', true],
      ['Mock run asserts 0 real provider calls', true],
      ['Every runtime reader agrees with the validated config', true],
    ],
    diagramTitle: 'One validated source',
    mermaid: `flowchart LR
  E[VOICE_* environment] --> V{Validated config}
  V -->|invalid| O[Everything OFF + logged]
  V -->|valid| C[Switches as set]
  C --> S[triggerVoiceCall routing]
  C --> H[Destination hash key]
  C --> P[voice:preflight report]
  C --> B[Boot log]`,
    evidenceLine: 'commits f06e63239, ee02aee4b, 3a6ef8338; voice:test:mock 4/4 with networkAttempts 0; verifier 10/12 then 12/12.',
    sections: [
      { h: 'What the verifier caught', p: ['Three places read the gateway switch and hash key straight from the environment, so with an invalid config the readiness check said "off" while the code still routed through the gateway. All readers now use the validated config, and a test fails the build if anything reads those settings any other way.'] },
    ],
    evidence: [
      ['Tests', 'voiceConfig 15, voiceConfigAgreement 12, preflight and mock 7'],
      ['Mock run', '4 scenarios through the real gateway; realCalls 0; networkAttempts 0; fetch restored'],
      ['Preflight', 'test mode: NOT READY with 3 named blockers, 0 dials; no number or secret in output'],
    ],
    notEstablished: [
      'Credential checks against the provider APIs (read-only) arrive with the Twilio adapter in VS2.1.',
      'The mock traps fetch, not raw sockets; the mock provider uses neither.',
    ],
  },
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
