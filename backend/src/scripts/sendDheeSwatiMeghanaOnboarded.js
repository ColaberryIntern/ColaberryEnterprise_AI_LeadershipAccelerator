#!/usr/bin/env node
// Reply to Dhee + Swati explaining Meghana has been onboarded.
// Triggered by Dhee's 2026-06-01 9:29am "@Ali Muwwakkil Please advise"
// reply to Swati's 2026-05-29 1:01pm "provide Basecamp access to Meghana" email.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const ONBOARDING_TODO_URL = 'https://app.basecamp.com/3945211/buckets/24865175/todos/9950486302';
const BUILD_TODO_URL = 'https://app.basecamp.com/3945211/buckets/24865175/todos/9950486363';
const INTERNSHIP_PROJECT_URL = 'https://3.basecamp.com/3945211/projects/24865175';

(async () => {
  const html = `<!doctype html><html><body style="margin:0;padding:0;font-family:arial,sans-serif;color:#1a202c;line-height:1.6;background:white">
<div style="max-width:680px;padding:24px 28px;font-size:14px">
<p>Dhee, Swati,</p>

<p>Meghana has been added. Here's the status.</p>

<h3 style="color:#1a365d;font-size:15px;margin-top:18px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px">Basecamp access</h3>
<ul style="margin:6px 0 0;padding-left:22px">
<li>Granted to <strong>b.meghana.chowdary02@gmail.com</strong> on the Internship / Apprenticeship Projects bucket: <a href="${INTERNSHIP_PROJECT_URL}">project link</a>.</li>
<li>She'll get the standard Basecamp invitation email and can set her password and log in. Basecamp person ID assigned: 52489233.</li>
</ul>

<h3 style="color:#1a365d;font-size:15px;margin-top:18px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px">Her two starting tasks</h3>
<p>Created and assigned to Meghana, duplicated from the Sarbjit + OBI templates so she has the same starting kit anyone else gets.</p>
<ol style="margin:6px 0 0;padding-left:22px">
<li><strong>Onboarding</strong> - <a href="${ONBOARDING_TODO_URL}">Meghana Chowdary - New Internship Onboarding</a>.<br>
   Includes the Colaberry Blueprint video + the podcast (carried over verbatim from the Sarbjit template).</li>
<li><strong>Build System</strong> - <a href="${BUILD_TODO_URL}">Meghana Chowdary - Colaberry Internship Build System</a>.<br>
   In the "Internship Build System" list per Swati's 2026-05-29 ask. After she completes the training described in the task, she gets her actual build ticket assigned on that same list.</li>
</ol>

<h3 style="color:#1a365d;font-size:15px;margin-top:18px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px">What's been communicated to Meghana</h3>
<p>One welcome comment posted on the Onboarding todo, tagging Meghana, Dhee, and me. Plain-English:</p>
<ul style="margin:6px 0 0;padding-left:22px">
<li>Welcome + brief orientation</li>
<li>Both task links with what to do on each</li>
<li>The 3-updates-per-week program standard and the consequences for going dark (4-6 days warning, 7-9 days formal warning, 10+ days processed out with a 72-hour reinstatement window). This is the same auto-nudge system that just shipped today.</li>
<li>Routing: technical questions on training/build go to Dhee; program-level go to me; admin questions (access, accounts, payments) go to Dhee.</li>
<li>Asked her to reply on the Onboarding todo once she starts so we know she's off to a clean start.</li>
</ul>

<h3 style="color:#1a365d;font-size:15px;margin-top:18px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px">One open thread - CCPP record</h3>
<p>I deferred the CCPP <code>ADF_InternshipProgram</code> insert. Reason: that table joins to a master user record via <code>InternUserID</code>, and Meghana Chowdary doesn't have a CCPP user record yet (the only "Meghana" in CCPP is Meghana Madikonda, a separate person). Inserting a new user row into <code>ADF_ColaberryActiveUsers</code> blind would risk corrupting the data warehouse, since that table sits in the middle of registration/class/payment flows I haven't traced.</p>
<p>Two options on this, your call:</p>
<ol style="margin:6px 0 0;padding-left:22px">
<li><strong>Dhee runs the manual CCPP add</strong> via whatever your normal new-intern provisioning is. Same as we've done historically. Once her InternID is in <code>ADF_InternshipProgram</code>, she'll show up in the daily intern reports automatically.</li>
<li><strong>I build the safe CCPP-add helper next.</strong> Probe the upstream user-provisioning flow (registration -&gt; class assignment -&gt; intern table), write it as a verified two-step transaction, and wire it as a @CB tool. Probably a half-day of work.</li>
</ol>
<p>Today's onboarding does not block on this - she has BC access, she has the tasks, she's ready to start. The CCPP record is what makes her appear in the daily nudge/intern reports.</p>

<p>Let me know which path you want on the CCPP side and I'll move on it.</p>

<p>Ali</p>
</div></body></html>`;

  const text = strip(`Dhee, Swati,

Meghana has been added. Status:

BASECAMP ACCESS
- Granted to b.meghana.chowdary02@gmail.com on Internship / Apprenticeship Projects.
- Project: ${INTERNSHIP_PROJECT_URL}
- She gets the standard BC invitation email + sets her password.
- BC person ID assigned: 52489233.

HER TWO STARTING TASKS (created and assigned to her)
1. Onboarding - duplicated from the Sarbjit template, includes Colaberry Blueprint video + podcast:
   ${ONBOARDING_TODO_URL}
2. Build System - duplicated from the OBI template, in the Internship Build System list per Swati's 2026-05-29 ask. Her actual build ticket assigns there after training:
   ${BUILD_TODO_URL}

WHAT'S BEEN COMMUNICATED TO MEGHANA
One welcome comment on the Onboarding todo tagging Meghana, Dhee, me. Covered:
- Brief orientation
- Both task links with what to do
- The 3-updates-per-week program standard + the auto-exit consequences (4-6 days warning, 7-9 days formal warning, 10+ days processed out with 72hr reinstatement window). Same auto-nudge system that just shipped today.
- Routing: technical training/build questions -> Dhee. Program-level -> me. Admin (access, accounts, payments) -> Dhee.
- Asked her to reply on the Onboarding todo once she starts.

ONE OPEN THREAD - CCPP RECORD
I deferred the CCPP ADF_InternshipProgram insert. The table joins to a master user record via InternUserID and Meghana Chowdary has no CCPP user yet. Inserting blind into ADF_ColaberryActiveUsers risks corrupting the data warehouse, since that table sits in registration/class/payment flows I haven't traced.

Two options - your call:
1. Dhee runs the manual CCPP add via your normal new-intern provisioning. Once her InternID is in ADF_InternshipProgram, she shows up in the daily intern reports automatically.
2. I build the safe CCPP-add helper next. Probe upstream provisioning, two-step verified transaction, wire as @CB tool. Half-day.

Today's onboarding doesn't block on this. She has BC access, tasks, and is ready to start. CCPP record makes her show in the daily reports.

Let me know which path on CCPP and I'll move on it.

Ali`);

  validateBeforeSend(html, text);

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: ['dhee@colaberry.com', 'swati@colaberry.com'],
    cc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    subject: 'Re: Basecamp access for Meghana',
    text,
    html,
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
