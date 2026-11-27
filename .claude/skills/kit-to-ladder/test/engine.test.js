'use strict';
// Run: node --test .claude/skills/kit-to-ladder/test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { target } = require('../scripts/target');
const { pick, parse } = require('../scripts/next_ticket');
const { parseArgs, TAKEAWAY_JS } = require('../scripts/closeout');
const { ticketHtml } = require('../scripts/render_ladder');
const { validate } = require('../scripts/validate_ladder');

test('destination: Ali Personal by default, another project or an existing list on request', () => {
  assert.deepEqual(target({}), { bucket: 7463955, intoList: null, place: 'Ali Personal' });
  assert.deepEqual(target({}, { bucket: '49210714' }), { bucket: 49210714, intoList: null, place: 'project 49210714' });
  assert.equal(target({ bucket: 49210714, place: 'Colaberry Live' }).place, 'Colaberry Live');
  assert.equal(target({}, { intoList: '10411595891' }).intoList, 10411595891);
  for (const bad of ['abc', '1; rm -rf', '12', '../7463955']) assert.throws(() => target({}, { bucket: bad }), /Basecamp id/);
});

const spec = { list: { name: 'Test list' }, repoName: 'repo', contract: { title: 'Contract', short: 'Contract', rules: ['r'] }, closeOut: ['c'] };
const links = { contract: 'https://x/c', folder: 'https://x/f' };
const todo = (t, extra) => ({ id: Math.floor(Math.random() * 1e9), title: `${t.id} ${t.kind === 'human' ? '🧑 [Human]' : '🤖 [AI]'} ${t.title}`,
  description: ticketHtml(spec, t, links), due_on: t.due, completed: false, ...extra });
const ai = (id, due, blockedBy = []) => ({ id, kind: 'ai', title: 'do ' + id, due, blockedBy, what: 'w', why: 'y' });

test('the next ticket reads the same "Blocked by" the renderer writes', () => {
  const p = parse(todo(ai('VS1.2', '2026-12-01', ['VS1.1', 'VS0.2'])), 0);
  assert.deepEqual([p.code, p.kind, p.blockedBy], ['VS1.2', 'ai', ['VS1.1', 'VS0.2']]);
  assert.deepEqual(parse(todo(ai('VS0.1', '2026-12-01')), 0).blockedBy, []);
  assert.equal(parse(todo({ id: 'M1', kind: 'human', title: 'Approve', due: '2026-12-01', questions: [{ q: 'Q', options: ['a', 'b'], default: 'a' }] }), 0).kind, 'human');
});

test('next: earliest ready AI ticket; milestones never block the work around them; done when empty', () => {
  const T = (code, due, blockedBy, x) => ({ code, due, blockedBy, kind: 'ai', completed: false, position: 0, ...x });
  let r = pick([T('A0.1', '2026-12-01', [], { completed: true }), T('A1.2', '2026-12-03', ['A0.1']), T('A1.1', '2026-12-02', ['A0.1']), T('A1.3', '2026-12-01', ['A1.1'])]);
  assert.equal(r.next.code, 'A1.1'); assert.deepEqual(r.blocked, ['A1.3']); // A1.3 is due earliest but waits on A1.1
  r = pick([T('M0', '2026-12-01', [], { kind: 'human' }), T('A1.1', '2026-12-05', [])]);
  assert.equal(r.next.code, 'A1.1'); assert.deepEqual(r.waitingOnAli, ['M0']);
  r = pick([T('A1.1', '2026-12-02', [], { position: 2 }), T('A1.2', '2026-12-02', [], { position: 1 })]);
  assert.equal(r.next.code, 'A1.2'); // same date: list order
  r = pick([T('A1.1', '2026-12-02', [], { completed: true })]);
  assert.equal(r.done, true); assert.equal(r.next, null);
  // A standing ticket (session log) closes last, even when it is the only ready one.
  const st = T('A0.3', '2026-12-01', [], { title: 'A0.3 🤖 [AI] Standing: session log' });
  r = pick([st, T('A1.1', '2026-12-05', ['M1']), T('M1', '2026-12-01', [], { kind: 'human' })]);
  assert.equal(r.next, null); assert.deepEqual(r.waitingOnAli, ['M1']);
  r = pick([st, T('A1.1', '2026-12-05', [], { completed: true })]); assert.equal(r.next.code, 'A0.3');
  r = pick([T('A2.1', '2026-12-02', ['M1']), T('M1', '2026-12-01', [], { kind: 'human' })]);
  assert.equal(r.next, null); assert.deepEqual(r.waitingOnAli, ['M1']); assert.equal(r.done, false); // only Ali can move it
});

test('close-out refuses anything it cannot check', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'k2l-')), v = path.join(d, 'v.html'), doc = path.join(d, 'd.html');
  fs.writeFileSync(v, '<p>v</p>'); fs.writeFileSync(doc, '<p>d</p>');
  const ok = ['--code', 'VS1.3', '--list', '10542482938', '--vault', '123456', '--artifacts', '03 - Ticket artifacts', '--visual', v, '--doc', doc, '--takeaway', 'Gateway live and tested'];
  assert.equal(parseArgs(ok).code, 'VS1.3'); assert.equal(parseArgs([...ok, '--dry']).dry, true); assert.equal(parseArgs(ok).bucket, '7463955');
  const swap = (k, v2) => { const a = [...ok]; a[a.indexOf(k) + 1] = v2; return a; };
  assert.throws(() => parseArgs(swap('--code', 'vs1.3; rm')), /code/);
  assert.throws(() => parseArgs(swap('--list', 'x')), /list/);
  assert.throws(() => parseArgs(swap('--visual', path.join(d, 'nope.html'))), /visual/);
  assert.throws(() => parseArgs(swap('--doc', v)), /two different pages/);
  assert.throws(() => parseArgs(swap('--doc', path.join(d, 'x.md'))), /doc/); // "Artifacts should not be .md files"
  assert.throws(() => parseArgs(swap('--takeaway', 'ok')), /takeaway/);
  assert.throws(() => parseArgs(swap('--artifacts', 'a"b')), /artifacts/);
});

test('the TAKEAWAY step escapes text, checks identity, and is idempotent by a marker', () => {
  assert.match(TAKEAWAY_JS, /me\.id !== 17454835/);
  assert.match(TAKEAWAY_JS, /\[closeout:/);
  assert.match(TAKEAWAY_JS, /esc\(S\.takeaway\)/);
  assert.doesNotThrow(() => new Function(TAKEAWAY_JS.replace(/require\([^)]*\)/g, '({})')));
});

test('the first ladder built with this engine still validates', () => {
  const ex = require('../examples/career-prep-v27.js');
  const r = validate({ ...ex, subfolders: [] });
  assert.deepEqual(r.problems, []);
});
