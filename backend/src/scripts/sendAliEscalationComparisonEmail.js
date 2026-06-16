/**
 * Email Ali an analysis comparing the new AI Ops Command Center "escalate"
 * automation rule against the escalation logic that already existed in the
 * codebase (the Launch PMO daily update's 1/3/5/7-day escalation).
 *
 * Requested by Ali 2026-06-15 ("How is this different from the escalation
 * rules that already exist. Create me analysis and then email me the results.")
 * after the Command Center escalation rules were built + deployed (session
 * CC-20260615-e9k2).
 *
 * Run: `node backend/src/scripts/sendAliEscalationComparisonEmail.js [--dry]`
 * Must run where MANDRILL_API_KEY is set (prod backend container / VPS env).
 */
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const DRY = process.argv.includes('--dry');

if (!DRY && !process.env.MANDRILL_API_KEY) {
  console.error('FATAL: MANDRILL_API_KEY not set.');
  process.exit(1);
}

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 20px;">
  <tr><td>
    <div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
    <div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
    <div style="color: #718096;">Colaberry Inc.</div>
    <div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
    <div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
  </td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai`;

const td = 'padding:9px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:13px';
const th = 'padding:9px 12px;background:#1a365d;color:#fff;text-align:left;font-size:12px;font-weight:700';
const dim = 'padding:9px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#1a365d;font-size:13px;white-space:nowrap';

const rows = [
  ['Lives in', 'launchPmoDailyUpdate.js (scheduled script)', 'automationRulesService.ts (Command Center rule engine)'],
  ['Delivery', 'Daily email to you + Human Action Queue posted to the launch project Message Board', 'An item in the interactive Approval Queue ("Waiting on Human") you decide inline'],
  ['Cadence', 'Once a day, Mon-Fri 8am CST', 'Every 2 minutes (after each sync + score)'],
  ['Scope', 'The launch program areas only (41-day launch timeline)', 'All of your CB-managed projects (~50), todos assigned to you, within the 90-day freshness window'],
  ['Severity model', 'Graduated 4-tier: 1d reminder, 3d escalate-to-lead, 5d notify-Ali, 7d critical-risk', 'Binary: overdue + urgency 70+, OR overdue by more than 7 days'],
  ['Smarts', 'Artifact-gated (will not escalate an approval with nothing to approve), tier-aware (human / AI), tags the area lead, then escalates to you at 5 days', 'Plain overdue + urgency threshold. No gating, no lead-tagging'],
  ['What it does', 'Notifies (read-only surface)', 'Creates an actionable queue item with decide-and-write-back to Basecamp'],
  ['Status now', 'Live, running daily', 'Deployed but OFF (opt-in toggle)'],
];

const tableHtml = `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:18px 0">
<tr><th style="${th}">Dimension</th><th style="${th}">Existing: Launch PMO escalation</th><th style="${th}">New: Command Center rule</th></tr>
${rows.map((r) => `<tr><td style="${dim}">${r[0]}</td><td style="${td}">${r[1]}</td><td style="${td}">${r[2]}</td></tr>`).join('')}
</table>`;

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:760px;margin:0 auto;padding:24px">
<div style="background:#1a365d;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0">
  <div style="font-size:18px;font-weight:800">Escalation rules: new vs. what already existed</div>
  <div style="font-size:13px;color:#cbd5e1;margin-top:4px">AI Systems Architect Accelerator &middot; Launch Readiness Dashboard</div>
</div>
<div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">

<div style="background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0;padding:14px 16px;margin-bottom:18px">
<strong>Bottom line:</strong> the system already had a more sophisticated escalation engine for launch work, the Launch PMO daily update with graduated 1/3/5/7-day rules that emails you every morning. The new Command Center rule is not the same thing, but for launch tasks it overlaps with that existing engine and is cruder. Its genuinely new value is two things: it reaches your non-launch projects, and it puts escalations in the interactive triage queue instead of a passive email. My recommendation is to leave it off for launch and decide whether you want it for the broader queue.
</div>

<div style="font-size:15px;font-weight:700;color:#1a365d;margin:6px 0">1. What already existed</div>
<p style="font-size:13px">The Launch PMO daily update (<code>launchPmoDailyUpdate.js</code>) already runs every weekday at 8am CST. It pulls the launch project state and applies graduated escalation rules by how many days a todo is overdue: 1 day is a reminder, 3 days escalates to the area lead, 5 days notifies you, 7 days is flagged critical risk. It emails you the escalation list (and ccs Ram), posts a Human Action Queue to the project Message Board, and it is gated so it never escalates an approval that has no artifact to approve. This is the escalation that produced the "CRITICAL RISK, 11 days overdue" note you saw on the ticket.</p>

<div style="font-size:15px;font-weight:700;color:#1a365d;margin:14px 0 6px">2. What I added</div>
<p style="font-size:13px">A new <code>escalate</code> action in the Command Center's deterministic automation-rule engine. When on, it opens an item in your Approval Queue for each of your overdue, high-urgency todos, which you triage inline (approve, escalate, reject) with the decision written back to Basecamp. It runs every 2 minutes, is idempotent (no duplicates), and is scoped to your CB-managed, recently-active todos across all your projects. It is currently deployed but disabled.</p>

<div style="font-size:15px;font-weight:700;color:#1a365d;margin:14px 0 6px">3. Side by side</div>
${tableHtml}

<div style="font-size:15px;font-weight:700;color:#1a365d;margin:14px 0 6px">4. The honest catch</div>
<p style="font-size:13px">For launch tasks the two overlap: both escalate the same overdue items. The existing PMO engine is the better one there, it grades severity, gates empty approvals, and tags leads before it reaches you. Turning the new rule on as-is would double-surface launch escalations (a daily email and a queue item) using the simpler logic. The new rule only adds something the PMO engine does not already do in two cases: your overdue work in the roughly 49 non-launch projects, and the interactive decide-in-place queue versus a read-only email.</p>

<div style="font-size:15px;font-weight:700;color:#1a365d;margin:14px 0 6px">5. Recommendation</div>
<ul style="font-size:13px">
<li><strong>Leave the new rule off for launch.</strong> The Launch PMO daily escalation already covers the launch readiness need this ticket described, and does it better.</li>
<li><strong>If you want the new rule's value</strong>, point it at your non-launch projects, or treat it purely as the interactive-queue complement, and keep relying on the PMO engine's graduated logic for launch.</li>
<li><strong>Either way it is safe right now:</strong> deployed, disabled, queue clean. Enabling is one toggle in the Command Center.</li>
</ul>

<p style="font-size:12px;color:#64748b;margin-top:18px">Context: this follows the incident earlier today where the first version of the rule, before scoping, briefly escalated the whole org backlog (~29k items). That was cleaned up and the rule was rescoped and disabled. Detail is in the Basecamp ticket and PROGRESS.md (session CC-20260615-e9k2).</p>

${SIG_HTML}
</div>
</div></body></html>`;

const TEXT = `ESCALATION RULES: NEW vs. WHAT ALREADY EXISTED
AI Systems Architect Accelerator / Launch Readiness Dashboard

BOTTOM LINE
The system already had a more sophisticated escalation engine for launch work
(the Launch PMO daily update, with graduated 1/3/5/7-day rules that emails you
every morning). The new Command Center rule is not the same thing, but for
launch tasks it overlaps with that engine and is cruder. Its genuinely new
value: it reaches your non-launch projects, and it puts escalations in the
interactive triage queue instead of a passive email. Recommendation: leave it
off for launch; decide whether you want it for the broader queue.

1. WHAT ALREADY EXISTED
Launch PMO daily update (launchPmoDailyUpdate.js), runs weekdays 8am CST.
Graduated by days overdue: 1d reminder, 3d escalate-to-lead, 5d notify-Ali,
7d critical-risk. Emails you the escalation list (cc Ram), posts a Human Action
Queue to the project Message Board, and is gated so it never escalates an
approval with nothing to approve. This produced the "CRITICAL RISK, 11 days
overdue" note on the ticket.

2. WHAT I ADDED
A new escalate action in the Command Center automation-rule engine. When on,
it opens an Approval Queue item for each of your overdue high-urgency todos,
which you triage inline with write-back to Basecamp. Runs every 2 min,
idempotent, scoped to your CB-managed recently-active todos across all projects.
Currently deployed but disabled.

3. SIDE BY SIDE
                    Existing Launch PMO            New Command Center rule
Lives in            launchPmoDailyUpdate.js        automationRulesService.ts
Delivery            daily email + MB post          interactive Approval Queue item
Cadence             once daily (Mon-Fri 8am)       every 2 minutes
Scope               launch program areas only      all your CB-managed projects (~50)
Severity            graduated 4-tier (1/3/5/7d)    binary (overdue+red, or overdue>7d)
Smarts              artifact-gated, tier-aware,    plain overdue + urgency threshold
                    tags lead, escalates at 5d
Action              notify (read-only)             actionable item, decide + write back
Status now          live, daily                    deployed but OFF (opt-in)

4. THE HONEST CATCH
For launch tasks the two overlap; both escalate the same overdue items, and the
existing PMO engine is the better one there. Turning the new rule on as-is would
double-surface launch escalations using simpler logic. The new rule only adds
value the PMO engine lacks in two cases: your overdue work in the ~49 non-launch
projects, and the interactive decide-in-place queue versus a read-only email.

5. RECOMMENDATION
- Leave the new rule off for launch. The PMO daily escalation already covers it,
  and better.
- If you want the new rule's value, point it at non-launch projects, or use it
  purely as the interactive-queue complement and keep the PMO engine for launch.
- Either way it is safe now: deployed, disabled, queue clean. One toggle to enable.

Context: follows today's incident where the pre-scoping version briefly escalated
the whole org backlog (~29k), since cleaned up, rescoped, and disabled. Detail in
the Basecamp ticket and PROGRESS.md (session CC-20260615-e9k2).

${SIG_TEXT}`;

(async () => {
  // No em-dash guard (house rule): fail loud if any slipped in.
  if (/—/.test(HTML) || /—/.test(TEXT)) {
    console.error('FATAL: em-dash found in email body. Remove before send.');
    process.exit(1);
  }

  if (DRY) {
    const out = path.resolve(__dirname, '../../../tmp/escalation-comparison-preview.html');
    fs.writeFileSync(out, HTML);
    console.log(`[escalation-analysis] DRY - wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
    return;
  }

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    subject: 'Escalation rules: new Command Center rule vs. the existing Launch PMO escalation',
    text: TEXT,
    html: HTML,
    headers: {
      'X-MC-Track': 'none',
      'X-MC-AutoText': 'false',
      'X-MC-Metadata': JSON.stringify({ business_event_id: 'escalation-comparison-CC-20260615-e9k2' }),
    },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
