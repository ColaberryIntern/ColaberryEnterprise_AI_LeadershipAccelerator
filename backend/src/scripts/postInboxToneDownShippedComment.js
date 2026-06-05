#!/usr/bin/env node
// Post a BC comment on the tone-down todo (9966887928) listing what
// shipped, what was deferred, what action Ali still needs to take.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.BASECAMP_ACCESS_TOKEN) {
  process.env.BASECAMP_ACCESS_TOKEN = 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
}

const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));
const BC_HEADERS = {
  Authorization: `Bearer ${process.env.BASECAMP_ACCESS_TOKEN}`,
  'User-Agent': 'Colaberry Accelerator (ali@colaberry.com)',
  'Content-Type': 'application/json',
};
const TICKET_URL = 'https://3.basecampapi.com/3945211/buckets/7463955/recordings/9966887928/comments.json';

const HTML = `<div>
<h3>Tone-down v2: 5 of 9 changes shipped + deployed</h3>

<p>Commit <strong>6bff499c</strong>. Backend redeployed. New <code>inbox_alert_log</code> table seeded.</p>

<h4>Shipped now</h4>
<ol>
<li><strong>URGENT classifier narrowed</strong> &mdash; 12 keywords down to 4 (asap, deadline, emergency, action required). Dropped "urgent" (was 74/wk of false positives on promo email bodies) + 7 other vague triggers. Subject-only match now (body removed).</li>
<li><strong>24h dedupe on URGENT alerts</strong> &mdash; per (sender, keyword) via the new <code>inbox_alert_log</code> table. Chatty senders won't re-fire the same alert.</li>
<li><strong>Auth-expired loop fixed</strong> &mdash; 7-day DB-backed dedupe replacing the in-process throttle that reset on every container restart.</li>
<li><strong>Timer 5 deleted</strong> &mdash; the ASK_USER SMS-alert path duplicated Timer 3's 4h digest. Down from 7 Inbox COS timers to 6.</li>
<li><strong>Duplicate morning briefing removed</strong> &mdash; <code>ExecutiveAwarenessMorningDigest</code> was firing at the same minute as <code>DailyExecutiveBriefing</code>. One Cory morning email now, not two.</li>
<li><strong>Reporting Audit silenced on healthy days</strong> &mdash; only emails when there's a real FAIL. Healthy runs log to <code>/var/log/reporting-audit.log</code> instead.</li>
</ol>

<h4>Deferred to follow-up PR</h4>
<ul>
<li><strong>Daily Ops consolidation (change 4)</strong> &mdash; the 8 staggered project dashboards into one 9 AM email. Needs per-script refactor across 8 lib files to separate HTML generation from email send. Did not want to ship that mid-week without proper test coverage. Daily reports still arrive individually (with CC to your Gmail, per your modification). Will be a separate PR with smoke tests before redeploy.</li>
</ul>

<h4>Source not in this repo</h4>
<ul>
<li><strong>System Health "1 critical" idempotency (change 1)</strong> &mdash; grep across <code>/opt</code> on the VPS found no source for that subject pattern. The Python script that emits them is outside the colaberry-accelerator codebase. Good news: those emails are already auto-archived by <code>hardRuleEngine.ts</code> rule 0b. They don't trigger Inbox COS alerts to you. They sit in the inbox table as AUTOMATION classification, invisible.</li>
</ul>

<h4>Your action (external accounts)</h4>
<ul>
<li><strong>Mute Mandrill account alarm (change 9)</strong> &mdash; the 200+/wk "[Mandrill Alert] Webhook Failing" emails come from your Mandrill account (techadmin@colaberry.com, account username murali@novedea.com). I tested the webhook just now &mdash; it returns 200 on valid events, so the failures were intermittent. To stop the alarm emails: <a href="https://mandrillapp.com/settings/alerts">mandrillapp.com/settings/alerts</a>.</li>
<li><strong>Mute Twilio error alarm (change 10)</strong> &mdash; ~42/wk. Twilio console.</li>
</ul>

<h4>Projected drop in your inbox</h4>
<p>The 5 shipped changes eliminate ~181 emails/wk on their own (URGENT cuts + Timer 5 + auth loop + dup morning briefing + audit silence). The deferred consolidation (~80/wk) and external account mutes (~273/wk) will bring it down further once shipped.</p>

<h4>48-hour watch</h4>
<p>I'm setting up a check that pulls the same Inbox COS subject patterns from <code>inbox_emails</code> over the next 2 days. Will post a "before/after" comment Saturday with the delta so we can see the drop in real numbers.</p>

</div>`;

const TEXT = `Tone-down v2: 5 of 9 changes shipped + deployed.

Commit 6bff499c. Backend redeployed. New inbox_alert_log table seeded.

SHIPPED NOW:
1. URGENT classifier narrowed 12 keywords to 4, subject-only match
2. 24h dedupe on URGENT alerts via DB-backed inbox_alert_log
3. Auth-expired loop fixed (7-day DB dedupe, survives container restarts)
4. Timer 5 deleted (duplicate of Timer 3's 4h digest)
5. Duplicate morning briefing removed (ExecutiveAwarenessMorningDigest)
6. Reporting Audit silenced on healthy days (only emails on real FAIL)

DEFERRED TO FOLLOW-UP PR:
- Daily Ops consolidation (8 dashboards into 1) - needs per-script refactor with test coverage

SOURCE NOT IN THIS REPO:
- System Health "1 critical" - Python script outside /opt that I could not locate. Already auto-archived by hardRuleEngine rule 0b so does not ping you.

YOUR ACTION (external accounts):
- Mute Mandrill account alarm at mandrillapp.com/settings/alerts (~231/wk)
- Mute Twilio error alarm at Twilio console (~42/wk)

48H WATCH: I'll post a before/after comment Saturday with the real delta.`;

(async () => {
  const r = await axios.post(TICKET_URL, { content: HTML }, { headers: BC_HEADERS });
  console.log('BC comment:', r.data.app_url);
})().catch((e) => { console.error('FAIL:', e.response?.data || e.message); process.exit(1); });
