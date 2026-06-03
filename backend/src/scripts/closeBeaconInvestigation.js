#!/usr/bin/env node
// Close Hotmail beacon-routing investigation BC todo 9945469075.
// Findings: both beacons landed in our Gmail (provider=gmail_colaberry)
// 2026-05-30 14:18 UTC. Microsoft accepted them per Mandrill but lost
// them inside Hotmail. The Hotmail Inbox COS path is now deprecated -
// pivoted to Hotmail->Gmail forwarding rule 2026-06-03 (Inbox Manager
// Phase 1) which resolves the visibility gap going forward.
//
// Cleanup: 2 test inbox_rules deleted via DELETE FROM inbox_rules
// WHERE created_by='ali-routing-proof-2026-05-30' (run via SSH+psql,
// returned 2 rows deleted: 8c5617d8 INBOX rule + c0c0fbf7 AUTOMATION rule).

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BC = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const H = { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211/buckets/7463955';
const TODO = 9945469075;

const VERDICT = `<div>
<p><strong>Verdict: investigation resolved. Closing.</strong></p>

<p>Findings: both beacons arrived. They landed in our Gmail Inbox COS pipe (<code>provider=gmail_colaberry</code>), not the Hotmail one. Microsoft accepted them per Mandrill but lost them inside Hotmail before any user-visible folder. The Hotmail-side investigation that this ticket was opened for is now moot because we pivoted to a Hotmail-to-Gmail forwarding rule 2026-06-03 (Inbox Manager Phase 1) which resolves the underlying visibility gap going forward.</p>

<h3 style="margin:18px 0 6px;font-size:14px">Evidence (from prod DB inspection just now)</h3>
<table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:12.5px">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:6px 10px">subject</th><th align="left" style="padding:6px 10px">received_at</th><th align="left" style="padding:6px 10px">provider</th></tr></thead>
<tbody>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11.5px">beacon-inbox-m2p9x4 - this should land in INBOX (14:18 UTC)</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">2026-05-30 14:18:22+00</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace">gmail_colaberry</td></tr>
<tr><td style="padding:6px 10px;font-family:monospace;font-size:11.5px">beacon-automation-m2p9x4 - this should land in _Automation (14:18 UTC)</td><td style="padding:6px 10px">2026-05-30 14:18:23+00</td><td style="padding:6px 10px;font-family:monospace">gmail_colaberry</td></tr>
</tbody>
</table>

<h3 style="margin:18px 0 6px;font-size:14px">Why "did not appear in Hotmail" is no longer the right question</h3>
<ul style="font-size:12.5px;margin:0 0 8px;line-height:1.6">
<li>2026-06-01: Microsoft killed basic-auth IMAP for personal Outlook.com accounts. App-password tested, LOGIN + AUTHENTICATE PLAIN both rejected. Hotmail Inbox COS provider via IMAP became permanently unviable.</li>
<li>2026-06-03 (today): Inbox Manager Phase 1 close shipped the Hotmail-to-Gmail forwarding rule (set in Outlook.com, "Keep a copy" UNCHECKED). Any Hotmail email now flows to ali@colaberry.com Gmail where Inbox COS picks it up. <code>isForwardedFromHotmail()</code> detection live in <code>backend/src/services/inbox/hardRuleEngine.ts:21</code> so audit logs can separate noise-from-Hotmail vs noise-from-Colaberry.</li>
<li>What about the 2 unresolved Mandrill msgids (e67a2936, 4a74d66f) that Microsoft accepted? Their fate inside Microsoft remains opaque without M365 admin audit access. Most-likely scenarios: Hotmail server-side spam quarantine, delivered to the renamed Archive folder, or Microsoft black-holed them entirely. Recovering those specific messages is not actionable from here and is no longer necessary since the forward rule covers any future case.</li>
</ul>

<h3 style="margin:18px 0 6px;font-size:14px">Cleanup executed in this session</h3>
<ul style="font-size:12.5px;margin:0 0 8px;line-height:1.6">
<li><code>DELETE FROM inbox_rules WHERE created_by='ali-routing-proof-2026-05-30'</code> returned 2 rows (8c5617d8 INBOX rule + c0c0fbf7 AUTOMATION rule), both removed. The "any future email with m2p9x4 in the subject will be classified" risk is gone.</li>
</ul>

<h3 style="margin:18px 0 6px;font-size:14px">Optional Ali action (not blocking close)</h3>
<ul style="font-size:12.5px;margin:0 0 8px;line-height:1.6">
<li>The legacy "Colaberry" folder in Hotmail (the renamed Archive folder mentioned in the original investigation) can be removed by you in Outlook.com Web. Not script-accessible because we no longer have IMAP / Graph credentials for Hotmail. Not a hard blocker - the folder just sits unused.</li>
</ul>

<p style="font-size:12.5px;color:#475569;margin-top:14px;font-style:italic">Closing this ticket. Session: CC-20260603-v7da.</p>
</div>`;

(async () => {
  console.log('1. Posting verdict comment...');
  const r = await fetch(`${BASE}/recordings/${TODO}/comments.json`, {
    method: 'POST', headers: H, body: JSON.stringify({ content: VERDICT }),
  });
  if (!r.ok) throw new Error(`POST -> ${r.status} ${await r.text()}`);
  const c = await r.json();
  console.log('   verdict:', c.id, c.app_url);

  console.log('\n2. Marking ticket complete...');
  const m = await fetch(`${BASE}/todos/${TODO}/completion.json`, { method: 'POST', headers: H });
  console.log('   status:', m.status);

  console.log('\n=== DONE ===');
  console.log('Verdict comment:', c.app_url);
  console.log('Ticket', TODO, 'marked complete');
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
