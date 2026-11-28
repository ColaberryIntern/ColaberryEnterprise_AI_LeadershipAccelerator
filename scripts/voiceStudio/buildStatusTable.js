#!/usr/bin/env node
/**
 * Voice AI Studio (VS0.3): rebuild the ticket table in docs/voice-studio/STATUS.md. Writes that one file only.
 *
 *   node scripts/voiceStudio/buildStatusTable.js <links.json> <state-ledger.json> <plan.md>
 *
 * links.json comes from statusLinks.py (Basecamp, read only); the ledger and plan come from the loop run.
 * Nothing in a row is typed by hand:
 *   - a ticket closed in Basecamp is PASS, with the score the ledger recorded and a link to its evidence comment;
 *   - an open ticket shows the ledger's own status word, and what it waits on: the plan's dependencies
 *     that are not done yet (a milestone not closed in Basecamp, or a task not passed in the ledger).
 * It refuses when the sources disagree: a ticket closed in Basecamp but not passed in the ledger, or passed
 * with no evidence comment. Idempotent: the same inputs give the same file.
 */
const fs = require('fs');
const path = require('path');

const WORD = { pending: 'NOT_STARTED', in_progress: 'IN_PROGRESS', blocked: 'BLOCKED', failed: 'FAIL' };

/** T-id -> { ticket, deps: [T-ids and M-ids] } from the plan. */
function readPlan(md) {
  const out = new Map();
  for (const block of md.split(/\n(?=## T\d+ = )/)) {
    const h = /^## (T\d+) = (VS\d+\.\d+)/.exec(block);
    if (!h) continue;
    const d = /- Depends on: ([^\n]*)/.exec(block);
    out.set(h[1], { ticket: h[2], deps: d ? d[1].split(',').map((x) => x.trim()).filter((x) => /^(T\d+|M\d)$/.test(x)) : [] });
  }
  return out;
}

function buildRows(links, ledger, plan) {
  const task = new Map(ledger.tasks.map((t) => [t.ticket, t]));
  const ticketOf = new Map([...plan].map(([id, p]) => [id, p.ticket]));
  const planOf = new Map([...plan.values()].map((p) => [p.ticket, p]));
  const done = (dep) => (/^M\d$/.test(dep) ? Boolean(links[dep] && links[dep].completed) : (task.get(ticketOf.get(dep)) || {}).status === 'passed');
  const codes = Object.keys(links).filter((c) => /^VS/.test(c)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return codes.map((c) => {
    const b = links[c];
    const t = task.get(c);
    if (!t) throw new Error(`${c} is in Basecamp but not in the ledger`);
    if (b.completed && t.status !== 'passed') throw new Error(`${c} is closed in Basecamp but ${t.status} in the ledger`);
    if (t.status === 'passed' && !b.evidence) throw new Error(`${c} passed with no evidence comment`);
    if (b.completed) {
      const out = c === 'VS0.2' ? 'plan audit' : 'verifier';
      const score = t.verifier_score ? ` (${out} ${t.verifier_score}/${c === 'VS0.2' ? 20 : 12})` : '';
      return `| ${c} | PASS${score} | ${b.evidence} |`;
    }
    const open = ((planOf.get(c) || {}).deps || []).filter((d) => !done(d)).map((d) => (/^M/.test(d) ? d : ticketOf.get(d) || d));
    const word = WORD[t.status] || (t.status === 'passed' ? 'PASS (not closed)' : t.status.toUpperCase());
    return `| ${c} | ${word}${open.length ? `: waits on ${open.join(', ')}` : ''} | - |`;
  });
}

function render(statusMd, rows) {
  const table = ['## Tickets', '', 'One row per ticket, rebuilt by scripts/voiceStudio/buildStatusTable.js from Basecamp and the run ledger. A passed ticket links to the Basecamp comment that carries its evidence; `npm run voice:status-check -- --ledger <state-ledger.json>` fails if one does not.', '', '| Ticket | Status | Evidence comment |', '|---|---|---|', ...rows, ''].join('\n');
  const head = statusMd.replace(/\r\n/g, '\n').replace(/\n## Tickets\n[\s\S]*$/, '\n').trimEnd();
  return `${head}\n\n${table}`;
}

module.exports = { readPlan, buildRows, render };

if (require.main === module) {
  const [linksPath, ledgerPath, planPath] = process.argv.slice(2);
  if (!linksPath || !ledgerPath || !planPath) { console.error('usage: buildStatusTable.js <links.json> <state-ledger.json> <plan.md>'); process.exit(2); }
  const read = (p) => fs.readFileSync(p, 'utf8');
  const target = path.resolve(__dirname, '../../docs/voice-studio/STATUS.md');
  const rows = buildRows(JSON.parse(read(linksPath)), JSON.parse(read(ledgerPath)), readPlan(read(planPath)));
  fs.writeFileSync(target, render(read(target), rows));
  console.log(`${rows.length} rows, ${rows.filter((r) => r.includes('| PASS')).length} passed`);
}
