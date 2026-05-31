#!/usr/bin/env node
// Consolidated Decision Queue email - everything outstanding across the
// session that needs Ali's call, in one place, prioritized by deadline.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function stripEmDashes(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

// Each decision: who, what, by when, recommendation, how to act (@CB syntax)
const DECISIONS = [
  // === IMMEDIATE (this week) ===
  {
    bucket: 'IMMEDIATE',
    title: 'Approve or skip the 6 BLACK interns',
    deadline: 'Today/tomorrow',
    why: 'They have been 10+ days dark. Until you decide, daily nudges stay in preview mode and they keep accumulating dark days.',
    recommendation: 'Open the BLACK pre-review email (just sent, separate). Decide approve/skip per person. Run the inlined CLI for each approval.',
    actions: [
      'Open the [Action Required] BLACK pre-review email',
      'For each approval: run the inlined confirmInternExit.js CLI on the VPS',
      'Or tag @CB System exit intern <name> reason=nochow for preview',
    ],
  },
  {
    bucket: 'IMMEDIATE',
    title: 'Flip intern nudges from preview to live',
    deadline: 'Once BLACK list is processed',
    why: 'Daily nudges are currently digest-only. Live mode emails interns directly + posts BC comments matching Jackie pattern.',
    recommendation: 'After BLACK exits done, flip to live.',
    actions: [
      'Tag @CB System set intern nudge mode live in any Basecamp thread',
      'Or to keep paused: tag @CB System set intern nudge mode preview (default)',
    ],
  },
  {
    bucket: 'IMMEDIATE',
    title: 'Anthropic Partner finish-line push',
    deadline: 'Jun 12 (12 days)',
    why: 'Partner status gates free CCA-F access for the new training program. The countdown report fires daily.',
    recommendation: 'Personally chase the cohort members still missing course completions. 10 out of 10 must finish.',
    actions: [
      'Check this morning\'s [Daily Report] Anthropic Partner Countdown email for who is still missing',
      'Reach out directly to anyone behind',
    ],
  },

  // === BY JUN 6 (Week 0 of training launch) ===
  {
    bucket: 'BY_JUN_6',
    title: 'Lock the training program brand name',
    deadline: 'Jun 6',
    why: 'Locks landing-page URLs, Stripe product naming, Partner Network co-branding ask. Changing post-launch is expensive.',
    recommendation: 'AI Systems Architect Accelerator (research final pick).',
    actions: ['Reply on the training BC todo (9945833396) with your name choice'],
  },
  {
    bucket: 'BY_JUN_6',
    title: 'Pick the launch wedge persona',
    deadline: 'Jun 6',
    why: 'Four personas have different acquisition channels and price sensitivities. Marketing to all four at once on a 41-day clock will fail.',
    recommendation: 'Career changer / working professional. Broadest viral reach, highest margin, no B2B sales motion required.',
    actions: ['Reply on the training BC todo with your persona pick'],
  },
  {
    bucket: 'BY_JUN_6',
    title: 'Reconcile pricing: $79+$149 BYO vs $99 bundled',
    deadline: 'Jun 6',
    why: 'Your earlier instinct was $99/mo bundled with Claude Code. The research explicitly rejected bundling (Anthropic pricing risk + some members already have Claude). Cannot ship Stripe without locking.',
    recommendation: '$79 Architect Network + $149 Architect Pro, BYO Claude. Cleaner, lower licensing risk.',
    actions: ['Reply on the training BC todo with your pricing model'],
  },
  {
    bucket: 'BY_JUN_6',
    title: 'Name the 4 team leads',
    deadline: 'Jun 6',
    why: 'You cannot run all 4 teams plus Ops alone for 41 days. Tight delivery needs Website lead full-time + Marketing lead part-time + AI Team contract dev full-time + you on Sales with a part-time SDR.',
    recommendation: 'Decide hire/contract for at minimum the Website lead and AI Team contract dev. Marketing lead can be part-time.',
    actions: ['Reply on the training BC todo with named team leads'],
  },

  // === BY JUN 13 ===
  {
    bucket: 'BY_JUN_13',
    title: 'TWC compliance docs to counsel',
    deadline: 'Jun 13',
    why: 'Selling a "course" without TWC approval is legal exposure. The 4-intensive seminar split needs defensibly INDEPENDENT outcomes. The Lego curriculum model puts that at risk.',
    recommendation: 'Get counsel review by Jun 13. Per-intensive outcome statements + per-intensive artifact catalogs.',
    actions: ['Engage TWC-aware counsel this week', 'Draft per-intensive outcomes (template in TRAINING_INTEGRATION_PLAN.md section 2)'],
  },

  // === BY JUL 4 ===
  {
    bucket: 'BY_JUL_4',
    title: 'Stripe enrollment live',
    deadline: 'Jul 4',
    why: 'Cannot take money on Jul 10 without it. Tax setup, legal entity confirmation, Stripe account in place all required.',
    recommendation: 'Confirm Stripe + tax setup is on the Website Team\'s critical path.',
    actions: ['Confirm with Website Team lead in week 1', 'Decide Stripe account: Colaberry Inc or new training-program LLC'],
  },

  // === OPERATIONAL (post-decision queue) ===
  {
    bucket: 'OPERATIONAL',
    title: 'Confirm Message Board target for intern weekly report',
    deadline: 'When convenient',
    why: 'Currently posts to "Sprint Pres / New Project" (board 4450326153). May not be the right home for "everyone informed" weekly status.',
    recommendation: 'If wrong, tell me which board. Override via env var INTERN_REPORT_MESSAGE_BOARD.',
    actions: ['Tell me in any Basecamp thread', 'Or tag @CB System set intern report mb <board id>'],
  },
  {
    bucket: 'OPERATIONAL',
    title: 'Hand roster reconciliation to CCPP team',
    deadline: 'When convenient',
    why: '17 people doing BC work but not in CCPP active. 9 CCPP-active with no BC project. Auto-matching is imperfect because CCPP InternBaseCampAlis is mostly null.',
    recommendation: 'Forward the [Roster Reconciliation] email (just sent, separate) to whoever owns CCPP data.',
    actions: ['Forward the [Roster Reconciliation] email', 'Backfill InternBaseCampAlis going forward'],
  },

  // === STRATEGIC TRAINING (post-Wk-0) ===
  {
    bucket: 'STRATEGIC',
    title: '15 strategic open decisions from the training plan',
    deadline: 'Various (post-launch)',
    why: 'Cohort cadence, cohort size cap, paid marketing budget, Skilljar sync architecture, Architect Pro mentor sourcing, Project Marketplace governance, refund policy, mid-cohort blueprint change workflow, etc.',
    recommendation: 'Walk through the open-decisions section of TRAINING_PROGRAM_CRITIQUE.html in one sitting. Lock the urgent ones, defer the post-launch ones.',
    actions: ['Open the critique HTML', 'Reply with your locks on the training BC todo'],
  },
];

function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function htmlEscape(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const BUCKET_LABEL = {
  IMMEDIATE: { label: 'Immediate - this week', color: '#1c1917', accent: '#dc2626' },
  BY_JUN_6: { label: 'By Jun 6 - Week 0 training kickoff', color: '#991b1b', accent: '#dc2626' },
  BY_JUN_13: { label: 'By Jun 13 - Week 1', color: '#9a3412', accent: '#ea580c' },
  BY_JUL_4: { label: 'By Jul 4 - Week 4', color: '#854d0e', accent: '#ca8a04' },
  OPERATIONAL: { label: 'Operational - when convenient', color: '#1a365d', accent: '#2b6cb0' },
  STRATEGIC: { label: 'Strategic - post-Wk-0', color: '#166534', accent: '#16a34a' },
};

(async () => {
  const groups = {};
  for (const d of DECISIONS) { (groups[d.bucket] = groups[d.bucket] || []).push(d); }

  const decisionCard = (d) => `
<div style="background:white;border:1px solid #e2e8f0;border-radius:6px;padding:16px;margin-bottom:12px">
  <div style="display:flex;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding-bottom:8px;margin-bottom:10px">
    <div style="font-size:14px;font-weight:700;color:#1a202c">${htmlEscape(d.title)}</div>
    <div style="font-size:11px;color:#64748b;white-space:nowrap;margin-left:12px">${htmlEscape(d.deadline)}</div>
  </div>
  <div style="font-size:12px;color:#475569;margin-bottom:8px"><strong>Why it matters:</strong> ${htmlEscape(stripEmDashes(d.why))}</div>
  <div style="font-size:12px;color:#0e7490;margin-bottom:8px"><strong>My recommendation:</strong> ${htmlEscape(stripEmDashes(d.recommendation))}</div>
  <div style="font-size:12px;color:#475569"><strong>How to act:</strong></div>
  <ul style="margin:4px 0 0 18px;padding:0;font-size:12px;color:#1a365d">${d.actions.map((a) => `<li style="margin-bottom:2px">${htmlEscape(stripEmDashes(a))}</li>`).join('')}</ul>
</div>`;

  const groupBlock = (key, decisions) => {
    const meta = BUCKET_LABEL[key];
    return `
<h2 style="font-size:16px;color:${meta.color};border-bottom:2px solid ${meta.accent};padding-bottom:8px;margin:28px 0 14px">${meta.label} (${decisions.length})</h2>
${decisions.map(decisionCard).join('')}`;
  };

  const totalCount = DECISIONS.length;
  const immediateCount = (groups.IMMEDIATE || []).length;
  const jun6Count = (groups.BY_JUN_6 || []).length;

  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:arial,sans-serif">
<div style="max-width:720px;margin:0 auto;background:white;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:white;padding:28px 32px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">Decision queue</div>
<div style="font-size:24px;font-weight:800;margin-top:6px;line-height:1.25">${totalCount} decisions outstanding</div>
<div style="font-size:14px;color:#cbd5e0;margin-top:6px">${immediateCount} immediate &middot; ${jun6Count} by Jun 6 &middot; rest by deadline</div>
</div>

<div style="background:#1c1917;color:white;padding:18px 32px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ali</div>
<div style="font-size:14px;margin-top:6px">Ali, this is everything I have flagged across the session that needs your call, in one place, prioritized by deadline. Each card has: why it matters, my recommendation, and the exact action to take. You can plough through this in one sitting. The Immediate bucket and the Jun-6 bucket are the ones that can actually break things if they slip.</div>
</div>

<div style="padding:24px 32px;background:#f8fafc">

${groupBlock('IMMEDIATE', groups.IMMEDIATE || [])}
${groupBlock('BY_JUN_6', groups.BY_JUN_6 || [])}
${groupBlock('BY_JUN_13', groups.BY_JUN_13 || [])}
${groupBlock('BY_JUL_4', groups.BY_JUL_4 || [])}
${groupBlock('OPERATIONAL', groups.OPERATIONAL || [])}
${groupBlock('STRATEGIC', groups.STRATEGIC || [])}

<div style="background:white;border:1px solid #cbd5e0;border-radius:6px;padding:16px;margin-top:24px">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1a365d;font-weight:700;margin-bottom:10px">What you can do from here</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:13px;line-height:1.55">
<tr><td style="padding:6px 0;vertical-align:top;width:220px;color:#475569"><strong>Process BLACK exits</strong></td><td style="padding:6px 0;vertical-align:top">Open the BLACK pre-review email (sent separately) and walk through it. CLI commands are pre-filled with InternIDs.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Flip nudges to live</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System set intern nudge mode live</code> after BLACK list is processed.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Lock training Wk-0 decisions</strong></td><td style="padding:6px 0;vertical-align:top">Reply on the <a href="https://app.basecamp.com/3945211/buckets/7463955/todos/9945833396" style="color:#2b6cb0">training BC todo</a> with your 4 Jun-6 locks (brand / persona / pricing / team leads).</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Hand off roster reconciliation</strong></td><td style="padding:6px 0;vertical-align:top">Forward the [Roster Reconciliation] email (sent separately) to whoever owns CCPP data.</td></tr>
<tr><td style="padding:6px 0;vertical-align:top;color:#475569"><strong>Ask CB anything</strong></td><td style="padding:6px 0;vertical-align:top">Tag <code style="background:#1f2937;color:#fbbf24;padding:2px 6px;border-radius:3px">@CB System &lt;anything&gt;</code> in a Basecamp thread.</td></tr>
</table>
</div>

</div>
</div>
</body></html>`;

  const text = `Ali, decision queue - ${totalCount} decisions outstanding, prioritized by deadline.\n\n` +
    Object.keys(BUCKET_LABEL).map((key) => {
      const decisions = groups[key] || [];
      if (decisions.length === 0) return '';
      return `\n=== ${BUCKET_LABEL[key].label.toUpperCase()} (${decisions.length}) ===\n\n` +
        decisions.map((d, i) => `${i + 1}. ${d.title}  [deadline: ${d.deadline}]\n   Why: ${stripEmDashes(d.why)}\n   Recommendation: ${stripEmDashes(d.recommendation)}\n   How:\n${d.actions.map((a) => `     - ${stripEmDashes(a)}`).join('\n')}\n`).join('\n');
    }).join('') +
    `\n\nQuick actions:\n  - BLACK exits: open the [Action Required] BLACK pre-review email\n  - Nudge live: @CB System set intern nudge mode live\n  - Training Wk-0: reply on BC todo 9945833396\n  - Roster: forward the [Roster Reconciliation] email\n`;

  validateBeforeSend(stripEmDashes(html), stripEmDashes(text));
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: 'alimuwwakkil@gmail.com',
    subject: `[Decision Queue] ${totalCount} outstanding decisions - ${immediateCount} immediate, ${jun6Count} by Jun 6`,
    text: stripEmDashes(text),
    html: stripEmDashes(html),
    headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'Importance': 'high', 'X-Priority': '1' },
  });
  console.log('Sent:', r.messageId);
})().catch(e => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
