#!/usr/bin/env node
/**
 * Which ticket comes next on a ladder list. The loop runs this after every close, so it keeps
 * working ticket after ticket instead of stopping and waiting to be told (Ali, 2026-11-25: "proceed
 * and don't stop until you reach a milestone").
 *
 * The rule, in order:
 *   1. only open tickets whose "Blocked by" tickets are all closed;
 *   2. earliest due date first, then list order;
 *   3. a "Standing" ticket (session log, STATUS.md: XX0.3) is kept up as the run goes and closes LAST,
 *      so it is next only when it is the last open AI ticket;
 *   4. a 🧑 Human milestone ticket is never "next to build": it is reported under `waitingOnAli`,
 *      and the AI tickets that do not depend on it keep going (its defaults apply automatically).
 * Answers: { next, open, closed, waitingOnAli, blocked, done } where `done` means nothing is left.
 *
 * Read only. Runs locally; the Basecamp read happens inside the production backend container,
 * which holds the live token (nothing is printed but the answer).
 *
 * Usage: node next_ticket.js --list <todolistId> [--bucket 7463955]
 */
'use strict';
const { spawn } = require('child_process');

/** tickets: [{ id, code, title, kind, due, position, completed, blockedBy:[codes] }] -> the answer. Pure. */
function pick(tickets) {
  const closed = new Set(tickets.filter((t) => t.completed).map((t) => t.code));
  const open = tickets.filter((t) => !t.completed);
  const ready = open.filter((t) => t.blockedBy.every((b) => closed.has(b)));
  const order = (a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || a.position - b.position;
  const standing = (t) => /(^|\s)Standing:/i.test(t.title || '');
  const openAi = open.filter((t) => t.kind === 'ai');
  const ai = ready.filter((t) => t.kind === 'ai' && (!standing(t) || openAi.every(standing))).sort(order);
  return {
    next: ai[0] || null,
    open: open.length,
    closed: closed.size,
    waitingOnAli: ready.filter((t) => t.kind === 'human').sort(order).map((t) => t.code),
    blocked: open.filter((t) => !ready.includes(t)).map((t) => t.code),
    done: open.length === 0,
  };
}

/** A Basecamp to-do -> the fields pick() needs. The ladder renderer writes "Blocked by: <strong>X, Y</strong>". */
function parse(todo, position) {
  const m = String(todo.title || todo.content || '').match(/^(\S+)\s+(🧑|🤖)?/u);
  const b = String(todo.description || '').match(/Blocked by:\s*<strong>([^<]*)<\/strong>/);
  const blockedBy = b && !/^\s*nothing\s*$/i.test(b[1]) ? b[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  return { id: todo.id, code: m ? m[1] : String(todo.id), title: String(todo.title || todo.content || ''), kind: m && m[2] === '🧑' ? 'human' : 'ai',
    due: todo.due_on, position, completed: !!todo.completed, blockedBy, url: todo.app_url };
}

// Runs inside the container: lists every group's open and closed to-dos, in list order.
const REMOTE = (bucket, list) => `
const { refreshBcToken } = require('/app/dist/services/ops/basecampToken');
(async () => {
  const H = { Authorization: 'Bearer ' + await refreshBcToken(), 'User-Agent': 'Colaberry AI Ops' };
  const get = async (p) => { const r = await fetch('https://3.basecampapi.com/3945211' + p, { headers: H, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(r.status + ' ' + p); return r.json(); };
  const all = async (p) => { const out = []; for (let i = 1; i < 40; i++) { const j = await get(p + (p.includes('?') ? '&' : '?') + 'page=' + i); out.push(...j); if (j.length < 15) break; } return out; };
  const groups = await all('/buckets/${bucket}/todolists/${list}/groups.json');
  const out = [];
  for (const g of [{ id: ${list} }, ...groups]) for (const q of ['', '?completed=true'])
    for (const t of await all('/buckets/${bucket}/todolists/' + g.id + '/todos.json' + q))
      out.push({ id: t.id, title: t.title || t.content, description: t.description, due_on: t.due_on, completed: t.completed, app_url: t.app_url, position: t.position, group: g.id });
  process.stdout.write('\\nTBJSON ' + JSON.stringify(out) + '\\n', () => process.exit(0));
})().catch((e) => { process.stdout.write('\\nTBJSON ' + JSON.stringify({ error: String(e.message) }) + '\\n', () => process.exit(1)); });`;

function remote(host, container, script, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const p = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', host, 'docker', 'exec', '-i', container, 'node', '-'], { windowsHide: true });
    let out = '';
    const kill = setTimeout(() => { p.kill(); reject(new Error('timed out reading Basecamp')); }, timeoutMs);
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', (e) => { clearTimeout(kill); reject(e); });
    p.on('close', () => {
      clearTimeout(kill);
      const i = out.lastIndexOf('TBJSON ');
      if (i < 0) return reject(new Error('no answer from Basecamp'));
      resolve(JSON.parse(out.slice(i + 7).split('\n')[0]));
    });
    p.stdin.end(script);
  });
}

async function main() {
  const args = process.argv.slice(2), opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
  const list = opt('--list'), bucket = opt('--bucket', '7463955');
  if (!/^\d+$/.test(list || '') || !/^\d+$/.test(bucket)) { console.error('usage: node next_ticket.js --list <id> [--bucket <id>]'); process.exit(2); }
  const raw = await remote(process.env.PROD_SSH || 'root@95.216.199.47', process.env.PROD_CONTAINER || 'accelerator-backend', REMOTE(bucket, list));
  if (raw.error) throw new Error(raw.error);
  // Dedupe (a to-do can appear in two listings) and keep list order.
  const seen = new Set(), todos = raw.filter((t) => !seen.has(t.id) && seen.add(t.id));
  const r = pick(todos.map((t, i) => parse(t, i)));
  console.log(JSON.stringify(r.next ? { ...r, next: { code: r.next.code, title: r.next.title, due: r.next.due, url: r.next.url } } : r, null, 1));
}

if (require.main === module) main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
module.exports = { pick, parse };
