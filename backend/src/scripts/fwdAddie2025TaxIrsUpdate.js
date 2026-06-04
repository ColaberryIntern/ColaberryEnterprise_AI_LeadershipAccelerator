#!/usr/bin/env node
// Forward the 2025 tax IRS-update email (sent to Lakeesha earlier today,
// Mandrill 042f5626) to Addie. Per Ali corrections 2026-06-04: always CC
// Addie on tax-related comms (saved as memory feedback_lakeesha_addie_tax_rules);
// retroactively forwarding the one I missed.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const { sendWithBcAttach } = require(path.resolve(__dirname, './lib/sendWithBcAttach'));

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 20px;">
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

const HTML = `<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.55; max-width: 700px;">

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">Addie,</p>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">Forwarding the update I sent to Lakeesha earlier today on the 2025 returns. Wanted you in the loop on the IRS call outcome + the IP PIN before the return goes in the mail.</p>

<hr style="border:none;border-top:1px solid #cbd5e1;margin:18px 0">

<div style="background:#f8fafc;border-left:3px solid #1a365d;padding:8px 14px;font-size:12px;color:#475569;margin-bottom:14px">
<strong>From:</strong> ali@colaberry.com<br>
<strong>To:</strong> Lakeesha Browne &lt;info@lvbrownecpa.com&gt;<br>
<strong>Date:</strong> 2026-06-04<br>
<strong>Subject:</strong> Re: 2025 tax return - IRS update + IP PIN + please mail the signed return
</div>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">Lakeesha,</p>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">Quick update from my IRS call. The signed 2025 returns are ready to go.</p>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">The IRS issued me an Identity Protection PIN today and the account is secured. They told me the signed return needs to be filed by <strong>mail</strong> because of the prior-filing situation that triggered the identity check.</p>

<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:14px 18px;margin:14px 0;font-family: arial, sans-serif;">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#475569;font-weight:700;margin-bottom:6px">2025 IP PIN (use on the return)</div>
<div style="font-family:'Courier New', monospace;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:2px">144104</div>
<div style="font-size:11px;color:#64748b;margin-top:6px">Per IRS guidance the IP PIN is shared with the tax preparer only. New PIN is issued each January.</div>
</div>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;"><strong>IRS guidance from the call:</strong></p>
<ul style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; margin: 0 0 12px;">
<li>File the signed return by mail, then wait 3 weeks and call back to confirm it landed in their system.</li>
<li>The two-return situation will trigger an investigation on their side. The agent flagged that investigations take a long time.</li>
<li>Once a return is submitted, they cannot modify it. The likely path is the return gets flagged for review and the investigation runs in parallel.</li>
</ul>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;"><strong>Please proceed with mailing the signed return.</strong> Use the IP PIN above on the return. I will keep you posted on the 3-week check-in and on anything that comes back from the investigation side.</p>

<p style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748;">If you need anything else from me to put it in the mail, let me know.</p>

${SIG_HTML}

</div>`;

const TEXT = `Addie,

Forwarding the update I sent to Lakeesha earlier today on the 2025 returns. Wanted you in the loop on the IRS call outcome + the IP PIN before the return goes in the mail.

---------- Forwarded message ---------
From: ali@colaberry.com
To: Lakeesha Browne <info@lvbrownecpa.com>
Date: 2026-06-04
Subject: Re: 2025 tax return - IRS update + IP PIN + please mail the signed return

Lakeesha,

Quick update from my IRS call. The signed 2025 returns are ready to go.

The IRS issued me an Identity Protection PIN today and the account is secured. They told me the signed return needs to be filed by MAIL because of the prior-filing situation that triggered the identity check.

2025 IP PIN (use on the return): 144104

(Per IRS guidance the IP PIN is shared with the tax preparer only. A new PIN is issued each January.)

IRS GUIDANCE FROM THE CALL:
- File the signed return by mail, then wait 3 weeks and call back to confirm it landed in their system.
- The two-return situation will trigger an investigation on their side. The agent flagged that investigations take a long time.
- Once a return is submitted, they cannot modify it. The likely path is the return gets flagged for review and the investigation runs in parallel.

Please proceed with mailing the signed return. Use the IP PIN above on the return. I will keep you posted on the 3-week check-in and on anything that comes back from the investigation side.

If you need anything else from me to put it in the mail, let me know.

${SIG_TEXT}`;

(async () => {
  const r = await sendWithBcAttach({
    ticketId: 9940778423,
    bucketId: 33392153, // Family Goals & Life Planning
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'addie.m.mack@gmail.com',
    bcc: ['ali@colaberry.com', 'alimuwwakkil@gmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Fwd: 2025 tax return - IRS update + IP PIN + Lakeesha mailing the signed return',
    html: HTML,
    text: TEXT,
    bcSummary: '<p>Retroactive forward to Addie of the 2025 tax IRS-update email Ali sent to Lakeesha earlier today (original Mandrill 042f5626 to info@lvbrownecpa.com). Per Ali correction 2026-06-04 ("Make sure you copy Addie on anything tax related"). Memory rule saved as feedback_lakeesha_addie_tax_rules so future tax emails CC Addie at addie.m.mack@gmail.com by default. Also deleted the bad keesha@lvbrownecpa.com row from inbox_vips - that was the address Ali flagged as fabricated.</p>',
  });
  console.log('Mandrill:', r.mandrillId);
  console.log('BC comment:', r.commentUrl);
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
