// node --test scripts/voiceStudio/__tests__/buildStatusTable.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { readPlan, buildRows, render } = require('../buildStatusTable');

const PLAN = [
  '## T001 = VS1.1: one', '- Depends on: none', '',
  '## T002 = VS1.2: two', '- Depends on: T001, M2', '',
  '## T003 = VS1.3: three', '- Depends on: T002, M1', '',
].join('\n');
const URL = (n) => `https://app.basecamp.com/1/buckets/2/todos/${n}#__recording_${n}0`;
const links = (p = {}) => ({ M1: { completed: true }, M2: { completed: false }, 'VS1.1': { completed: true, evidence: URL(1) }, 'VS1.2': { completed: false, evidence: null }, 'VS1.3': { completed: false, evidence: null }, ...p });
const ledger = (p = {}) => ({ tasks: [{ ticket: 'VS1.1', status: 'passed', verifier_score: 11 }, { ticket: 'VS1.2', status: 'blocked' }, { ticket: 'VS1.3', status: 'pending' }, ...(p.extra || [])].map((t) => ({ ...t, ...(p[t.ticket] || {}) })) });
const rows = (l = links(), g = ledger()) => buildRows(l, g, readPlan(PLAN));

test('reads the dependencies, tasks and milestones only', () => {
  assert.deepEqual([...readPlan(PLAN)].map(([id, p]) => [id, p.ticket, p.deps]), [['T001', 'VS1.1', []], ['T002', 'VS1.2', ['T001', 'M2']], ['T003', 'VS1.3', ['T002', 'M1']]]);
});

test('a closed ticket is PASS with its score and evidence; an open one says what it waits on', () => {
  assert.deepEqual(rows(), [
    `| VS1.1 | PASS (verifier 11/12) | ${URL(1)} |`,
    '| VS1.2 | BLOCKED: waits on M2 | - |', // T001 passed, M2 not closed
    '| VS1.3 | NOT_STARTED: waits on VS1.2 | - |', // M1 closed
  ]);
});

test('the plan audit is scored out of 20', () => {
  const r = buildRows({ 'VS0.2': { completed: true, evidence: URL(2) } }, { tasks: [{ ticket: 'VS0.2', status: 'passed', verifier_score: 18 }] }, new Map());
  assert.equal(r[0], `| VS0.2 | PASS (plan audit 18/20) | ${URL(2)} |`);
});

test('refuses when the sources disagree', () => {
  assert.throws(() => rows(links({ 'VS1.2': { completed: true, evidence: URL(3) } })), /closed in Basecamp but blocked/);
  assert.throws(() => rows(links({ 'VS1.1': { completed: true, evidence: null } })), /no evidence comment/);
  assert.throws(() => rows(links({ 'VS9.9': { completed: false } })), /not in the ledger/);
});

test('render replaces the table and keeps the rest; twice is the same', () => {
  const once = render('# Status\n\nReadiness: x\n', rows());
  assert.equal(render(once, rows()), once);
  assert.match(once, /^# Status\n\nReadiness: x\n\n## Tickets\n/);
  assert.equal(once.split('## Tickets').length, 2);
});
