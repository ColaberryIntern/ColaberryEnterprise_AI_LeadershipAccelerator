#!/usr/bin/env node
// Summary email to Ali on the AI_ProjectArchitect rollout: what was done, where to find it,
// recommended approach, open questions. Spreadsheet attached.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const SUMMARY = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../tmp/ai-arch-bc-tickets.json'), 'utf8'));
const XLSX_PATH = path.resolve(__dirname, '../../../docs/ai-architect-rubrics-2026-06-02.xlsx');
const XLSX_BUF = fs.readFileSync(XLSX_PATH);

function group(label, predicate) {
  return SUMMARY.todos.filter((t) => predicate(t.content));
}

const groups = [
  { title: 'Overview', items: group('Overview', (c) => c.startsWith('OVERVIEW')) },
  { title: 'Infrastructure (5 tickets)', items: group('Infra', (c) => c.startsWith('[Infra')) },
  { title: 'Karun pilot (5 tickets)', items: group('Karun', (c) => c.startsWith('[Karun]')) },
  { title: 'Kes pilot (5 tickets)', items: group('Kes', (c) => c.startsWith('[Kes]')) },
  { title: 'Phase 2 (after pilot, 3 tickets)', items: group('Phase 2', (c) => c.startsWith('[Phase 2')) },
  { title: 'Phase 3 + Day-90 retro (3 tickets)', items: group('Phase 3', (c) => c.startsWith('[Phase 3') || c.startsWith('[Day 90')) },
  { title: 'Strategic (1 ticket)', items: group('Strategic', (c) => c.startsWith('[Strategic')) },
];

function groupBlock(g) {
  if (!g.items.length) return '';
  const rows = g.items.map((t) => {
    const label = t.content.length > 92 ? t.content.slice(0, 92) + '...' : t.content;
    return `<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;white-space:nowrap">${t.due_on}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:13px"><a href="${t.url}" style="color:#1a365d;text-decoration:none">${escapeHtml(label)}</a></td></tr>`;
  }).join('');
  return `<div style="margin-top:14px"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7c2d12;font-weight:700;font-family:Arial,sans-serif">${escapeHtml(g.title)}</div>
<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:6px;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;background:white">
<thead><tr style="background:#0f172a;color:white"><th style="padding:8px 12px;text-align:left;font-size:10px;letter-spacing:1px;width:90px">Due</th><th style="padding:8px 12px;text-align:left;font-size:10px;letter-spacing:1px">Ticket</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:820px;margin:0 auto;background:white">

<div style="padding:20px 32px 0;font-size:13px;color:#475569">Ali -</div>

<div style="margin:14px 32px 0;background:linear-gradient(135deg,#0f172a 0%,#1a365d 100%);color:white;padding:24px 28px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">AI_ProjectArchitect rollout - planning shipped</div>
<h1 style="margin:8px 0 6px;font-size:22px;font-weight:800;line-height:1.3">23 Basecamp tickets + a per-employee rubric spreadsheet ready for your refinement.</h1>
<div style="font-size:13px;color:#cbd5e0">Starting with Karun and Kes as you specified. Full org plan drafted but only the pilot pair is scheduled for execution. Open the xlsx attached - you said you would need to put thought in. Spreadsheet has 5 sheets and is sized to be a 30-minute Sunday afternoon refinement, not a multi-hour project.</div>
</div>

<div style="padding:24px 32px">

<h2 style="font-size:17px;margin:0 0 10px;color:#0f172a">What I did</h2>
<ol style="font-size:14px;color:#1f2937;padding-left:22px;line-height:1.7">
<li><strong>Inventoried the team.</strong> Pulled all active Colaberry employees from the repo + memory: 17 core + Karun + Kes pilots + departures (Mika, Shveta) excluded + interns + externals excluded. Each person mapped to role, domain, systems they touch.</li>
<li><strong>Drafted per-person rubrics + skills.</strong> 5 numbers + 10 skills + draft rubric per number, per person. Format = FICO-style 5/7/9/10 thresholds, same pattern Alden described in the talk. Pilots (Karun + Kes) are highlighted; the rest are honest-best-guess drafts.</li>
<li><strong>Generated the workbook.</strong> <code style="background:#fef3c7;padding:1px 6px;border-radius:3px">docs/ai-architect-rubrics-2026-06-02.xlsx</code> attached. 5 sheets - README (how to use), Employee Master, 5 Numbers + Rubrics, 10 Skills per Person, Systems Matrix.</li>
<li><strong>Created the Basecamp tree.</strong> New list on Ali Personal: <a href="${SUMMARY.list_url}" style="color:#1a365d;font-weight:700">AI_ProjectArchitect company-wide rollout</a>. 23 todos with due dates spanning today through Day 95.</li>
<li><strong>Held the line on scope.</strong> Phase 2 + Phase 3 are scheduled but only as planning entries - the actual execution work is parked until the Karun + Kes pilots prove out (per your "we will only roll out Karun and Kes" instruction + Alden's mistake #1 about rolling out to everyone at once).</li>
</ol>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">How I recommend you approach the spreadsheet</h2>
<div style="background:#fef9e7;border-left:5px solid #d4a017;padding:16px 20px;font-size:13px;color:#78350f;border-radius:0 6px 6px 0">
<strong>30 minutes, in this order:</strong>
<ol style="margin:8px 0 0;padding-left:20px;line-height:1.8">
<li>Open the xlsx. Skim the README sheet (2 min) - confirms what each sheet is for.</li>
<li>Sheet 2 "Employee Master" (5 min): confirm I have the 17 right people in the right wave. Move anyone if needed. Flag departures I might have missed.</li>
<li>Sheet 3 "5 Numbers + Rubrics" (15 min): scroll to Karun + Kes rows. These need to be CORRECT before we build their agents. Change targets, change thresholds, change number names. Everyone else stays draft for now.</li>
<li>Sheet 4 "10 Skills per Person" (3 min on Karun + Kes only): ratify or strike. Each one becomes a Colaberry-approved entry in the library once you nod.</li>
<li>Sheet 5 "Systems Matrix" (5 min): scroll to confirm I have the right tools attached to each person.</li>
<li>Reply to this email with the refined xlsx. I commit it to the repo + start the Karun + Kes PRD sessions.</li>
</ol>
</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Where I drew from</h2>
<ul style="font-size:13px;color:#1f2937;padding-left:22px;line-height:1.7">
<li><strong>This repo</strong> - code + comments + PROGRESS.md + CLAUDE.md hierarchy + Basecamp project structure. Most names + roles came from working code.</li>
<li><strong>Memory</strong> - prior session notes flagged the Mika + Shveta offboarding, Karun's Coca-Cola work, Kes's platform ownership, etc.</li>
<li><strong>The AI Systems Architect Accelerator program docs</strong> at <code>docs/training-program-2026-q3/</code> - 17 launch briefs that map every team member's track for the July 10 cohort.</li>
<li><strong>The AI_ProjectArchitect GitHub repo</strong> (<a href="https://github.com/ColaberryIntern/AI_ProjectArchitect">ColaberryIntern/AI_ProjectArchitect</a>) - confirms the "bridge from idea to execution" framing + the library/sync architecture.</li>
<li><strong>The Alden DoRosario / GAI Insights talk</strong> Ram sent + my prior synthesis (Mandrill <code>9303b5d0...</code>).</li>
</ul>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">All 23 Basecamp tickets - the structure</h2>
<div style="padding:14px 18px;background:#0f172a;color:white;border-radius:6px;margin-bottom:14px;font-size:13px">
<strong style="color:#fbbf24">Parent list:</strong> <a href="${SUMMARY.list_url}" style="color:#fbbf24">AI_ProjectArchitect company-wide rollout (Karun + Kes pilot)</a>
</div>
${groups.map(groupBlock).join('')}

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">Open questions I need from you</h2>
<div style="background:#fef2f2;border-left:5px solid #c1272d;padding:16px 20px;font-size:13px;color:#7f1d1d;border-radius:0 6px 6px 0">
<ol style="margin:0;padding-left:20px;line-height:1.8">
<li><strong>Rubric thresholds:</strong> I used 5/7/9/10 (acceptable / on plan / ahead / best-in-class). Want a different spread? E.g. some teams prefer 1-10, some 0-100, some 4-quadrant. Tell me what fits your mental model.</li>
<li><strong>Wave assignments:</strong> Sohail might belong in PILOT instead of PHASE 2 given the July 10 marketing-driven launch. Should I move him?</li>
<li><strong>Per-person numbers:</strong> are the 5 I drafted for Karun + Kes actually the 5 they should own? Karun gets coverage on Coca-Cola + Patriot + Anthropic; Kes gets uptime + agent count + ship cadence + GHL coverage + MTTR. Wanted to surface this explicitly.</li>
<li><strong>Skill granularity:</strong> 10 skills per person seemed right (Alden talked about "12 skills that produce 5 numbers"). Want me to go higher or lower for any role?</li>
<li><strong>Library → GitHub sync mechanism:</strong> the localhost:8765 library is the source of truth today. Do you want me to build the sync webhook now (Infra 2, due 21 days), or do you want to manually flag + commit until the pilots prove out?</li>
<li><strong>Ram framing:</strong> do you want me to draft the all-hands Earn/Learn/Bond/Save message from Ram now (Infra 5, due 14 days), or hold until after the pilot?</li>
</ol>
<div style="margin-top:12px;font-size:13px"><strong>Reply to this email with answers in any format - bullet, paragraph, or just "go" if you want me to proceed on best judgment.</strong></div>
</div>

<h2 style="font-size:17px;margin:24px 0 10px;color:#0f172a">What I am NOT doing without your signal</h2>
<ul style="font-size:13px;color:#1f2937;padding-left:22px;line-height:1.7">
<li>Sending anything to Karun or Kes about their PRDs. (Comes after you refine.)</li>
<li>Building karun-agent or kes-agent code. (Comes after PRD is signed.)</li>
<li>Touching Ram's all-hands draft. (Pending your nod above.)</li>
<li>Committing anything as "Colaberry approved" to AI_ProjectArchitect. (Library + sync spec is in tickets but execution is pending.)</li>
<li>Wave 2 or Wave 3 person execution. (Tickets are placeholders only.)</li>
</ul>

</div>

<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
Spreadsheet attached. Reply with refinements or "go" on any subset.<br><br>
Ali
</div>

</div></body></html>`;

const text = strip(`Ali - AI_ProjectArchitect rollout planning shipped.

WHAT I DID:
1. Inventoried the team. 17 core employees + 2 pilots (Karun + Kes) + Mika/Shveta excluded (offboarded) + interns + externals excluded.
2. Drafted per-person rubrics + skills. 5 numbers + 10 skills + draft FICO-style rubric per number per person. Pilots highlighted.
3. Generated xlsx workbook: docs/ai-architect-rubrics-2026-06-02.xlsx. 5 sheets - README, Employee Master, 5 Numbers + Rubrics, 10 Skills, Systems Matrix.
4. Created 23 BC tickets on a new list: ${SUMMARY.list_url}
5. Held to your "only roll out Karun and Kes" instruction - Phase 2/3 are planning entries; execution work is parked.

HOW TO APPROACH THE SPREADSHEET (30 min):
- Open xlsx. README sheet first (2 min).
- Employee Master (5 min): confirm 17 right people in right wave.
- 5 Numbers + Rubrics (15 min): scroll to Karun + Kes ONLY. Refine targets/thresholds/number names. Rest stays draft.
- 10 Skills per Person (3 min on Karun + Kes).
- Systems Matrix (5 min): confirm tools.
- Reply with refined xlsx. I commit + start PRD sessions.

BC TICKETS (23 total):
- Overview (1)
- Infrastructure (5): Colaberry-approved spec, library→GitHub sync, employee onboarding runbook, weekly rubric refinement cadence, Ram all-hands comms.
- Karun pilot (5): PRD, agent build, calendar wire, 4-week iteration, 30-day retro.
- Kes pilot (5): PRD, agent build, calendar wire, 4-week iteration, 30-day retro.
- Phase 2 (3, planning only): YAML generalization, exec team onboarding, DRI + $90/$10 budget.
- Phase 3 + Day-90 retro (3, planning only): rest of team, "no 1:1 without dashboard" hard rule, 90-day retrospective.
- Strategic (1): Tier-C "Colaberry AI Box" Q4 product evaluation.

OPEN QUESTIONS:
1. Rubric thresholds (used 5/7/9/10) - want different spread?
2. Move Sohail to PILOT given July 10 launch dependency?
3. Are the 5 numbers correct for Karun + Kes?
4. Skill granularity (used 10 each) - higher/lower for any role?
5. Library→GitHub sync now (Infra 2, due 21d) or manual until pilots prove?
6. Want me to draft Ram's all-hands Earn/Learn/Bond/Save message now (Infra 5, due 14d)?

WHAT I AM NOT DOING WITHOUT YOUR SIGNAL: contacting Karun/Kes about PRDs, building agent code, drafting Ram comms, committing Colaberry-approved entries, executing Phase 2/3.

Reply with refinements or "go" on any subset.

Ali`);

(async () => {
  validateBeforeSend(HTML, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    cc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Ali - AI_ProjectArchitect rollout: 23 BC tickets + per-employee rubric spreadsheet for your refinement',
    text, html: HTML,
    attachments: [
      { filename: 'ai-architect-rubrics-2026-06-02.xlsx', content: XLSX_BUF, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ],
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
