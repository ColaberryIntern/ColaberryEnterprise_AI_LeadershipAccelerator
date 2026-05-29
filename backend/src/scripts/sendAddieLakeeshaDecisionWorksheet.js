#!/usr/bin/env node
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const HTML_BODY = `<!doctype html>
<html><head><meta charset="utf-8"><title>2025 Tax Return Decisions - Worksheet</title></head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;padding:0"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:8px;margin:24px 0;overflow:hidden">
<tr><td style="background:#1a365d;color:#fff;padding:28px 32px">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#90cdf4;font-weight:700">Worksheet &middot; for me + addie</div>
  <h1 style="margin:6px 0 8px;font-size:24px;font-weight:800">2025 Tax Return - 4 Decisions to Make</h1>
  <div style="font-size:13px;color:#e2e8f0;line-height:1.6">Lakeesha at LV Browne CPA has been waiting on us for 8 days (since 5/21). This is the worksheet we walk through together, mark our answers, and reply back to me from. I'll handle the actual reply to Lakeesha once we land on the 4 answers.</div>
</td></tr>

<tr><td style="padding:24px 32px;color:#2d3748;font-size:14px;line-height:1.65">

<div style="background:#fffaf0;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:4px;margin-bottom:24px">
<strong>📋 The 4 decisions, in the order Lakeesha needs them:</strong><br>
1. SEP-IRA contribution for 2025 - yes/no, and if yes, how much?<br>
2. Authorize her to charge her CPA fee now?<br>
3. Cancel the $350 quarterly auto-debit (eats $199 cancellation, applies ~$151 to fee)?<br>
4. Sign off on the 5/11 updated return as-is?
</div>

<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">Where things stand right now</h2>
<ul>
<li><strong>5/6:</strong> Lakeesha sent first draft return - we owe taxes this year (mainly from rental income shifts)</li>
<li><strong>5/7:</strong> I sent her additional deductions to reduce the bill</li>
<li><strong>5/11:</strong> She sent the updated return - waiting on our review + sign-off</li>
<li><strong>5/21:</strong> I asked about a payment plan. She said: file first, then irs.gov/pay for IRS plan once accepted</li>
<li><strong>5/21:</strong> She asked permission to charge her CPA fee. I proposed using the $350 quarterly auto-debit. She said: $199 cancellation fee, $151 applies to her fee</li>
<li><strong>5/21 22:37 onward:</strong> radio silence from us</li>
</ul>

<!-- DECISION 1 -->
<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">Decision 1: SEP-IRA contribution for 2025?</h2>
<p><strong>The trade:</strong> a SEP contribution lowers our 2025 taxable income, so the tax bill drops. But it uses cash now. The deadline to contribute for 2025 is the extended filing deadline (10/15) but Lakeesha needs the answer NOW because the return is unfilable until we decide.</p>
<p><strong>SEP limits for 2025:</strong> up to 25% of self-employment net earnings, capped at $69,000.</p>
<p><strong>Math we should look at:</strong></p>
<ul>
<li>What's the current tax owed amount on the 5/11 return? <span style="color:#a0aec0">(need to look at the PDF)</span></li>
<li>What's our cash position right now? Can we afford to lock $X away in a SEP?</li>
<li>Is the marginal tax saving worth the liquidity cost? Roughly: every $1k SEP contribution saves ~$220-$320 in tax depending on bracket.</li>
</ul>
<div style="background:#ebf4ff;border-left:4px solid #2b6cb0;padding:14px 18px;border-radius:4px;margin-top:14px">
<strong>Our answer (mark when we decide):</strong><br>
<table cellpadding="6" cellspacing="0" style="margin-top:6px;font-size:14px">
<tr><td>☐ No SEP. File as-is.</td></tr>
<tr><td>☐ Yes SEP. Amount: $______________</td></tr>
<tr><td>☐ Defer - want Lakeesha to run two scenarios first (with and without)</td></tr>
</table>
</div>

<!-- DECISION 2 -->
<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">Decision 2: Authorize Keesha to charge her CPA fee now?</h2>
<p><strong>Context:</strong> She is sitting on the return waiting on payment. She asked twice. Standard practice is to pay the preparer at completion. Saying yes unblocks the file step.</p>
<p><strong>We need from Keesha first:</strong> total fee number - I just sent her that question separately, so we'll know before we answer this one.</p>
<div style="background:#ebf4ff;border-left:4px solid #2b6cb0;padding:14px 18px;border-radius:4px;margin-top:14px">
<strong>Our answer:</strong><br>
<table cellpadding="6" cellspacing="0" style="margin-top:6px;font-size:14px">
<tr><td>☐ Yes - authorize her to charge the full fee on the card on file</td></tr>
<tr><td>☐ Yes - but use the quarterly auto-debit redirect (see Decision 3)</td></tr>
<tr><td>☐ Yes - but split: 50% now, 50% on file acceptance</td></tr>
<tr><td>☐ No - we want to pay manually after seeing the total. Tell her the date.</td></tr>
</table>
</div>

<!-- DECISION 3 -->
<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">Decision 3: Cancel the $350 quarterly auto-debit?</h2>
<p><strong>The math:</strong> $350 already came out. Cancellation fee is $199. That leaves $151 applied toward Keesha's fee. Net cost of cancelling: $199 vs the savings of NOT continuing the quarterly billings going forward.</p>
<p><strong>Question we should think about:</strong> what is the $350 quarterly debit FOR? Is it ongoing tax planning / quarterly estimated tax review? If we cancel, do we lose that service?</p>
<div style="background:#ebf4ff;border-left:4px solid #2b6cb0;padding:14px 18px;border-radius:4px;margin-top:14px">
<strong>Our answer:</strong><br>
<table cellpadding="6" cellspacing="0" style="margin-top:6px;font-size:14px">
<tr><td>☐ Cancel, apply the $151 toward Keesha's fee. Eat the $199.</td></tr>
<tr><td>☐ Keep the quarterly going. Pay Keesha's fee separately.</td></tr>
<tr><td>☐ Need more info from Keesha before deciding (what is the $350 buying us?)</td></tr>
</table>
</div>

<!-- DECISION 4 -->
<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">Decision 4: Sign off on the 5/11 updated return?</h2>
<p><strong>What we need to do:</strong> open the 5/11 updated return PDF Lakeesha sent and verify:</p>
<ul>
<li>Total tax owed line matches what we expect after my 5/7 additions</li>
<li>All rental income / cost basis numbers correct (Bamboo, Ranchview, Bent Brook)</li>
<li>Dependent care benefits handled ($5000 W-2, Creed Muwwakkil as provider)</li>
<li>Both W-2s captured (yours from Mimosa + mine from Colaberry)</li>
<li>Anything weird that doesn't match our records</li>
</ul>
<div style="background:#ebf4ff;border-left:4px solid #2b6cb0;padding:14px 18px;border-radius:4px;margin-top:14px">
<strong>Our answer:</strong><br>
<table cellpadding="6" cellspacing="0" style="margin-top:6px;font-size:14px">
<tr><td>☐ Approve as-is. Sign + file.</td></tr>
<tr><td>☐ Approve with changes (list them): _________________________________</td></tr>
<tr><td>☐ Need to see the PDF before deciding</td></tr>
</table>
</div>

<!-- AFTER DECISIONS -->
<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">What happens AFTER we file</h2>
<p>Sequence so we know what's coming:</p>
<ol>
<li>Keesha files the return with IRS</li>
<li>IRS accepts (usually 24-48 hours for e-file)</li>
<li>We go to <a href="https://irs.gov/pay">irs.gov/pay</a> and set up the IRS payment plan with the amount on file</li>
<li>State payment plan if applicable (separate)</li>
</ol>

<h2 style="color:#1a365d;font-size:18px;margin-top:32px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">📨 Once we've marked our 4 answers, reply to this email</h2>
<div style="background:#dcfce7;border-left:4px solid #16a34a;padding:18px;border-radius:4px">
<strong>Just reply with:</strong>
<pre style="background:#fff;padding:12px;border-radius:4px;font-size:13px;font-family:monospace;border:1px solid #cbd5e0">1. SEP: [no / yes $X / defer scenarios]
2. CPA fee: [authorize full / use quarterly / split / no]
3. Quarterly: [cancel / keep / need info]
4. Return: [approve as-is / changes: ... / show me PDF first]</pre>
<p style="margin-bottom:0">Once it lands, I draft the actual reply to Lakeesha within 1 hour. She'll have her answers and can file by Monday.</p>
</div>

</td></tr>

<tr><td style="background:#f7fafc;padding:18px 32px;text-align:center;font-size:12px;color:#718096;border-top:1px solid #e2e8f0">
This is a worksheet for the two of us, not a Lakeesha-facing document. Keep it. Mark it up. Reply when ready.
</td></tr>

</table>
</td></tr></table>
</body></html>`;

const TEXT_BODY = `2025 Tax Return - 4 Decisions Worksheet (for me + Addie)

Lakeesha has been waiting 8 days. Walk through this, mark answers, reply to me.

1. SEP-IRA for 2025?
   - No SEP. File as-is.
   - Yes $______
   - Defer - want Lakeesha to run scenarios first

2. Authorize Keesha to charge her CPA fee now?
   - Yes full
   - Yes via quarterly auto-debit redirect (see #3)
   - 50/50 split
   - No - manual pay later

3. Cancel $350 quarterly auto-debit? ($199 cancel fee, $151 applies to her fee)
   - Cancel
   - Keep
   - Need info on what the $350 buys

4. Sign off on 5/11 updated return?
   - Approve as-is
   - Approve with changes: ___
   - Need to see PDF first

Reply with answers in that format and I send back to Keesha within 1 hour.

Ali`;

if (!process.env.MANDRILL_API_KEY) { console.error('MANDRILL_API_KEY required'); process.exit(1); }

nodemailer.createTransport({
  host: 'smtp.mandrillapp.com', port: 587,
  auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
}).sendMail({
  from: '"Ali Muwwakkil" <ali@colaberry.com>',
  to: ['ali@colaberry.com', 'addie.m.mack@gmail.com'],
  subject: '2025 Tax Return - 4 decisions worksheet (let\'s walk through and reply back)',
  text: TEXT_BODY,
  html: HTML_BODY,
  headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false' },
}).then(r => {
  console.log('Sent Addie+Ali decision worksheet:', r.messageId);
}).catch(e => { console.error('Failed:', e.message); process.exit(1); });
