#!/usr/bin/env node
/**
 * Update the project Message Board kickoff post to point at the Launch Briefs
 * vault folder + the new richer todo structure.
 *
 * Idempotent: postMessage matches by subject so existing message is updated
 * in place.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');
const { provisioned, missing, LAUNCH } = require('./lib/launchPmoTeam');

const VAULT_MAP = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../tmp/launch-briefs-vault-urls.json'), 'utf8'));

function teamLinks() {
  return provisioned().map((p) => {
    const slugMatch = Object.keys(VAULT_MAP.briefs).find((s) => s.includes(p.handle));
    const brief = slugMatch ? VAULT_MAP.briefs[slugMatch] : null;
    return `<li><strong>${p.displayName}</strong> (${p.role})${brief ? ` - <a href="${brief.url}">brief</a>` : ''}</li>`;
  }).join('');
}

(async () => {
  const folder = VAULT_MAP.folder;
  const briefList = Object.values(VAULT_MAP.briefs)
    .sort((a, b) => a.filename.localeCompare(b.filename))
    .map((b) => `<li><a href="${b.url}">${b.filename}</a> - ${b.description}</li>`)
    .join('');
  const provBlock = provisioned().map((p) => `<li><strong>${p.displayName}</strong> (${p.role})</li>`).join('');
  const missBlock = missing().map((p) => `<li><strong>${p.displayName}</strong> (${p.role}) - ${p.note || 'Needs to be added to Basecamp'}</li>`).join('');
  const content = `<div>
<h2>AI Systems Architect Accelerator - Launch PMO Kickoff (v2)</h2>
<p><strong>Target launch:</strong> 2026-07-11 (41 days from 2026-05-31)</p>
<p><strong>How this project works:</strong> CB System is the autonomous Program Management Office. CB plans, drafts, builds, escalates, and reports. Humans decide. AI executes. Progress never waits on a human - CB always has the next AI task running.</p>

<h3>How to use this project (start here)</h3>
<ol>
<li><strong>Open your role brief</strong> in the Launch Briefs vault folder below. Read your brief first.</li>
<li><strong>Open the todolist for your area</strong> in the project sidebar. Pick the next task.</li>
<li><strong>Each task includes:</strong> tier badge (AI / Human), owner, objective, deliverable, definition of done, dependencies, "how to do this in Claude Code" recipe, and links to the briefs you need.</li>
<li><strong>To execute a task in Claude Code:</strong> open Claude Code, paste the linked briefs + the task description, ask Claude to execute. CB has already done a first draft for most AI-tier tasks.</li>
<li><strong>To escalate or ask CB to act:</strong> tag <code>@CB System</code> on the todo or a comment.</li>
</ol>

<h3>Launch Briefs vault folder (read first)</h3>
<p><a href="${folder.url}"><strong>${folder.title}</strong></a> - 17 .md files</p>
<ul>${briefList}</ul>

<h3>Daily cadence (Mon-Fri)</h3>
<ul>
<li><strong>8am CST:</strong> CB emails Ali the Executive Update + posts the "Human Action Queue" on this Message Board</li>
<li><strong>Continuous:</strong> CB executes AI-tier tasks. When humans clear blockers, dependent AI work picks up immediately.</li>
<li><strong>End of day:</strong> CB updates the "Launch Readiness Dashboard" todolist (top task = current readiness %).</li>
</ul>

<h3>Project structure (10 area lists)</h3>
<ol>
<li>Curriculum (Swati lead)</li>
<li>Website - training.colaberry.com (Tejesh lead)</li>
<li>Website - enterprise.colaberry.ai (Kes lead)</li>
<li>Marketing (Sohail lead)</li>
<li>AI Systems (Kes lead)</li>
<li>Open Houses & Events (Jackie lead)</li>
<li>Sales & Admissions (Roselen [blocked] + Taiwo)</li>
<li>TWC Compliance (Swati lead)</li>
<li>Approval Queues (Ali sole approver)</li>
<li>Launch Readiness Dashboard (CB auto-updates daily)</li>
</ol>

<h3>Team roster (provisioned)</h3>
<ul>${provBlock}</ul>

${missBlock ? `<h3>Blockers - need Ali action</h3><ul>${missBlock}</ul>` : ''}

<h3>Escalation rules</h3>
<ul>
<li>Overdue 1 day: CB reminder</li>
<li>Overdue 3 days: CB escalates to area lead</li>
<li>Overdue 5 days: CB notifies Ali in the daily email</li>
<li>Overdue 7 days: tagged CRITICAL_RISK on dashboard</li>
</ul>

<h3>How to override a locked decision</h3>
<p>17 assumptions are locked in <code>04-decisions-locked.md</code> in the briefs folder. Override any by:</p>
<ul>
<li>Replying on this MB post with "A3: actually use X because Y"</li>
<li>Or tagging <code>@CB System override assumption A3 to X because Y</code> anywhere in Basecamp</li>
</ul>

<p style="font-size:11px;color:#64748b">v2 generated 2026-05-31 by CB System. Each area todolist has 8-12 detailed tasks with linked briefs. Operating contract in <a href="${VAULT_MAP.briefs['cb-pmo-contract']?.url || '#'}">cb-pmo-contract</a>.</p>
</div>`;

  const msg = await ops.postMessage({
    subject: 'Launch PMO Kickoff - AI Systems Architect Accelerator (target 2026-07-11)',
    content,
  });
  console.log(`Updated kickoff: id=${msg.id} url=${msg.app_url}`);
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
