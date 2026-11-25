/**
 * Voice AI Studio ticket artifact data, Phase 3 (VS3.1 to VS3.7). Same rules as vsData.js: no phone
 * number, full CallSid, transcript or secret. Scores, counts and commits come from the run's state
 * ledger, the session log and the two production verifier reports of 2026-11-25.
 */
const SESSION = 'CC-20261124-2ptc';
const OK = '#2e7d32';

const DECISION = 'None for this ticket. Next for Voice Studio: merge Phase 4 (PR 4430) when it is ready, then save the two keys for the first live calls.';
const SHIPPED = 'PR 4407 merged 11:39 AM CST, deployed 12:04 PM CST on 2026-11-25 (main c5ed9c441); independent production verifier PASS 10/10 on its second pass; every voice switch off; 0 calls placed.';
const SHIP_ROWS = [
  ['Merge', 'PR 4407, merge 5d8c8a44c, all CI checks passed on the merged commit'],
  ['Deploy', 'deploy-prod.sh backend nginx, exit 0, host HEAD c5ed9c441, running images equal the registry tags'],
  ['Production check', 'cycle 1 failed only the rollback note (corrected); cycle 2 PASS 10/10'],
];
const NOT_LIVE = 'Anything about a real phone call: LIVE-01 to LIVE-03 and one real inbound call are still open (keys and a call window).';
const NOT_SEEN = 'The signed-in console in production: its switch is off, so it was verified on a local stack only.';

function entry(e) {
  return {
    date: '2026-11-25', session: SESSION, decision: DECISION, ladder: ['done', 'done', 'active', 'active', 'todo', 'todo'],
    evidenceLine: `${e.commits}; ${SHIPPED}`, ...e,
    evidence: [...e.evidence, ...SHIP_ROWS],
    notEstablished: [...e.notEstablished, NOT_LIVE],
  };
}

module.exports = {
  'VS3.1': entry({
    code: 'VS3.1', short: 'What an agent may say and do is versioned, approved and locked',
    title: 'Agent profiles and immutable versions, tool policy and knowledge lookup', docName: 'PROFILES_VERSIONS', status: 'PASS 11/12 (attempt 3), live and switched off', commits: 'commits 9d49a20e8, 9044f2d32, c3979c12d',
    asked: 'Make a voice profile a phone channel for an existing agent, seeded from the live Cory prompt, with versions nobody can quietly change and tools the caller cannot talk their way into.',
    delivered: 'Versions are identified by a hash of their content and never edited in place; approval needs a second person; publishing retires the old version in one transaction. Tool access is decided once at the start of a call from grants, version, brand and read-only status. Knowledge answers go through the existing admissions gate. A seed command reads the live Cory assistant and saves a draft without printing its prompt.',
    takeaway: 'Caller speech cannot unlock a tool: 22 prompt-injection attempts granted none, and no published script can be altered.',
    cards: [{ n: '22', k: 'injection attempts, 0 tools granted', color: OK }, { n: '10', k: 'planted bugs, all caught' }, { n: '2', k: 'people needed to approve' }, { n: '11/12', k: 'independent verifier', color: OK }],
    checks: [['A content change always changes the version hash', true], ['Published versions are immutable', true], ['At least 20 injection fixtures grant zero tools', true], ['Seeded on production from the live assistant (waits for Voice Studio to be switched on)', false]],
    diagramTitle: 'From edit to live', mermaid: 'flowchart LR\n  D[Draft] --> A[Approved by a second person]\n  A --> P[Published]\n  P --> R[Retired when replaced]\n  P --> C[Call pins this version]',
    bars: { title: 'Verifier score by attempt (out of 12)', max: 12, rows: [{ label: 'attempt 3', value: 11, color: OK }] },
    sections: [{ h: 'What the reviews changed', p: ['Tool grants and their audit trail moved onto the shared agent tool registry, so voice does not keep a second list of permissions and the existing kill switch covers it.'] }],
    evidence: [['Injection', '22 fixtures, 0 tools granted'], ['Mutations', '10 planted bugs, 10 caught by tests'], ['Database', 'profile store suite 8/8 on Postgres']],
    notEstablished: ['The Cory draft on production: the seed has not been run there.'],
  }),
  'VS3.2': entry({
    code: 'VS3.2', short: 'A finished call is recorded once, and nobody is texted twice',
    title: 'Post-call completion exactly once, and human transfer', docName: 'POST_CALL', status: 'PASS 12/12 (attempt 2), live and switched off', commits: 'commits 77c050c2d, d24229c2c',
    asked: 'Feed every finished call into the existing records and follow-ups exactly once, never count an empty transcript as success, and hand a caller to a person safely.',
    delivered: 'One shared normalizer turns any provider result into a claim on the call record; a replayed or concurrent delivery finds the claim taken. Extraction failures leave the transcript for review and are retried a bounded number of times. Transfer dials only the server-side teammate line in hours, otherwise the caller hears a short message and the call is marked for a callback.',
    takeaway: 'Reading the old webhook found a live defect: a resent completion texted the lead again. It is fixed, and shipped early in its own PR.',
    cards: [{ n: '1', k: 'first delivery out of 20 concurrent', color: OK }, { n: '1', k: 'live defect found and fixed (PR 4413)' }, { n: '10', k: 'planted bugs, all caught' }, { n: '12/12', k: 'independent verifier', color: OK }],
    checks: [['Replayed completion: one record and one of each effect', true], ['Failed extraction leaves the transcript pending review', true], ['No transcript is never counted as success', true], ['Transfer tested for available, unavailable and failed dial', true]],
    diagramTitle: 'One call, one set of effects', mermaid: 'flowchart LR\n  W[Completion, any provider] --> N[Normalizer]\n  N --> C{Claim free?}\n  C -->|yes| E[Record, timeline, extraction]\n  C -->|no| M[Merge latest data only]',
    sections: [{ h: 'Continued in Phase 4', p: ['PR 4430 hardens this path further (post-call and transfer).'] }],
    evidence: [['Concurrency', '20 simultaneous deliveries, exactly one first delivery (Postgres)'], ['Hotfix', 'PR 4413 merged and live 6:54 AM CST on 2026-11-25'], ['Mutations', '10 of 10 caught']],
    notEstablished: ['A real transfer to a teammate: no transfer number is configured.'],
  }),
  'VS3.3': entry({
    code: 'VS3.3', short: 'An admin page that shows only what was really measured',
    title: '/admin/voice-studio shell, Overview and Agents tabs', docName: 'OVERVIEW_AGENTS', status: 'PASS 11/12 (attempt 2), live and switched off', commits: 'commits eede0cb0d, fce037467, 1c96b0a69',
    asked: 'Build the Voice Studio page inside the existing admin, with honest numbers and a controlled way to edit, approve and publish an agent.',
    delivered: 'Overview shows every figure with its window, denominator and whether it was observed, estimated or simulated; missing data reads "no data", never zero. Agents lists each agent and its versions, with a draft editor, validation, a diff against the live version and approve and publish buttons that the server refuses without the right role.',
    takeaway: 'A figure with nothing behind it says so. Nothing on the page can be mistaken for a real result.',
    cards: [{ n: '0', k: 'invented figures', color: OK }, { n: '403', k: 'publish without the role' }, { n: '12/12', k: 'page tests incl. accessibility' }, { n: '11/12', k: 'independent verifier', color: OK }],
    checks: [['Every figure renders its API value and "no data" for null', true], ['Every figure carries its provenance', true], ['Publish without the approval role returns 403', true], ['Existing admin pages unchanged with the switch off', true]],
    diagramTitle: 'Where a figure comes from', mermaid: 'flowchart LR\n  C[Call records] --> K[KPI with denominator and window]\n  K --> O[Observed]\n  K --> E[Estimated]\n  K --> S[Simulated test traffic]',
    sections: [{ h: 'Review history', p: ['Attempt 1 scored 9/12 because seven new files were missing from the repository inventory; regenerated, and a test now asserts the Simulated label.'] }],
    evidence: [['Page tests', '12/12 including axe'], ['API tests', 'console routes 9/9, overview 7/7']],
    notEstablished: [NOT_SEEN],
  }),
  'VS3.4': entry({
    code: 'VS3.4', short: 'Hear voices blind, and see the impact before a route moves',
    title: 'Voice Lab and Numbers & Routing tabs', docName: 'LAB_ROUTING', status: 'PASS 12/12 (attempt 2), live and switched off', commits: 'commits 7ebc8b038, c6dd534d2',
    asked: 'Let an admin compare voices without bias and change routing without surprises, with nothing that buys or ports a number.',
    delivered: 'Blind A/B trials hide which voice is which until scored once. Dry run is the default; a live test needs a second confirming click and can be stopped. A route change must be validated first, shows how many recent calls it would affect, and is refused if anything changed after validating.',
    takeaway: 'No route can move real callers without being validated, its impact shown, and the exact change confirmed.',
    cards: [{ n: '0', k: 'numbers bought or ported' }, { n: '409', k: 'apply without validating' }, { n: '1', k: 'score allowed per blind trial' }, { n: '12/12', k: 'independent verifier', color: OK }],
    checks: [['Blind A/B hides voice identity until scored', true], ['Route change without validate is refused', true], ['Dry run by default; live needs confirmation and can be stopped', true], ['Numbers shown by reference only', true]],
    diagramTitle: 'Changing a route', mermaid: 'flowchart LR\n  E[Edit] --> V[Validate: rules and impact]\n  V --> T[Token for this exact change]\n  T --> A[Apply]\n  E -. any edit .-> X[Token no longer matches]',
    sections: [{ h: 'Extended in Phase 4', p: ['PR 4430 adds an explicit canary audience and refuses a version that belongs to another brand. Not yet deployed.'] }],
    evidence: [['CI', 'green on 7ebc8b038 including the Postgres tier'], ['Database', 'lab store suite 3/3']],
    notEstablished: ['A generated voice preview bought from a provider: none was purchased in testing.', NOT_SEEN],
  }),
  'VS3.5': entry({
    code: 'VS3.5', short: 'Every call can be explained, step by step, without exposing the caller',
    title: 'Call Explorer, Trust Center, Quality & Release, Costs & Operations tabs', docName: 'EVIDENCE_TABS', status: 'PASS 12/12 (attempt 2), live and switched off', commits: 'commits b2e929c35, 172c78028, a38e1e048',
    asked: 'Show what happened on a call and why, what was refused, what it cost and whether quality evidence exists, with exports that respect roles and privacy.',
    delivered: 'Call detail shows status, timing, tools, cost and reconciliation with the provider id masked. The Trust Center timeline labels each event as human, AI, our own service or the carrier, including denied actions. Quality shows no green without recorded evidence. Costs separates measured from estimated. Audit export is full-admin only, redacted, and safe to open in a spreadsheet.',
    takeaway: 'One call\'s data can never appear under another call, and no phone number is ever selected for these screens.',
    cards: [{ n: '0', k: 'phone columns read' }, { n: '4', k: 'tabs' }, { n: '403', k: 'export without full admin' }, { n: '12/12', k: 'independent verifier', color: OK }],
    checks: [['Trust timeline shows a tool event from a mock call end to end', true], ['Export respects role and redaction', true], ['No call\'s data shown under another call', true], ['Null costs read as unpriced, never as zero', true]],
    diagramTitle: 'Who did what', mermaid: 'flowchart LR\n  H[Human] --> T[Timeline]\n  A[AI] --> T\n  S[Our service] --> T\n  C[Carrier] --> T\n  T --> X[Redacted audit export]',
    sections: [{ h: 'Review history', p: ['Attempt 1 found a slow response could paint one call\'s data under another; every tab now ignores answers it no longer asked for, with tests.'] }],
    evidence: [['Database', 'evidence store suite 3/3']],
    notEstablished: ['Per-tenant access on these screens: one operator today; scoped in VS6.1.', NOT_SEEN],
  }),
  'VS3.6': entry({
    code: 'VS3.6', short: 'An inbound call reaches only the brand whose number was called',
    title: 'Inbound on a dedicated test number', docName: 'INBOUND', status: 'PASS 12/12 (attempt 2; race fix re-verified), live and switched off', commits: 'commits include 2007f8edf (race fix)',
    asked: 'Answer inbound calls on the test line only, choosing tenant and brand from the called number alone, with disclosure and a safe fallback.',
    delivered: 'The called number is the only input that chooses an agent; the caller cannot. Anything unknown, off, out of hours or not ready gets a short message or, in hours and if configured, the teammate line. Redelivered webhooks reuse the same call. The caller\'s number is never stored. Existing Cora and Cory numbers are untouched.',
    takeaway: 'Reopened after passing: a concurrent redelivery could fail. 174 of 500 rounds failed before the fix and 0 of 500 after.',
    cards: [{ n: '0/500', k: 'race failures after the fix', color: OK }, { n: '174/500', k: 'before it', color: '#c62828' }, { n: '0', k: 'caller numbers stored' }, { n: '12/12', k: 'independent verifier', color: OK }],
    checks: [['Unknown called number gets the safe fallback', true], ['Never another brand\'s agent', true], ['Concurrent redelivery makes one call', true], ['One real inbound call placed by Ali', false]],
    diagramTitle: 'Who answers', mermaid: 'flowchart LR\n  C[Called number] --> P{Policy on that number}\n  P -->|on and ready| A[Agent with disclosure]\n  P -->|in hours, configured| T[Teammate line]\n  P -->|anything else| M[Short message]',
    bars: { title: 'Race rounds that failed (of 500)', max: 500, rows: [{ label: 'before', value: 174, color: '#c62828' }, { label: 'after', value: 0, color: OK }] },
    sections: [{ h: 'Carried', p: ['Before any non-Colaberry number is given an inbound policy, the teammate fallback must be set per brand.'] }],
    evidence: [['Database', 'inbound suite 6/6 on Postgres'], ['Race', '0 of 500 rounds after, 174 of 500 before (verifier)']],
    notEstablished: ['Pointing a real line at us at the carrier: a separate step the owner approves.'],
  }),
  'VS3.7': entry({
    code: 'VS3.7', short: 'The whole console was driven end to end, and is accessible',
    title: 'End-to-end and accessibility tests for Voice Studio', docName: 'E2E_A11Y', status: 'PASS 11/12 (attempt 2; follow-up 12/12), live and switched off', commits: 'commits 2007f8edf and 675eb33e5',
    asked: 'Drive the real console in a browser against a local stack, check accessibility, and prove existing pages are unchanged with the switch off.',
    delivered: 'Two scripts drive every tab through a real browser and a real local database, refuse to run against anything but a local address, and exit non-zero on failure. Along the way they found and fixed a live test starting on one click, stale figures under the wrong label, phone-width overflow, and one agent\'s versions appearing under another.',
    takeaway: '65 of 65 browser checks and 42 of 42 accessibility checks pass. Nothing was dialed and no speech was bought.',
    cards: [{ n: '65/65', k: 'browser checks', color: OK }, { n: '42/42', k: 'accessibility checks', color: OK }, { n: '2', k: 'exit code for a non-local address' }, { n: '12/12', k: 'follow-up re-grade', color: OK }],
    checks: [['End-to-end script exits 0 on the local stack', true], ['Accessibility: zero serious or critical', true], ['Both refuse a non-local address', true], ['Follow-up: late work never shows under another agent', true]],
    diagramTitle: 'How it was tested', mermaid: 'flowchart LR\n  PG[Local Postgres] --> B[Backend]\n  B --> W[Site]\n  W --> E[Browser script: 65]\n  W --> A[Accessibility script: 42]',
    sections: [{ h: 'Review history', p: ['Attempt 1 scored 9/12 (stale figures). The Agents tab follow-up was graded separately: 9/12, fixed, then 12/12.', 'The plan named a docker stack; this machine has no Docker, so a portable Postgres was used with Ali\'s approval.'] }],
    evidence: [['End to end', 'voiceStudio.e2e.js 65/65, five runs in a row'], ['Accessibility', 'voiceStudio.a11y.js 42/42, twice']],
    notEstablished: ['Contrast of the shared admin frame around the console: reported, not failed, as in the Comms Hub check.', NOT_SEEN],
  }),
};
