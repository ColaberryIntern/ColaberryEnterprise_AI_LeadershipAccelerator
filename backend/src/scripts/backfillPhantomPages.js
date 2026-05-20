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

// Brownfield-discovered page caps that already exist at a real registered
// route — attach the route so they participate in ui_review correctly.
// Picked by hand because the brownfield scanner derived these names from
// backend/doc evidence without route attribution, and we want to bind them
// to the live React routes rather than create yet more page caps.
const BROWNFIELD_ROUTE_ASSIGNMENTS = {
  'Advisory Page':                 '/advisory',
  'Agency Partner Page':           '/partners',
  'AI Architect Landing Page':     '/ai-architect',
  'AI Workforce Designer Page':    '/ai-workforce-designer',
  'AIXcelerator Landing Page':     '/aixcelerator',
  'Alumni Champion Page':          '/alumni-ai-champion',
  'Case Studies Page':             '/case-studies',
  'Executive ROI Calculator Page': '/executive-roi-calculator',
};

// Pure duplicates: brownfield-discovered cap with same conceptual name as
// a frontend_page cap that's already correctly bound. Deactivate the
// brownfield one (it's redundant and pollutes the ui_review queue).
//
// 2026-05-20 extension: also dedup brownfield-vs-brownfield duplicates
// where the LLM consolidation pass produced two names for the same
// code grouping. Verified by linked_backend_services equality:
//   - Requirements Engine ≡ Requirements Management (11/11 files identical)
//   - Revenue Dashboard Insights ≡ Revenue Dashboard (7/7 files identical)
//   - Discovery Engine ⊂ Discovery (Discovery is the 8-file superset)
const DUPLICATE_NAMES = new Set([
  'Enrollment Success Page', // duplicate of "Enroll Success Page" → /enroll/success
  'Pilot AI Team Page',      // duplicate of "Pilot Ai Team Page" → /pilot/ai-team
  'Requirements Engine',     // duplicate of "Requirements Management"
  'Revenue Dashboard Insights', // duplicate of "Revenue Dashboard"
  'Discovery Engine',        // subset of "Discovery"
]);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const sequelize = new Sequelize(url, { logging: false });

  // Pull all candidate caps for the project. Expanded 2026-05-20 to
  // also include brownfield service duplicates by name (the LLM
  // consolidation pass occasionally produced two names for the same
  // code grouping). The DUPLICATE_NAMES set tells us which ones to
  // touch.
  const duplicateNamesList = [...DUPLICATE_NAMES];
  const [caps] = await sequelize.query(
    `SELECT id, name, kind, source, frontend_route
       FROM capabilities
      WHERE project_id = :pid
        AND (source = 'frontend_page' OR kind = 'page' OR name = ANY(:dupNames))
      ORDER BY name`,
    { replacements: { pid: PROJECT_ID, dupNames: duplicateNamesList } },
  );

  console.log(`Found ${caps.length} candidate caps in project.\n`);

  let fixedRoutes = 0;
  let downgradedPhantoms = 0;
  let assignedBrownfield = 0;
  let deactivatedDuplicates = 0;
  let untouched = 0;

  for (const cap of caps) {
    const route = cap.frontend_route;
    if (!route) {
      // Brownfield page cap with no route attached. Two cases:
      // 1) Known duplicate of a frontend_page cap → deactivate
      // 2) Known assignment → attach the registered route
      // 3) Unknown → leave alone (operator will set the route manually)
      if (DUPLICATE_NAMES.has(cap.name)) {
        await sequelize.query(
          `UPDATE capabilities SET applicability_status = 'inactive', updated_at = NOW() WHERE id = :id`,
          { replacements: { id: cap.id } },
        );
        console.log(`  [duplicate]  "${cap.name}" → inactive (already covered by frontend_page cap)`);
        deactivatedDuplicates++;
        continue;
      }
      const assigned = BROWNFIELD_ROUTE_ASSIGNMENTS[cap.name];
      if (assigned) {
        await sequelize.query(
          `UPDATE capabilities SET frontend_route = :r, source = 'frontend_page', updated_at = NOW() WHERE id = :id`,
          { replacements: { r: assigned, id: cap.id } },
        );
        console.log(`  [bind-route] "${cap.name}" → ${assigned}`);
        assignedBrownfield++;
        continue;
      }
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
  console.log(`Summary: ${fixedRoutes} routes fixed, ${downgradedPhantoms} phantoms downgraded, ${assignedBrownfield} brownfield routes attached, ${deactivatedDuplicates} duplicates deactivated, ${untouched} left as-is.`);
  await sequelize.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
