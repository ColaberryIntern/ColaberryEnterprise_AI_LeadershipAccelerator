/**
 * Assign owners to each task in the Detroit AI for Muni-Code Search bid list.
 *
 * Owner buckets (per Ali, 2026-05-19):
 *   CB System (vishnu@colaberry.com)    - AI-handled tasks
 *   Vinay Shankar (vinay@colaberry.com) - Colaberry company info / forms
 *   Design House LLC                     - Production build / engineering
 *   Ali Muwwakkil                        - Strategic / sign-off / unknowns
 *
 * Multiple assignees per task supported (Basecamp allows it).
 *
 * Posts a summary message to the Message Board after assignment so the team
 * sees the ownership distribution at a glance.
 *
 * Run: `BASECAMP_ACCESS_TOKEN=... node backend/src/scripts/assignDetroitBidTasks.js`
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const ACCOUNT_ID = '3945211';
const PROJECT_ID = '47346103';
const LIST_ID = '9908586327';
const MESSAGE_BOARD_ID = '9908475791';
const API = `https://3.basecampapi.com/${ACCOUNT_ID}`;

// People IDs (Gov Contracts project)
const ALI = 17454835;
const VINAY = 45809041;
const CB_SYSTEM = 37708014;
const DESIGN_HOUSE = 52407626;

const NAME_FOR = {
  [ALI]: 'Ali',
  [VINAY]: 'Vinay',
  [CB_SYSTEM]: 'CB System',
  [DESIGN_HOUSE]: 'Design House',
};

// Task content -> assignees. Match by exact content string (what the script wrote).
const ASSIGNMENTS = [
  { match: 'Read RFP 544695',                         assignees: [CB_SYSTEM] },
  { match: 'Bid / no-bid decision',                    assignees: [ALI] },
  { match: 'Build demo POC',                           assignees: [DESIGN_HOUSE] },
  { match: 'Capability statement',                     assignees: [VINAY, CB_SYSTEM] },
  { match: 'Complete Attachment A',                    assignees: [VINAY] },
  { match: 'Complete Attachment B',                    assignees: [CB_SYSTEM, ALI] },
  { match: 'Complete Attachment C',                    assignees: [ALI] },
  { match: 'Complete Attachment D-1',                  assignees: [VINAY, ALI] },
  { match: 'Complete Attachment F',                    assignees: [VINAY, CB_SYSTEM] },
  { match: 'Review + redline Tech Contract',           assignees: [ALI] },
  { match: 'Verify Equalization Credit Statement',     assignees: [VINAY] },
  { match: 'Executive summary',                        assignees: [CB_SYSTEM, ALI] },
  { match: 'Internal review + sign-off',               assignees: [ALI] },
  { match: 'Submit via Detroit Bonfire portal',        assignees: [ALI] },
];

function getToken() {
  let t = process.env.BASECAMP_ACCESS_TOKEN;
  if (!t) throw new Error('BASECAMP_ACCESS_TOKEN required');
  if (t.startsWith('Bearer ')) t = t.slice(7);
  return t;
}

const HEADERS = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  'User-Agent': 'Colaberry Internal Tools (ali@colaberry.com)',
  Accept: 'application/json',
  ...extra,
});

async function bcGet(token, urlOrPath) {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${API}${urlOrPath}`;
  const r = await fetch(url, { headers: HEADERS(token) });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function bcPut(token, urlOrPath, body) {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${API}${urlOrPath}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: HEADERS(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PUT ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function bcPost(token, urlOrPath, body) {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${API}${urlOrPath}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: HEADERS(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

(async () => {
  const token = getToken();

  // Fetch all todos in the list
  const list = await bcGet(token, `/buckets/${PROJECT_ID}/todolists/${LIST_ID}.json`);
  const todos = await bcGet(token, list.todos_url);
  console.log(`[bc] Found ${todos.length} todos in list "${list.name}"`);

  const results = [];
  for (const a of ASSIGNMENTS) {
    const todo = todos.find((t) => t.content.includes(a.match));
    if (!todo) {
      console.log(`[bc] SKIP - no todo matching: "${a.match}"`);
      results.push({ match: a.match, status: 'not_found' });
      continue;
    }
    // PUT to update assignees. Basecamp requires content + description on PUT
    // so we send them unchanged.
    await bcPut(token, `/buckets/${PROJECT_ID}/todos/${todo.id}.json`, {
      content: todo.content,
      description: todo.description,
      assignee_ids: a.assignees,
      notify: false,
    });
    const names = a.assignees.map((id) => NAME_FOR[id]).join(' + ');
    console.log(`[bc] +assigned [${names}] to: ${todo.content.slice(0, 70)}`);
    results.push({ todo_id: todo.id, content: todo.content, assignees: names });
    await new Promise((r) => setTimeout(r, 150));
  }

  // Post summary message to the Message Board so the team sees the breakdown
  const tableRows = results
    .filter((r) => r.assignees)
    .map((r) => `<tr><td style="padding:4px 12px 4px 0;">${r.content}</td><td style="padding:4px 0;"><strong>${r.assignees}</strong></td></tr>`)
    .join('');
  const summaryContent = `<div>
<p><strong>Task assignments for Detroit AI Muni-Code Search bid.</strong></p>

<p>Bucket logic:</p>
<ul>
  <li><strong>CB System</strong> - AI-handled (drafting from RFP context, filling structured forms with provided source-of-truth, requirements extraction)</li>
  <li><strong>Vinay</strong> - Colaberry company info, forms, certifications, past performance</li>
  <li><strong>Design House</strong> - Production-quality engineering build (the demo POC)</li>
  <li><strong>Ali</strong> - Strategic decisions, legal/contract review, pricing, sign-offs, final submission</li>
</ul>

<p>Most multi-assignee tasks follow a draft+review pattern: AI or Vinay sources/drafts, Ali reviews. The bottleneck on multi-assignee tasks is whichever non-Ali owner finishes first.</p>

<table style="border-collapse: collapse; margin-top: 12px;">
<thead><tr><th style="text-align:left; padding:4px 12px 4px 0; border-bottom: 1px solid #ccc;">Task</th><th style="text-align:left; padding:4px 0; border-bottom: 1px solid #ccc;">Owner(s)</th></tr></thead>
<tbody>${tableRows}</tbody>
</table>

<p><em>Re-run <code>assignDetroitBidTasks.js</code> with edits if assignments need to change. Assignments are visible in the To-Do List view directly per task.</em></p>
</div>`;

  const summarySubject = 'Task assignments: Detroit AI Muni-Code Search bid';
  const existing = await bcGet(token, `/buckets/${PROJECT_ID}/message_boards/${MESSAGE_BOARD_ID}/messages.json`).catch(() => []);
  let msg;
  if (existing.find((m) => m.subject === summarySubject)) {
    msg = existing.find((m) => m.subject === summarySubject);
    console.log(`[bc] Assignment summary message already posted (id=${msg.id}) - updating via PUT`);
    const upd = await fetch(`${API}/buckets/${PROJECT_ID}/messages/${msg.id}.json`, {
      method: 'PUT',
      headers: HEADERS(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ subject: summarySubject, content: summaryContent }),
    });
    if (!upd.ok) throw new Error(`PUT message -> ${upd.status} ${await upd.text()}`);
    msg = await upd.json();
  } else {
    msg = await bcPost(token, `/buckets/${PROJECT_ID}/message_boards/${MESSAGE_BOARD_ID}/messages.json`, {
      subject: summarySubject,
      content: summaryContent,
      status: 'active',
    });
    console.log(`[bc] +posted assignment summary (id=${msg.id}) -> ${msg.app_url}`);
  }

  console.log('\n[bc] === DONE ===');
  console.log(`Assigned: ${results.filter((r) => r.assignees).length} / ${results.length} tasks`);
  console.log(`Summary message: ${msg.app_url}`);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
