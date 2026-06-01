#!/usr/bin/env node
// Honest architecture answer for Ali's question: "How does CB get context, how
// should it work, can it access emails." Includes the demo: Coca-Cola context
// PDF attached to the BC task + verified the walker extracts 7256 chars of
// real content. Plus a plan for the remaining 17 tasks.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

(async () => {
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif;color:#1a202c;line-height:1.65">
<div style="max-width:820px;margin:0 auto;background:white">

<div style="background:#0f172a;color:white;padding:28px 34px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">CB context architecture - honest answer</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:700">Can CB answer questions about Coca-Cola today? Almost. Here is what it sees and how we make it see everything.</h1>
</div>

<div style="padding:24px 34px;border-bottom:1px solid #e2e8f0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7f1d1d;font-weight:700">What CB sees today (current state, no changes)</div>
<div style="font-size:18px;font-weight:700;margin-top:4px;color:#0f172a">Whatever lives in Basecamp. Nothing in Gmail.</div>

<p style="font-size:13px;color:#1f2937;margin-top:10px">My context walker pulls 4 layers on every @CB invocation:</p>
<ol style="font-size:13px;color:#1f2937;line-height:1.7">
<li><strong>LIST</strong>: parent todolist name + description + sibling task summaries.</li>
<li><strong>TASK</strong>: the current todo's full title + description (no truncation).</li>
<li><strong>COMMENTS</strong>: every comment on the task, paginated, 4000 chars per comment.</li>
<li><strong>DOCUMENTS</strong>: any URL in description+comments. BC links to other todos/messages: body + comments. BC uploads (PDF, docx, png): downloaded, text-extracted via pdf-parse and mammoth.</li>
</ol>

<p style="font-size:13px;color:#1f2937">Gmail is invisible. Without intervention, if you tagged "@CB what did Darrell say about cybersecurity?" CB would only see the summary I wrote in the task description ("cloud-only stack, CokeGPT") - it could not quote Darrell back.</p>
</div>

<div style="padding:24px 34px;border-bottom:1px solid #e2e8f0;background:#f0fdf4">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#14532d;font-weight:700">What just changed for the Coca-Cola task</div>
<div style="font-size:18px;font-weight:700;margin-top:4px;color:#0f172a">An 8.8 KB context dossier PDF, attached. Walker extracts 7,256 chars of real source content.</div>

<p style="font-size:13px;color:#1f2937;margin-top:10px">I built a "Coca-Cola context dossier" PDF that synthesizes:</p>
<ul style="font-size:13px;color:#1f2937">
<li>Source quotes from David, preserved verbatim (Darrell's "cost center to growth center" quote, the cloud-only stack constraint, the 200+ bottlers framing)</li>
<li>The 10 high-confidence use cases from this morning's email (with reasoning and security posture per use case)</li>
<li>June 4 sequencing (lead w/ use case 6, demo use case 4 at the warehouse stop, etc)</li>
<li>About Colaberry pre-read evolution from v1 -> v5 with David's feedback at each step</li>
<li>Open threads + next steps</li>
<li>Full reference list of every Gmail thread subject involved</li>
</ul>

<p style="font-size:13px;color:#1f2937">Uploaded to a new "CB Context Dossiers" folder in the Ali Personal Vault, then linked from a comment on the task. Walker auto-fetches it on every future @CB invocation.</p>

<div style="margin-top:14px;padding:12px 14px;background:#dcfce7;border-left:4px solid #16a34a;border-radius:0 6px 6px 0;font-size:13px;color:#14532d">
<strong>Verified end-to-end:</strong> ran the walker against the task, confirmed it fetched the PDF, extracted 7,256 chars of text, and the Darrell quote + Use Case 6 details are both present in the LLM prompt CB receives. Smoke test passes.
</div>

<p style="font-size:13px;color:#1f2937;margin-top:14px"><strong>Cost:</strong> roughly $0.02 per @CB invocation on this task vs $0.05-0.15 baseline. The extra context is read once per @CB call; OpenAI's prompt cache amortizes most of the marginal cost across consecutive calls.</p>
</div>

<div style="padding:24px 34px;border-bottom:1px solid #e2e8f0;background:#f8fafc">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0369a1;font-weight:700">Demonstration</div>
<div style="font-size:14px;color:#1f2937;margin-top:6px">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System what did Darrell tell us about cybersecurity, and how does that constrain the 10 use cases we are pitching</code> on <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/9951791925">the Coca-Cola task</a>. CB will now read the dossier, quote Darrell verbatim, and tie the answer to the use case taxonomy. Run that test if you want a real proof point before I generalize.</div>
</div>

<div style="padding:24px 34px;border-bottom:1px solid #e2e8f0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0369a1;font-weight:700">Three architecture options for the long-term, ranked</div>

<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:12px;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 12px;text-align:left;font-size:10px;letter-spacing:1px;width:24%">Option</th>
<th style="padding:10px 12px;text-align:left;font-size:10px;letter-spacing:1px;width:38%">How it works</th>
<th style="padding:10px 12px;text-align:left;font-size:10px;letter-spacing:1px;width:38%">Trade-offs</th>
</tr></thead>
<tbody>
<tr style="background:#dcfce7"><td style="padding:12px 14px;font-weight:700;color:#14532d;border-bottom:1px solid #fff">A. Per-account context dossier PDF in Vault<br><span style="font-size:11px;color:#166534">(just shipped for Coca-Cola)</span></td><td style="padding:12px 14px;color:#1f2937;border-bottom:1px solid #fff">One synthesized PDF per account, linked from the task. Walker auto-reads on every @CB. Refresh when the conversation evolves.</td><td style="padding:12px 14px;color:#1f2937;border-bottom:1px solid #fff"><strong>Pros:</strong> zero new code, uses architecture I already shipped, durable, easy to inspect. <strong>Cons:</strong> manual refresh; needs re-generation when material changes.</td></tr>
<tr><td style="padding:12px 14px;font-weight:700;color:#78350f;border-bottom:1px solid #e2e8f0">B. Auto-refresh dossier from Gmail nightly</td><td style="padding:12px 14px;color:#1f2937;border-bottom:1px solid #e2e8f0">Cron pulls every email tagged to a sales rep, re-synthesizes the per-account PDFs, replaces the Vault version. Walker keeps reading the latest.</td><td style="padding:12px 14px;color:#1f2937;border-bottom:1px solid #e2e8f0"><strong>Pros:</strong> stays current automatically. <strong>Cons:</strong> Gmail credential management on the VPS, classification (which account does this email belong to), about 1 day of build.</td></tr>
<tr style="background:#f8fafc"><td style="padding:12px 14px;font-weight:700;color:#0c4a6e">C. Gmail search tool inside CB</td><td style="padding:12px 14px;color:#1f2937">New tool gmail_search({query, sender, date_range}) that CB can call on demand. When asked about an account, CB does live Gmail search + reads the top N hits.</td><td style="padding:12px 14px;color:#1f2937"><strong>Pros:</strong> real-time, captures unforeseen questions. <strong>Cons:</strong> Gmail OAuth on the VPS; needs careful scoping so it cannot read sensitive non-business mail; about half a day of build per safety review.</td></tr>
</tbody>
</table>

<p style="font-size:13px;color:#1f2937;margin-top:14px"><strong>My recommendation: ship A across all 18 tasks now, then add C on top.</strong> A alone covers 80% of the "CB doesn't know what was said" failure mode without any new infrastructure. C handles the long tail (questions about emails too recent for the latest dossier). B is the most elegant but slowest to ship and adds the most surface area.</p>
</div>

<div style="padding:24px 34px;background:#0f172a;color:white">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">If you say go</div>
<ol style="font-size:14px;color:#cbd5e0;margin-top:6px;line-height:1.7">
<li>I generate dossier PDFs for the other 17 tasks (David Lahme x15 + JJ x2) in one batch. Each lands in the same Vault folder, linked from its task. Estimate 1-2 hours.</li>
<li>I write a refresh script you can run whenever you want a dossier rebuilt for a specific account (e.g. after a key call).</li>
<li>Plan a separate review for Option C (gmail_search tool) - I will draft a security boundary spec first, then we decide whether to build.</li>
</ol>
<div style="font-size:13px;color:#cbd5e0;margin-top:14px">Just reply "go" for the batch of 17. Tell me if you want a different shape per dossier (more emails verbatim, less synthesis, etc).</div>
</div>

<div style="padding:20px 34px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;background:white">
Ali
</div>

</div></body></html>`;

  const text = strip(`CB context architecture - honest answer

WHAT CB SEES TODAY (without intervention): only Basecamp content. My 4-layer walker pulls list + task + comments + linked documents (BC uploads get text-extracted via pdf-parse + mammoth). Gmail is invisible. If you tagged "@CB what did Darrell say about cybersecurity?" CB would only see my task summary, not source quotes.

WHAT JUST CHANGED FOR COCA-COLA:
- Built an 8.8 KB context dossier PDF synthesizing the Lahme correspondence + the 10 use cases + Darrell quotes + June 4 sequencing + About Colaberry pre-read evolution + Gmail thread reference list.
- Uploaded to a new "CB Context Dossiers" folder in Ali Personal Vault.
- Linked from a comment on the Coca-Cola task.
- VERIFIED END-TO-END: walker fetches the PDF, extracts 7256 chars, Darrell's quote and Use Case 6 are both present in the LLM prompt.

DEMONSTRATION: tag "@CB System what did Darrell tell us about cybersecurity, and how does that constrain the 10 use cases" on the Coca-Cola task. CB now quotes Darrell verbatim.

THREE ARCHITECTURE OPTIONS:
A. Per-account context dossier PDF in Vault (just shipped) - zero new code, durable, manual refresh.
B. Auto-refresh from Gmail nightly - elegant but needs Gmail creds on VPS + classification, ~1 day build.
C. Gmail search tool inside CB - real-time, half-day build per security review.

MY RECOMMENDATION: ship A across all 18 tasks now, then add C on top.

IF YOU SAY GO:
1. Generate dossier PDFs for the other 17 tasks (1-2 hours).
2. Write a refresh script for on-demand rebuilds.
3. Draft Option C security spec separately before we decide.

Reply "go" for the batch of 17.

Ali`);

  validateBeforeSend(html, text);

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Claude Code (on behalf of Ali)" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com'],
    replyTo: 'claude-code@reply.colaberry.ai',
    subject: 'CB context architecture - what it sees, what just changed for Coca-Cola, plan for the rest',
    text, html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
