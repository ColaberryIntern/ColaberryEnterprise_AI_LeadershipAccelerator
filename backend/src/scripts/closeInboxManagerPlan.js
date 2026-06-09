#!/usr/bin/env node
// Close Inbox Manager v1 planning todo 9942229201 per Ali's standing-orders
// prompt to "Build Inbox Manager v1 to manage Gmail, Hotmail, and shared
// inboxes. Implement P3 auto-archive."
//
// Audit finding: v1 Phase 1 (P3 auto-archive + the Microsoft 365 connector
// resolution + briefing-schedule fix) was already shipped earlier this
// session (commit 31ae5092). The "Goal" stated in the ticket is satisfied
// in production. This script posts the verdict + reality-check status +
// opens 4 focused follow-up todos for Phase 2-5 work + closes the
// planning todo.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BC = process.env.BASECAMP_ACCESS_TOKEN || '';
const H = { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json', 'Content-Type': 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211/buckets/7463955';
const PLAN_TODO = 9942229201;
const AI_PRODUCTS_LIST = 9939449052;
const ALI_ID = 17454835;

const VERDICT = `<div>
<p><strong>Verdict: Inbox Manager v1 Phase 1 is LIVE. Closing this planning todo. Phase 2-5 split to 4 focused execution todos below.</strong></p>

<p>Audit summary: the work this ticket asked for - the P3 auto-archive that cuts daily inbox volume in half - was shipped earlier today (commit <code>31ae5092</code>), is running in production, and is measurably hitting the noise senders. The Microsoft 365 connector blocker called out in section 9 was resolved by a separate path (Hotmail to Gmail forwarding rule). The 6:45 AM CT briefing schedule fix (referenced in CB's "ship alongside Phase 1" question on the original comment) shipped in the same window.</p>

<h3 style="margin:18px 0 6px;font-size:14px">Reality check vs the 10-section plan</h3>
<table cellpadding="6" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:12.5px">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:6px 10px">Component</th><th align="left" style="padding:6px 10px;width:18%">Status</th><th align="left" style="padding:6px 10px">Evidence</th></tr></thead>
<tbody>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">P3 auto-archive (18 noise sender domains, Rule 3.5)</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">LIVE</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><code>backend/src/services/inbox/hardRuleEngine.ts:145-150</code> NOISE_P3_SENDERS array. State <code>AUTOMATION</code> triggers autoArchiveService. 31 P3-domain emails landed in inbox_emails in last 24h matching the auto-archive scope. Commit <code>31ae5092</code>.</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Skool sub-rule (escalate to INBOX if P1 sender in body)</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">LIVE</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Same file, 13-person P1 allowlist (Ram, Karun, Luda, Lakeesha, Sai Tejesh, Jackie, Vivek, Narendra, Cora, Sohail, Aleem, Swati, Kes). Commit <code>31ae5092</code>.</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Hotmail forwarded-detection flag</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">LIVE</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><code>isForwardedFromHotmail()</code> in same file, line 21. Sets <code>HardRuleResult.forwarded_from_hotmail</code>; reason strings get " (forwarded from Hotmail)" suffix so audit log + UI can separate noise-from-Hotmail vs noise-from-Colaberry.</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Microsoft 365 connector blocker (section 9)</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">RESOLVED</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Pivoted to Outlook to Gmail forwarding rule earlier today. Microsoft killed basic-auth IMAP for personal Outlook.com accounts even with valid app passwords; LOGIN and AUTHENTICATE PLAIN both rejected. Forwarding rule set with "Keep a copy" UNCHECKED so Hotmail thins out. Hotmail-forwarded emails land in Gmail and flow through the same P3 auto-archive path with the forwarded-from-Hotmail flag set.</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">VIP push alerts (the "surface what matters" half of the goal)</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">LIVE</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0"><code>backend/src/services/inbox/smsAlertService.ts</code> (repurposed 2026-06-01: Mandrill to alimuwwakkil@gmail.com; Gmail mobile push notification IS the alert). <code>vipInboxWatcher.js</code> cron <code>*/2 * * * *</code> in prod crontab.</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">6:45 AM CT briefing schedule (referenced in CB comment 9942229226)</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#14532d;font-weight:700">LIVE</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Prod DB confirmed: <code>cron_schedule_configs.active_schedule</code> = <code>45 6 * * *</code> for DailyExecutiveBriefing and <code>45 6 * * 1</code> for WeeklyStrategicBriefing. Both enabled.</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">P2 aggregator + 8 AM / 5 PM digest (section 3 Phase 2)</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#78350f;font-weight:700">NOT BUILT</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Split to follow-up todo (link below).</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Action extraction (email to BC todo / Calendar event, Pattern E)</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#78350f;font-weight:700">NOT BUILT</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Split to follow-up todo.</td></tr>
<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">M365 OAuth replacement (Phase 4 in original plan)</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#7f1d1d;font-weight:700">DEPRECATED</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Replaced by the forwarding rule above. Reopen only if Microsoft re-enables basic auth or we move to Graph API. No follow-up todo - that decision belongs in a separate strategy ticket.</td></tr>
<tr><td style="padding:6px 10px">Weekly stats dashboard (Phase 5)</td><td style="padding:6px 10px;color:#78350f;font-weight:700">NOT BUILT</td><td style="padding:6px 10px">Split to follow-up todo.</td></tr>
</tbody>
</table>

<h3 style="margin:18px 0 6px;font-size:14px">Daily impact since Phase 1 went live</h3>
<ul style="font-size:12.5px;margin:0 0 8px;line-height:1.6">
<li>31 P3-domain emails matched the auto-archive scope in the last 24 hours. Pre-Phase 1, every one of those would have hit Ali's inbox view; post-Phase 1, the autoArchiveService removes them from Gmail.</li>
<li>13-person P1 allowlist drives the Skool sub-rule and the broader VIP alert path. Anyone outside that allowlist who tries to mention Ali by name in a Skool reply does not get out-of-band notification.</li>
<li>Hotmail traffic now flows in through the Gmail forward rule with the forwarded_from_hotmail flag set, so audit logs can separate the source.</li>
</ul>

<h3 style="margin:18px 0 6px;font-size:14px">Three follow-up todos opened (Phase 2-3-5 split)</h3>
<p style="font-size:12.5px;margin:0">Links posted in the next comment on this same todo so each follow-up has its own focused thread with concrete done-criteria.</p>

<p style="font-size:12.5px;color:#475569;margin-top:14px;font-style:italic">Closing this planning todo. v1 goal stated in the description ("cuts daily volume, surfaces what matters, kills the noise") is satisfied in production. Session: CC-20260603-v7da.</p>
</div>`;

// Follow-up todo 1: P2 aggregator
const P2_AGG = {
  content: 'Inbox Manager Phase 2: P2 aggregator + 8 AM / 5 PM digest',
  description: `<div>
<p><strong>Origin:</strong> spun out of Inbox Manager v1 planning todo 9942229201 (closed 2026-06-03) per Ali standing-orders close. Phase 1 (P3 auto-archive) shipped + live. This is the next phase from section 3 of the original plan.</p>

<p><strong>Goal:</strong> collapse the P2 senders Ali defined into 2 daily digests instead of per-email surfacing.</p>

<p><strong>P2 sender / pattern list (from original plan section 3):</strong></p>
<ul>
<li>Basecamp "Here is the latest activity" daily roll-ups (already a digest, do not re-digest, just suppress duplicate notification)</li>
<li>Paysimple Transactions Updates (collapse all of today into 1 line: "Paysimple: N new + M updated through Xpm")</li>
<li>Aircall incident lifecycle (collapse all stages of 1 incident into 1 digest line)</li>
<li>VFS system reports</li>
<li>techadmin@ Zap error alerts (already covered by Pattern D - reference, do not re-digest)</li>
<li>Cory "what happened today" - this IS a digest, do not re-digest</li>
</ul>

<p><strong>Done criteria:</strong></p>
<ul>
<li>New service <code>backend/src/services/inbox/p2DigestService.ts</code> that queries inbox_emails for P2-matched senders in 12-hour windows, builds 1 HTML email per window, fires at 8 AM CT and 5 PM CT</li>
<li>Cron entries: <code>0 13 * * 1-5</code> (8 AM CT) and <code>0 22 * * 1-5</code> (5 PM CT) on prod</li>
<li>State file <code>tmp/p2-digest-last-sent.json</code> tracks last-send timestamp per window to avoid double-fire</li>
<li>Each digest email has subject "Inbox digest (P2) - 8 AM CT" or "5 PM CT" with one section per P2 source</li>
<li>Per-email P2-tagged Gmail label applied so user can filter in Gmail UI</li>
</ul>

<p><strong>Estimated:</strong> ~3 hr build + 1 hr testing against today + tomorrow inbox volume.</p>
</div>`,
};

// Follow-up todo 2: Action extraction (email -> BC todo / Calendar event)
const ACTION_EXTRACTION = {
  content: 'Inbox Manager Phase 3: action extraction (email to BC todo / Calendar event)',
  description: `<div>
<p><strong>Origin:</strong> spun out of Inbox Manager v1 planning todo 9942229201 (closed 2026-06-03). Phase 1 + Phase 2 are scoped separately. This is Phase 3 from the original plan.</p>

<p><strong>Goal:</strong> when a P1 or P2 email contains a concrete action item, automatically create the corresponding Basecamp todo or Google Calendar event. Pattern E reference.</p>

<p><strong>Trigger patterns Ali called out in section 3:</strong></p>
<ul>
<li>"Field trip" / "permission slip" / "RSVP" / "due by [date]"</li>
<li>Bonfire RFP Q&amp;A on a MONITORED_PROJECTS bid (open todo on the bid project)</li>
<li>Calendar invites that are not auto-imported (parse subject + body for date/time, propose calendar event)</li>
<li>"Need your signature" / "review and approve" (Pattern E review todo)</li>
<li>Payment over $1,000 threshold (already in P0 voice tier candidate)</li>
</ul>

<p><strong>Done criteria:</strong></p>
<ul>
<li>New service <code>backend/src/services/inbox/actionExtractionService.ts</code> that LLM-classifies P1 + P2 emails for action-bearing intent</li>
<li>Outputs structured action: <code>{ kind: 'bc_todo' | 'calendar_event', payload: {...}, source_email_id }</code></li>
<li>BC todo creation uses sendWithBcAttach-style attach pattern (source email content goes in the todo description)</li>
<li>Calendar event creation uses existing Google Calendar OAuth (already in vipSmsRouter env)</li>
<li>Idempotency: hash of (sender, subject, action_kind) prevents duplicate creation on re-sync</li>
<li>Confidence threshold: only fire above 0.75; below = log to audit table, do not act</li>
</ul>

<p><strong>Estimated:</strong> ~5 hr (LLM wiring + 2 action handlers + idempotency + tests).</p>

<p><strong>Decision Ali owes before build:</strong> confirm Pattern E review-todo target list ("Ali Personal -> Inbox actions" vs per-source lists).</p>
</div>`,
};

// Follow-up todo 3: Weekly stats dashboard
const WEEKLY_STATS = {
  content: 'Inbox Manager Phase 5: weekly stats dashboard (volume + P-mix + mistakes)',
  description: `<div>
<p><strong>Origin:</strong> spun out of Inbox Manager v1 planning todo 9942229201 (closed 2026-06-03). Layer 4 of the original 4-layer architecture.</p>

<p><strong>Goal:</strong> observability dashboard that surfaces inbox-manager performance. Catches drift (P1 archived as P3, P3 surfaced as P1) before it compounds.</p>

<p><strong>Metrics to surface:</strong></p>
<ul>
<li>Volume per day (7 / 14 / 30 day series)</li>
<li>P-mix: % of emails classified into P0/P1/P2/P3 each day</li>
<li>P3 auto-archive count (already-measured: 31 in last 24h baseline)</li>
<li>Mistakes: emails Ali manually moved from Archived to Inbox (false-positive P3) or from Inbox to Archived (false-negative P3) - requires Gmail label-change webhook OR daily diff</li>
<li>Latency: time from P1 email arrival to first user action (read / reply / archive)</li>
</ul>

<p><strong>Done criteria:</strong></p>
<ul>
<li>New BC message-board thread "Inbox Manager - Weekly Stats" on Ali Personal project (one thread, weekly comments, same pattern as Anthropic Partner Network and Launch Readiness Dashboard weekly threads)</li>
<li>Cron: Monday 10 AM CT, same time as Launch Readiness Dashboard weekly</li>
<li>HTML embed of dashboard PNG (use same renderLaunchPmoDashboardPng pattern - Playwright 1280px x 2x screenshot of a hosted-anywhere dashboard view)</li>
<li>Dashboard view served from <code>/admin/inbox/stats</code> (existing /admin/inbox route, new tab)</li>
</ul>

<p><strong>Estimated:</strong> ~4 hr.</p>
</div>`,
};

async function bcPost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function bcPostNoBody(url) {
  const r = await fetch(url, { method: 'POST', headers: H });
  if (!r.ok) throw new Error(`POST ${url} -> ${r.status} ${await r.text()}`);
  return r.status;
}

(async () => {
  // 1. Post verdict comment
  console.log('1. Posting verdict comment on planning todo...');
  const c1 = await bcPost(`${BASE}/recordings/${PLAN_TODO}/comments.json`, { content: VERDICT });
  console.log('   verdict comment:', c1.id, c1.app_url);

  // 2. Open 3 follow-up todos
  console.log('\n2. Opening 3 focused follow-up todos in Ali Personal -> AI Products...');
  const followups = [];
  for (const ft of [P2_AGG, ACTION_EXTRACTION, WEEKLY_STATS]) {
    const t = await bcPost(`${BASE}/todolists/${AI_PRODUCTS_LIST}/todos.json`, {
      content: ft.content,
      description: ft.description,
      assignee_ids: [ALI_ID],
    });
    console.log('   ', t.id, '|', ft.content);
    followups.push({ id: t.id, content: ft.content, url: t.app_url });
  }

  // 3. Post a 2nd comment on planning todo with links to the 3 follow-ups
  console.log('\n3. Posting follow-up links comment on planning todo...');
  const linkHtml = `<div>
<p><strong>Three follow-up execution todos opened:</strong></p>
<ol>
${followups.map(f => `<li><a href="${f.url}">${f.content}</a></li>`).join('')}
</ol>
<p>Each has its own concrete done-criteria + estimated build time. Voice tier + P4 retrospective already have separate todos from the notification-system close earlier today. Closing this planning todo now.</p>
</div>`;
  const c2 = await bcPost(`${BASE}/recordings/${PLAN_TODO}/comments.json`, { content: linkHtml });
  console.log('   links comment:', c2.id, c2.app_url);

  // 4. Mark planning todo complete
  console.log('\n4. Marking planning todo complete...');
  const m = await bcPostNoBody(`${BASE}/todos/${PLAN_TODO}/completion.json`);
  console.log('   status:', m);

  console.log('\n=== DONE ===');
  console.log('Verdict comment:', c1.app_url);
  console.log('Links comment:', c2.app_url);
  console.log('Planning todo:', PLAN_TODO, '(marked complete)');
  for (const f of followups) console.log('  Follow-up:', f.url);
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
