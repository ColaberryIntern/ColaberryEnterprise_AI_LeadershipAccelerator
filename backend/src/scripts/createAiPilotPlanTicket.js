// createAiPilotPlanTicket.js — stand up the Basecamp home for the AI ROI Pilot
// initiative: a dedicated project, the GTM plan posted as a message, and a
// sequenced "Launch Sprint" to-do list (all assigned to Ali, every todo with a
// due_on per operating doctrine). Full strategy: docs/AI_ROI_PILOT_GTM_STRATEGY.md.
//
// Idempotent (safe to re-run): reuses the project / message / list by name+subject,
// skips any todo whose content already exists. DRY-RUN by default; pass COMMIT=1 to
// write. Self-contained token resolution (env BASECAMP_ACCESS_TOKEN, else CCPP) so
// it runs inside the prod backend container where MSSQL_* is set.

const path = require('path');

const ACCOUNT_ID = process.env.BASECAMP_ACCOUNT_ID || '3945211';
const API = `https://3.basecampapi.com/${ACCOUNT_ID}`;
const COMMIT = process.env.COMMIT === '1';
const ALI = { id: 17454835, name: 'Ali Muwwakkil' };

const PROJECT_NAME = 'AI ROI Pilot Program';
const PROJECT_DESC =
  'Productized go-to-market: a low-barrier 6-week AI ROI Pilot ($2,500, credited forward) for small-business ' +
  'CEOs, converting into flexible retainer / revenue-share deals. Templated from the LandJet engagement.';
const MESSAGE_SUBJECT = 'AI ROI Pilot: SMB CEO Growth Engine (GTM Plan)';
const LIST_NAME = 'AI ROI Pilot — Launch Sprint';

const PLAN_HTML =
  '<div>' +
  '<p><strong>Thesis.</strong> LandJet (Ryan, Percy) is the template for a market: small, ops-heavy, ' +
  'idea-rich, short-staffed CEOs who balk at a big upfront but will do an incentivized deal based on results. ' +
  'Come in small, prove ROI on one project, then convert to a flexible retainer / revenue-share / per-outcome deal.</p>' +
  '<p><strong>Offer.</strong> The 6-Week AI ROI Pilot. $2,500 flat, 100% credited toward any continuation. ' +
  'Week 1 discovery, weeks 2-4 build a real working system, week 5 measure, week 6 roadmap.</p>' +
  '<p><strong>Continuation ladder (flexible).</strong> Monthly retainer (from ~$3,500/mo), or revenue share ' +
  '(lower fixed + % of attributable revenue, the structure Percy asked for), or pay-per-outcome (e.g. per new ' +
  'client), or a hybrid. The flexibility is the product.</p>' +
  '<p><strong>Proof.</strong> The LandJet Growth Engine: a production multi-channel AI growth + 24/7 quoting ' +
  'system shipped in ~3 months. Much of it (campaign blueprint, channel adapters, scoring/routing engines, ' +
  'governance) is reusable, so each new pilot starts from a templated stack.</p>' +
  '<p><strong>ICP.</strong> CEO / Founder / Owner / President / COO at ~5-50 employee US companies in ops-heavy ' +
  'verticals (transportation, logistics, construction/trades, field services, staffing, professional services, ' +
  'real estate, hospitality). Apollo params in <code>backend/src/scripts/pullAiPilotLeads.js</code>.</p>' +
  '<p><strong>Demand gen (live for Monday).</strong> (1) Landing page <code>/ai-pilot</code> on ' +
  'enterprise.colaberry.ai with lead capture; (2) Apollo cold email, reviewed batch 1 (25-50) sent from ' +
  'ali@colaberry.com; (3) a 3-touch follow-up cadence. Copy in ' +
  '<code>docs/AI_ROI_PILOT_EMAIL_SEQUENCE.md</code>.</p>' +
  '<p><strong>Funnel.</strong> Apollo list &rarr; cold email &rarr; 20-min fit call &rarr; pilot signed &rarr; ' +
  'ROI win &rarr; continuation deal. The number that matters is pilot-to-continuation (target 60%+).</p>' +
  '<p><strong>Scale.</strong> AI Systems Architect + MyDay structure run several pilots at once on a templated ' +
  'engine; document a delivery playbook; migrate training-program people into delivery and adjacent lanes ' +
  '(e.g. Gov Contracts).</p>' +
  '<p><em>Full plan: docs/AI_ROI_PILOT_GTM_STRATEGY.md</em></p>' +
  '</div>';

// Launch-sprint todos. [You] = Ali's hands-on step, [Build] = deliverable he reviews.
const TICKETS = [
  { content: '[Build] Deploy /ai-pilot landing page to prod + verify the form posts', due_on: '2026-06-22',
    description: '<div>Deploy the nginx image so <code>enterprise.colaberry.ai/ai-pilot</code> renders, then submit a test lead and confirm it lands in the leads pipeline (source <code>ai-pilot</code>).</div>' },
  { content: '[Build] Run Apollo ICP pull, export the reviewable list', due_on: '2026-06-22',
    description: '<div>Run <code>pullAiPilotLeads.js --enrich</code> in the prod backend container. Produces a review CSV of verified-email SMB CEOs in ops-heavy verticals.</div>' },
  { content: '[You] Confirm the CAN-SPAM mailing address line for cold sends', due_on: '2026-06-22',
    description: '<div>The send script refuses to go live until a real physical mailing address is set (<code>ADDRESS</code> env). Confirm the line to use.</div>' },
  { content: '[You] Approve cold-email batch 1 (25-50 leads)', due_on: '2026-06-22',
    description: '<div>Review the Apollo CSV and the Touch 1 copy, then green-light the first batch. Decision 2026-06-20: Ali approves batch 1 before any send.</div>' },
  { content: '[Build] Send batch 1 (Touch 1) after approval', due_on: '2026-06-22',
    description: '<div>Run <code>sendAiPilotOutreach.js --send</code> (TOUCH=1, cap 25) from ali@colaberry.com. Idempotent + throttled + dash-guarded.</div>' },
  { content: '[Build] Import worked Apollo contacts into the CRM pipeline', due_on: '2026-06-26',
    description: '<div>Bring the contacted batch into the leads/pipeline tables so fit calls and stages are tracked alongside inbound landing-page leads.</div>' },
  { content: '[Build] Send Touch 2 follow-up to non-repliers', due_on: '2026-06-25',
    description: '<div><code>sendAiPilotOutreach.js --send TOUCH=2</code>. Skips anyone who replied or already got touch 2.</div>' },
  { content: '[You] Review funnel metrics, tune ICP + copy', due_on: '2026-06-29',
    description: '<div>Open / reply / fit-call rates from batch 1. Adjust the ICP verticals and Touch 1 copy before scaling volume.</div>' },
  { content: '[Build] Send Touch 3 break-up to remaining non-repliers', due_on: '2026-07-02',
    description: '<div><code>sendAiPilotOutreach.js --send TOUCH=3</code>.</div>' },
  { content: '[You] Take first fit calls and sign the first pilot', due_on: '2026-07-03',
    description: '<div>Run 20-minute fit calls, pick the highest-ROI workflow, sign the first $2,500 pilot. This is the conversion that validates the whole model.</div>' },
];

function loadMssql() {
  try { return require('mssql'); }
  catch { return require(path.resolve(__dirname, '../../node_modules/mssql')); }
}
async function getToken() {
  const env = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^Bearer\s+/i, '').trim();
  if (env) return env;
  const sql = loadMssql();
  const pool = await new sql.ConnectionPool({
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS,
    database: process.env.MSSQL_DATABASE || 'CCPP',
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 2, min: 0, idleTimeoutMillis: 5000 },
  }).connect();
  try {
    const r = await pool.request().query('SELECT TOP 1 AccessToken FROM Basecamp_AuthInfo WHERE IsActive = 1 ORDER BY BasecampAuthInfoID DESC');
    return r.recordset[0].AccessToken.replace(/^Bearer\s+/i, '').trim();
  } finally { await pool.close(); }
}
async function bc(token, p, opts = {}) {
  const url = p.startsWith('http') ? p : `${API}${p}`;
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Colaberry Internal Tools (ali@colaberry.com)',
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) throw new Error(`BC ${opts.method || 'GET'} ${url} -> ${r.status} ${await r.text()}`);
  const text = await r.text();
  return { data: text ? JSON.parse(text) : null, link: r.headers.get('link') };
}
async function paged(token, url) {
  let out = [];
  while (url) {
    const { data, link } = await bc(token, url);
    out = out.concat(data || []);
    const next = link && /<([^>]+)>;\s*rel="next"/.exec(link);
    url = next ? next[1] : null;
  }
  return out;
}

(async () => {
  const token = await getToken();
  console.log(`MODE: ${COMMIT ? 'COMMIT (writing)' : 'DRY-RUN (no writes)'}`);

  // 1. Find or create the dedicated project (idempotent by name).
  const projects = await paged(token, '/projects.json');
  let project = projects.find((p) => (p.name || '').trim() === PROJECT_NAME);
  if (project) {
    console.log(`\n[project] reuse "${PROJECT_NAME}" (#${project.id}) ${project.app_url || ''}`);
  } else if (COMMIT) {
    project = (await bc(token, '/projects.json', { method: 'POST', body: { name: PROJECT_NAME, description: PROJECT_DESC } })).data;
    console.log(`\n[project] created "${PROJECT_NAME}" (#${project.id}) ${project.app_url || ''}`);
  } else {
    console.log(`\n[project] WOULD create "${PROJECT_NAME}". (dry-run; cannot continue to message/list)`);
    console.log('\nRun with COMMIT=1 to create. DONE (dry-run).');
    return;
  }

  const dock = project.dock || [];

  // 2. Post the GTM plan as a message (idempotent by subject).
  const mbRef = dock.find((d) => d.name === 'message_board');
  if (mbRef) {
    const board = (await bc(token, `/buckets/${project.id}/message_boards/${mbRef.id}.json`)).data;
    const messages = await paged(token, board.messages_url || `/buckets/${project.id}/message_boards/${mbRef.id}/messages.json`);
    const dupMsg = messages.find((m) => (m.subject || '').trim() === MESSAGE_SUBJECT);
    if (dupMsg) {
      console.log(`[message] exists: "${MESSAGE_SUBJECT}" (#${dupMsg.id}). skip.`);
    } else if (COMMIT) {
      const made = (await bc(token, `/buckets/${project.id}/message_boards/${mbRef.id}/messages.json`,
        { method: 'POST', body: { subject: MESSAGE_SUBJECT, content: PLAN_HTML, status: 'active' } })).data;
      console.log(`[message] posted: "${MESSAGE_SUBJECT}" -> #${made.id} ${made.app_url || ''}`);
    } else {
      console.log(`[message] WOULD post: "${MESSAGE_SUBJECT}".`);
    }
  } else {
    console.log('[message] no message_board on project; skipping plan message.');
  }

  // 3. Create/reuse the launch-sprint todolist.
  const todosetRef = dock.find((d) => d.name === 'todoset');
  if (!todosetRef) throw new Error('No todoset on this project.');
  const todoset = (await bc(token, `/buckets/${project.id}/todosets/${todosetRef.id}.json`)).data;
  const lists = await paged(token, todoset.todolists_url);
  let list = lists.find((l) => (l.name || '').trim() === LIST_NAME);
  if (list) {
    console.log(`[list] reuse "${LIST_NAME}" (#${list.id}).`);
  } else if (COMMIT) {
    list = (await bc(token, todoset.todolists_url, { method: 'POST', body: { name: LIST_NAME } })).data;
    console.log(`[list] created "${LIST_NAME}" (#${list.id}).`);
  } else {
    console.log(`[list] WOULD create "${LIST_NAME}".`);
    list = null;
  }

  // 4. Create the todos, idempotent by content.
  let existing = [];
  if (list) {
    const open = await paged(token, list.todos_url);
    let done = [];
    try { done = await paged(token, list.todos_url.replace('.json', '.json?completed=true')); } catch {}
    existing = open.concat(done);
  }

  let created = 0, skipped = 0;
  for (const t of TICKETS) {
    const dup = existing.find((x) => (x.content || '').trim() === t.content);
    if (dup) { console.log(`[todo] exists: "${t.content}" (#${dup.id}). skip.`); skipped++; continue; }
    if (COMMIT && list) {
      const made = (await bc(token, `/buckets/${project.id}/todolists/${list.id}/todos.json`, {
        method: 'POST',
        body: { content: t.content, description: t.description, assignee_ids: [ALI.id], due_on: t.due_on, notify: false },
      })).data;
      console.log(`[todo] created: "${t.content}" due ${t.due_on} -> #${made.id}`);
      created++;
    } else {
      console.log(`[todo] WOULD create: "${t.content}" due ${t.due_on} -> ${ALI.name}`);
    }
  }

  console.log(`\nDONE. created=${created} skipped=${skipped} total=${TICKETS.length}`);
  if (list && list.app_url) console.log(`List: ${list.app_url}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
