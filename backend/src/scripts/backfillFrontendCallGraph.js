/**
 * backfillFrontendCallGraph — populates cap.frontend_calls_capability_ids
 * for every active cap in a project via frontendCallGraphScanner.
 *
 * 2026-05-20: ships alongside the FE→BE chips. One-shot run after deploy;
 * idempotent (re-running overwrites with fresh detections).
 *
 * Run inside the prod backend container:
 *   docker cp <this-file> accelerator-backend:/app/runFCG.js
 *   docker exec -w /app accelerator-backend node runFCG.js
 */

const PROJECT_ID = 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';

async function main() {
  const { Sequelize, QueryTypes } = require('sequelize');
  const seq = new Sequelize(process.env.DATABASE_URL, { logging: false });

  // Find the project's enrollment so the scanner can read files from GitHub.
  const enrolls = await seq.query(
    `SELECT enrollment_id FROM projects WHERE id = :pid`,
    { replacements: { pid: PROJECT_ID }, type: QueryTypes.SELECT },
  );
  if (enrolls.length === 0) { console.error('No project found'); process.exit(1); }
  const enrollmentId = enrolls[0].enrollment_id;

  // Pull every active cap with its linked_* arrays so the scanner has a
  // complete picture of the project's surface.
  const caps = await seq.query(
    `SELECT id, name, linked_backend_services, linked_frontend_components
       FROM capabilities
      WHERE project_id = :pid
        AND applicability_status = 'active'
      ORDER BY name`,
    { replacements: { pid: PROJECT_ID }, type: QueryTypes.SELECT },
  );
  console.log(`Loaded ${caps.length} active caps.\n`);

  const { scanProjectCallGraph } = require('/app/dist/services/frontendCallGraphScanner');
  console.log('Scanning project — reading backend + frontend files…');
  const result = await scanProjectCallGraph(enrollmentId, caps.map(c => ({
    id: c.id,
    linked_backend_services: c.linked_backend_services || [],
    linked_frontend_components: c.linked_frontend_components || [],
  })));

  console.log('\nScan stats:');
  for (const [k, v] of Object.entries(result.stats)) console.log(`  ${k}: ${v}`);
  console.log();

  // Persist: each cap's downstream set goes to frontend_calls_capability_ids.
  // Caps with no outgoing calls get an empty array (so the column tracks
  // "we scanned, found nothing" vs null = "never scanned").
  const capIdByName = new Map(caps.map(c => [c.id, c.name]));
  let updated = 0;
  for (const cap of caps) {
    const downstream = Array.from(result.feCallsBe.get(cap.id) || []);
    await seq.query(
      `UPDATE capabilities SET frontend_calls_capability_ids = :ids::jsonb, updated_at = NOW() WHERE id = :id`,
      { replacements: { ids: JSON.stringify(downstream), id: cap.id } },
    );
    if (downstream.length > 0) {
      const names = downstream.map(id => capIdByName.get(id) || id.slice(0, 8)).join(', ');
      console.log(`  [linked] "${cap.name}" -> [${names}]`);
    }
    updated++;
  }
  console.log(`\nUpdated ${updated} caps; ${result.stats.caps_with_outgoing_calls} have outgoing calls.`);

  await seq.close();
}

main().catch(err => { console.error(err); process.exit(1); });
