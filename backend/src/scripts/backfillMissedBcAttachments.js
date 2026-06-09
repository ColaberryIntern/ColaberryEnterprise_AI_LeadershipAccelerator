#!/usr/bin/env node
// One-shot backfill: attach the 5 previously-missed strategic emails (sent after
// the operating-doctrine memory rule was added) to their originating BC tickets.
// Idempotent-ish: posts a NEW comment per email, so re-running creates duplicates.
// Run once.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = '';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const BASE = 'https://3.basecampapi.com/3945211';
const BUCKET = 7463955;
const H = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'CB Backfill', Accept: 'application/json', ...extra });
const REPO = path.resolve(__dirname, '../../..');

async function uploadAttachment(filename, buf, contentType) {
  const r = await fetch(`${BASE}/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST', headers: H({ 'Content-Type': contentType }), body: buf,
  });
  if (!r.ok) throw new Error(`upload ${filename} -> ${r.status}: ${await r.text()}`);
  return (await r.json()).attachable_sgid;
}

async function uploadToVault(sgid, baseName, description) {
  const proj = await (await fetch(`${BASE}/projects/${BUCKET}.json`, { headers: H() })).json();
  const vault = (proj.dock || []).find((d) => d.name === 'vault');
  const subs = await (await fetch(`${BASE}/buckets/${BUCKET}/vaults/${vault.id}/vaults.json`, { headers: H() })).json();
  let folder = Array.isArray(subs) ? subs.find((v) => v.title === 'CB Context Dossiers') : null;
  if (!folder) {
    folder = await (await fetch(`${BASE}/buckets/${BUCKET}/vaults/${vault.id}/vaults.json`, {
      method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'CB Context Dossiers' }),
    })).json();
  }
  const upload = await (await fetch(`${BASE}/buckets/${BUCKET}/vaults/${folder.id}/uploads.json`, {
    method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ attachable_sgid: sgid, base_name: baseName, description }),
  })).json();
  return upload;
}

async function postComment(ticketId, content) {
  const r = await fetch(`${BASE}/buckets/${BUCKET}/recordings/${ticketId}/comments.json`, {
    method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content }),
  });
  if (!r.ok) throw new Error(`comment ${ticketId} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

function header(mandrillId, when, subject, recipients, source) {
  return `<div style="background:#fef9e7;border-left:5px solid #d4a017;padding:14px 18px;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Backfill - outbound email attached per operating doctrine</div>
<div style="font-size:13px;color:#78350f;margin-top:4px">Sent ${when}. Was missed at send time; attaching now retroactively.</div>
</div>
<div style="margin-top:12px"><strong>Subject:</strong> ${subject}</div>
<div style="margin-top:4px"><strong>To:</strong> ${recipients}</div>
<div style="margin-top:4px"><strong>Mandrill:</strong> <code>${mandrillId}</code></div>
<div style="margin-top:4px"><strong>Source script:</strong> <code>backend/src/scripts/${source}</code></div>`;
}

// =============================================
// BACKFILL #1: Triad Alden comparison
// =============================================
async function backfill1() {
  console.log('[1/5] Triad Alden comparison -> Alden upgrade overview 9953675946');
  const body = header(
    '9303b5d0-45bc-5845-fa32-bdc45b071d82',
    '2026-06-02 morning',
    `Ram / Karun / Ali - Alden's playbook mapped to our stack + the 2 questions Ram flagged (90-day plan inside)`,
    'ram@colaberry.com, karun@colaberry.com, ali@colaberry.com',
    'sendAliRamAldenComparisonPlan.js'
  ) + `
<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">
<div><strong>Summary of contents:</strong></div>
<ul>
<li><strong>Side-by-side scorecard:</strong> 9 Alden pillars vs Colaberry today, weighted ~60% overall. LEGIBILITY 75% / PRE-MEETING DASHBOARD 30% / PER-PERSON AGENT 0% / RUBRIC 25% / VERIFICATION 60% / SKILLS-IN-GITHUB 80% / $90/$10 RATIO 10% / DRI 65% / EARN-LEARN-BOND-SAVE 5%.</li>
<li><strong>Architecture diagram:</strong> Colaberry today (Context → One Big Agent → Aggregate → Ali inbox) vs Alden's stack (Context → Per-Person Agent → Per-meeting Dashboard → 15-min meeting). Gap = the per-person agent box.</li>
<li><strong>The 2 questions Ram flagged:</strong> Ray on AI sovereignty boxes (our tiered answer A/B/C, Tier C = "Colaberry AI Box" Q4 candidate product) + Yohan on skills-based org (our ~100 existing skills in repo are the org structure).</li>
<li><strong>90-day plan, 3 phases:</strong> Phase 1 (days 1-30) pilot Karun. Phase 2 (days 31-60) ladder to exec team + Earn/Learn/Bond/Save framework. Phase 3 (days 61-90) interns + non-tech + hard rule "no 1:1 without dashboard."</li>
<li><strong>Asks per person:</strong> Ram pick pilot, Karun give 30 min for PRD, Ali approve 4-hr dashboard build.</li>
</ul>
<div style="margin-top:12px;font-size:11px;color:#94a3b8;font-style:italic">Drove the creation of the 23-ticket Alden upgrade list this lives on. Subsequent BC ticket creation also separately created the AI_ProjectArchitect rollout list.</div>`;
  const c = await postComment(9953675946, body);
  console.log('  comment:', c.app_url);
}

// =============================================
// BACKFILL #2: AI Project Architect rollout summary + xlsx
// =============================================
async function backfill2() {
  console.log('[2/5] AI Project Architect rollout summary + xlsx -> Overview 9953889114');
  const xlsxPath = path.join(REPO, 'docs/ai-architect-rubrics-2026-06-02.xlsx');
  let xlsxLink = '';
  if (fs.existsSync(xlsxPath)) {
    const sgid = await uploadAttachment('ai-architect-rubrics-2026-06-02.xlsx', fs.readFileSync(xlsxPath), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const up = await uploadToVault(sgid, 'ai-architect-rubrics-2026-06-02', 'Employee rubric matrix - 17 employees, 5 numbers + 10 skills + FICO-style rubric per person. Drafted by Claude Code, Ali to refine in place.');
    xlsxLink = `<div style="margin-top:12px"><strong>Spreadsheet (download to edit):</strong> <a href="${up.app_url}">${up.app_url}</a></div><div style="margin-top:6px"><bc-attachment sgid="${sgid}" caption="ai-architect-rubrics-2026-06-02.xlsx"></bc-attachment></div>`;
  }
  const body = header(
    '81e57bdb-e0ce-6955-cca2-9b368be7e5e3',
    '2026-06-02 afternoon',
    `Ali - AI_ProjectArchitect rollout: 23 BC tickets + per-employee rubric spreadsheet for your refinement`,
    'ali@colaberry.com (CC personal + hotmail)',
    'sendAliAiArchitectRolloutSummary.js'
  ) + `
${xlsxLink}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">
<div><strong>Summary of contents:</strong></div>
<ul>
<li><strong>Inventoried 17 core active employees</strong> + 2 pilots (Karun + Kes) called out + Mika/Shveta excluded (offboarded) + interns/externals excluded.</li>
<li><strong>Drafted per-person:</strong> 5 numbers + 10 skills + FICO-style rubric (5/7/9/10 thresholds). Pilots highlighted in xlsx.</li>
<li><strong>Generated workbook</strong> with 5 sheets: README, Employee Master, 5 Numbers + Rubrics, 10 Skills, Systems Matrix.</li>
<li><strong>Created 23 BC tickets</strong> on the "AI_ProjectArchitect company-wide rollout" list - infra (5), Karun pilot (5), Kes pilot (5), Phase 2 + 3 placeholders.</li>
<li><strong>6 open questions for Ali:</strong> rubric thresholds, wave assignments, Karun + Kes numbers, skill granularity, library→GitHub sync timing, Ram all-hands message draft timing.</li>
<li><strong>Refinement playbook:</strong> 30 min in order - README → Employee Master → Karun + Kes rows → systems matrix → reply.</li>
</ul>`;
  const c = await postComment(9953889114, body);
  console.log('  comment:', c.app_url);
}

// =============================================
// BACKFILL #3: David ad refreshed V3 critique HTML (pre-edits)
// =============================================
async function backfill3() {
  console.log('[3/5] David V3 refreshed critique HTML -> RE Magazine ad 9955562788');
  const body = header(
    '7a53da20-ce04-e110-fcb7-05bb6ca1de03',
    '2026-06-02 afternoon (before David replied)',
    `Re: Open for Advertising - RE Magazine - refreshed critique HTML (download + reply with feedback)`,
    'dlahme@colaberry.com (CC ram, BCC ali)',
    'sendDavidAdCritiqueRefreshedV2.js'
  ) + `
<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">
<div><strong>Summary of contents:</strong></div>
<ul>
<li>Refreshed critique HTML with Colaberry logo embedded + structured [CB-AD-CRITIQUE-V1] machine-readable marker for the future auto-processor.</li>
<li>Same review-tool pattern David used for About Colaberry overview. 5 mockups, per-concept widget (Finalist / Keep / Edits / Drop + free-text), Generate Reply button at bottom.</li>
<li>Subject line + body emphasized half-page horizontal + red punch + Thursday EOD deadline.</li>
<li>5 open questions baked in: Gold-tier commitment, NRECA badge rights, QR code, photography path, stat verification.</li>
<li><strong>Bug discovered:</strong> images broke when David downloaded the HTML (referenced by file path). Fixed in standalone follow-up (see next backfill entry).</li>
</ul>`;
  const c = await postComment(9955562788, body);
  console.log('  comment:', c.app_url);
}

// =============================================
// BACKFILL #4: David standalone fix
// =============================================
async function backfill4() {
  console.log('[4/5] David standalone fix -> RE Magazine ad 9955562788');
  const body = header(
    'f428e9f8-14a6-1f4a-32fd-1048929933bc',
    '2026-06-02 afternoon (immediately after #3 broke)',
    `Re: Open for Advertising - RE Magazine - fixed HTML (images now embedded)`,
    'dlahme@colaberry.com (CC ram, BCC ali)',
    'sendDavidAdCritiqueStandalone.js'
  ) + `
<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">
<div><strong>Summary of contents:</strong></div>
<ul>
<li>Apology + corrected standalone HTML attached.</li>
<li>Built <code>tmp/inline-html-images.js</code> as a reusable helper - walks HTML, base64-encodes every <code>img/</code> reference, embeds as <code>data:</code> URI. HTML becomes truly portable.</li>
<li>Resulting standalone: 2.2 MB with all 13 images embedded inline.</li>
<li>Apologized for back-and-forth. Confirmed Thursday EOD deadline still holds.</li>
</ul>
<div style="margin-top:8px;font-size:11px;color:#94a3b8;font-style:italic">This is the version David successfully opened, filled out, and replied to with his M4 critique (handled separately - see V4-edits-applied comment posted earlier).</div>`;
  const c = await postComment(9955562788, body);
  console.log('  comment:', c.app_url);
}

// =============================================
// BACKFILL #5: Trigger-live notification
// =============================================
async function backfill5() {
  console.log('[5/5] Trigger-live email -> RE Magazine ad 9955562788');
  const body = header(
    '5fafd83e-2bc2-658b-e925-447d7dc3bc3b',
    '2026-06-02 evening',
    `Ali - David ad auto-trigger is live (prod cron, 5-min poll, 3 safety gates, kill switch documented)`,
    'ali@colaberry.com (CC personal + hotmail)',
    'sendAliTriggerLiveEmail.js'
  ) + `
<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">
<div><strong>Summary of contents:</strong></div>
<ul>
<li><strong>What's running:</strong> <code>processDavidAdReply.js</code> on prod cron every 5 min. Polls Gmail thread 19e89a52879d4a32 for new David replies past the marker.</li>
<li><strong>Flow:</strong> Cron fires → reads marker → Gmail pull → if new message, OpenAI extracts JSON edit plan → 3 safety gates → if all pass, apply edits, render PDF + thumb + inlined standalone → send David V5 reply → post BC comment + update marker.</li>
<li><strong>3 safety gates (any failure → abort + escalate to Ali):</strong> low-confidence edit (&lt;0.7), find-string fail, render fail.</li>
<li><strong>Kill switch:</strong> <code>ssh root@95.216.199.47 "touch /opt/colaberry-accelerator/tmp/david-trigger-killed.flag"</code>.</li>
<li><strong>Where things live:</strong> script in <code>backend/src/scripts/processDavidAdReply.js</code>, marker in <code>tmp/david-ad-trigger-state.json</code>, log at <code>/var/log/david-ad-trigger.log</code>, source HTML at <code>docs/coop-ad-mockups-2026-06-02.html</code>.</li>
<li><strong>Honest limits flagged:</strong> strategic questions surface as ambiguities NOT auto-answered; scope is Mockup 4 only; ROI numbers not invented; one reply per cron tick.</li>
</ul>`;
  const c = await postComment(9955562788, body);
  console.log('  comment:', c.app_url);
}

(async () => {
  console.log('=== Backfill: 5 missed emails -> BC tickets ===');
  await backfill1();
  await backfill2();
  await backfill3();
  await backfill4();
  await backfill5();
  console.log('=== Done. ===');
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
