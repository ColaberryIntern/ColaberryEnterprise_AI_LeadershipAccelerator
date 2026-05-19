/**
 * Backfill: reconcile phantom page caps against the real React Router registry.
 *
 * Surfaced 2026-05-19 after the operator clicked the top ui_review priority
 * "Run UI Advisor on Trust Badges Page" → /trust-badges → 404 because that
 * route was never registered. Cross-referencing showed 24 of 44 frontend_page
 * caps had routes not present in the React Router files. Two failure shapes:
 *
 *   PURE PHANTOMS (12): the cap was auto-created from src/components/X.tsx
 *   files that LOOK like pages but are embedded components (TrustBadges,
 *   DreamBigSection, MayaAvatar, etc.). Convert to kind='component', clear
 *   frontend_route, rename to strip " Page" suffix. The cap stays in the
 *   DB for traceability but no longer triggers ui_review.
 *
 *   WRONG-FORMAT (~8): the cap IS a real page but uses a stale route form
 *   (e.g., /enroll-cancel when the real registered route is /enroll/cancel).
 *   Update frontend_route to the registered form. Page stays as a page.
 *
 * Runs against prod DB. Idempotent — re-running is a no-op.
 */
const { Sequelize } = require('sequelize');

const PROJECT_ID = 'fcce50ef-fe01-471d-a3ff-cd6948d092c2';

// Pure phantoms → convert to embedded component, clear route.
const PURE_PHANTOMS = new Set([
  '/trust-badges',
  '/dream-big-section',
  '/home-learning-media-section',
  '/industry-demo-card',
  '/industry-demo-grid',
  '/inline-demo-player',
  '/live-demo-strip',
  '/maya-avatar',
  '/roi-highlight-section',
  '/temperature-badge',
  '/communication-log-panel',
  '/seo-head',
  '/email-preview',
]);

// Wrong-format → fix to real route.
const ROUTE_FIXUPS = {
  '/enroll-cancel': '/enroll/cancel',
  '/enroll-success': '/enroll/success',
  '/exec-overview-thank-you': '/executive-overview/thank-you',
  '/pilot-ai-team': '/pilot/ai-team',
  '/pilot-exclusive': '/pilot/exclusive',
  '/pilot-zero-risk': '/pilot/zero-risk',
  '/home': '/',
  '/instructor': '/ai-architect/instructor',
  '/admin/icp-insights': '/admin/insights',
  '/not-found': '*',
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const sequelize = new Sequelize(url, { logging: false });

  // Pull all frontend_page caps for the project
  const [caps] = await sequelize.query(
    `SELECT id, name, kind, source, frontend_route
       FROM capabilities
      WHERE project_id = :pid
        AND (source = 'frontend_page' OR kind = 'page')
      ORDER BY name`,
    { replacements: { pid: PROJECT_ID } },
  );

  console.log(`Found ${caps.length} page caps in project.\n`);

  let fixedRoutes = 0;
  let downgradedPhantoms = 0;
  let untouched = 0;

  for (const cap of caps) {
    const route = cap.frontend_route;
    if (!route) {
      untouched++;
      continue;
    }

    if (ROUTE_FIXUPS[route]) {
      const newRoute = ROUTE_FIXUPS[route];
      await sequelize.query(
        `UPDATE capabilities SET frontend_route = :r, updated_at = NOW() WHERE id = :id`,
        { replacements: { r: newRoute, id: cap.id } },
      );
      console.log(`  [fix-route]  "${cap.name}"  ${route}  →  ${newRoute}`);
      fixedRoutes++;
      continue;
    }

    if (PURE_PHANTOMS.has(route)) {
      const newName = cap.name.replace(/\s+Page$/i, '');
      await sequelize.query(
        `UPDATE capabilities
            SET kind = 'component',
                source = 'embedded_component',
                frontend_route = NULL,
                name = :n,
                applicability_status = 'inactive',
                updated_at = NOW()
          WHERE id = :id`,
        { replacements: { n: newName, id: cap.id } },
      );
      console.log(`  [phantom]    "${cap.name}"  ${route}  →  component "${newName}" (inactive)`);
      downgradedPhantoms++;
      continue;
    }

    untouched++;
  }

  console.log();
  console.log(`Summary: ${fixedRoutes} routes fixed, ${downgradedPhantoms} phantoms downgraded, ${untouched} left as-is.`);
  await sequelize.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
