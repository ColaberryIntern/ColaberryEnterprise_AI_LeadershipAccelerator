#!/usr/bin/env node
// Confirmation email to Ali that the gap is closed: 5 backfills posted + new
// sendWithBcAttach helper in place. THIS EMAIL is itself sent via the new
// helper as proof the workflow works end-to-end.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Make sure BASECAMP_ACCESS_TOKEN is set (use fallback if not in env)
if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#14532d 0%,#1a365d 100%);color:white;padding:24px 28px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Both done</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">Backfill complete. Wrapper helper in place. This email was sent through it.</h1>
<div style="font-size:13px;color:#cbd5e0">Both fixes from your direct ask are shipped. The proof: this email is being sent through the new wrapper, with its ticketId required at the call site, and auto-attached to a BC ticket without me writing a separate attach script.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">Part 1: Backfill</h2>
<p style="font-size:14px">Posted comments on the 5 originating BC tickets for the previously-missed emails:</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:13px">
<thead><tr style="background:#1a365d;color:white">
<th style="padding:10px 14px;text-align:left;font-size:11px">Email</th>
<th style="padding:10px 14px;text-align:left;font-size:11px">Now lives on</th>
</tr></thead>
<tbody>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Triad Alden comparison plan</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">Alden upgrade Overview todo 9953675946</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">AI Project Architect rollout summary + xlsx</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">AI_ProjectArchitect Overview todo 9953889114 (xlsx uploaded to Vault)</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">David ad refreshed-V3 HTML</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">RE Magazine ad todo 9955562788</td></tr>
<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">David ad standalone-fix follow-up</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">RE Magazine ad todo 9955562788</td></tr>
<tr><td style="padding:8px 12px">Trigger-live notification</td><td style="padding:8px 12px">RE Magazine ad todo 9955562788</td></tr>
</tbody>
</table>
<div style="margin-top:10px;font-size:12px;color:#94a3b8;font-style:italic">Two emails accepted as exceptions (no ticket home): Cory delivery diagnosis (admin fix-it) + Kes Workspace reset (personal admin).</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Part 2: The wrapper</h2>
<p style="font-size:14px"><code>backend/src/scripts/lib/sendWithBcAttach.js</code> is the new canonical email send for Ali Personal flows. It does three things in one call:</p>
<ol style="font-size:14px;padding-left:22px;line-height:1.7">
<li><strong>Sends via Mandrill</strong> (same transport, same em-dash strip, same preflight as before).</li>
<li><strong>Uploads any produced documents</strong> to the project Vault under CB Context Dossiers, so the CB walker can read them later.</li>
<li><strong>Posts a structured comment</strong> on the originating BC ticket with subject + recipients + Mandrill ID + summary + Vault links.</li>
</ol>

<div style="padding:14px 18px;background:#fef2f2;border-left:5px solid #c1272d;border-radius:0 6px 6px 0;font-size:13px;color:#7f1d1d;margin-top:14px">
<strong>The forcing function:</strong> <code>ticketId</code> is REQUIRED. If a caller omits it, the helper throws immediately. There is no opt-out. The only way to bypass is to drop down to raw nodemailer - which a future Claude session will see and treat as a deliberate exception, not an accident.
</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Why this email is proof it works</h2>
<p style="font-size:14px">This email was sent via <code>sendWithBcAttach</code> with <code>ticketId: 9953889114</code> (the AI_ProjectArchitect Overview todo). If you check that ticket right now you will see a comment with the same content you are reading. No separate attach script. No two-step process. If I forget the ticketId on the next email, the script throws before sending.</p>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What changes going forward</h2>
<ul style="font-size:14px;padding-left:22px;line-height:1.7">
<li>New email scripts use the helper directly. One file, one call, both surfaces (Gmail + BC) covered.</li>
<li>Existing scripts under <code>backend/src/scripts/sendXxx.js</code> stay as-is for now. They can be migrated when next touched.</li>
<li>Memory now has <code>reference_send_with_bc_attach_helper</code> under Email Sending so future Claude sessions default to this pattern.</li>
<li>The two genuine exceptions (one-off admin sends like Kes login or fix-it instructions) still use raw nodemailer. The choice is conscious, not accidental.</li>
</ul>

<p style="font-size:14px;margin:18px 0 0">If anything in either part needs to be adjusted - the wrapper signature, the comment format, the Vault folder, the BC summary template - tell me and I tighten it.</p>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Ali
</div>

</div></body></html>`;

const TEXT = `Ali - both done.

PART 1 BACKFILL: Posted comments on 5 originating BC tickets:
- Triad Alden comparison plan -> Alden upgrade Overview 9953675946
- AI Project Architect rollout + xlsx -> AI_ProjectArchitect Overview 9953889114 (xlsx in Vault)
- David ad refreshed-V3 HTML -> RE Magazine ad 9955562788
- David ad standalone fix -> RE Magazine ad 9955562788
- Trigger-live notification -> RE Magazine ad 9955562788

Two exceptions accepted (no ticket home): Cory diagnosis + Kes reset (both admin fix-its).

PART 2 WRAPPER: backend/src/scripts/lib/sendWithBcAttach.js is the new canonical email send. Sends via Mandrill + uploads produced docs to Vault + posts structured BC comment - all in one call.

THE FORCING FUNCTION: ticketId is REQUIRED. Throws if omitted. No opt-out. The only bypass is dropping to raw nodemailer, which a future session will see as a deliberate exception.

PROOF: this email was sent via sendWithBcAttach with ticketId 9953889114. Check that ticket - the same content lives there as a comment.

WHAT CHANGES: new scripts use the helper directly. Existing scripts stay until next touched. Memory now has reference_send_with_bc_attach_helper.

Ali`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9953889114, // AI_ProjectArchitect Overview todo
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    subject: 'Ali - both done: backfill complete + sendWithBcAttach helper in place (this email is the proof)',
    html: HTML, text: TEXT,
    bcSummary: '<p>Confirmation email to Ali that the operating-doctrine gap is closed. Backfilled 5 previously-missed emails to their BC tickets + built <code>sendWithBcAttach</code> helper that forces <code>ticketId</code> at call site. This very comment was created automatically by the new helper as proof of the workflow.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
