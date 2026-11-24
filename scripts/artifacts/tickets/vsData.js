/**
 * Voice AI Studio ticket artifact data, one entry per ticket code. Read by vsRender.js.
 * Never put the test phone number, a full CallSid, a transcript or a secret here: vsRender.assertSafe()
 * refuses to render them, and the repo is public.
 */
const SESSION = 'CC-20261124-2ptc';

module.exports = {
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
