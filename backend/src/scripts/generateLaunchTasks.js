#!/usr/bin/env node
/**
 * Generate (v2) detailed launch tasks for AI Systems Architect Accelerator.
 *
 * Reads:
 *   - tmp/launch-briefs-vault-urls.json (run uploadLaunchBriefs.js first)
 *   - docs/training-program-2026-q3/TRAINING_INTEGRATION_PLAN.md
 *   - docs/training-program-2026-q3/ASSUMPTIONS_LOG.md
 *
 * Per area:
 *   1. (Default) Trash all existing todos in that list to avoid stale + dup
 *   2. Call gpt-4o via launchPmoTaskGenerator
 *   3. Write each task with a richly formatted description that includes:
 *      - Tier badge + Owner
 *      - Objective / Deliverable / Definition of Done / Dependencies
 *      - "How to do this in Claude Code" mini-recipe
 *      - Clickable links to the relevant briefs (BC Vault URLs)
 *      - Pointer to the Launch Briefs vault folder
 *
 * Run: node backend/src/scripts/generateLaunchTasks.js
 *      --dry-run         preview without writing
 *      --area="<name>"   limit to one area
 *      --keep-existing   skip the trash-old step (default trashes first)
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ops = require('./lib/launchPmoOps');
const { generateAreaTasks } = require('./lib/launchPmoTaskGenerator');
const { LAUNCH, provisioned, getByHandle } = require('./lib/launchPmoTeam');
const { buildDescription } = require('./lib/launchPmoDescription');

const DRY = process.argv.includes('--dry-run');
const KEEP = process.argv.includes('--keep-existing');
const areaArg = process.argv.find((a) => a.startsWith('--area='));
const AREA_FILTER = areaArg ? areaArg.split('=')[1] : null;

const DOCS = path.resolve(__dirname, '../../../docs/training-program-2026-q3');
const INTEGRATION_PLAN = fs.readFileSync(path.join(DOCS, 'TRAINING_INTEGRATION_PLAN.md'), 'utf8');
const ASSUMPTIONS = fs.readFileSync(path.join(DOCS, 'ASSUMPTIONS_LOG.md'), 'utf8');
const VAULT_MAP_PATH = path.resolve(__dirname, '../../../tmp/launch-briefs-vault-urls.json');
if (!fs.existsSync(VAULT_MAP_PATH)) {
  console.error('tmp/launch-briefs-vault-urls.json missing. Run uploadLaunchBriefs.js first.');
  process.exit(1);
}
const VAULT_MAP = JSON.parse(fs.readFileSync(VAULT_MAP_PATH, 'utf8'));

const ALI_DIRECTIVES = `
- CB System wears 9 hats: PMO, Chief of Staff, PM, Scrum Master, Ops Coordinator, Product Manager, Marketing Coordinator, Curriculum Coordinator, AI Systems Coordinator.
- Monday-Friday tickets only. No weekend due dates.
- Two websites:
  - training.colaberry.com (Tejesh) = public marketing site, career changer / working professional audience, swaps DA->AI Systems positioning while keeping testimonials + reviews + blogs.
  - enterprise.colaberry.ai (Kes) = student platform + CRM + portfolio + community + certification + incubator + AI agent ecosystem. Drives monthly subscription revenue.
- Marketing strategy + landing pages + social media strategy by end of THIS week (2026-06-06). Mailchimp campaign to alumni/dropouts/non-signups ASAP (within 2 weeks). Content production starts 2 weeks from today (2026-06-14).
- Viral videos in 2 weeks (2026-06-14). Aleem produces. NO auto-post to LinkedIn - humans approve all publishing.
- All AI switched to new program in 3 weeks (2026-06-21): Cora (support@colaberry.com inbox AI), Voice AI on 972-992-1024, GHL workflows rebuild.
- enterprise.colaberry.ai migration done 2026-06-07, 3 sessions planned in advance, curriculum flow testable 2026-06-07.
- Curriculum design visuals (UI/UX-grade) in 2 days (2026-06-02). Aleem + Ali approve.
- Both websites finalized 2026-06-21.
- Open House design + materials + landing page + slides + follow-up sequence + sales process in 3 weeks (2026-06-21). Recurring Open House events.
- TWC tasks divided evenly Mon-Fri through to launch.
- Platform capacity analysis THIS week.
- Daily executive update 8am CST.
- Escalation: 1d reminder, 3d escalate to lead, 5d notify Ali, 7d CRITICAL_RISK.
- Roselen is the Sales/Admissions human-in-the-loop. NOT yet on Basecamp; Ali to provision. Until then, sales tasks go unassigned or Taiwo.
- Mentor agent MUST have human-review queue from day 1.
- Anthropic Partner Network status deadline 2026-06-12 (hard gate).
`;

// Area name -> integration plan slices + suggested owner brief slug
const AREA_CONFIG = {
  'Curriculum': { suggestedOwnerBrief: 'swati-curriculum-twc', sections: ['3\\.1 Project Builder', '3\\.2 Anthropic Companion', '3\\.4 The 6 AI Agents'], extra: ['## 2. Curriculum structure'] },
  'Website - training.colaberry.com': { suggestedOwnerBrief: 'tejesh-website-training', sections: ['3\\.7 Build Log auto-formatter', '3\\.11 Pricing'], extra: ['## 9. How this connects'] },
  'Website - enterprise.colaberry.ai': { suggestedOwnerBrief: 'kes-ai-systems', sections: ['3\\.1 Project Builder', '3\\.2 Anthropic Companion', '3\\.5 Architect Portfolio Dashboard', '3\\.6 GitHub integration', '3\\.9 In-platform community'], extra: [] },
  'Marketing': { suggestedOwnerBrief: 'sohail-marketing', sections: ['3\\.7 Build Log auto-formatter', '3\\.11 Pricing'], extra: ['## 6. Open decisions'] },
  'AI Systems': { suggestedOwnerBrief: 'kes-ai-systems', sections: ['3\\.3 Anthropic Intelligence Layer', '3\\.4 The 6 AI Agents', '3\\.6 GitHub integration'], extra: [] },
  'Open Houses & Events': { suggestedOwnerBrief: 'jackie-events', sections: ['3\\.10 Architect Expo'], extra: [] },
  'Sales & Admissions': { suggestedOwnerBrief: 'roselen-sales', sections: ['3\\.8 Project Marketplace', '3\\.11 Pricing'], extra: ['## 4. Team structure'] },
  'TWC Compliance': { suggestedOwnerBrief: 'swati-curriculum-twc', sections: ['3\\.12 TWC compliance'], extra: ['## 2. Curriculum structure'] },
  'Approval Queues': { suggestedOwnerBrief: 'ali-decisions', sections: [], extra: ['## 6. Open decisions', '## 11. Decisions I made on Ali'] },
  'Launch Readiness Dashboard': { suggestedOwnerBrief: 'cb-pmo-contract', sections: [], extra: ['## 5. The 41-day plan', '## 10. Risks'] },
};

function extractSection(heading) {
  const m = INTEGRATION_PLAN.match(new RegExp(`(${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}[\\s\\S]*?)(?=\\n## |$)`, 'i'));
  return m ? m[1].trim() : '';
}
function getSection3x(re) {
  const m = INTEGRATION_PLAN.match(new RegExp(`(### ${re}[\\s\\S]*?)(?=\\n### |\\n## )`, 'i'));
  return m ? m[1].trim() : '';
}
function sliceFor(areaName) {
  const cfg = AREA_CONFIG[areaName];
  if (!cfg) return '';
  const parts = [];
  for (const sec of cfg.sections) parts.push(getSection3x(sec));
  for (const sec of cfg.extra) parts.push(extractSection(sec));
  return parts.filter(Boolean).join('\n\n');
}

async function trashTodoslist({ projectId, listId, listName }) {
  // Trash all todos in the list (both open + completed). Idempotent.
  const open = await ops.bcGetAll(`/buckets/${projectId}/todolists/${listId}/todos.json`);
  const done = await ops.bcGetAll(`/buckets/${projectId}/todolists/${listId}/todos.json?completed=true`);
  const all = [...(open || []), ...(done || [])];
  console.log(`  trashing ${all.length} existing todos in "${listName}"`);
  for (const t of all) {
    try {
      await ops.bcPut(`/buckets/${projectId}/recordings/${t.id}/status/trashed.json`, {});
      await new Promise((r) => setTimeout(r, 100));
    } catch (e) {
      console.error(`    trash ${t.id} fail: ${e.message}`);
    }
  }
}

(async () => {
  const dock = await ops.getDock();
  const lists = await ops.bcGetAll(`/buckets/${LAUNCH.projectId}/todosets/${dock.todoset.id}/todolists.json`);
  const roster = provisioned();
  const today = new Date().toISOString().slice(0, 10);

  console.log(`Generating launch tasks v2${DRY ? ' [DRY-RUN]' : ''} - today=${today}, target=${LAUNCH.targetLaunchDate}`);
  console.log(`${lists.length} lists in project, ${Object.keys(VAULT_MAP.briefs || {}).length} briefs in vault`);

  for (const list of lists) {
    if (AREA_FILTER && list.name !== AREA_FILTER) continue;
    console.log(`\n=== ${list.name} ===`);
    const cfg = AREA_CONFIG[list.name];
    if (!cfg) { console.log('  (no config; skipping)'); continue; }
    if (!KEEP && !DRY) {
      await trashTodoslist({ projectId: LAUNCH.projectId, listId: list.id, listName: list.name });
    }
    try {
      const t0 = Date.now();
      const { tasks, rationale, tokenUsage } = await generateAreaTasks({
        area: { name: list.name, description: list.description?.slice(0, 600) || '', suggestedOwnerBrief: cfg.suggestedOwnerBrief },
        integrationPlanSlice: sliceFor(list.name),
        assumptions: ASSUMPTIONS,
        teamRoster: roster,
        newDirectives: ALI_DIRECTIVES,
        briefSlugMap: VAULT_MAP.briefs || {},
        todayIso: today,
        targetLaunch: LAUNCH.targetLaunchDate,
      });
      console.log(`  generated ${tasks.length} tasks in ${Date.now() - t0}ms (tokens=${tokenUsage?.total_tokens || '?'})`);
      console.log(`  rationale: ${rationale}`);
      for (const t of tasks) {
        const owner = getByHandle(t.owner_handle);
        const assigneeIds = owner && owner.basecampPersonId ? [owner.basecampPersonId] : [];
        const ownerLabel = owner ? owner.displayName : t.owner_handle;
        const { html: descHtml, unlinkedDependencies } = buildDescription({ task: t, ownerLabel, today, vaultMap: VAULT_MAP });
        if (unlinkedDependencies.length) {
          // F5 lint: surface dependencies that resolved to no brief link so an
          // unreachable dependency is visible rather than silently emitted.
          console.warn(`    ⚠ unlinked dependencies for "${t.content.slice(0, 50)}": ${unlinkedDependencies.join(' | ')}`);
        }
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
          console.log(`    + [${t.due_on}] ${t.owner_handle.padEnd(8)} ${t.tier.padEnd(5)} ${todo.id}: ${t.content.slice(0, 70)}`);
          await new Promise((r) => setTimeout(r, 200));
        } catch (e) {
          console.error(`    FAIL "${t.content.slice(0, 60)}": ${e.message}`);
        }
      }
    } catch (e) {
      console.error(`  area gen FAIL: ${e.message}`);
    }
  }

  console.log('\n=== Done ===');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
