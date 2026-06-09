#!/usr/bin/env node
// Per new memory rule (feedback_ali_personal_attach_emails_docs_to_ticket):
// every outbound email + produced document gets attached to its originating
// ticket. The visual story HTML + the email content go onto the
// AI_ProjectArchitect rollout OVERVIEW todo (id 9953889114).
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const TOKEN_FALLBACK = '';
const TOKEN = (process.env.BASECAMP_ACCESS_TOKEN || TOKEN_FALLBACK).replace(/^bearer\s+/i, '').trim();
const BASE = 'https://3.basecampapi.com/3945211';
const BUCKET = 7463955;
const TODO = 9953889114; // OVERVIEW todo
const H = (extra = {}) => ({ Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Colaberry Attach', Accept: 'application/json', ...extra });

const HTML_PATH = path.resolve(__dirname, '../../../docs/ai-architect-rollout-story-2026-06-02-standalone.html');

(async () => {
  // 1) Upload HTML as attachment (sgid)
  const htmlBuf = fs.readFileSync(HTML_PATH);
  const filename = 'ai-architect-rollout-story-2026-06-02.html';
  console.log(`[attach] uploading HTML (${htmlBuf.length} bytes)...`);
  const att = await (await fetch(`${BASE}/attachments.json?name=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: H({ 'Content-Type': 'text/html' }),
    body: htmlBuf,
  })).json();
  const sgid = att.attachable_sgid;
  console.log(`  sgid: ${sgid.slice(0, 30)}...`);

  // 2) Upload to project Vault under "CB Context Dossiers" so the URL is stable for the walker
  const proj = await (await fetch(`${BASE}/projects/${BUCKET}.json`, { headers: H() })).json();
  const vault = (proj.dock || []).find((d) => d.name === 'vault');
  let folder = null;
  try {
    const subs = await (await fetch(`${BASE}/buckets/${BUCKET}/vaults/${vault.id}/vaults.json`, { headers: H() })).json();
    folder = Array.isArray(subs) ? subs.find((v) => v.title === 'CB Context Dossiers') : null;
  } catch {}
  if (!folder) {
    folder = await (await fetch(`${BASE}/buckets/${BUCKET}/vaults/${vault.id}/vaults.json`, {
      method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'CB Context Dossiers' }),
    })).json();
  }
  const upload = await (await fetch(`${BASE}/buckets/${BUCKET}/vaults/${folder.id}/uploads.json`, {
    method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      attachable_sgid: sgid,
      base_name: filename.replace(/\.html$/, ''),
      description: 'Visual story HTML: how the AI_ProjectArchitect rollout works across Karun, Kes, Akiwam, Obi. 7 chapters + diagrams + 6 scenarios + governance + Bonfire-track. Standalone (images base64-embedded).',
    }),
  })).json();
  console.log(`  vault upload: ${upload.app_url}`);

  // 3) Post comment on overview todo: email summary + Vault link + inline attachment
  const commentHtml = `<div style="background:#fef9e7;border-left:5px solid #d4a017;padding:14px 18px;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Outbound email + produced document - attached per operating doctrine</div>
<div style="font-size:13px;color:#78350f;margin-top:4px">Email sent to Ali on 2026-06-02 18:42 UTC. Mandrill <code>0fdc23e4-837a-17a1-36ed-b6d8e28bc3c7</code>. Restored from auto-trash, attached here as the durable record.</div>
</div>

<div style="margin-top:14px"><strong>Subject:</strong> Ali - the visual story of how the rollout works (4 people, 6 scenarios, security + governance explained)</div>
<div style="margin-top:8px"><strong>To:</strong> ali@colaberry.com &middot; <strong>Cc:</strong> alimuwwakkil@gmail.com, ali_muwwakkil@hotmail.com</div>

<div style="margin-top:14px"><strong>Visual story HTML (download to view in browser):</strong> <a href="${upload.app_url}">${upload.app_url}</a></div>
<div style="margin-top:6px"><bc-attachment sgid="${sgid}" caption="${filename}"></bc-attachment></div>

<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">

<div style="font-weight:700">Email body summary:</div>

<div style="margin-top:8px"><strong>Chapter outline (in the HTML):</strong></div>
<ol>
<li><strong>The cast</strong> - 4 cards. Karun + Kes (gold-border pilots). Akiwam + Obi (green-border interns). Each shows scope, systems wired, what they can/cannot touch.</li>
<li><strong>The architecture</strong> - 5-layer stacked diagram: Identity -&gt; Tool -&gt; AI_ProjectArchitect repo -&gt; Approval gates -&gt; External systems.</li>
<li><strong>The 4 security layers</strong> - Identity / Authorization / Approval gates / Audit. Defense in depth.</li>
<li><strong>The governance decision tree</strong> - 7 scenarios mapped flat: AUTO / Employee confirms / Escalate to Ali.</li>
<li><strong>6 scenarios</strong> - workday stories with timestamps, gate prompts in yellow, audit trail in green:
<ul>
<li>Karun preps for a Coca-Cola check-in (silent, no gate)</li>
<li>Karun drafts a follow-up email (send gate fires)</li>
<li>Kes ships a hotfix to prod (deploy gate fires)</li>
<li>Akiwam discovers a new Bonfire RFP (intern-narrow surface)</li>
<li>Cross-team: Karun finds a gov contract opp, hands off to Akiwam + Obi</li>
<li>Akiwam tries to submit a Bonfire bid - system stops her, escalates to Vinay + Ali</li>
</ul>
</li>
<li><strong>Bonfire / gov-contracts track</strong> - what Akiwam + Obi CAN do (read both Bonfire accounts, triage, draft, comment, tag Vinay) vs CANNOT do (hard tool-layer denials: submit bids, send external email, modify capability statement, touch customer data).</li>
<li><strong>What Ali sees</strong> - 3 panels: daily Cory digest (7 AM), real-time escalation pages (&lt;2/week steady-state), weekly 30-min skill PR review queue.</li>
</ol>

<div style="margin-top:14px"><strong>Closing mental model (one paragraph repeatable):</strong></div>
<div style="margin-top:6px;font-style:italic;padding:12px 16px;background:#f8fafc;border-left:4px solid #1a365d;border-radius:0 6px 6px 0">"Everyone runs the same Claude Code with the same skill library. The skill library is governed by Ali - he ratifies what becomes 'Colaberry approved.' Each employee's Claude Code is shaped to their role - what tools, what systems, what permissions. Three approval gates sit between intent and any external action: a permission prompt, a hook with a reason field, and plan mode for big tasks. Everything is logged. Ali sees daily digests, escalation pages, and a weekly skill-approval queue. Nothing else."</div>

<div style="margin-top:14px"><strong>What Ali needs to respond to:</strong></div>
<ol>
<li>Does the architecture make sense?</li>
<li>Are the 6 scenarios realistic?</li>
<li>Is the Bonfire carve-out tight enough?</li>
<li>Does Chapter 7 (where Ali appears) feel right?</li>
<li>Add a Chapter 8 on the bootstrap mechanics (how each employee actually gets set up on their laptop)?</li>
</ol>

<div style="margin-top:14px;font-size:11px;color:#94a3b8;font-style:italic">Note: the email was auto-trashed by Inbox COS LLM classifier because the subject "Ali - the visual story..." (dash not comma) does not match the hardRule INBOX pattern. Need to extend the Cory rule to include "Ali - " patterns in addition to "Ali, here's..." patterns. Tracking separately.</div>`;

  const c = await (await fetch(`${BASE}/buckets/${BUCKET}/recordings/${TODO}/comments.json`, {
    method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content: commentHtml }),
  })).json();
  console.log(`  comment posted: ${c.app_url}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
