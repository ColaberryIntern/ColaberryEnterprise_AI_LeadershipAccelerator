#!/usr/bin/env node
// Per operating doctrine (feedback_ali_personal_attach_emails_docs_to_ticket):
// attach visual story v2 (the BC loop) to the AI_ProjectArchitect rollout
// OVERVIEW todo (9953889114) on Ali Personal.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = '';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const BASE = 'https://3.basecampapi.com/3945211';
const BUCKET = 7463955;
const TODO = 9953889114;
const H = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry Attach', Accept: 'application/json', ...extra });

const HTML_PATH = path.resolve(__dirname, '../../../docs/ai-architect-rollout-story-v2-basecamp-loop-2026-06-02-standalone.html');

(async () => {
  const buf = fs.readFileSync(HTML_PATH);
  const filename = 'ai-architect-rollout-story-v2-basecamp-loop.html';
  console.log(`[attach] uploading HTML (${buf.length} bytes)...`);
  const att = await (await fetch(`${BASE}/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST', headers: H({ 'Content-Type': 'text/html' }), body: buf,
  })).json();
  const sgid = att.attachable_sgid;

  // Upload to project Vault under CB Context Dossiers (same folder as v1)
  const proj = await (await fetch(`${BASE}/projects/${BUCKET}.json`, { headers: H() })).json();
  const vault = (proj.dock || []).find((d) => d.name === 'vault');
  const subs = await (await fetch(`${BASE}/buckets/${BUCKET}/vaults/${vault.id}/vaults.json`, { headers: H() })).json();
  const folder = Array.isArray(subs) ? subs.find((v) => v.title === 'CB Context Dossiers') : null;
  if (!folder) throw new Error('CB Context Dossiers folder missing');
  const upload = await (await fetch(`${BASE}/buckets/${BUCKET}/vaults/${folder.id}/uploads.json`, {
    method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      attachable_sgid: sgid,
      base_name: filename.replace(/\.html$/, ''),
      description: 'Visual story v2: the Basecamp loop. Akiwam scenarios + personal BC + skill extraction pipeline. Standalone (logo base64-embedded).',
    }),
  })).json();
  console.log(`  vault upload: ${upload.app_url}`);

  // Post comment
  const commentHtml = `<div style="background:#fef9e7;border-left:5px solid #d4a017;padding:14px 18px;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Outbound email + produced document - attached per operating doctrine</div>
<div style="font-size:13px;color:#78350f;margin-top:4px">Visual story v2 sent to Ali on 2026-06-02. Follow-up to v1 (governance + permissions) — this one covers operational rhythm.</div>
</div>

<div style="margin-top:14px"><strong>Subject:</strong> Ali - visual story v2: the Basecamp loop (Akiwam scenarios + personal BC + skill extraction)</div>

<div style="margin-top:14px"><strong>Vault link (download to view):</strong> <a href="${upload.app_url}">${upload.app_url}</a></div>
<div style="margin-top:6px"><bc-attachment sgid="${sgid}" caption="${filename}"></bc-attachment></div>

<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">

<div><strong>Chapter outline:</strong></div>
<ol>
<li><strong>The 3 roles</strong> - Human (Akiwam) + AI (her Claude Code) + Ticket (her BC project). Cards showing the actors.</li>
<li><strong>The loop diagram</strong> - 6 steps drawn as a clock: Task arrives → Alert fires → Akiwam invokes → Claude executes → Posted back → Skill candidate.</li>
<li><strong>Scenario 1: AI verification</strong> (landing page) - AI drafts raw text, Akiwam tells her Claude Code to format like the standard utility pre-read + finalize as PDF, Claude pulls template + logo + tile + renders, gate fires before BC post, comment lands, skill candidate auto-tagged.</li>
<li><strong>Scenario 2: Jen scheduling</strong> - "Schedule 30-min deep-dive, pick 3 slots in next 2 days, email Jen." Claude reads BC, checks calendar, drafts email, gate fires, Akiwam approves, Jen replies, calendar invite sent, logged to BC, <strong>workflow auto-tags as /schedule-deep-dive for the team</strong>.</li>
<li><strong>Personal Basecamp projects</strong> - 4 person cards (Karun, Kes, Akiwam, Obi) with each one's ticket list. The durable trace. Yohan's "skills are the org" operationalized.</li>
<li><strong>Skill extraction pipeline</strong> - 4 stages: completed ticket → auto-tag candidate → Ali weekly review → Colaberry approved + library. Math: ~50 skills in 90 days.</li>
<li><strong>Ali's Friday afternoon</strong> - the actual weekly review dashboard. 5 candidates with APPROVE / REVIEW / REJECT buttons. 30-min job.</li>
<li><strong>Closing paragraph</strong> - the architecture compressed.</li>
</ol>

<div style="margin-top:14px"><strong>Key insight Ali articulated:</strong> completed tickets become skill candidates. Every workflow is a training data point. The org becomes its own training set.</div>

<div style="margin-top:14px"><strong>Questions sent back to Ali:</strong></div>
<ol>
<li>Do the 2 scenarios match what he imagined?</li>
<li>Personal Basecamp - separate projects per person, or sub-todolists on Ali Personal?</li>
<li>Skill auto-tag - automatic, or human-driven?</li>
<li>Weekly review cadence (Friday 30-min vs daily vs just-in-time)?</li>
<li>Add a Chapter 8 on the skill sync mechanics?</li>
</ol>

<div style="margin-top:14px;font-size:11px;color:#94a3b8;font-style:italic">v2 complements v1 (governance/permissions doc, attached earlier to this same overview ticket). v1 = who can do what + safety gates; v2 = how the workday flows + how skills compound.</div>`;

  const c = await (await fetch(`${BASE}/buckets/${BUCKET}/recordings/${TODO}/comments.json`, {
    method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content: commentHtml }),
  })).json();
  console.log(`[attach] comment posted: ${c.app_url}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
