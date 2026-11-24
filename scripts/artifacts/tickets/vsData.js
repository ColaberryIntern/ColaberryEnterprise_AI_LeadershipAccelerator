/**
 * Voice AI Studio ticket artifact data, one entry per ticket code. Read by vsRender.js.
 * Never put the test phone number, a full CallSid, a transcript or a secret here: vsRender.assertSafe()
 * refuses to render them, and the repo is public.
 */
const SESSION = 'CC-20261124-2ptc';

module.exports = {
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
