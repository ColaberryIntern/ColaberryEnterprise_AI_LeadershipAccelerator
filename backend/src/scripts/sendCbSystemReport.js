/**
 * One-off: file the CB System architecture & management report on a Basecamp
 * reference ticket and email it to Ali with the ticket link.
 *
 * Idempotent: looks for an existing "[Reference] CB System" todo in the target
 * list before creating one, so re-running does not duplicate the ticket. The
 * email send itself is a single deliberate action (not auto-retried).
 *
 * Credentials are passed inline from the prod container env, never stored:
 *   MANDRILL_API_KEY=... BASECAMP_ACCESS_TOKEN=... node backend/src/scripts/sendCbSystemReport.js
 */
const path = require('path');
const fs = require('fs');
const { sendWithBcAttach } = require('./lib/sendWithBcAttach');

const ACCOUNT = '3945211';
const BASE = `https://3.basecampapi.com/${ACCOUNT}`;
const PROJECT = 7463955; // Ali Personal
const TODO_TITLE = '[Reference] CB System - Architecture and Management Report';

let TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || '').trim();
if (TOKEN.toLowerCase().startsWith('bearer ')) TOKEN = TOKEN.slice(7).trim();

const H = (extra) => ({
  Authorization: `Bearer ${TOKEN}`,
  'User-Agent': 'Colaberry CB Report (ali@colaberry.com)',
  Accept: 'application/json',
  'Content-Type': 'application/json',
  ...(extra || {}),
});

async function bc(url, opts) {
  const res = await fetch(url.startsWith('http') ? url : `${BASE}${url}`, { headers: H(), ...(opts || {}) });
  if (!res.ok) throw new Error(`BC ${res.status} ${opts && opts.method || 'GET'} ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

async function resolveTodoList() {
  const proj = await bc(`/projects/${PROJECT}.json`);
  const todosetDock = (proj.dock || []).find((d) => d.name === 'todoset');
  if (!todosetDock) throw new Error('Ali Personal has no todoset in its dock');
  const todoset = await bc(todosetDock.url);
  const lists = await bc(todoset.todolists_url);
  if (!lists.length) throw new Error('Ali Personal todoset has no todolists');
  return lists[0]; // first active list
}

async function findOrCreateTicket(list) {
  // Idempotency: reuse an existing reference ticket if present.
  let page = `${BASE}/buckets/${PROJECT}/todolists/${list.id}/todos.json`;
  while (page) {
    const res = await fetch(page, { headers: H() });
    if (!res.ok) break;
    const todos = await res.json();
    const hit = todos.find((t) => (t.content || '').trim() === TODO_TITLE);
    if (hit) return { todo: hit, created: false };
    const link = res.headers.get('Link');
    const m = link && link.match(/<([^>]+)>;\s*rel="next"/);
    page = m ? m[1] : null;
  }
  const description =
    '<div><strong>CB System</strong> is the autonomous Basecamp agent (the engine behind the advisor ' +
    '<code>/my-day</code> product). This reference holds the full architecture and management report: ' +
    'six-layer breakdown, @CB mention lifecycle, the data it produces, the new CB System Command dashboard ' +
    '(<code>enterprise.colaberry.ai/admin/cb-system</code>), and the June 2026 reliability hardening. ' +
    'HTML and Markdown copies (with mermaid diagrams) are attached to this ticket and were emailed to Ali.</div>';
  const todo = await bc(`/buckets/${PROJECT}/todolists/${list.id}/todos.json`, {
    method: 'POST',
    body: JSON.stringify({ content: TODO_TITLE, description, assignee_ids: [], due_on: null }),
  });
  return { todo, created: true };
}

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
<tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
<div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
<div style="margin-top: 14px;">
<a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
</div>
</td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai
Design Your AI Organization: https://advisor.colaberry.ai/advisory`;

function buildBody(ticketUrl) {
  const html = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6;">
<p>Here is the full CB System report you asked for, in one place.</p>
<p><strong>CB System</strong> is the autonomous agent that lives inside Basecamp: it reads @-mentions, drafts deliverables, scores and tracks every to-do, watches itself, and reports back. It is the shared engine that the advisor <a href="https://advisor.colaberry.ai/my-day" style="color:#2b6cb0;text-decoration:none;">/my-day</a> product is built on, and it is now managed from the new <strong>CB System Command</strong> dashboard at <a href="https://enterprise.colaberry.ai/admin/cb-system" style="color:#2b6cb0;text-decoration:none;">enterprise.colaberry.ai/admin/cb-system</a>.</p>
<p>The report covers every moving part with visuals:</p>
<ul>
<li>The big picture: engine (enterprise) vs. product (advisor /my-day) and how they connect.</li>
<li>All six layers (input, brain, proactive work, mirror and scoring, comms, health) with a diagram and a cadence table.</li>
<li>What happens step by step when you @-mention CB, including the duplicate-reply circuit breaker.</li>
<li>The data it produces and how the dashboard reads it.</li>
<li>The June 2026 reliability hardening: before and after for each fix.</li>
</ul>
<p>Two copies are attached so you can keep them: an <strong>HTML</strong> file that renders the mermaid diagrams in your browser, and a <strong>Markdown</strong> file. Both are also filed on a Basecamp reference ticket so you can find them later:</p>
<p style="margin: 14px 0;"><a href="${ticketUrl}" style="display:inline-block;background:#1a365d;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Open the reference ticket</a></p>
<p style="font-size:13px;color:#718096;">Ticket link: <a href="${ticketUrl}" style="color:#2b6cb0;text-decoration:none;">${ticketUrl}</a></p>
</div>`;

  const text = `Here is the full CB System report you asked for, in one place.

CB System is the autonomous agent that lives inside Basecamp: it reads @-mentions, drafts deliverables, scores and tracks every to-do, watches itself, and reports back. It is the shared engine that the advisor /my-day product is built on, and it is now managed from the new CB System Command dashboard at enterprise.colaberry.ai/admin/cb-system.

The report covers every moving part with visuals:
- The big picture: engine (enterprise) vs. product (advisor /my-day) and how they connect.
- All six layers (input, brain, proactive work, mirror and scoring, comms, health) with a diagram and a cadence table.
- What happens step by step when you @-mention CB, including the duplicate-reply circuit breaker.
- The data it produces and how the dashboard reads it.
- The June 2026 reliability hardening: before and after for each fix.

Two copies are attached so you can keep them: an HTML file that renders the mermaid diagrams in your browser, and a Markdown file. Both are also filed on a Basecamp reference ticket so you can find them later:

Open the reference ticket: ${ticketUrl}`;

  return { html, text };
}

(async () => {
  if (!TOKEN) throw new Error('BASECAMP_ACCESS_TOKEN not set');
  if (!process.env.MANDRILL_API_KEY) throw new Error('MANDRILL_API_KEY not set');

  const docsDir = path.resolve(__dirname, '../../../docs');
  const htmlBuf = fs.readFileSync(path.join(docsDir, 'CB_SYSTEM_REPORT.html'));
  const mdBuf = fs.readFileSync(path.join(docsDir, 'CB_SYSTEM_REPORT.md'));

  const list = await resolveTodoList();
  const { todo, created } = await findOrCreateTicket(list);
  const ticketUrl = todo.app_url || `https://3.basecamp.com/${ACCOUNT}/buckets/${PROJECT}/todos/${todo.id}`;
  console.log(`Ticket ${created ? 'created' : 'reused'}: ${todo.id} -> ${ticketUrl}`);

  const { html, text } = buildBody(ticketUrl);

  const result = await sendWithBcAttach({
    ticketId: todo.id,
    to: 'ali@colaberry.com',
    bcc: ['ali@colaberry.com'],
    subject: 'CB System: Architecture and Management Report',
    html: html + SIG_HTML,
    text: text + '\n\n' + SIG_TEXT,
    attachments: [
      { filename: 'CB_SYSTEM_REPORT.html', content: htmlBuf, contentType: 'text/html' },
      { filename: 'CB_SYSTEM_REPORT.md', content: mdBuf, contentType: 'text/markdown' },
    ],
    vaultAttachments: [
      { filename: 'CB_SYSTEM_REPORT.html', content: htmlBuf, contentType: 'text/html', vaultDescription: 'CB System architecture and management report (renders mermaid diagrams)' },
      { filename: 'CB_SYSTEM_REPORT.md', content: mdBuf, contentType: 'text/markdown', vaultDescription: 'CB System report, Markdown source with mermaid diagrams' },
    ],
    bcSummary: '<p>CB System architecture and management report (HTML + Markdown, with mermaid diagrams) emailed to Ali and filed here for reference.</p>',
  });

  console.log('Email sent. Mandrill:', result.mandrillId);
  console.log('BC comment:', result.commentUrl);
  console.log('Vault uploads:', JSON.stringify(result.vaultUploads));
  console.log('TICKET_URL', ticketUrl);
})().catch((e) => {
  console.error('FAILED:', e.stack || e.message);
  process.exit(1);
});
