/**
 * Voice AI Studio ticket artifact data, Phase 4 (VS4.1, VS4.2, VS4.3, VS4.5). Same rules as vsData.js.
 * Scores and counts come from the independent verifier reports and the session log of 2026-11-25.
 */
const SESSION = 'CC-20261124-2ptc';
const OK = '#2e7d32';

const DECISION = 'None for this ticket. Next for Voice Studio: save the two provider keys and pick a 15-minute call window (Central) for the live test calls.';
const SHIPPED = 'PR 4430 merged 3:59 PM CST, deployed 4:08 PM CST on 2026-11-25 (main 22a427a6c); independent production verifier PASS; every voice switch off; 0 calls placed.';
const SHIP_ROWS = [
  ['Merge', 'PR 4430, merge 570ee103e, all 10 CI checks passed on the merged commit'],
  ['Deploy', 'deploy-prod.sh backend nginx, exit 0, host HEAD 22a427a6c, running images equal the registry tags'],
  ['Production check', 'PASS on the first cycle (switched-off release; live calls out of scope)'],
];
const NOT_LIVE = 'Anything about a real phone call: the live calls are still open (keys and a call window).';

function entry(e) {
  return { date: '2026-11-25', session: SESSION, decision: DECISION, ladder: ['done', 'done', 'active', 'active', 'todo', 'todo'], evidenceLine: `${e.commits}; ${SHIPPED}`, ...e, evidence: [...e.evidence, ...SHIP_ROWS], notEstablished: [...e.notEstablished, NOT_LIVE] };
}

module.exports = {
  'VS4.1': entry({
    code: 'VS4.1', short: 'Load testing found two bugs that would have broken live calls',
    title: 'Load, soak and chaos on synthetic calls', docName: 'LOAD_CHAOS', status: 'PASS 11/12 (attempt 1), live and switched off', commits: 'commit 7eb2908b2',
    asked: 'Push the real engines with synthetic callers, break things on purpose, and set capacity from measurement, with no provider involved.',
    delivered: 'A harness drives the real upgrade handler, signature check, engines, session worker and tools over loopback sockets, with stand-ins only for the AI providers and two database lookups. It runs load steps, a memory soak and 13 chaos scenarios.',
    takeaway: 'It caught calls being dropped when the caller spoke during setup, and connections left open when they hung up during it. Both are fixed and live.',
    cards: [{ n: '100', k: 'synthetic calls at once, 100% completed', color: OK }, { n: '0', k: 'leaked sessions, sockets or connections', color: OK }, { n: '2', k: 'real bugs found and fixed' }, { n: '11/12', k: 'independent verifier', color: OK }],
    checks: [['Zero leaked sessions', true], ['Memory bounded at 20 concurrent', true], ['At least 99% of synthetic calls complete', true], ['Capacity set from measurement: 100 measured, 50 planned', true]],
    diagramTitle: 'The drop it found', mermaid: 'flowchart LR\n  R[Call connects] --> K[Reference being checked]\n  A[Caller audio arrives] --> K\n  K -->|before| X[Call ended]\n  K -->|now| Q[Audio kept, call goes on]',
    sections: [{ h: 'What capacity means here', p: ['Measured on one development machine with the callers in the same process. Providers, TLS and the database are not included. Each agent is still limited to 3 calls at once by default.'] }],
    evidence: [['Harness', 'npm run voice:load -- --mock exit 0 on repeated runs; without --mock exit 2'], ['Old code', 'the new tests fail on the previous engines'], ['Latency added', 'p95 under 4 ms at 100 concurrent']],
    notEstablished: ['Capacity on the production server.'],
  }),
  'VS4.2': entry({
    code: 'VS4.2', short: 'Independent security review, its findings fixed, and call retention',
    title: 'Security review and retention', docName: 'SECURITY_RETENTION', status: 'PASS 11/12 (attempt 2), live and switched off', commits: 'commits 751fd2ed7 through 8377775e1, hotfix PR 4431',
    asked: 'Review the voice code for security before any live call, fix what matters, and build retention that deletes safely.',
    delivered: 'An unanchored reviewer read the voice code. One finding affected production at once and was fixed the same day in its own PR (4431). The rest were fixed here: webhook, transfers, inbound, tools, disclosure, sockets, opt-outs and test-call permissions. Retention is a dry run by default, deletes only calls past their own deadline, removes copies of the conversation, and leaves an audit row.',
    takeaway: 'No way was found for an outsider to dial an arbitrary number. Opt-outs heard on an Engine A call are saved and retried until recorded.',
    cards: [{ n: '1', k: 'production issue, fixed the same day' }, { n: '8/8', k: 'retention tests on Postgres', color: OK }, { n: '9', k: 'controls removed in test, all caught' }, { n: '11/12', k: 'independent verifier', color: OK }],
    checks: [['Critical security tests pass', true], ['Retention dry run lists exactly the expired fixtures', true], ['Delete removes every copy and is audited', true], ['Retention period chosen (owner decision)', false]],
    diagramTitle: 'Retention', mermaid: 'flowchart LR\n  D[Deadline passed] --> E{Ended, no recording, opt-out recorded?}\n  E -->|yes| X[Delete call and copies]\n  X --> A[Audit row: counts only]\n  E -->|no| K[Kept and reported]',
    sections: [{ h: 'Review history', p: ['Attempt 1 scored 8/12: one control did not hold on the stored record, and the disclosure and opt-out wording was too loose. Fixed, with the reviewer\'s examples as tests.'] }, { h: 'Outside this ticket', p: ['The dependency scan found known vulnerabilities across the whole backend, none added by this work. Recommended as a separate change.'] }],
    evidence: [['Attempt 2', '1005 unit tests, 12 voice integration suites, all passing'], ['Hotfix', 'PR 4431 live 12:55 PM CST, production verifier PASS'], ['Scans', 'secret scan and static security scan on every push']],
    notEstablished: ['Any call has a retention deadline: none is set until a period is chosen.', 'Opt-outs on Engine B: it has no transcript, so it is limited to test calls.'],
  }),
  'VS4.3': entry({
    code: 'VS4.3', short: 'If a provider fails or a call goes wrong, we are told, with a runbook',
    title: 'Observability, alerts, circuit breakers and runbook', docName: 'OPS_RUNBOOK', status: 'PASS 11/12 (attempt 2), live and switched off', commits: 'commits 2ca7d8bf6, a24a30998, 218c34a47, 20e406242',
    asked: 'Measure the voice system, stop calling a failing provider, raise the right alerts through the existing alert service, and write a runbook whose every incident is drilled.',
    delivered: 'A circuit breaker per provider (Claude, OpenAI, Twilio), rolling metrics, 18 alert rules, correlation ids on voice log lines, and a runbook with one section per alert. A test fails if an alert has no section, a section has no alert, or a drill does not raise it.',
    takeaway: 'Attempt 1 failed because some alerts could never fire on real data. They now rest on what the code really writes, and drills run the real writers.',
    cards: [{ n: '18', k: 'alerts, each with a drill', color: OK }, { n: '3', k: 'provider circuits' }, { n: '12', k: 'planted breaks, all caught' }, { n: '11/12', k: 'independent verifier', color: OK }],
    checks: [['Every runbook incident has a drill that raises its alert', true], ['Breaker open, half-open and close', true], ['Alerts use the existing alert service', true], ['Engine B answer latency measured', false]],
    diagramTitle: 'A failing provider', mermaid: 'flowchart LR\n  C[Closed] -->|half of 5 fail| O[Open: stop calling]\n  O -->|60 s| H[One probe]\n  H -->|works twice| C\n  H -->|fails| O',
    sections: [{ h: 'What waits for live routes', p: ['Four alerts leave test calls out, so they start working with the first live route. The spend alert uses a deliberate over-estimate until usage is recorded.'] }],
    evidence: [['Drills', 'real reconciler, carrier events and session worker, on Postgres'], ['Mutations', 'eight from the reviewer and four more, all caught'], ['Runbook', 'docs/voice-studio/RUNBOOK.md']],
    notEstablished: ['An alert raised in production: the sweep does nothing while voice is off.'],
  }),
  'VS4.5': entry({
    code: 'VS4.5', short: 'One provider per call, and a rollback rehearsed in under a second',
    title: 'Pilot plumbing: canary, sticky allocation, rollback, reconciliation', docName: 'ROLLOUT_ROLLBACK', status: 'PASS 11/12 (attempt 3), live, connected to nothing', commits: 'commits 0eb96b4da, 734d14ef0, eb0eb5b79, 008d56296',
    asked: 'Move calls gradually and safely: the same person always on the same side, exactly one provider per call, a rehearsed rollback, and a way to settle uncertain calls.',
    delivered: 'A deterministic allocator with an explicit audience; a durable claim per call covering both the old and the new provider; the whole rule checked again right before dialing; route rollback and reconcile commands that are dry by default; calls pinned to the version they were dialed on.',
    takeaway: 'In a rehearsal, every new call was back on Synthflow in under one second and the live call was untouched. Nothing real is connected: that is the M3 decision.',
    cards: [{ n: '0.63 s', k: 'rollback to first legacy call (verifier run)', color: OK }, { n: '27/27', k: 'rollout tests on Postgres', color: OK }, { n: '0', k: 'double dials in the verifier\'s race probes', color: OK }, { n: '11/12', k: 'independent verifier', color: OK }],
    checks: [['Rollback drill within 60 s, with timestamps', true], ['Same person always on the same provider', true], ['Exactly one provider per call; unknown never redialed', true], ['Canary connected to a real route (M3)', false]],
    diagramTitle: 'One owner per call', mermaid: 'flowchart LR\n  A[Allocate] --> C[Claim: one owner]\n  C --> K{Still allowed right before dialing?}\n  K -->|yes| D[Dial once]\n  K -->|no| N[No dial, all released]',
    bars: { title: 'Verifier score by attempt (out of 12)', max: 12, rows: [{ label: 'attempt 1', value: 9, color: '#c62828' }, { label: 'attempt 2', value: 10, color: '#b26a00' }, { label: 'attempt 3', value: 11, color: OK }] },
    sections: [{ h: 'Before any route is connected', p: ['A retention path for claims, and every old-provider call on that route must go through the allocator with one key per call.'] }, { h: 'Deviations', p: ['Ships before VS4.4, which needs live calls. The drill used a local Postgres instead of docker compose and was not run on production.'] }],
    evidence: [['Drill', 'docs/voice-studio/ROLLBACK_DRILL.md'], ['Production', '0 allocations, 0 reservations, 0 calls; the allocator has no runtime caller']],
    notEstablished: ['A rollback on production.'],
  }),
};
