/**
 * captureMultibuildDisplay.js — browser evidence for the multi-build display
 * defects (D1 the build counter, D2 the starter-template masking, D4 the archive
 * dialog contradiction).
 *
 * WHAT IT SEEDS AND WHY. The defect only appears in the state production
 * actually reaches, which is AFTER `claimBackendProject` has run: the browser's
 * ten-task starter template, `origin: 'local'`, holding a claim on the server
 * project AND already re-keyed so its `id` IS the server UUID. That re-key is
 * what makes `reconcileProjects`' `matchIdx` match and the supersede branch
 * unreachable. Seeding it directly is the honest reproduction — driving the
 * wizard would take minutes of real pipeline time and land in the same state.
 *
 * The seeded template's tasks carry NO `storyId`, exactly as `generateSkeleton`
 * mints them. That is load-bearing: it is why the template's keys and the plan's
 * `STORY-NNN` keys are disjoint, and therefore why the pre-fix overlay ADDED the
 * plan to the template (10 + 17 = 27) rather than replacing it.
 *
 * The training example is seeded alongside it so the "Active builds" counter
 * reproduces at a known value.
 *
 * DEV ONLY. Points at the dev stack on :9999 and a throwaway enrollment.
 *
 * Usage:
 *   CAPTURE_TOKEN=<participant jwt> BASE_URL=http://127.0.0.1:9999 \
 *   OUT_DIR=docs/screenshots/2026-08-19-multibuild-display LABEL=after \
 *   node scripts/captureMultibuildDisplay.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createSafeContext, safeScreenshot } = require('./captureHelpers');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:9999';
const OUT_DIR = process.env.OUT_DIR || 'docs/screenshots/2026-08-19-multibuild-display';
const LABEL = process.env.LABEL || 'after';
const SERVER_PROJECT_ID = process.env.SERVER_PROJECT_ID || '9a11cc00-0000-4000-8000-000000000002';
const LOCAL_PLACEHOLDER_ID = 'p1786000000000';

/** The ten tasks `generateSkeleton` mints: local ids, and no story ids at all. */
function templateTasks() {
  const titles = [
    'Lock the core requirements with acceptance criteria',
    'Map the safety guardrail (currently UNMAPPED)',
    'Scaffold the MCP server over stdio',
    'Implement the seat-usage read tool',
    'Implement the core action against a real source',
    'Connect the live preview at the build URL',
    'Add retry + timeout to the upstream call',
    'Handle the empty and no-match cases gracefully',
    'Record a 2-minute demo screencast',
    'Write the one-pager for reviewers',
  ];
  return titles.map((title, i) => ({
    id: `${LOCAL_PLACEHOLDER_ID}-t${i + 1}`,
    title,
    state: 'todo',
    due: i === 0 ? 'today' : 'up',
  }));
}

/**
 * The post-claim placeholder. `id` is the SERVER uuid (adoptServerIds re-keyed
 * it at claim time) while the content is still entirely the browser's template.
 */
function claimedTemplate() {
  const t = templateTasks();
  return {
    id: SERVER_PROJECT_ID,
    legacyIds: [LOCAL_PLACEHOLDER_ID],
    pipelineProjectId: SERVER_PROJECT_ID,
    origin: 'local',
    name: 'Sponsor Utilisation Dashboard',
    slug: 'sponsor-utilisation-dashboard',
    descriptor: 'show sponsors whether their seats are actually being used',
    accent: '#367895',
    cover: 'linear-gradient(120deg,#367895,#5BA63C)',
    icon: 'M5 4h11l4 4v12H5z',
    status: 'ready',
    createdAt: 1786000000000,
    stage: 'Step 2 of 9 · Requirements',
    curStep: 2,
    size: 'project',
    idea: 'show sponsors whether their seats are actually being used',
    sample: false,
    reqs: [
      { id: 'R1', name: 'Core action via Claude agent', kind: 'FUNC', state: 'planned' },
      { id: 'R2', name: 'Seat-usage data source (read-only)', kind: 'FUNC', state: 'planned' },
      { id: 'R3', name: 'Result shaping + substitutions', kind: 'FUNC', state: 'unmapped' },
      { id: 'R4', name: 'Human approval before any side effect', kind: 'SAFE', state: 'unmapped' },
      { id: 'R5', name: 'Retry + timeout on the upstream call', kind: 'REL', state: 'unmapped' },
    ],
    lists: [
      { id: `${LOCAL_PLACEHOLDER_ID}-L1`, step: 2, name: 'Project DNA & Requirements',
        sub: 'Your generated requirements, tracked as tasks', tasks: t.slice(0, 2) },
      { id: `${LOCAL_PLACEHOLDER_ID}-L2`, step: 4, name: 'Core build',
        sub: 'Build the full project', tasks: t.slice(2, 6) },
      { id: `${LOCAL_PLACEHOLDER_ID}-L3`, step: 6, name: 'Reliability & polish',
        sub: 'Make it survive failure', tasks: t.slice(6, 8) },
      { id: `${LOCAL_PLACEHOLDER_ID}-L4`, step: 8, name: 'Showcase & portfolio',
        sub: 'Prove it at the Architect Expo', tasks: t.slice(8, 10) },
    ],
    activity: [],
    preview: {
      toolName: 'Sponsor Utilisation Dashboard', summary: '',
      tools: ['get_seat_usage', 'run_action', 'validate_result'],
      dataSources: ['seat usage export'], guardrails: [],
    },
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await createSafeContext(browser, { label: 'retina-review' });

  // Seed BEFORE any app code runs, so the first read() sees the claimed template.
  await ctx.addInitScript((payload) => {
    try {
      window.localStorage.setItem('te_projects_v1', payload);
    } catch (_e) { /* ignore */ }
  }, JSON.stringify([claimedTemplate()]));

  const page = await ctx.newPage();
  const shot = (n) => path.join(OUT_DIR, `${LABEL}-${n}.png`);

  // BLOCK THE MIRROR. `projectSync.mirrorToBackend` pushes the first non-sample
  // LOCAL project up to `POST /api/portal/projects/import` on every sync. Left
  // alone it writes the browser's ten template tasks into the server as real
  // rows, so the fixture drifts under the capture and the second run measures a
  // different plan from the first. Aborting it keeps the seeded 17-story plan
  // the single source of truth for both the before and the after run, which is
  // the only way the two are comparable. Nothing under test reads this call.
  const mirrored = [];
  await page.route('**/api/portal/projects/import', async (route) => {
    mirrored.push(route.request().url());
    await route.abort();
  });

  await page.goto(`${BASE_URL}/portal/projects`, { waitUntil: 'networkidle' });
  // The page syncs with the backend on mount; give reconcile a beat to land.
  await page.waitForTimeout(4000);

  await safeScreenshot(page, shot('01-projects-overview'), { fullPage: false, label: 'retina-review' });

  // ── the machine-readable half: what the page actually says ────────────────
  const facts = await page.evaluate(() => {
    const text = (el) => (el ? (el.textContent || '').trim() : null);
    const statEl = Array.from(document.querySelectorAll('.te-stat .lab'))
      .find((el) => el.textContent === 'Active builds');
    const store = JSON.parse(window.localStorage.getItem('te_projects_v1') || '[]');
    const own = store.filter((p) => !p.sample);
    return {
      activeBuildsStat: statEl ? text(statEl.parentElement.querySelector('.num')) : null,
      originChips: Array.from(document.querySelectorAll('.pj-origin')).map((e) => text(e)),
      sidebarRows: Array.from(document.querySelectorAll('.pj-sidebuild')).map((r) => ({
        name: text(r.querySelector('.nm')),
        tag: text(r.querySelector('.pj-sb-tag')),
      })),
      storeOwnBuilds: own.length,
      storeFirstOrigin: own[0] ? own[0].origin : null,
      storeFirstTaskCount: own[0]
        ? own[0].lists.reduce((n, l) => n + l.tasks.length, 0) : null,
      storeFirstListNames: own[0] ? own[0].lists.map((l) => l.name) : null,
      storeFirstTaskTitles: own[0]
        ? own[0].lists.flatMap((l) => l.tasks.map((t) => t.title)).slice(0, 4) : null,
      storeFirstListBreakdown: own[0]
        ? own[0].lists.map((l) => ({ name: l.name, tasks: l.tasks.length })) : null,
    };
  });
  facts.mirrorAttemptsBlocked = mirrored.length;
  fs.writeFileSync(path.join(OUT_DIR, `${LABEL}-facts.json`), JSON.stringify(facts, null, 2));
  console.log(`[${LABEL}] ` + JSON.stringify(facts, null, 2));

  // ── D4: the archive dialog, beside the card it describes ──────────────────
  const removeBtn = page.locator('button.pjb-remove').first();
  if (await removeBtn.count()) {
    await removeBtn.click();
    await page.waitForTimeout(2500);
    await safeScreenshot(page, shot('02-archive-dialog'), { fullPage: false, label: 'retina-review' });
    const dialogText = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"], .pj-modal, .te-modal');
      return d ? (d.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600) : null;
    });
    fs.writeFileSync(path.join(OUT_DIR, `${LABEL}-archive-dialog.txt`), dialogText || '(no dialog found)');
    console.log(`[${LABEL}] archive dialog: ${dialogText}`);
  } else {
    console.log(`[${LABEL}] no archive control found on the card`);
  }

  await ctx.close();
  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
