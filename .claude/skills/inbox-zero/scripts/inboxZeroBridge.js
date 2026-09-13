/**
 * inboxZeroBridge — the /inbox-zero skill's ONLY way to talk to the backend.
 *
 * Runs INSIDE the prod backend container, fed over stdin:
 *   ssh root@95.216.199.47 "docker exec -i -e IZ_CMD=<cmd> -e IZ_ARGS='<json>' accelerator-backend node -" < inboxZeroBridge.js
 *
 * It mints a 5-minute admin JWT in-process from the container's own JWT_SECRET
 * (the person-360 pattern), calls http://localhost:3001/api/admin/inbox/zero/...
 * and prints ONLY the JSON result to stdout. The token never reaches stdout,
 * stderr, a file, or the local machine. That is the whole point of the shape:
 * no credential ever leaves the box, and nothing exfiltration-shaped is run.
 *
 * Node 20 built-ins only (fetch is global). No dependency outside what the
 * container already has (`jsonwebtoken` is a backend runtime dep).
 *
 * Commands (IZ_CMD) and their IZ_ARGS (JSON):
 *   start        {tab}                      POST session/start
 *   heartbeat    {lease_id}                 POST session/heartbeat
 *   stop         {lease_id}                 POST session/stop
 *   reconcile    {limit?, stale_minutes?}   POST liveness/reconcile (T16 bounded inbox-liveness sweep)
 *   dismiss      {case_id}                  POST cases/:id/dismiss (E: disposition items NO_ACTION + close)
 *   cursor       {lease_id,to,processing_succeeded}  POST session/cursor
 *   health       {}                         GET  health
 *   overview     {cursor?}                  GET  overview
 *   delta        {since}                    GET  delta
 *   next         {focus?}                   GET  next
 *   case         {case_id}                  GET  cases/:id
 *   queue        {view?}                    GET  queue
 *   waiting      {}                         GET  waiting
 *   commitments  {}                         GET  commitments
 *   snoozed      {}                         GET  snoozed
 *   snooze       {case_id, snoozed_until, snooze_reason, priority_band?, priority_reason?}  PATCH cases/:id/operator
 *   approve      {case_id, action_id}       POST cases/:id/actions/:aid/approve  (existing gate)
 *   reject       {case_id, action_id}       POST cases/:id/actions/:aid/reject
 *   execute      {case_id}                  POST cases/:id/execute               (existing gate)
 *   verify       {case_id}                  POST cases/:id/verify
 *   plan         {case_id}                  POST cases/:id/plan
 *   assess       {case_id}                  POST cases/:id/assess
 *
 * Args may be passed as IZ_ARGS (raw JSON) or IZ_ARGS_B64 (base64 of the JSON —
 * use this from Windows; it survives ssh + docker exec quoting untouched).
 *
 * IZ_DRY_RUN=1 prints the request it WOULD make (method, path, body) and exits
 * without minting a token or calling anything.
 *
 * Every ISO-8601 timestamp in the response body gets a sibling `<key>_ct`
 * rendered in Central time (IZ_TZ, default America/Chicago), e.g.
 *   "expiresAt": "2026-09-11T20:22:45.292Z", "expiresAt_ct": "Fri 11 Sep 2026, 3:22 PM CDT"
 * Ali reads Central; the API keeps UTC; the conversion is done here, by Node's
 * ICU, never by hand. IZ_TZ= (empty) disables the annotation.
 */
'use strict';

const BASE = process.env.IZ_BASE_URL || 'http://localhost:3001';
const ZERO = '/api/admin/inbox/zero';
const CASES = '/api/admin/inbox/cases';

function route(cmd, a) {
  const id = a.case_id ? encodeURIComponent(a.case_id) : null;
  const aid = a.action_id ? encodeURIComponent(a.action_id) : null;
  const q = (obj) => {
    const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '');
    return entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : '';
  };
  switch (cmd) {
    case 'start': return { method: 'POST', path: `${ZERO}/session/start`, body: { tab: a.tab } };
    case 'heartbeat': return { method: 'POST', path: `${ZERO}/session/heartbeat`, body: { lease_id: a.lease_id } };
    case 'stop': return { method: 'POST', path: `${ZERO}/session/stop`, body: { lease_id: a.lease_id } };
    case 'reconcile': return { method: 'POST', path: `${ZERO}/liveness/reconcile`, body: pick(a, ['limit', 'stale_minutes']) };
    case 'cursor': return { method: 'POST', path: `${ZERO}/session/cursor`, body: { lease_id: a.lease_id, to: a.to, processing_succeeded: a.processing_succeeded === true } };
    case 'health': return { method: 'GET', path: `${ZERO}/health` };
    case 'overview': return { method: 'GET', path: `${ZERO}/overview${q({ cursor: a.cursor })}` };
    case 'delta': return { method: 'GET', path: `${ZERO}/delta${q({ since: a.since })}` };
    case 'next': return { method: 'GET', path: `${ZERO}/next${q({ focus: a.focus })}` };
    case 'case': return { method: 'GET', path: `${ZERO}/cases/${id}` };
    case 'queue': return { method: 'GET', path: `${ZERO}/queue${q({ view: a.view })}` };
    case 'waiting': return { method: 'GET', path: `${ZERO}/waiting` };
    case 'commitments': return { method: 'GET', path: `${ZERO}/commitments` };
    case 'snoozed': return { method: 'GET', path: `${ZERO}/snoozed` };
    case 'snooze': return { method: 'PATCH', path: `${CASES}/${id}/operator`, body: pick(a, ['snoozed_until', 'snooze_reason', 'priority_band', 'priority_reason']) };
    case 'approve': return { method: 'POST', path: `${CASES}/${id}/actions/${aid}/approve`, body: {} };
    case 'reject': return { method: 'POST', path: `${CASES}/${id}/actions/${aid}/reject`, body: pick(a, ['reason']) };
    // E (no response) needs this: reject records WHY, dismiss dispositions the
    // items and closes through the real guard. Without it a case whose only
    // action was rejected sits open with an undispositioned item forever.
    case 'dismiss': return { method: 'POST', path: `${CASES}/${id}/dismiss`, body: {} };
    case 'execute': return { method: 'POST', path: `${CASES}/${id}/execute`, body: {} };
    case 'verify': return { method: 'POST', path: `${CASES}/${id}/verify`, body: {} };
    case 'plan': return { method: 'POST', path: `${CASES}/${id}/plan`, body: {} };
    case 'assess': return { method: 'POST', path: `${CASES}/${id}/assess`, body: pick(a, ['force']) };
    default: return null;
  }
}

const TZ = process.env.IZ_TZ === undefined ? 'America/Chicago' : process.env.IZ_TZ;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const ctFmt = TZ ? new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
}) : null;

// "Thu, Sep 11, 2026, 3:22 PM CDT" -> "Thu 11 Sep 2026, 3:22 PM CDT" (absolute, unambiguous).
function toCentral(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(ctFmt.formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName}`;
}

// Walks the body once; adds `<key>_ct` next to every ISO timestamp string.
// Additive only — nothing the API returned is changed or removed.
function annotateCentral(node, depth) {
  if (!ctFmt || depth > 12 || node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) { node.forEach((x) => annotateCentral(x, depth + 1)); return node; }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (typeof v === 'string' && ISO_RE.test(v)) {
      const ct = toCentral(v);
      if (ct && !(`${k}_ct` in node)) node[`${k}_ct`] = ct;
    } else if (v && typeof v === 'object') {
      annotateCentral(v, depth + 1);
    }
  }
  return node;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function fail(code, message, extra) {
  process.stdout.write(JSON.stringify({ ok: false, error: code, message, ...(extra || {}) }) + '\n');
  process.exit(1);
}

async function main() {
  const cmd = String(process.env.IZ_CMD || '').trim();
  // IZ_ARGS_B64 wins when present: base64 survives every quoting layer between
  // a Windows shell, ssh, and docker exec, where raw JSON does not.
  let args = {};
  try {
    const raw = process.env.IZ_ARGS_B64 ? Buffer.from(process.env.IZ_ARGS_B64, 'base64').toString('utf8') : (process.env.IZ_ARGS || '');
    args = raw ? JSON.parse(raw) : {};
  } catch (e) { fail('BadArgs', 'IZ_ARGS / IZ_ARGS_B64 is not valid JSON'); }
  const r = route(cmd, args);
  if (!r) fail('UnknownCommand', `unknown IZ_CMD "${cmd}"`);

  if (process.env.IZ_DRY_RUN === '1') {
    process.stdout.write(JSON.stringify({ ok: true, dry_run: true, request: { method: r.method, url: BASE + r.path, body: r.body ?? null } }) + '\n');
    return;
  }

  if (!process.env.JWT_SECRET) fail('NoSecret', 'JWT_SECRET is not set in this environment (run inside accelerator-backend)');
  let jwt;
  try { jwt = require('jsonwebtoken'); } catch (e) { fail('NoJwtLib', 'jsonwebtoken is not resolvable here (run inside accelerator-backend)'); }
  // Minted, used, and dropped in-process. Never logged.
  const token = jwt.sign({ sub: 'inbox-zero', email: process.env.IZ_ACTOR || 'ali@colaberry.com', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Number(process.env.IZ_TIMEOUT_MS) || 30000);
  let res;
  try {
    res = await fetch(BASE + r.path, {
      method: r.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: r.body !== undefined ? JSON.stringify(r.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(t);
    fail(e && e.name === 'AbortError' ? 'TimeoutError' : 'TransportError', String((e && e.message) || e));
  }
  clearTimeout(t);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 2000) }; }
  process.stdout.write(JSON.stringify({ ok: res.ok, status: res.status, cmd, body: annotateCentral(body, 0), tz: TZ || null }) + '\n');
  if (!res.ok) process.exit(2);
}

main().catch((e) => fail('Unhandled', String((e && e.message) || e)));
