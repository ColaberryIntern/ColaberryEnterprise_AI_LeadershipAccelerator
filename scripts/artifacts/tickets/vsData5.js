/**
 * Voice AI Studio ticket artifact data, Phase 5 (VS5.1, VS5.3). Same rules as vsData.js.
 * Scores and counts come from the independent verifier reports and the session log of 2026-11-25.
 */
const SESSION = 'CC-20261124-2ptc';
const OK = '#2e7d32';

const DECISION = 'At M4: how long imported call history is kept (recommended 90 days), and a decision per assistant and per number in the migration matrix.';
const SHIPPED = 'PR 4447 merged 6:07 PM CST, deployed 6:18 PM CST on 2026-11-25 (main b83dba3bf); independent production verifier PASS on cycle 2; every voice switch off; nothing imported; 0 calls placed.';
const SHIP_ROWS = [
  ['Merge', 'PR 4447, merge 3ef185b04, all CI checks passed on the merged commit'],
  ['Deploy', 'deploy-prod.sh backend nginx, exit 0, host HEAD b83dba3bf, running image equals the registry tag'],
  ['Production check', 'cycle 1 failed only the written rollback steps; corrected; cycle 2 PASS'],
];
const NOT_MOVED = 'Anything moved off Synthflow: no assistant, number or route has changed. That starts after the M4 decisions.';

function entry(e) {
  return { date: '2026-11-25', session: SESSION, decision: DECISION, ladder: ['done', 'done', 'done', 'active', 'active', 'todo'], evidenceLine: `${e.commits}; ${SHIPPED}`, ...e, evidence: [...e.evidence, ...SHIP_ROWS], notEstablished: [...e.notEstablished, NOT_MOVED] };
}

module.exports = {
  'VS5.1': entry({
    code: 'VS5.1', short: 'Every Synthflow assistant is listed, checked against the vendor, and its settings kept privately',
    title: 'Synthflow inventory and migration matrix', docName: 'MIGRATION_INVENTORY', status: 'PASS 11/12 (attempt 2), live', commits: 'commits b91c05963, a6d3e437f, b488db69e',
    asked: 'List every assistant, number, action, knowledge base and setting the migration has to rebuild, from the vendor itself, with credentials redacted, and say what the API cannot show.',
    delivered: 'voice:migration:report checks the matrix document against the vendor API (GET only) and fails when they differ. With --capture it writes the full settings to one private file outside the repository: prompts, first messages, voices, timeouts, knowledge base mapping, actions and extraction, with credentials, links, numbers and emails removed. A coverage list ties every item to a captured field or a numbered manual step, and a test keeps the two in step.',
    takeaway: 'The matrix and the vendor agree on all 14 assistants. What the API cannot show is a 7-step manual checklist.',
    cards: [{ n: '14', k: 'assistants, matrix equals vendor', color: OK }, { n: '44 of 45', k: 'actions listed; the last is a manual step' }, { n: '0', k: 'credentials, numbers or emails in the capture', color: OK }, { n: '11/12', k: 'independent verifier', color: OK }],
    checks: [['Every assistant has a matrix row with an owner', true], ['Every needed item captured or on the checklist', true], ['Capture refused inside the repository', true], ['Per-assistant decisions made (M4)', false]],
    diagramTitle: 'Where each fact comes from', mermaid: 'flowchart LR\n  V[Vendor API, GET only] --> C[Private capture, redacted]\n  V --> R[Report: matrix vs vendor]\n  M[Matrix document] --> R\n  D[Dashboard only] --> K[7-step manual checklist]',
    sections: [{ h: 'Review history', p: ['Attempt 1 scored 10/12: the capture missed some settings and some matrix wording went beyond the evidence. Both fixed; the wording now says what is unverified.'] }, { h: 'Vendor behavior found', p: ['The offset is rounded to a multiple of the page size, a page past the end has no total, and one action is declared but never listed. The first live run refused rather than guess; all three are now in the tests.'] }],
    evidence: [['Unit tests', 'migration suites, 88 tests passing at attempt 2'], ['Live run', 'read-only from the production container: 14 assistants, 14 rows'], ['Redaction', 'checked by the verifier on the private file: no number, email, key or token']],
    notEstablished: ['The one unlisted action: found by hand at checklist step 3.'],
  }),
  'VS5.3': entry({
    code: 'VS5.3', short: 'Call history can be exported, imported without overwriting, checked and undone',
    title: 'Call history export, import and reconciliation', docName: 'HISTORY_IMPORT', status: 'PASS 12/12 (attempt 3), live, nothing imported', commits: 'commits b488db69e, 485604b55, dd0cc777f',
    asked: 'Export the history, import it explicitly without overwriting, with counts, hashes and an error list, keep the old provider ids searchable, and make a batch removable.',
    delivered: 'voice:history exports call metadata only (GET, no transcripts, recordings, names or numbers), counting every date window and every total so nothing can go missing silently. The import writes to a separate table, never overwrites, reports a conflict when a stored call differs, and needs the retention period before it will write. Verify compares the database with the export; rollback removes one batch; purge removes rows past their deadline; an old call is found by its id from the command line or the admin console.',
    takeaway: 'A rehearsal exported 3,096 of 3,096 calls from three assistants with no error. Nothing is imported until the retention period is set.',
    cards: [{ n: '3,096 / 3,096', k: 'calls in the rehearsal export', color: OK }, { n: '0', k: 'rows imported (waits for M4)' }, { n: '13', k: 'tests on real Postgres', color: OK }, { n: '12/12', k: 'independent verifier', color: OK }],
    checks: [['Imported equals exported minus listed errors', true], ['Re-import changes nothing', true], ['Rollback removes one batch only', true], ['Retention period set (M4)', false]],
    diagramTitle: 'One import', mermaid: 'flowchart LR\n  E[Export: counted windows] --> P[Parse: refuse extra fields]\n  P --> I[Insert, never overwrite]\n  I --> C{Same as stored?}\n  C -->|yes| OK[Already there]\n  C -->|no| X[Listed conflict]',
    sections: [{ h: 'Review history', p: ['Attempt 1 scored 9/12: removing a tenant check or the count check broke no test. Attempt 2 scored 9/12: a test claimed in the log did not exist. Attempt 3 added it, and each check was proven by removing it and watching a test fail.'] }],
    evidence: [['Integration', 'history.integration on Postgres, 13 passing'], ['Mutations', 'tenant scope, date scope, count check, overwrite and batch scope: all caught'], ['Rehearsal', 'export of three assistants from the production container, 0 errors']],
    notEstablished: ['Transcripts and recordings: not exported; whether to keep them is a policy decision (checklist step 4).'],
  }),
};
