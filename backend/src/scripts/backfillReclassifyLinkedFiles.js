/**
 * backfillReclassifyLinkedFiles — re-bucket each cap's linked_* arrays
 * using the FIXED classifyFile (2026-05-20).
 *
 * The pre-fix classifier checked `/frontend/` as a substring, missing
 * paths that START with "frontend/" (no leading slash). Result:
 * files under frontend/src/services/* fell through to the backend
 * /service rule and got bucketed as backend. Most visible: Validation
 * cap's only "backend" file was frontend/src/services/validationStore.ts.
 *
 * This script walks every cap and re-buckets its linked_* arrays:
 *   - frontend/* files → linked_frontend_components
 *   - intelligence/ + agents/ → linked_agents
 *   - everything else with .ts/.js/.py → linked_backend_services
 *
 * Idempotent — re-classification produces the same result every run.
 *
 * Run inside prod container: docker exec -w /app accelerator-backend node backfill.js
 */

const PROJECT_ID = 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';

function classifyFile(p) {
  const lower = p.toLowerCase();
  const name = (p.split('/').pop() || '').toLowerCase();
  // Frontend FIRST (the fix)
  if (lower.startsWith('frontend/') || lower.includes('/frontend/')) return 'frontend';
  if (name.endsWith('.tsx') || name.endsWith('.jsx')) return 'frontend';
  if (lower.includes('/components/') || lower.includes('/pages/') || lower.includes('/views/')) return 'frontend';
  // Agent
  if (name.includes('agent') || lower.includes('/agents/') || lower.startsWith('agents/')) return 'agent';
  if (lower.includes('/intelligence/') || lower.startsWith('intelligence/')) return 'agent';
  // Model
  if (lower.includes('/models/') || lower.includes('/schemas/') || lower.includes('/entities/') || lower.includes('/migrations/') || /\.prisma$/.test(lower)) return 'model';
  // Backend
  if (lower.includes('/services/') || lower.includes('/routes/') || lower.includes('/controllers/') || lower.includes('/handlers/') || lower.includes('/api/')) return 'backend';
  if (lower.startsWith('backend/') || lower.includes('/backend/')) return 'backend';
  if (name.endsWith('.ts') || name.endsWith('.js') || name.endsWith('.py') || name.endsWith('.go') || name.endsWith('.rs')) return 'backend';
  return 'other';
}

async function main() {
  const { Sequelize } = require('sequelize');
  const seq = new Sequelize(process.env.DATABASE_URL, { logging: false });

  const caps = await seq.query(
    `SELECT id, name, linked_backend_services, linked_frontend_components, linked_agents
       FROM capabilities
      WHERE project_id = :pid`,
    { replacements: { pid: PROJECT_ID }, type: Sequelize.QueryTypes.SELECT },
  );

  console.log(`Found ${caps.length} caps. Re-bucketing each cap's linked_* arrays...\n`);

  let changed = 0;
  let totalMoved = 0;
  for (const cap of caps) {
    const all = [
      ...(cap.linked_backend_services || []),
      ...(cap.linked_frontend_components || []),
      ...(cap.linked_agents || []),
    ];
    if (all.length === 0) continue;

    const newBackend = [];
    const newFrontend = [];
    const newAgents = [];
    // models join backend per the existing convention
    for (const f of all) {
      const layer = classifyFile(f);
      if (layer === 'frontend') newFrontend.push(f);
      else if (layer === 'agent') newAgents.push(f);
      else if (layer === 'backend' || layer === 'model') newBackend.push(f);
      // 'other' is silently dropped — same behavior as the live scanner
    }

    // Dedup + sort for deterministic comparison
    const uniqBe = [...new Set(newBackend)].sort();
    const uniqFe = [...new Set(newFrontend)].sort();
    const uniqAg = [...new Set(newAgents)].sort();

    const oldBe = [...(cap.linked_backend_services || [])].sort();
    const oldFe = [...(cap.linked_frontend_components || [])].sort();
    const oldAg = [...(cap.linked_agents || [])].sort();

    const beDiff = uniqBe.length !== oldBe.length || uniqBe.some((v, i) => v !== oldBe[i]);
    const feDiff = uniqFe.length !== oldFe.length || uniqFe.some((v, i) => v !== oldFe[i]);
    const agDiff = uniqAg.length !== oldAg.length || uniqAg.some((v, i) => v !== oldAg[i]);

    if (!beDiff && !feDiff && !agDiff) continue;

    const beMoved = oldBe.length - uniqBe.length;
    const feMoved = uniqFe.length - oldFe.length;
    const agMoved = uniqAg.length - oldAg.length;

    await seq.query(
      `UPDATE capabilities
          SET linked_backend_services = :be,
              linked_frontend_components = :fe,
              linked_agents = :ag,
              updated_at = NOW()
        WHERE id = :id`,
      {
        replacements: {
          be: JSON.stringify(uniqBe),
          fe: JSON.stringify(uniqFe),
          ag: JSON.stringify(uniqAg),
          id: cap.id,
        },
      },
    );
    changed++;
    const moves = Math.abs(beMoved) + Math.abs(feMoved) + Math.abs(agMoved);
    totalMoved += moves;
    console.log(`  ${cap.name}: be ${oldBe.length}→${uniqBe.length}, fe ${oldFe.length}→${uniqFe.length}, ag ${oldAg.length}→${uniqAg.length}`);
  }

  console.log(`\nSummary: ${changed} caps re-bucketed, ${totalMoved} file moves total.`);
  await seq.close();
}

main().catch(err => { console.error(err); process.exit(1); });
