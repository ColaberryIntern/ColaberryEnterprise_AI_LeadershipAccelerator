/**
 * Close one or more Basecamp to-dos, with a stated reason, and PROVE each one closed.
 *
 * Runs ON THE PROD BACKEND, because that is where a live Basecamp token can be minted:
 *   SPEC=/tmp/afclose/close.json node /tmp/afclose/closeTicket.js
 *
 * ## Why this is a script and not a click
 *
 * Closing is the last step of the artifact rule -- the two PDFs go on the ticket, a human reads
 * them, and only then does it close. Doing that by hand across a dozen tickets is where the wrong
 * one gets closed: a nine-digit id is not checkable against anything by eye. So a close is named
 * by its AF CODE, which IS checkable against the list, and the id in the spec must agree with the
 * code or nothing happens. The same guard in `attachArtifactToTicket` exists because a backfill
 * once carried six ids written from memory and all six were wrong.
 *
 * ## What it refuses to do
 *
 * - Close anything while not acting as Ali.
 * - Close a ticket whose code and id disagree.
 * - Claim a close it did not read back. Basecamp answers the completion POST with 204, which says
 *   the request was accepted, not that the to-do is now complete. The only honest check is to GET
 *   the to-do again and look at `completed`.
 *
 * Idempotent: a to-do that is already complete is reported and skipped, so a re-run writes
 * nothing. That matters because this is the kind of script somebody re-runs after a timeout.
 */
const fs = require('fs');

const ACCOUNT = '3945211';
const API = `https://3.basecampapi.com/${ACCOUNT}`;
const UA = 'Colaberry Accelerator (ali@colaberry.com)';
const BUCKET = Number(process.env.BUCKET || 7463955);
const LIST = Number(process.env.LIST || 10406233777);
const DRY = process.env.DRY === '1';

let TOKEN = null;
async function tok() {
  if (!TOKEN) {
    TOKEN = await require('/app/dist/services/ops/basecampToken.js').refreshBcToken();
  }
  return TOKEN;
}

async function api(method, p, body) {
  if (DRY && method !== 'GET') { console.log(`  [DRY] ${method} ${p.split('?')[0]}`); return {}; }
  const r = await fetch(API + p, {
    method,
    headers: {
      Authorization: `Bearer ${await tok()}`, 'User-Agent': UA, 'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? {} : r.json();
}

async function listAll(p) {
  const out = [];
  for (let i = 1; i <= 30; i++) {
    // eslint-disable-next-line no-await-in-loop
    const j = await api('GET', `${p}${p.includes('?') ? '&' : '?'}page=${i}`);
    if (!Array.isArray(j) || !j.length) break;
    out.push(...j);
  }
  return out;
}

/**
 * Resolve by AF code and REFUSE if it disagrees with the id in the spec.
 *
 * Exactly one match is required. Zero means the code is wrong; two means the titles are ambiguous
 * and a human should say which. The board groups its todos, so the groups are walked -- a
 * grouped todolist returns ZERO todos from its own todos.json.
 */
/**
 * The board walk, done ONCE for the whole run.
 *
 * The first version walked every group for every ticket in the spec. Closing two tickets meant
 * two full walks -- each one a groups listing plus a paged todos listing per group -- and the run
 * was killed (exit 137) before it wrote anything. The work is identical for every ticket in the
 * spec, so it is done once and reused.
 */
let TODO_CACHE = null;
async function allTodos() {
  if (TODO_CACHE) return TODO_CACHE;
  const groups = await listAll(`/buckets/${BUCKET}/todolists/${LIST}/groups.json`);
  const todos = [];
  for (const g of (groups.length ? groups : [{ id: LIST }])) {
    // eslint-disable-next-line no-await-in-loop
    todos.push(...await listAll(`/buckets/${BUCKET}/todolists/${g.id}/todos.json`));
  }
  TODO_CACHE = todos;
  return todos;
}

async function resolveTicket(t) {
  if (!t.ticketCode) {
    if (!t.ticketId) throw new Error('a close needs a ticketCode or a ticketId');
    return t.ticketId;
  }
  const todos = await allTodos();
  const hits = todos.filter((x) => String(x.title).startsWith(`${t.ticketCode} `));

  /**
   * A todos listing returns only the OPEN todos. Once this script has closed something, a re-run
   * would find zero and throw -- so an idempotent re-run would look like a broken spec. When the
   * code is absent from the open list and the spec names an id, that id is checked DIRECTLY and
   * its title still has to start with the code, so the guard survives rather than being skipped.
   */
  if (hits.length === 0 && t.ticketId) {
    const direct = await api('GET', `/buckets/${BUCKET}/todos/${t.ticketId}.json`);
    if (!String(direct.title || '').startsWith(`${t.ticketCode} `)) {
      throw new Error(
        `${t.ticketCode} is not in the open list and id ${t.ticketId} is titled `
        + `${JSON.stringify(direct.title)}. Refusing: the code and the id disagree.`,
      );
    }
    return direct.id;
  }

  if (hits.length !== 1) {
    throw new Error(`${t.ticketCode} matched ${hits.length} tickets, expected exactly 1`);
  }
  if (t.ticketId && t.ticketId !== hits[0].id) {
    throw new Error(
      `${t.ticketCode} resolves to ${hits[0].id} but the spec says ${t.ticketId}. `
      + 'Refusing to close: one of the two is pointing at the wrong ticket.',
    );
  }
  return hits[0].id;
}

/** Basecamp comments are HTML, and this route has mangled UTF-8 before. Keep it ASCII. */
function assertAscii(s, where) {
  const bad = [...String(s)].filter((c) => c.charCodeAt(0) > 126);
  if (bad.length) throw new Error(`${where}: non-ASCII character(s) ${JSON.stringify(bad.slice(0, 5))}`);
}

async function closeOne(t) {
  const id = await resolveTicket(t);
  assertAscii(t.reason, `${t.ticketCode} reason`);

  const before = await api('GET', `/buckets/${BUCKET}/todos/${id}.json`);
  if (before.completed === true) {
    console.log(`${t.ticketCode}: already closed, skipped`);
    return { code: t.ticketCode, id, outcome: 'already' };
  }

  // The reason goes on the ticket BEFORE the close, so the last thing a reader sees above the
  // completion is why it happened rather than a bare state change.
  await api('POST', `/buckets/${BUCKET}/recordings/${id}/comments.json`, {
    content: `<div><strong>Closing.</strong> ${t.reason}</div>`,
  });
  await api('POST', `/buckets/${BUCKET}/todos/${id}/completion.json`);

  // READ IT BACK. The POST answers 204, which says the request was accepted, not that the to-do
  // is complete.
  if (DRY) {
    console.log(`${t.ticketCode}: would close (dry run, not verified)`);
    return { code: t.ticketCode, id, outcome: 'dry' };
  }
  const after = await api('GET', `/buckets/${BUCKET}/todos/${id}.json`);
  if (after.completed !== true) {
    throw new Error(`${t.ticketCode}: POST accepted but the to-do still reads completed=false`);
  }
  console.log(`${t.ticketCode}: CLOSED and verified -> ${after.app_url || id}`);
  return { code: t.ticketCode, id, outcome: 'closed' };
}

async function main() {
  const spec = JSON.parse(fs.readFileSync(process.env.SPEC, 'utf8'));
  const me = await api('GET', '/my/profile.json');
  if (!/ali@colaberry\.com/i.test(me.email_address || '')) throw new Error('not acting as Ali');

  const results = [];
  for (const t of spec.tickets) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await closeOne(t));
  }
  const n = (o) => results.filter((r) => r.outcome === o).length;
  console.log(`\n${DRY ? 'dry run' : 'applied'} -- ${n('closed')} closed, ${n('already')} already closed, `
    + `${n('dry')} would close, ${results.length} considered`);
}

main().catch((e) => { console.error('CLOSE FAILED: ' + e.message); process.exit(1); });
