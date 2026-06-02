#!/usr/bin/env node
// Comparison of Alden DoRosario's playbook (from the GAI Insights talk Ram sent)
// against Ali's actual current stack — what's already in place, what's missing,
// and a 90-day upgrade plan. To Ali, CC Ram, BCC Ali's other inboxes.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const nodemailer = require(path.resolve(__dirname, '../../../node_modules/nodemailer'));
const { validateBeforeSend } = require(path.resolve(__dirname, './lib/mandrillPreflight'));

function strip(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

const HTML = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Georgia,'Times New Roman',serif;color:#1a202c;line-height:1.65">
<div style="max-width:820px;margin:0 auto;background:#fefaf3">

<div style="padding:22px 36px 0;font-family:Arial,sans-serif">
<div style="font-size:13px;color:#475569">Ram, Karun, Ali -</div>
<div style="font-size:14px;color:#1f2937;margin-top:6px">Ram - on your "Ali built a mini version of this, let's create our own" - here is the read. I took the Alden DoRosario transcript and mapped his framework against what we already have running across Basecamp, Cory, Inbox COS, CB System, and the briefing pipeline. Then I built a 90-day plan to close the gap and explicitly addressed the last two audience questions you flagged (Ray's "own box" sovereignty question + Yohan's "skills-based organization" answer). Karun - this directly involves you; you are the proposed pilot.</div>
<div style="font-size:14px;color:#1f2937;margin-top:8px">Honest read: we are further along than I expected on legibility, behind on rubric + per-person agents, and the upgrade is mostly composition of pieces we already have, not net-new builds.</div>
</div>

<!-- HERO -->
<div style="margin-top:24px;padding:48px 36px;background:linear-gradient(135deg,#0f172a 0%,#1a365d 60%,#7c2d12 100%);color:white;text-align:center">
<div style="font-size:11px;letter-spacing:5px;text-transform:uppercase;color:#fbbf24;font-weight:700">Alden's playbook vs Colaberry's current stack</div>
<h1 style="margin:14px 0 6px;font-size:36px;line-height:1.05;font-weight:800;letter-spacing:-1px;font-family:Georgia,serif">We are 60% of the way there.<br>The other 40% is a 90-day project.</h1>
<div style="margin-top:14px;font-size:15px;color:#cbd5e0;max-width:600px;margin-left:auto;margin-right:auto;line-height:1.5">Alden runs CustomGPT with 32 people, manages legibly through agents. We are at ~30 people across Colaberry. Our context layer (per-account dossiers, BC graph walker, Cory briefings) is already where Alden's was 3 months in. What we are missing is the per-person agent + the rubric + the player-coach DRI model.</div>
</div>

<!-- SCORECARD -->
<div style="padding:42px 40px 12px;background:#fefaf3">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7c2d12;font-weight:700;font-family:Arial,sans-serif">Side-by-side scorecard</div>
<h2 style="margin:6px 0 18px;font-size:28px;line-height:1.15;color:#0f172a">Where we already match Alden, where we don't.</h2>

<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden">
<thead><tr style="background:#0f172a;color:white">
<th style="padding:12px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:30%">Alden's pillar</th>
<th style="padding:12px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:35%">What we already have</th>
<th style="padding:12px 14px;text-align:left;font-size:11px;letter-spacing:1px;width:25%">Gap</th>
<th style="padding:12px 14px;text-align:center;font-size:11px;letter-spacing:1px;width:10%">Status</th>
</tr></thead>
<tbody>

<tr style="background:white"><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong style="color:#0f172a">LEGIBILITY</strong><br><span style="color:#475569">AI sees everything every direct report touches.</span></td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#1f2937"><strong>Most of it.</strong> CB Context Walker pulls every BC comment + every linked doc + every Vault PDF. Per-account dossiers synthesize Gmail. Basecamp dock filter covers todos + messages + recordings + uploads + vaults. CCPP is wired in. HubSpot + Slack equivalents are partial.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#7c2d12;font-size:12px">Slack/HubSpot/Apollo not yet piped into a single agent context. Calendar data not yet legible to Cory.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:middle;text-align:center"><span style="display:inline-block;width:64px;height:8px;background:linear-gradient(90deg,#14532d 0%,#14532d 75%,#e2e8f0 75%,#e2e8f0 100%);border-radius:4px"></span><div style="font-size:11px;color:#14532d;font-weight:700;margin-top:4px">75%</div></td></tr>

<tr style="background:#f8fafc"><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong style="color:#0f172a">PRE-MEETING DASHBOARD</strong><br><span style="color:#475569">AI builds a custom HTML dashboard 5 min before each meeting.</span></td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#1f2937"><strong>Aggregate version only.</strong> Cory daily + weekly briefings. Daily Admin Digest. Daily Ali Personal Decisions Report. Gov Contracts Analysis. Client Projects Report. All operate on portfolio metrics, not on a specific 1:1.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#7c2d12;font-size:12px">No per-person dashboard generated before a specific 1:1. No "tonight at 7pm I am meeting with Karun, here is the dashboard for Karun" flow.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:middle;text-align:center"><span style="display:inline-block;width:64px;height:8px;background:linear-gradient(90deg,#d4a017 0%,#d4a017 30%,#e2e8f0 30%,#e2e8f0 100%);border-radius:4px"></span><div style="font-size:11px;color:#78350f;font-weight:700;margin-top:4px">30%</div></td></tr>

<tr style="background:white"><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong style="color:#0f172a">PER-PERSON AGENT</strong><br><span style="color:#475569">Each direct report has their own Context + Goals + Plan + Verification + Rubric agent.</span></td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#1f2937"><strong>None yet.</strong> Cory operates org-wide (one agent for the whole company). CB System handles open-ended @CB tags but is not scoped per person.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#7c2d12;font-size:12px">Zero per-person agents. No agent that says "I am Karun's GPS, here is where Karun is vs the goal."</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:middle;text-align:center"><span style="display:inline-block;width:64px;height:8px;background:linear-gradient(90deg,#c1272d 0%,#c1272d 0%,#e2e8f0 0%,#e2e8f0 100%);border-radius:4px"></span><div style="font-size:11px;color:#7f1d1d;font-weight:700;margin-top:4px">0%</div></td></tr>

<tr style="background:#f8fafc"><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong style="color:#0f172a">RUBRIC / FICO-FOR-WORK</strong><br><span style="color:#475569">Every piece of work gets a numerical score against an explicit rubric.</span></td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#1f2937"><strong>Sub-domain only.</strong> Intern activity tracker has weekly intern scoring (strong / light / inactive based on update count). Openclaw has quality gate scoring on outbound posts. ShipCES has built-in scoring. Gov bid pipeline has min-score filter (≥3 → 2). Nothing rolls up to per-person.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#7c2d12;font-size:12px">No "Karun's work output this week scored 6.7/10" with the rubric explicit and shared with Karun.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:middle;text-align:center"><span style="display:inline-block;width:64px;height:8px;background:linear-gradient(90deg,#d4a017 0%,#d4a017 25%,#e2e8f0 25%,#e2e8f0 100%);border-radius:4px"></span><div style="font-size:11px;color:#78350f;font-weight:700;margin-top:4px">25%</div></td></tr>

<tr style="background:white"><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong style="color:#0f172a">VERIFICATION LOOPS</strong><br><span style="color:#475569">Every AI artifact gets a critic + verification pass before it ships.</span></td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#1f2937"><strong>Strong on the operational side.</strong> CB Coverage Check runs 12 verification checks. Openclaw circuit breaker. Skool quality gate agent. CB Watchdog daily health email. ShipCES feedback loop. CB Watchdog catches dispatcher silence within 24h.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#7c2d12;font-size:12px">No formal critic-loop / verification-loop on the LLM artifacts CB System generates (decisions report items, gov bid recommendations, content drafts).</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:middle;text-align:center"><span style="display:inline-block;width:64px;height:8px;background:linear-gradient(90deg,#14532d 0%,#14532d 60%,#e2e8f0 60%,#e2e8f0 100%);border-radius:4px"></span><div style="font-size:11px;color:#14532d;font-weight:700;margin-top:4px">60%</div></td></tr>

<tr style="background:#f8fafc"><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong style="color:#0f172a">SKILLS IN GITHUB</strong><br><span style="color:#475569">Agents and their skills owned by the company, not the employee. Slash-command surface.</span></td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#1f2937"><strong>Already there.</strong> All Cory + CB System + Inbox COS + 100+ briefing scripts live in <code style="background:#0f172a;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:12px">backend/src/scripts/</code> + <code style="background:#0f172a;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:12px">scripts/ops-engine/</code> on GitHub. Claude Code skills under <code style="background:#0f172a;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:12px">.claude/skills/</code>. When someone leaves, their workflows persist.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#7c2d12;font-size:12px">Non-eng employees don't yet have personal skills they can invoke via slash command. The portfolio is dev-centric.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:middle;text-align:center"><span style="display:inline-block;width:64px;height:8px;background:linear-gradient(90deg,#14532d 0%,#14532d 80%,#e2e8f0 80%,#e2e8f0 100%);border-radius:4px"></span><div style="font-size:11px;color:#14532d;font-weight:700;margin-top:4px">80%</div></td></tr>

<tr style="background:white"><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong style="color:#0f172a">$90 + $10 RATIO</strong><br><span style="color:#475569">For every $90 spent on a human, spend $10 making that human AI-augmented.</span></td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#1f2937"><strong>Not yet a budget line.</strong> Ad-hoc AI spend across OpenAI, Anthropic, Claude Code, Mandrill, Twilio, etc. Not tracked per employee.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#7c2d12;font-size:12px">No per-employee AI budget envelope. No reporting on AI spend / headcount.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:middle;text-align:center"><span style="display:inline-block;width:64px;height:8px;background:linear-gradient(90deg,#c1272d 0%,#c1272d 10%,#e2e8f0 10%,#e2e8f0 100%);border-radius:4px"></span><div style="font-size:11px;color:#7f1d1d;font-weight:700;margin-top:4px">10%</div></td></tr>

<tr style="background:#f8fafc"><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top"><strong style="color:#0f172a">DRI MODEL</strong><br><span style="color:#475569">Player-coaches replace coaches. Heads of X become directly responsible individuals who own a number.</span></td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#1f2937"><strong>Partial.</strong> Most leadership at Colaberry already runs lean - Karun, David Lahme, JJ McBride each own numbers + a domain + still execute. The Basecamp structure (Ali Personal + Internship + Dev Team + etc.) is already DRI-shaped.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#7c2d12;font-size:12px">Not formally framed as DRI. No explicit "Karun owns these 5 numbers, here they are, here is the rubric." Some areas still have manager-only layers.</td>
<td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:middle;text-align:center"><span style="display:inline-block;width:64px;height:8px;background:linear-gradient(90deg,#14532d 0%,#14532d 65%,#e2e8f0 65%,#e2e8f0 100%);border-radius:4px"></span><div style="font-size:11px;color:#14532d;font-weight:700;margin-top:4px">65%</div></td></tr>

<tr style="background:white"><td style="padding:14px 16px;vertical-align:top"><strong style="color:#0f172a">EARN / LEARN / BOND / SAVE</strong><br><span style="color:#475569">Framework for the people side of the AI transformation.</span></td>
<td style="padding:14px 16px;vertical-align:top;color:#1f2937"><strong>None named.</strong> Implicit version in places (intern nudges have a learn aspect; nothing explicit on earn / bond / save).</td>
<td style="padding:14px 16px;vertical-align:top;color:#7c2d12;font-size:12px">No framework adopted. Risk - if we accelerate the agent push without it, we will repeat Alden's "fatwa" mistake on the people side.</td>
<td style="padding:14px 16px;vertical-align:middle;text-align:center"><span style="display:inline-block;width:64px;height:8px;background:linear-gradient(90deg,#c1272d 0%,#c1272d 5%,#e2e8f0 5%,#e2e8f0 100%);border-radius:4px"></span><div style="font-size:11px;color:#7f1d1d;font-weight:700;margin-top:4px">5%</div></td></tr>

</tbody>
</table>

<div style="margin-top:16px;padding:14px 18px;background:#0f172a;color:white;border-radius:8px;font-size:13px;font-family:Arial,sans-serif">
<strong style="color:#fbbf24">Weighted score: ~60%.</strong> The legibility + skills-in-GitHub layers are nearly there. The per-person agent / rubric / DRI framing is the wedge that turns infrastructure into management leverage.
</div>
</div>

<!-- DIAGRAM: WHAT WE HAVE VS WHAT ALDEN HAS -->
<div style="padding:42px 40px;background:#0f172a;color:white">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700;font-family:Arial,sans-serif">Architecture diagram</div>
<h2 style="margin:6px 0 20px;font-size:28px;line-height:1.15;color:white">Our stack today (top) vs Alden's stack (bottom). The difference is the per-person box.</h2>

<div style="background:#1e293b;padding:24px;border-radius:10px;border:1px solid #334155">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#cbd5e0;font-weight:700;font-family:Arial,sans-serif">COLABERRY TODAY</div>
<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;font-family:Arial,sans-serif">
<div style="flex:1;min-width:140px;background:#14532d;color:white;padding:14px 12px;border-radius:6px;text-align:center;font-size:12px"><strong style="display:block;font-size:11px;letter-spacing:1px;color:#bbf7d0">CONTEXT</strong>BC walker<br>Per-account<br>dossiers<br>CCPP wired<br>Gmail OAuth</div>
<div style="font-size:24px;color:#fbbf24;align-self:center;font-family:monospace">→</div>
<div style="flex:1;min-width:140px;background:#7c2d12;color:white;padding:14px 12px;border-radius:6px;text-align:center;font-size:12px"><strong style="display:block;font-size:11px;letter-spacing:1px;color:#fecaca">ONE BIG AGENT</strong>Cory<br>(org-wide)<br>CB System<br>Inbox COS</div>
<div style="font-size:24px;color:#fbbf24;align-self:center;font-family:monospace">→</div>
<div style="flex:1;min-width:140px;background:#1a365d;color:white;padding:14px 12px;border-radius:6px;text-align:center;font-size:12px"><strong style="display:block;font-size:11px;letter-spacing:1px;color:#bfdbfe">AGGREGATE OUT</strong>Daily briefings<br>Weekly review<br>Decisions report<br>Health alerts</div>
<div style="font-size:24px;color:#fbbf24;align-self:center;font-family:monospace">→</div>
<div style="flex:1;min-width:140px;background:#0c4a6e;color:white;padding:14px 12px;border-radius:6px;text-align:center;font-size:12px"><strong style="display:block;font-size:11px;letter-spacing:1px;color:#bae6fd">ALI INBOX</strong>(when not<br>auto-archived<br>by mistake)</div>
</div>
<div style="margin-top:12px;font-size:12px;color:#cbd5e0;font-style:italic;font-family:Arial,sans-serif">Flow: rich context → one general agent → portfolio metrics → executive. No per-person artifact.</div>
</div>

<div style="background:#1e293b;padding:24px;border-radius:10px;border:1px solid #334155;margin-top:18px">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700;font-family:Arial,sans-serif">ALDEN'S STACK</div>
<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;font-family:Arial,sans-serif">
<div style="flex:1;min-width:140px;background:#14532d;color:white;padding:14px 12px;border-radius:6px;text-align:center;font-size:12px"><strong style="display:block;font-size:11px;letter-spacing:1px;color:#bbf7d0">CONTEXT</strong>Slack threads<br>GitHub PRs<br>Docs<br>Sales calls<br>(All MCP-wired)</div>
<div style="font-size:24px;color:#fbbf24;align-self:center;font-family:monospace">→</div>
<div style="flex:1;min-width:140px;background:#fbbf24;color:#0f172a;padding:14px 12px;border-radius:6px;text-align:center;font-size:12px;font-weight:700"><strong style="display:block;font-size:11px;letter-spacing:1px;color:#7c2d12">PER-PERSON AGENT</strong>One agent<br>per direct<br>report<br>(Context+Goals+<br>Plan+Verify+Rubric)</div>
<div style="font-size:24px;color:#fbbf24;align-self:center;font-family:monospace">→</div>
<div style="flex:1;min-width:140px;background:#1a365d;color:white;padding:14px 12px;border-radius:6px;text-align:center;font-size:12px"><strong style="display:block;font-size:11px;letter-spacing:1px;color:#bfdbfe">PRE-MEETING DASH</strong>"Alden vs Sarah<br>1:1 Monday 10am"<br>HTML dashboard,<br>5 min before</div>
<div style="font-size:24px;color:#fbbf24;align-self:center;font-family:monospace">→</div>
<div style="flex:1;min-width:140px;background:#0c4a6e;color:white;padding:14px 12px;border-radius:6px;text-align:center;font-size:12px"><strong style="display:block;font-size:11px;letter-spacing:1px;color:#bae6fd">15-MIN MEETING</strong>Both sides see<br>same numbers<br>+ same rubric</div>
</div>
<div style="margin-top:12px;font-size:12px;color:#fbbf24;font-style:italic;font-family:Arial,sans-serif">Flow: same context → ONE AGENT PER PERSON → per-meeting dashboard → both-sides-aligned 15-min working session.</div>
</div>

<div style="margin-top:18px;padding:14px 18px;background:rgba(212,30,46,0.15);border-left:5px solid #c1272d;border-radius:0 6px 6px 0;font-size:13px;color:#fecaca;font-family:Arial,sans-serif">
<strong>The gap is the gold box.</strong> Our infrastructure feeds aggregate dashboards (Cory). Alden's feeds per-person agents that generate per-meeting dashboards. Same plumbing - different terminal output.
</div>
</div>

<!-- 90-DAY PLAN -->
<div style="padding:42px 40px;background:#fefaf3">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7c2d12;font-weight:700;font-family:Arial,sans-serif">The plan</div>
<h2 style="margin:6px 0 18px;font-size:32px;line-height:1.15;color:#0f172a">90 days, three phases, one pilot person at a time.</h2>

<p style="font-size:15px;color:#1f2937;margin:0 0 16px">Alden's fourth mistake was rolling out to 30 people on day one. We don't repeat that. We pick one person, build the full stack, prove the loop, then ladder.</p>

<!-- PHASE 1 -->
<div style="margin-top:22px;border:2px solid #14532d;border-radius:10px;overflow:hidden;background:white">
<div style="background:#14532d;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:baseline;font-family:Arial,sans-serif">
<div><div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#bbf7d0">Phase 1 - Days 1-30</div><div style="font-size:20px;font-weight:800">Pilot the per-person agent. One person. Karun.</div></div>
<div style="font-size:11px;letter-spacing:1px;color:#bbf7d0;text-align:right">Cost: low<br>Risk: low</div>
</div>
<div style="padding:18px 22px">
<ol style="font-size:14px;color:#1f2937;margin:0;padding-left:22px;line-height:1.8">
<li><strong>Write Karun's PRD on paper.</strong> One page. What systems does he touch (HubSpot, Gmail, BC, CCPP). What 5 numbers does he own (active accounts, weighted pipeline, conversion to demo, demo-to-pilot, win rate). What is the rubric per number.</li>
<li><strong>Build "karun-agent" as a Claude Code skill</strong> under <code style="background:#0f172a;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:12px">.claude/skills/karun-agent/</code>. It reads BC + Gmail + HubSpot + CCPP via MCP, scores each of the 5 numbers against the rubric, generates a dashboard HTML.</li>
<li><strong>Wire <code style="background:#0f172a;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:12px">/karun-dash</code> to fire automatically 30 min before each 1:1.</strong> Reuse the existing calendar integration. The dashboard lands in both Karun's inbox and yours.</li>
<li><strong>Add a critic-loop pass</strong> on the dashboard before it sends. We have the pattern already - Openclaw circuit breaker + Skool quality gate. Reuse.</li>
<li><strong>Run for 4 weeks.</strong> Two 1:1s a week. Iterate the rubric based on what Karun pushes back on.</li>
</ol>
<div style="margin-top:14px;padding:12px 16px;background:#dcfce7;border-left:4px solid #14532d;border-radius:0 6px 6px 0;font-size:13px;color:#14532d">
<strong>Why Karun first:</strong> his work is the most data-pipeable (BD/sales pipeline lives in HubSpot already), he is already in lockstep on the Coca-Cola work, and we have 6 weeks of conversation history that gives the agent a warm start.
</div>
</div>
</div>

<!-- PHASE 2 -->
<div style="margin-top:22px;border:2px solid #d4a017;border-radius:10px;overflow:hidden;background:white">
<div style="background:#d4a017;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:baseline;font-family:Arial,sans-serif">
<div><div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fef3c7">Phase 2 - Days 31-60</div><div style="font-size:20px;font-weight:800">Ladder to the rest of the exec team.</div></div>
<div style="font-size:11px;letter-spacing:1px;color:#fef3c7;text-align:right">Cost: medium<br>Risk: low-medium</div>
</div>
<div style="padding:18px 22px">
<ol style="font-size:14px;color:#1f2937;margin:0;padding-left:22px;line-height:1.8">
<li><strong>Generalize the karun-agent skill.</strong> Replace hardcoded "Karun" / HubSpot config with a YAML config per person. <code style="background:#0f172a;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:12px">/person karun</code>, <code style="background:#0f172a;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:12px">/person david</code>, etc.</li>
<li><strong>Stand up agents for David Lahme + JJ McBride + Dhee + Swati.</strong> Each one with their own PRD, their own 5 numbers, their own rubric. Each PRD takes ~1 hour after the pattern is set.</li>
<li><strong>Adopt the DRI framing explicitly.</strong> Each of the above is now a Directly Responsible Individual. The 5 numbers per person become public to that domain.</li>
<li><strong>Adopt the Earn / Learn / Bond / Save framework</strong> for how we communicate this internally. Single all-hands intro from Ram so it lands as opportunity, not surveillance.</li>
<li><strong>Set up the $90/$10 budget</strong> as a real line item. ~$1K/mo per exec on AI infrastructure (OpenAI, Anthropic, MCP, Mandrill share-of, Twilio share-of). Track quarterly.</li>
</ol>
<div style="margin-top:14px;padding:12px 16px;background:#fef9e7;border-left:4px solid #d4a017;border-radius:0 6px 6px 0;font-size:13px;color:#78350f">
<strong>Why exec team second:</strong> they all volunteered for the AI bet. Lowest people-side risk before we touch interns + non-tech employees.
</div>
</div>
</div>

<!-- PHASE 3 -->
<div style="margin-top:22px;border:2px solid #c1272d;border-radius:10px;overflow:hidden;background:white">
<div style="background:#c1272d;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:baseline;font-family:Arial,sans-serif">
<div><div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fee2e2">Phase 3 - Days 61-90</div><div style="font-size:20px;font-weight:800">Roll out to the rest of the org. Carefully.</div></div>
<div style="font-size:11px;letter-spacing:1px;color:#fee2e2;text-align:right">Cost: medium<br>Risk: medium-high</div>
</div>
<div style="padding:18px 22px">
<ol style="font-size:14px;color:#1f2937;margin:0;padding-left:22px;line-height:1.8">
<li><strong>Apply the framework to interns, instructors, TAs, the marketing team.</strong> Pair each non-technical person with an AI engineer for the first 2 weeks (Alden's mistake #2).</li>
<li><strong>For interns specifically:</strong> the existing tracker already has weekly Strong/Light/Inactive scoring. Upgrade to FICO-for-work - explicit rubric, public score, weekly delta.</li>
<li><strong>Ship the per-person Vault dossier for every direct report</strong> (we already have this pattern for sales-rep accounts; extend to people). Each person's dossier becomes the warm-start context for their agent.</li>
<li><strong>Move 1:1s to dashboard-first.</strong> Hard rule: no 1:1 happens unless the dashboard fired 30 min prior. Verbal-only 1:1s are the failure mode this whole project replaces.</li>
<li><strong>Retrospective at day 90.</strong> Compare engagement, decisions made per week, time-in-meeting per week, retention, before and after.</li>
</ol>
<div style="margin-top:14px;padding:12px 16px;background:#fee2e2;border-left:4px solid #c1272d;border-radius:0 6px 6px 0;font-size:13px;color:#7f1d1d">
<strong>Risk to flag now:</strong> Alden lost two types of people - anti-AI ideologues and low performers exposed by the scoreboard. We should be ready for both. Earn / Learn / Bond / Save reduces the first; we manage the second on its own terms.
</div>
</div>
</div>

</div>

<!-- THE LAST TWO QUESTIONS RAM FLAGGED -->
<div style="padding:42px 40px;background:#fefaf3">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7c2d12;font-weight:700;font-family:Arial,sans-serif">The last two questions Ram flagged</div>
<h2 style="margin:6px 0 16px;font-size:28px;line-height:1.15;color:#0f172a">Both are pointed straight at us. Here is my read on each.</h2>

<!-- Question 1: Ray's box -->
<div style="margin-top:18px;border:2px solid #1a365d;border-radius:10px;overflow:hidden;background:white">
<div style="background:#1a365d;color:white;padding:14px 20px;font-family:Arial,sans-serif">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24">Question 1 - Ray (42:58 - 46:53)</div>
<div style="font-size:18px;font-weight:800;margin-top:2px">"Should companies run their AI on their own physical box - all open-source, on-prem, so proprietary info never leaves?"</div>
</div>
<div style="padding:18px 22px">
<p style="font-size:14px;color:#1f2937;margin:0 0 10px"><strong>What Ray said:</strong> there's a $2B-funded company already automating boardroom-to-bottom-of-org. His own move: an actual hardware box - 128 GB, open-source AI software, all company SOPs + IP + employee data stored locally. As the company runs, "the box" learns the company. Argument is data sovereignty - "no matter which GPT, no matter which GitHub, you have it in your own box."</p>

<div style="margin-top:14px;padding:14px 18px;background:#dcfce7;border-left:5px solid #14532d;border-radius:0 6px 6px 0;font-size:13px;color:#14532d;font-family:Arial,sans-serif">
<strong>My read for us:</strong> Ray is half-right and half-overshooting. For Colaberry the right move is a <strong>tiered model</strong>, not "everything in one box." Concretely:
<ul style="margin:6px 0 0;padding-left:20px;line-height:1.7">
<li><strong>Tier A - hosted (today):</strong> Cory, CB System, Inbox COS, briefings. These run on our Hetzner VPS, talk to OpenAI / Anthropic over the wire. Fine for our own org because no client data flows through them.</li>
<li><strong>Tier B - hybrid (next 90 days):</strong> for client engagements like <strong>Coca-Cola, IOU utilities, Patriot Insurance</strong>, the agent infra needs to live INSIDE the client's stack. AWS / Azure / GCP at Coke. On-prem for Coke's Snyder bottling facility data. This was literally Darrell's "cloud-only" requirement in the May 13 deep-dive. Ray's argument is correct for that surface.</li>
<li><strong>Tier C - "Colaberry box" product (Q4 2026 / 2027 candidate):</strong> if Ray is right about the trajectory, we should be <em>selling the box</em>, not just running our own. A "Colaberry AI Box" pre-loaded with our 5 platforms (Outage IQ, Crew Capture, Member Voice, Rate Case IQ, Compliance Companion - the co-op ad we're building this week) is a real product, not a thought experiment.</li>
</ul>
<strong>The thing to NOT copy:</strong> Ray builds his own box because he distrusts GitHub / OpenAI / cloud. We already proved (Coca-Cola use case 7, the on-prem RAG one) that the right answer for sensitive workloads is on-prem + cloud hybrid, not "burn the cloud."
</div>
</div>
</div>

<!-- Question 2: Yohan's skills-based org -->
<div style="margin-top:22px;border:2px solid #7c2d12;border-radius:10px;overflow:hidden;background:white">
<div style="background:#7c2d12;color:white;padding:14px 20px;font-family:Arial,sans-serif">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24">Question 2 - Yohan (47:18 - 48:05)</div>
<div style="font-size:18px;font-weight:800;margin-top:2px">"I disbanded all departments. The org is now skill-based. Skills capture procedures, methods, IP. People leave - skills stay."</div>
</div>
<div style="padding:18px 22px">
<p style="font-size:14px;color:#1f2937;margin:0 0 10px"><strong>What Yohan said:</strong> his organization no longer has functional departments. The unit is the <em>skill</em>. Each skill encapsulates an SOP, a method, a piece of IP. When an employee leaves, the skill stays with the company; whoever takes the role uses the skill. "Skills are the organization."</p>

<div style="margin-top:14px;padding:14px 18px;background:#fef2f2;border-left:5px solid #c1272d;border-radius:0 6px 6px 0;font-size:13px;color:#7f1d1d;font-family:Arial,sans-serif">
<strong>My read for us:</strong> Yohan's answer is the <em>right north star</em> for what Alden was describing but didn't fully articulate. It also explains why the "agents in GitHub" point Alden made matters - <strong>each agent IS a skill</strong>. Concretely for Colaberry:
<ul style="margin:6px 0 0;padding-left:20px;line-height:1.7">
<li><strong>We already have ~100 skills</strong> in <code style="background:#0f172a;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:12px">backend/src/scripts/</code> + <code style="background:#0f172a;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:12px">scripts/ops-engine/</code> + <code style="background:#0f172a;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:12px">.claude/skills/</code>. Each one is a procedure, owned by Colaberry. <strong>We just haven't framed them as "the org structure" yet.</strong></li>
<li><strong>The shift:</strong> stop thinking of "Karun's job" or "Dhee's job." Start thinking of "the new lead intake skill, the deal qualification skill, the proposal generation skill, the post-call follow-up skill." Karun executes a portfolio of skills. So does Dhee. Skills overlap.</li>
<li><strong>This solves Yohan's "people leaving" problem directly.</strong> If Mika leaves tomorrow, the "intern weekly scoring skill," the "resume review skill," and the "TMAY orientation skill" are all already in repo - the next person inherits them.</li>
<li><strong>This is the upgrade to "DRI."</strong> Alden's DRI owns a number. Yohan's skill-based-org says: the DRI owns a number AND a portfolio of skills. The skills are how the number gets hit. The portfolio is portable.</li>
</ul>
<strong>The implication for Phase 1:</strong> when we write Karun's PRD, we should NOT just list "his 5 numbers." We should also list "the 12 skills that produce those 5 numbers." Those 12 skills get committed to GitHub. If Karun's role shifts or he ever moves on, the skills outlast him.
</div>
</div>
</div>

<div style="margin-top:22px;padding:16px 20px;background:#0f172a;color:white;border-radius:8px;font-family:Arial,sans-serif">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">Putting the two together</div>
<div style="font-size:14px;color:#cbd5e0;margin-top:6px">Ray says <strong>where the AI lives</strong> matters (the box). Yohan says <strong>what the AI knows</strong> matters (skills, not departments). Both true. Our 90-day plan threads them - Phase 1 + 2 builds the skills (Yohan); the Tier-B + Tier-C product roadmap addresses sovereignty (Ray). Neither is the whole answer alone. Combined they describe an architecture we are 60% of the way to anyway.</div>
</div>
</div>

<!-- WHAT TO LIFT FIRST -->
<div style="padding:42px 40px;background:#1a365d;color:white">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700;font-family:Arial,sans-serif">If we lift one thing from the talk this week</div>
<h2 style="margin:6px 0 14px;font-size:28px;line-height:1.15;color:white">The pre-meeting dashboard.</h2>
<p style="font-size:15px;color:#cbd5e0;margin:0 0 14px">Of everything Alden described, the single highest-leverage move is: a custom HTML dashboard generated 5 minutes before each 1:1. It does not require a per-person agent yet. It does not require the rubric to be perfect. It just requires that Cory pull the relevant numbers + the relevant Basecamp activity + the relevant Gmail threads for that person and email it to both parties before the call.</p>
<p style="font-size:15px;color:#cbd5e0;margin:0 0 14px">We have every piece. The walker pulls per-account context. The briefing service knows how to email. The calendar service knows the schedule. Wiring those three together for one person is a ~4 hour build, not a 4 week build.</p>

<div style="margin-top:18px;padding:18px 22px;background:rgba(251,191,36,0.18);border-left:5px solid #fbbf24;border-radius:0 6px 6px 0;font-family:Georgia,serif;font-size:17px;color:#fef3c7;font-style:italic;line-height:1.5">
"That makes the meeting much more enjoyable and high-fidelity than just showing up with a couple of slides or two-three notes."<br>
<span style="font-style:normal;font-size:12px;letter-spacing:1px;color:#fbbf24;font-family:Arial,sans-serif;text-transform:uppercase;display:block;margin-top:8px">- Alden DoRosario, GAI Insights, June 2026</span>
</div>
</div>

<!-- ACTION SECTION -->
<div style="padding:42px 40px;background:#fefaf3">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7c2d12;font-weight:700;font-family:Arial,sans-serif">What I need from each of you</div>

<div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
<div style="background:white;padding:20px 22px;border-radius:8px;border-left:6px solid #1a365d">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;font-weight:700;font-family:Arial,sans-serif">Ram</div>
<div style="font-size:17px;font-weight:700;color:#0f172a;margin-top:4px">Pick the pilot + frame the people story.</div>
<p style="font-size:13px;color:#1f2937;margin:8px 0 0">I am proposing Karun. If David Lahme, JJ McBride, or someone else fits better, say the word. Also - if you want this rolled into a Ram all-hands message (Earn / Learn / Bond / Save framing), I will draft it.</p>
</div>
<div style="background:white;padding:20px 22px;border-radius:8px;border-left:6px solid #d4a017">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;font-weight:700;font-family:Arial,sans-serif">Karun</div>
<div style="font-size:17px;font-weight:700;color:#0f172a;margin-top:4px">If you are the pilot, give me 30 min.</div>
<p style="font-size:13px;color:#1f2937;margin:8px 0 0">I need to sit with you and write the karun-PRD on paper: which systems you touch, what 5 numbers you own, what 12 skills produce those numbers, what 7-vs-8 looks like on each rubric. After that, the build is mine.</p>
</div>
<div style="background:white;padding:20px 22px;border-radius:8px;border-left:6px solid #7c2d12">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;font-weight:700;font-family:Arial,sans-serif">Ali</div>
<div style="font-size:17px;font-weight:700;color:#0f172a;margin-top:4px">Approve the 4-hour build.</div>
<p style="font-size:13px;color:#1f2937;margin:8px 0 0">If you green-light the pre-meeting dashboard for Karun (Phase 1 step 3), v1 lives by EOD tomorrow. The full Phase 1 takes the rest of the 30 days to iterate.</p>
</div>
</div>
</div>

<div style="padding:32px 40px;background:#0f172a;color:white">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700;font-family:Arial,sans-serif">Sources</div>
<ul style="font-size:13px;color:#cbd5e0;margin-top:8px;line-height:1.8">
<li>Alden DoRosario / CustomGPT / GAI Insights Daily AI News &amp; Learning Lab. <a href="https://www.youtube.com/watch?v=mV1SAo5BRgo" style="color:#fbbf24">Full talk (48:39)</a>. Transcript pulled via youtube-transcript-api + auto-paragraphed.</li>
<li>Brian Halligan / HubSpot / Jack Dorsey podcast - the 6,000-direct-reports anchor Alden cites.</li>
<li>Dr. John Sviokla - Earn / Learn / Bond / Save framework Alden references for the people side.</li>
<li>Our actual stack: BC Context Walker (<code>scripts/ops-engine/cb-context-walker.js</code>), Cory briefing service (<code>backend/src/services/executiveBriefingService.ts</code>), Inbox COS (<code>backend/src/services/inbox/</code>), Per-account Vault dossiers, CB Coverage Check, CB Watchdog.</li>
</ul>
</div>

<div style="padding:20px 40px;background:white;font-size:13px;color:#475569;font-family:Arial,sans-serif">
Both of you - tell me what to change.<br><br>
Ali
</div>

</div></body></html>`;

const text = strip(`Ram, Karun, Ali - Ram, picking up on the Triad chat: "Ali built a mini version of this, let's create our own." Here's the read on the Alden DoRosario talk you sent.

VERDICT: we're ~60% of the way there. Legibility + skills-in-GitHub are nearly Alden's level. Per-person agent + rubric + DRI framing are the wedge that turns infrastructure into management leverage.

SIDE-BY-SIDE SCORECARD:
- LEGIBILITY (Alden's central pillar): 75%. CB Context Walker + per-account dossiers + Gmail OAuth + BC dock filter cover most. Missing: Slack/HubSpot/Apollo not yet piped into one agent context, calendar not yet legible to Cory.
- PRE-MEETING DASHBOARD: 30%. We have aggregate Cory + Daily Admin Digest + Decisions Report. We don't have "the dashboard for tonight's 7pm Karun 1:1."
- PER-PERSON AGENT: 0%. Cory is org-wide. No agent that says "I'm Karun's GPS."
- RUBRIC / FICO-FOR-WORK: 25%. Sub-domain scoring exists (intern tracker, Openclaw quality gate, ShipCES). No per-person rubric.
- VERIFICATION LOOPS: 60%. Strong operationally (Coverage Check, Watchdog, circuit breakers). Missing critic-loop on LLM artifacts.
- SKILLS IN GITHUB: 80%. All Cory + CB + Inbox COS in repo. Non-eng employees don't have personal slash skills yet.
- $90/$10 RATIO: 10%. Not a budget line yet.
- DRI MODEL: 65%. Karun, David, JJ already DRI-shaped. Not formally framed.
- EARN/LEARN/BOND/SAVE: 5%. Not adopted. Risk: we repeat Alden's "fatwa" mistake.

ARCHITECTURE DIAGRAM (in the HTML):
Today: Context (rich) -> One Big Agent (Cory) -> Aggregate Out -> Ali Inbox
Alden: Context (rich) -> Per-Person Agent (Context+Goals+Plan+Verify+Rubric) -> Per-meeting Dashboard -> 15-min meeting

The gap is the "per-person agent" box. Same plumbing, different terminal output.

90-DAY PLAN:
PHASE 1 (days 1-30): Pilot per-person agent for Karun.
- Write Karun's PRD on paper (systems, 5 numbers, rubric).
- Build "karun-agent" as a Claude Code skill.
- /karun-dash fires 30 min before each 1:1.
- Critic-loop pass on the dashboard. Run 4 weeks.

PHASE 2 (days 31-60): Ladder to exec team.
- Generalize the skill (YAML config per person).
- Stand up agents for David Lahme + JJ McBride + Dhee + Swati.
- Adopt DRI framing + Earn/Learn/Bond/Save framework explicitly.
- Set up $90/$10 budget envelope.

PHASE 3 (days 61-90): Roll out to interns, instructors, TAs, marketing.
- Pair each non-tech person with an AI engineer for 2 weeks (Alden mistake #2).
- Upgrade intern weekly scoring to FICO-for-work.
- Ship per-person Vault dossiers.
- Hard rule: no 1:1 without dashboard fired 30 min prior.
- Day-90 retro: engagement, decisions/week, time-in-meeting, retention before/after.

LIFT THIS WEEK: the pre-meeting dashboard. 4-hour build, not 4-week. We have every piece (walker, briefing service, calendar service).

THE 2 QUESTIONS RAM FLAGGED (last 2 audience contributions in the talk):

Q1 - Ray (~43:00): should companies run AI on their own physical box (open-source, on-prem, sovereign)?
MY READ: tiered model. Tier A = our internal stack stays hosted (no client data). Tier B = client engagements (Coca-Cola, IOU utilities, Patriot) need agent infra inside client stack - this matches Darrell's "cloud-only / AWS+Azure+GCP" Coca-Cola requirement directly. Tier C = potential Q4 product: a "Colaberry AI Box" pre-loaded with our 5 platforms (Outage IQ / Crew Capture / Member Voice / Rate Case IQ / Compliance Companion) becomes a real productized offering for co-ops. Don't copy Ray's "burn the cloud" framing - hybrid is the right answer.

Q2 - Yohan (~47:18): I disbanded all departments; org is skill-based; people leave, skills stay.
MY READ: this is the missing piece in Alden's frame. We already have ~100 skills in backend/src/scripts/ + scripts/ops-engine/ + .claude/skills/ - we just haven't framed them as the org structure. The upgrade to DRI: each person owns a number AND a portfolio of skills. Skills are committed to GitHub, portable when a person leaves. When we write Karun's PRD, we list "12 skills that produce his 5 numbers" - those 12 outlast him.

Together: Ray says WHERE the AI lives matters. Yohan says WHAT the AI knows matters. Phase 1+2 of our plan builds the skills. Tier-B/Tier-C addresses sovereignty. Combined they describe an architecture we're 60% of the way to.

WHAT I NEED:
- Ram: pick the pilot person (I'm proposing Karun). Also tell me if you want a Ram all-hands message rolled around Earn/Learn/Bond/Save.
- Karun: if you are the pilot, give me 30 minutes to write the karun-PRD with you - systems, 5 numbers, 12 skills, rubrics.
- Ali: approve the 4-hour Karun pre-meeting dashboard build. v1 live by EOD tomorrow.

Source: https://www.youtube.com/watch?v=mV1SAo5BRgo (48:39).

Tell me what to change.

Ali`);

(async () => {
  validateBeforeSend(HTML, text);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });
  const r = await transport.sendMail({
    from: '"Ali Muwwakkil" <ali@colaberry.com>',
    to: ['ram@colaberry.com', 'karun@colaberry.com', 'ali@colaberry.com'],
    bcc: ['alimuwwakkil@gmail.com', 'ali_muwwakkil@hotmail.com'],
    replyTo: 'ali@colaberry.com',
    subject: 'Ram / Karun / Ali - Alden\'s playbook mapped to our stack + the 2 questions Ram flagged (90-day plan inside)',
    text, html: HTML,
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });
  console.log('Sent:', r.messageId);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
