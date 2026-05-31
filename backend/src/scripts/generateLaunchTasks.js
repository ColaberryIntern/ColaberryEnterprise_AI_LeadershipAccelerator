#!/usr/bin/env node
/**
 * Generate Week 0-1 tasks per area for AI Systems Architect Accelerator.
 *
 * Reads:
 *   - docs/training-program-2026-q3/TRAINING_INTEGRATION_PLAN.md (per-area sections)
 *   - docs/training-program-2026-q3/ASSUMPTIONS_LOG.md (locked decisions)
 *   - Ali's latest system-prompt directives (hardcoded extract; see ALI_DIRECTIVES)
 *
 * For each area in the project, calls gpt-4o via lib/launchPmoTaskGenerator,
 * then writes the tasks to Basecamp via lib/launchPmoOps. Idempotent: existing
 * todos by same content are skipped.
 *
 * Run: node backend/src/scripts/generateLaunchTasks.js
 *      Add --dry-run to preview without writing.
 *      Add --area="<name>" to limit to a single area.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');
const { generateAreaTasks } = require('./lib/launchPmoTaskGenerator');
const { TEAM, LAUNCH, provisioned, getByHandle } = require('./lib/launchPmoTeam');

const DRY = process.argv.includes('--dry-run');
const areaArg = process.argv.find((a) => a.startsWith('--area='));
const AREA_FILTER = areaArg ? areaArg.split('=')[1] : null;

// ---------- Load context docs ------------
const DOCS = path.resolve(__dirname, '../../../docs/training-program-2026-q3');
const INTEGRATION_PLAN = fs.readFileSync(path.join(DOCS, 'TRAINING_INTEGRATION_PLAN.md'), 'utf8');
const ASSUMPTIONS = fs.readFileSync(path.join(DOCS, 'ASSUMPTIONS_LOG.md'), 'utf8');

// Ali's directives from his 2026-05-31 system prompt comment (9946342528).
// Captures additions beyond the integration plan: 9-hat operator role,
// Mon-Fri-only tickets, Mailchimp ASAP, Open Houses recurring, GHL rebuild,
// voice AI 972-992-1024, Cora inbox AI, training.colaberry.com vs
// enterprise.colaberry.ai split, NotebookLM podcasts/videos, no auto-post to
// LinkedIn, escalation cadence 1/3/5/7, daily exec update at 8am CST.
const ALI_DIRECTIVES = `
- CB System wears 9 hats: PMO, Chief of Staff, PM, Scrum Master, Ops Coordinator, Product Manager, Marketing Coordinator, Curriculum Coordinator, AI Systems Coordinator.
- Monday-Friday tickets only. No weekend due dates.
- Two websites:
  - training.colaberry.com (Tejesh) = public marketing site, career changer / working professional audience, swaps DA->AI Systems positioning while keeping testimonials + reviews + blogs.
  - enterprise.colaberry.ai (Kes) = student platform + CRM + portfolio + community + certification + incubator + AI agent ecosystem. Drives monthly subscription revenue.
- Marketing strategy + landing pages + social media strategy by end of THIS week (2026-06-06). Mailchimp campaign to alumni/dropouts/non-signups ASAP (within 2 weeks). Content production starts 2 weeks from today (2026-06-14).
- Viral videos in 2 weeks (2026-06-14). Aleem produces these. NO auto-post to LinkedIn - humans approve all publishing.
- All AI switched to new program in 3 weeks (2026-06-21): Cora (support@colaberry.com inbox AI), Voice AI on 972-992-1024, GHL workflows rebuild.
- enterprise.colaberry.ai migration done 2026-06-07 (end of next week), 3 sessions planned in advance, curriculum flow testable 2026-06-07.
- Curriculum design visuals (UI/UX-grade like a professional tool) in 2 days (2026-06-02). Aleem and Ali approve.
- Both websites finalized 2026-06-21.
- Open House design + materials + landing page + slides + follow-up sequence + sales process in 3 weeks (2026-06-21). Recurring Open House events.
- TWC tasks divided evenly Mon-Fri through to launch.
- Platform capacity analysis THIS week (how many projects/students the platform can manage in current state).
- Daily executive update 8am CST (Ali email + Basecamp Message Board post).
- Escalation: 1d reminder, 3d escalate to lead, 5d notify Ali, 7d CRITICAL_RISK on dashboard.
- Roselen is the Sales/Admissions human-in-the-loop. NOT yet on Basecamp; Ali to provision. Until then, sales tasks go unassigned or to Taiwo (admissions ops).
- Mentor agent MUST have a human-review queue from day 1 (Ali specifically called this out: don't pretend it's fully autonomous - students paid).
- Anthropic Partner Network status deadline 2026-06-12 (hard gate).
`;

// ---------- Map area name -> integration plan slice ------------
// Extracts the relevant Section 3.x text for each area to focus the LLM.
function sliceFor(areaName) {
  function getSections(headerRegexes) {
    const slices = [];
    for (const re of headerRegexes) {
      const m = INTEGRATION_PLAN.match(new RegExp(`(### ${re}[\\s\\S]*?)(?=\\n### |\\n## )`, 'i'));
      if (m) slices.push(m[1].trim());
    }
    return slices.join('\n\n');
  }
  switch (areaName) {
    case 'Curriculum':
      return getSections(['3\\.1 Project Builder', '3\\.2 Anthropic Companion', '3\\.4 The 6 AI Agents']) + '\n\n' + extractSection('## 2. Curriculum structure');
    case 'Website - training.colaberry.com':
      return getSections(['3\\.7 Build Log auto-formatter', '3\\.11 Pricing']) + '\n\n' + extractSection('## 9. How this connects');
    case 'Website - enterprise.colaberry.ai':
      return getSections(['3\\.1 Project Builder', '3\\.2 Anthropic Companion', '3\\.5 Architect Portfolio Dashboard', '3\\.6 GitHub integration', '3\\.9 In-platform community']);
    case 'Marketing':
      return getSections(['3\\.7 Build Log auto-formatter', '3\\.11 Pricing']) + '\n\n' + extractSection('## 6. Open decisions');
    case 'AI Systems':
      return getSections(['3\\.3 Anthropic Intelligence Layer', '3\\.4 The 6 AI Agents', '3\\.6 GitHub integration']);
    case 'Open Houses & Events':
      return getSections(['3\\.10 Architect Expo']) + '\n\nNote: Recurring Open Houses are Ali-direct addition not in original plan; format = AI demo + Claude Code demo + student success + live Q&A + enrollment offer.';
    case 'Sales & Admissions':
      return getSections(['3\\.8 Project Marketplace', '3\\.11 Pricing']) + '\n\n' + extractSection('## 4. Team structure');
    case 'TWC Compliance':
      return getSections(['3\\.12 TWC compliance']) + '\n\n' + extractSection('## 2. Curriculum structure');
    case 'Approval Queues':
      return extractSection('## 6. Open decisions') + '\n\n' + extractSection('## 11. Decisions I made on Ali');
    case 'Launch Readiness Dashboard':
      return extractSection('## 5. The 41-day plan') + '\n\n' + extractSection('## 10. Risks');
    default:
      return '';
  }
}
function extractSection(heading) {
  const m = INTEGRATION_PLAN.match(new RegExp(`(${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}[\\s\\S]*?)(?=\\n## |$)`, 'i'));
  return m ? m[1].trim() : '';
}

// ---------- Main ------------
(async () => {
  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);
  const roster = provisioned();
  const today = new Date().toISOString().slice(0, 10);

  console.log(`Generating launch tasks${DRY ? ' [DRY-RUN]' : ''} - today=${today}, target=${LAUNCH.targetLaunchDate}`);
  console.log(`Found ${lists.length} todolists in project ${LAUNCH.projectId}`);

  for (const list of lists) {
    if (AREA_FILTER && list.name !== AREA_FILTER) continue;
    console.log(`\n=== ${list.name} ===`);
    const slice = sliceFor(list.name);
    if (!slice && list.name !== 'Launch Readiness Dashboard') {
      console.log('  (no integration plan slice for this area; using general prompt)');
    }
    try {
      const t0 = Date.now();
      const { tasks, rationale, tokenUsage } = await generateAreaTasks({
        area: { name: list.name, description: list.description?.slice(0, 600) || '', focus: list.name },
        integrationPlanSlice: slice,
        assumptions: ASSUMPTIONS,
        teamRoster: roster,
        newDirectives: ALI_DIRECTIVES,
        todayIso: today,
        targetLaunch: LAUNCH.targetLaunchDate,
      });
      console.log(`  generated ${tasks.length} tasks in ${Date.now() - t0}ms (tokens=${tokenUsage?.total_tokens || '?'})`);
      console.log(`  rationale: ${rationale}`);

      for (const t of tasks) {
        const owner = getByHandle(t.owner_handle);
        const assigneeIds = owner && owner.basecampPersonId ? [owner.basecampPersonId] : [];
        const ownerLabel = owner ? owner.displayName : t.owner_handle;
        const descHtml = `<div><strong>${t.tier === 'ai' ? 'AI Task' : 'Human Task'}</strong> | Owner: ${ownerLabel}</div>
<div><br></div>
<div>${t.note}</div>
<div><br></div>
<div style="font-size:11px;color:#64748b">Generated by CB System Launch PMO on ${today}. Source: TRAINING_INTEGRATION_PLAN.md + ASSUMPTIONS_LOG.md + Ali's 2026-05-31 directives.</div>`;
        if (DRY) {
          console.log(`    [dry] ${t.due_on} ${t.owner_handle.padEnd(8)} ${t.tier.padEnd(5)} ${t.content.slice(0, 80)}`);
          continue;
        }
        try {
          const todo = await ops.createTodo({
            listId: list.id,
            content: t.content,
            description: descHtml,
            assigneePersonIds: assigneeIds,
            dueOn: t.due_on,
          });
          console.log(`    + [${t.due_on}] ${t.owner_handle.padEnd(8)} ${todo.id}: ${t.content.slice(0, 70)}`);
          await new Promise((r) => setTimeout(r, 200));
        } catch (e) {
          console.error(`    FAIL "${t.content.slice(0, 60)}": ${e.message}`);
        }
      }
    } catch (e) {
      console.error(`  area generation FAIL: ${e.message}`);
    }
  }

  console.log('\n=== Done ===');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
