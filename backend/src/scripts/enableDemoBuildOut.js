/**
 * enableDemoBuildOut — 2026-05-20.
 *
 * Satisfies the project-activation gate for the three E2E demo accounts so
 * the build-out (requirements → capabilities/features clustering) can run
 * WITHOUT connecting a real GitHub repo. activateProject() refuses to run
 * unless setup_status.github_connected is true; for these demo projects we
 * mark that step satisfied directly. The GitHub-dependent steps inside
 * activation (file-tree sync + requirement→file matching) are wrapped in
 * try/catch and degrade to zero matches, so capability/feature clustering
 * still happens and the requirements setup becomes visible in the portal.
 *
 * This is a deliberate demo affordance, not a product change: activateProject
 * itself is untouched, and only the three ali+demo-run* projects are mutated.
 *
 * Runs INSIDE the production backend container (needs DATABASE_URL):
 *   ssh root@95.216.199.47 'docker exec -i -w /app accelerator-backend node' < backend/src/scripts/enableDemoBuildOut.js
 *
 * Idempotent: re-running just re-asserts the two flags (jsonb merge).
 */
const { Sequelize, QueryTypes } = require('sequelize');

const DEMO_EMAILS = [
  'ali+demo-run1@colaberry.com',
  'ali+demo-run2@colaberry.com',
  'ali+demo-run3@colaberry.com',
];

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set — must run inside the backend container.');
    process.exit(1);
  }
  const s = new Sequelize(url, { logging: false });
  try {
    const results = [];
    for (const email of DEMO_EMAILS) {
      const rows = await s.query(
        `SELECT p.id AS project_id, p.enrollment_id, p.setup_status
           FROM projects p
           JOIN enrollments e ON e.id = p.enrollment_id
          WHERE e.email = :email
          LIMIT 1`,
        { replacements: { email }, type: QueryTypes.SELECT }
      );
      if (rows.length === 0) {
        results.push({ email, status: 'no_project' });
        continue;
      }
      const projectId = rows[0].project_id;
      // jsonb merge: keep existing setup_status, force the two flags on.
      await s.query(
        `UPDATE projects
            SET setup_status = COALESCE(setup_status, '{}'::jsonb)
              || '{"github_connected": true, "requirements_loaded": true}'::jsonb
          WHERE id = :pid`,
        { replacements: { pid: projectId } }
      );
      results.push({ email, status: 'gate_satisfied', project_id: projectId });
    }
    for (const r of results) {
      console.error(`[buildout-gate] ${r.email} -> ${r.status}${r.project_id ? ' (' + r.project_id + ')' : ''}`);
    }
    console.log('RESULT_JSON:' + JSON.stringify(results));
  } catch (err) {
    console.error('[buildout-gate] FATAL', err.message);
    process.exit(1);
  } finally {
    await s.close();
  }
})();
