#!/usr/bin/env node
// Wrap-up email for the "proceed through all the issues" execution pass.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '');
const ALI_SGID = 'BAh7BkkiC19yYWlscwY6BkVUewdJIglkYXRhBjsAVEkiKWdpZDovL2JjMy9QZXJzb24vMTc0NTQ4MzU_ZXhwaXJlc19pbgY7AFRJIghwdXIGOwBUSSIPYXR0YWNoYWJsZQY7AFQ=--119f405284666f646ff92128b896da907f10c3ab';
const MENTION = `<bc-attachment sgid="${ALI_SGID}" content-type="application/vnd.basecamp.mention"></bc-attachment>`;
const BUCKET = 7463955;
const TODO_ID = 9945833396;
const TODO_URL = `https://app.basecamp.com/3945211/buckets/${BUCKET}/todos/${TODO_ID}`;

const REPO = path.resolve(__dirname, '../../..');
const ASSUMPTIONS_PATH = path.join(REPO, 'docs/training-program-2026-q3/ASSUMPTIONS_LOG.md');
const TWC_PATH = path.join(REPO, 'docs/training-program-2026-q3/TWC_INTENSIVE_OUTCOMES.md');
const JD_PATH = path.join(REPO, 'docs/training-program-2026-q3/TEAM_LEAD_JOB_DESCRIPTIONS.md');
const SQL_PATH = path.join(REPO, 'docs/training-program-2026-q3/ccpp-training-schema.sql');

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const bcComment = `<div>${MENTION} <strong>Execution pass complete.</strong></div>
<div><br></div>
<div>You asked me to proceed through all the outstanding issues. Most of the Decision Queue items genuinely require your input (brand name, persona, pricing, BLACK approvals, etc.), but per the proceed-by-default doctrine I locked my recommended decisions as working assumptions and shipped the foundational pieces that proceed under those assumptions.</div>
<div><br></div>
<div><strong>What I just shipped (4 attachments coming via email):</strong></div>
<ol>
<li><strong>ASSUMPTIONS_LOG.md</strong> - 17 decisions locked as working assumptions. You override any of them by replying.</li>
<li><strong>TWC_INTENSIVE_OUTCOMES.md</strong> - counsel-ready draft of per-intensive outcome statements. Hand to TWC-aware counsel for Jun 13 gate.</li>
<li><strong>TEAM_LEAD_JOB_DESCRIPTIONS.md</strong> - 4 JDs (Website Lead, Marketing Lead, AI Team Contract Dev, part-time SDR). Post-ready.</li>
<li><strong>ccpp-training-schema.sql</strong> - 4 new CCPP tables (ADF_TrainingPrograms, ADF_TrainingCohorts, ADF_TrainingEnrollments, ADF_TrainingDropReasons) plus a convenience view. NOT YET EXECUTED. Run when you're ready.</li>
</ol>
<div><br></div>
<div><strong>Plus the Anthropic Partner per-person drill-down email</strong> (sent separately) showing exactly who's stalled and a chase-script template.</div>
<div><br></div>
<div><strong>Still in your court (genuinely needs you):</strong></div>
<ul>
<li>The 7 BLACK exit approvals (open the BLACK pre-review email)</li>
<li>Nudge mode flip (tag @CB after BLACK is processed)</li>
<li>Anthropic Partner finish-line chase (drill-down has the list)</li>
<li>4 Jun-6 training decisions (or accept my locks in ASSUMPTIONS_LOG.md by silence)</li>
<li>TWC counsel engagement</li>
<li>Posting the 4 JDs to your network</li>
<li>Running ccpp-training-schema.sql against CCPP when ready</li>
</ul>`;

const emailHtml = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:720px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Execution pass complete</div>
<div style="font-size:24px;font-weight:800;margin-top:6px;line-height:1.25">5 deliverables shipped under working assumptions</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, you asked me to proceed through all the outstanding issues. Most of the Decision Queue genuinely needs your judgment (brand, persona, pricing, BLACK approvals), but per the proceed-by-default doctrine I locked my recommended decisions as working assumptions and shipped the foundational pieces that proceed under those assumptions. You override anything by replying. If you do nothing, downstream work continues on these locks.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:0 0 14px">4 attachments + 1 separate email shipped</h2>

<table cellpadding="10" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #cbd5e0">
<tr style="background:#1a365d;color:white"><th align="left" style="padding:10px">File</th><th align="left" style="padding:10px">What it does</th></tr>
<tr style="background:#f8fafc"><td><strong>ASSUMPTIONS_LOG.md</strong></td><td>17 strategic decisions locked as working assumptions (brand, persona, pricing, cohort size, mentor sourcing, refund policy, capstone rubric, etc.). Override mechanism documented. If silent, downstream proceeds on these.</td></tr>
<tr><td><strong>TWC_INTENSIVE_OUTCOMES.md</strong></td><td>Counsel-ready draft for the Jun 13 TWC gate. Per-intensive independent outcome statements + 5 open questions for counsel. Sized for direct forward to TWC-aware counsel.</td></tr>
<tr style="background:#f8fafc"><td><strong>TEAM_LEAD_JOB_DESCRIPTIONS.md</strong></td><td>4 ready-to-post JDs (Website Lead full-time / Marketing Lead part-time / AI Dev full-time / Sales SDR part-time). Edit comp lines, then post to your network.</td></tr>
<tr><td><strong>ccpp-training-schema.sql</strong></td><td>4 new CCPP tables (Programs / Cohorts / Enrollments / DropReasons) + convenience view. Wrapped in BEGIN TRANSACTION. NOT EXECUTED. Review and COMMIT when ready.</td></tr>
<tr style="background:#f8fafc"><td colspan="2"><em>Separately:</em> <strong>[Anthropic Partner] Drill-down</strong> email - per-person view of all 10 cohort members with chase-script template.</td></tr>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">What's still in your court</h2>

<ol style="font-size:14px;line-height:1.7;margin:0 0 0 18px;padding:0">
<li><strong>7 BLACK exit approvals</strong> - open the [Action Required] BLACK pre-review email (sent earlier). Each card has the CLI pre-filled.</li>
<li><strong>Flip nudges to live</strong> after BLACK is processed - tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System set intern nudge mode live</code>.</li>
<li><strong>Anthropic Partner chase</strong> - use the drill-down (separate email). Direct-message each STALLED person tonight.</li>
<li><strong>Confirm or override the 4 main Jun-6 assumptions</strong> - if silent, downstream proceeds under: brand "AI Systems Architect Accelerator" / persona career changer / pricing $79+$149 BYO / team leads to be hired.</li>
<li><strong>Engage TWC-aware counsel</strong> - forward TWC_INTENSIVE_OUTCOMES.md.</li>
<li><strong>Post the JDs</strong> to your network (LinkedIn, founder networks, ex-colleagues).</li>
<li><strong>Run ccpp-training-schema.sql</strong> against CCPP when comfortable. Wrapped in transaction; review the sanity-check SELECT before COMMIT.</li>
</ol>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">Override mechanism</h2>

<table cellpadding="8" cellspacing="0" border="0" style="width:100%;font-size:13px">
<tr><td style="vertical-align:top;width:220px;color:#475569"><strong>Override an assumption</strong></td><td style="vertical-align:top">Reply on the <a href="${TODO_URL}" style="color:#2b6cb0">BC todo</a> with "A3: actually use $99 bundled because..." (the assumption ID + new value).</td></tr>
<tr><td style="vertical-align:top;color:#475569"><strong>Or via @CB</strong></td><td style="vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System override assumption A3 to &lt;value&gt; because &lt;reason&gt;</code> in any thread.</td></tr>
<tr><td style="vertical-align:top;color:#475569"><strong>If silent</strong></td><td style="vertical-align:top">Downstream work proceeds on the locked assumption. Cohort start, schema, JDs, TWC outcomes all assume the recommended path.</td></tr>
</table>

</div>

<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-left:3px solid #1a365d;padding-left:14px;margin:0 32px 24px;font-size:13px;color:#1a202c">
<tr><td style="padding:0">
<div style="font-weight:700;font-size:15px;color:#1a365d">CB System</div>
<div style="color:#2b6cb0;font-weight:600">Ali Muwwakkil's executive agent</div>
<div style="color:#64748b">Colaberry Inc.</div>
</td></tr></table>

</div>
</body></html>`;

const emailText = `Ali, execution pass complete. 5 deliverables shipped under working assumptions.

ATTACHED:
1. ASSUMPTIONS_LOG.md - 17 strategic decisions locked, override by replying
2. TWC_INTENSIVE_OUTCOMES.md - counsel-ready draft for Jun 13 gate
3. TEAM_LEAD_JOB_DESCRIPTIONS.md - 4 ready-to-post JDs
4. ccpp-training-schema.sql - 4 new CCPP tables, NOT EXECUTED

SEPARATELY: [Anthropic Partner] drill-down email with chase script.

STILL IN YOUR COURT:
- 7 BLACK exit approvals (open BLACK pre-review email)
- Flip nudges to live: tag @CB System set intern nudge mode live
- Anthropic Partner finish-line chase (use drill-down)
- 4 Jun-6 decisions (or accept locks by silence)
- TWC counsel engagement (forward TWC outcomes)
- Post the 4 JDs to your network
- Run ccpp-training-schema.sql when comfortable

BC todo: ${TODO_URL}

--
CB System
Ali Muwwakkil's executive agent
Colaberry Inc.`;

async function bcPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}

(async () => {
  console.log('Posting BC comment...');
  const bcResp = await bcPost(`https://3.basecampapi.com/3945211/buckets/${BUCKET}/recordings/${TODO_ID}/comments.json`, {
    content: stripEmDashes(bcComment),
  });
  console.log('BC comment posted:', bcResp.id);

  for (const p of [ASSUMPTIONS_PATH, TWC_PATH, JD_PATH, SQL_PATH]) {
    const s = fs.statSync(p);
    console.log(`  attachment ${path.basename(p)} (${(s.size / 1024).toFixed(1)}KB)`);
  }

  console.log('Sending email...');
  const htmlClean = stripEmDashes(emailHtml);
  const textClean = stripEmDashes(emailText);
  validateBeforeSend(htmlClean, textClean);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: 'alimuwwakkil@gmail.com',
    subject: '[Execution Pass] 5 deliverables shipped under working assumptions',
    text: textClean,
    html: htmlClean,
    attachments: [
      { filename: 'ASSUMPTIONS_LOG.md', path: ASSUMPTIONS_PATH },
      { filename: 'TWC_INTENSIVE_OUTCOMES.md', path: TWC_PATH },
      { filename: 'TEAM_LEAD_JOB_DESCRIPTIONS.md', path: JD_PATH },
      { filename: 'ccpp-training-schema.sql', path: SQL_PATH },
    ],
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  console.log('Email sent:', r.messageId);
})().catch(e => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
