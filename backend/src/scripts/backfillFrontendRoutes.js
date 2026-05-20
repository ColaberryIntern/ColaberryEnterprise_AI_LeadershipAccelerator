/**
 * backfillFrontendRoutes — derive cap.frontend_route from
 * linked_frontend_components using the persisted route→component
 * bindings.
 *
 * 2026-05-20: surfaced when operator hit Marketing Dashboard cap
 * detail and got no live preview. The cap has 4 linked frontend
 * page components (AdminMarketingDashboardPage.tsx etc.) but
 * frontend_route is null — so the cap detail UI has no URL to
 * embed in the preview iframe.
 *
 * Pre-req: githubService.syncFileTree must have populated
 * connection.route_component_bindings_json. The script aborts if not.
 *
 * Idempotent: skips caps whose frontend_route is already set, OR
 * whose linked_frontend_components don't resolve to any registered
 * component → route binding.
 *
 * Run: docker exec -w /app accelerator-backend node backfill.js
 */

const PROJECT_ID = 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';

function deriveRoute(capName, linkedComponents, componentToRoute) {
  if (!linkedComponents || linkedComponents.length === 0) return null;
  const candidates = [];
  for (const comp of linkedComponents) {
    const filename = (comp.split('/').pop() || '');
    const compName = filename.replace(/\.(tsx?|jsx?)$/, '');
    const route = componentToRoute[compName];
    if (route) candidates.push({ component: compName, route });
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].route;

  const normalize = s => (s || '').toLowerCase()
    .replace(/(page|view|screen|dashboard|admin)$/g, '')
    .replace(/[^a-z0-9]/g, '');
  const capKey = normalize(capName);
  let best = candidates[0], bestScore = 0;
  for (const c of candidates) {
    const compKey = normalize(c.component);
    let score = 0;
    for (let i = 2; i <= Math.min(compKey.length, capKey.length); i++) {
      for (let j = 0; j <= compKey.length - i; j++) {
        if (capKey.includes(compKey.substring(j, j + i))) score = Math.max(score, i);
      }
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best.route;
}

async function main() {
  const { Sequelize } = require('sequelize');
  const seq = new Sequelize(process.env.DATABASE_URL, { logging: false });

  // Pull the connection's component bindings via the project's enrollment
  const enrolls = await seq.query(
    `SELECT enrollment_id FROM projects WHERE id = :pid`,
    { replacements: { pid: PROJECT_ID }, type: Sequelize.QueryTypes.SELECT },
  );
  if (enrolls.length === 0) { console.error('No project found'); process.exit(1); }
  const enrollmentId = enrolls[0].enrollment_id;

  const conns = await seq.query(
    `SELECT route_component_bindings_json FROM github_connections WHERE enrollment_id = :eid`,
    { replacements: { eid: enrollmentId }, type: Sequelize.QueryTypes.SELECT },
  );
  if (conns.length === 0 || !conns[0].route_component_bindings_json) {
    console.error('No route_component_bindings_json on the GitHub connection. Run syncFileTree first.');
    process.exit(1);
  }
  const bindings = conns[0].route_component_bindings_json.bindings || {};
  console.log(`Loaded ${Object.keys(bindings).length} component→route bindings.\n`);

  // Pull all caps with linked frontend components but no frontend_route
  const caps = await seq.query(
    `SELECT id, name, linked_frontend_components, frontend_route
       FROM capabilities
      WHERE project_id = :pid
        AND applicability_status = 'active'
        AND (frontend_route IS NULL OR frontend_route = '')
        AND linked_frontend_components IS NOT NULL
        AND jsonb_array_length(linked_frontend_components::jsonb) > 0
      ORDER BY name`,
    { replacements: { pid: PROJECT_ID }, type: Sequelize.QueryTypes.SELECT },
  );

  console.log(`Found ${caps.length} active caps with frontend components but no frontend_route.\n`);

  let assigned = 0;
  let noMatch = 0;
  for (const cap of caps) {
    const route = deriveRoute(cap.name, cap.linked_frontend_components || [], bindings);
    if (!route) {
      noMatch++;
      console.log(`  [no-match] "${cap.name}" — no linked component resolves to a registered route`);
      continue;
    }
    await seq.query(
      `UPDATE capabilities SET frontend_route = :r, updated_at = NOW() WHERE id = :id`,
      { replacements: { r: route, id: cap.id } },
    );
    assigned++;
    console.log(`  [assigned] "${cap.name}" → ${route}`);
  }
  console.log(`\nSummary: ${assigned} routes assigned, ${noMatch} left unmatched.`);
  await seq.close();
}

main().catch(err => { console.error(err); process.exit(1); });
