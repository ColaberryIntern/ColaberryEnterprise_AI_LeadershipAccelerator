/**
 * captureCritiqueBlueprintWalkthrough.js
 *
 * Step-by-step walkthrough capture for the Critique → Blueprint flow.
 * Two use cases per surface, captured at each meaningful step on
 * production, with prefixes that match the walkthrough HTML's narrative.
 *
 *   critique-uc1-step1-landing
 *   critique-uc1-step2-form-filled
 *   critique-uc1-step3-workspace-opened
 *   critique-uc1-step4-annotate-active
 *   critique-uc1-step5-annotation-modal
 *   critique-uc1-step6-pin-saved
 *   critique-uc1-step7-prompt-preview
 *   (same skeleton for uc2)
 *
 *   blueprint-uc1-step1-landing
 *   blueprint-uc1-step2-context-task
 *   blueprint-uc1-step3-prompt
 *   blueprint-uc1-step4-execute
 *   blueprint-uc1-step5-verify
 *   blueprint-uc1-step6-iterate
 *   blueprint-uc2-step1-handoff-landing
 *   blueprint-uc2-step2-handoff-prompt
 *
 * Viewport 1440x1500 at deviceScaleFactor=1.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-critique-blueprint-walkthrough`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

const USE_CASES = {
  critique: [
    {
      id: 'uc1', label: 'Pricing page review',
      route: '/pricing',
      annotation: {
        title: 'Hero headline is feature-y, not buyer-y',
        description: 'The headline "Executive Accelerator Pricing" tells the visitor WHAT this is, not WHO it’s for. An exec landing here wants to know which tier matches their stage. Rewrite the hero so it leads with the operator situation ("Choose the tier that matches where your AI operation is today"), then names the tiers as outcomes, not labels.',
        kind: 'copy', severity: 'medium',
      },
    },
    {
      id: 'uc2', label: 'Operator home tile clarity',
      route: '/portal/home',
      annotation: {
        title: 'Health tile at 60% in amber, no remediation hint',
        description: 'Operators land on Home, see Health at 60% (amber), and have no idea what would lift it back to healthy. Add one calm sentence under the tile value naming the dominant signal pulling the score down right now (e.g. "regressions in the last 24h" / "verification pass rate below 80%") so the operator can act without opening the drawer.',
        kind: 'hierarchy', severity: 'medium',
      },
    },
  ],
};

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[walkthrough] Out: ${OUT_DIR}`);
  const browser = await chromium.launch({ headless: true });

  const makeContext = async (extraInit) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1500 }, deviceScaleFactor: 1 });
    if (TOKEN) {
      await ctx.addInitScript(({ t, extra }) => {
        try {
          window.localStorage.setItem('participant_token', t);
          if (extra) for (const [k, v] of Object.entries(extra)) window.localStorage.setItem(k, v);
        } catch (_e) { /* ignore */ }
      }, { t: TOKEN, extra: extraInit || null });
    }
    return ctx;
  };

  const shot = (page, name) =>
    page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });

  // Close the CoryDrawer if it happens to be open. Avoids "drawer
  // intercepts pointer events" errors when scripting a clean flow.
  const closeCoryIfOpen = async (page) => {
    const drawer = page.locator('aside[role="dialog"][aria-label*="Here"]');
    if ((await drawer.count()) > 0 && await drawer.isVisible()) {
      // Click the × close button inside the drawer
      const closeBtn = drawer.locator('button[aria-label*="close" i], button:has-text("×")').first();
      if ((await closeBtn.count()) > 0) {
        await closeBtn.click().catch(() => {});
        await page.waitForTimeout(400);
      } else {
        // Fallback: press Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
    }
  };

  // Click safely — closes the drawer first, then clicks. Returns true
  // on success, false on failure (logs the failure instead of crashing).
  const safeClick = async (page, selector, label) => {
    await closeCoryIfOpen(page);
    const loc = page.locator(selector).first();
    if ((await loc.count()) === 0) {
      console.log(`  [warn] ${label}: selector ${selector} not found`);
      return false;
    }
    try {
      await loc.click({ timeout: 8000 });
      return true;
    } catch (e) {
      console.log(`  [warn] ${label}: click failed — ${e.message.slice(0, 80)}`);
      return false;
    }
  };

  // ─────────── CRITIQUE — both use cases ───────────
  for (const uc of USE_CASES.critique) {
    console.log(`\n[walkthrough] CRITIQUE ${uc.id} — ${uc.label}`);
    const ctx = await makeContext();
    const page = await ctx.newPage();

    // STEP 1: land on Critique fresh
    await page.goto(`${BASE}/portal/visual-workspace`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await shot(page, `critique-${uc.id}-step1-landing`);
    console.log(`  step1 captured`);

    // STEP 2: fill in the form — origin already defaults to current page; we type the route
    const routeInput = await page.locator('input[placeholder="/portal/project/blueprint"]').first();
    await routeInput.click();
    await routeInput.fill(uc.route);
    await page.waitForTimeout(400);
    await shot(page, `critique-${uc.id}-step2-form-filled`);
    console.log(`  step2 captured — route ${uc.route}`);

    // STEP 3: open the visual workspace — backend POSTs a new session
    const openBtn = await page.locator('button:has-text("Open visual workspace")').first();
    await openBtn.click();
    await page.waitForTimeout(5000); // wait for session create + iframe load
    await shot(page, `critique-${uc.id}-step3-workspace-opened`);
    console.log(`  step3 captured`);

    // STEP 4: enter annotate mode
    await safeClick(page, 'button:has-text("Annotate")', 'Annotate button');
    await page.waitForTimeout(600);
    await closeCoryIfOpen(page);
    await shot(page, `critique-${uc.id}-step4-annotate-active`);
    console.log(`  step4 captured`);

    // STEP 5: click on the iframe stage to drop a pin → annotation modal opens
    // The stage iframe is inside a wrapping div with class vw-stage; the
    // click overlay handles the pin drop, not the iframe itself.
    const stage = await page.locator('.vw-stage, iframe').first();
    const stageBox = await stage.boundingBox().catch(() => null);
    if (stageBox) {
      await page.mouse.click(stageBox.x + stageBox.width * 0.5, stageBox.y + stageBox.height * 0.2);
      await page.waitForTimeout(1000);
    }
    await shot(page, `critique-${uc.id}-step5-annotation-modal`);
    console.log(`  step5 captured`);

    // STEP 6: fill in the annotation modal — description textarea is the
    // main field; title is optional. Use a more specific selector for the
    // modal so we don't accidentally fill the page route input upstream.
    const modal = page.locator('.vw-modal, [role="dialog"]').last();
    const descArea = modal.locator('textarea').first();
    if ((await descArea.count()) > 0) {
      await descArea.fill(uc.annotation.description).catch(() => {});
    }
    const titleInput = modal.locator('input[type="text"]').first();
    if ((await titleInput.count()) > 0) {
      await titleInput.fill(uc.annotation.title).catch(() => {});
    }
    await page.waitForTimeout(400);
    await shot(page, `critique-${uc.id}-step6a-annotation-filled`);
    // Submit the annotation — exact button text per AnnotationModal.tsx
    await safeClick(page, 'button:has-text("Save annotation")', 'Save annotation button');
    await page.waitForTimeout(2500);
    await closeCoryIfOpen(page);
    await shot(page, `critique-${uc.id}-step6b-pin-saved`);
    console.log(`  step6 captured`);

    // STEP 7: compile prompt — exact button text per ActionBar.tsx
    await closeCoryIfOpen(page);
    const clicked = await safeClick(page, 'button:has-text("Compile prompt")', 'Compile prompt button');
    if (clicked) {
      await page.waitForTimeout(3500); // backend generate-prompt round-trip
      await closeCoryIfOpen(page);
      await shot(page, `critique-${uc.id}-step7-prompt-preview`);
      console.log(`  step7 captured`);
    }

    await ctx.close();
  }

  // ─────────── BLUEPRINT — Use Case 1: Cory's next action ───────────
  console.log(`\n[walkthrough] BLUEPRINT uc1 — Cory's next action`);
  {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/portal/project/blueprint`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await shot(page, 'blueprint-uc1-step1-landing');
    console.log('  step1 captured');

    // Scroll through the 6 stages to capture them. Page is tall; each stage has a circle number.
    // For Context+Task we can use viewport top. For Prompt and Execute we need to scroll mid-page.
    // For Verify/Iterate we need to scroll to the bottom.
    // Scroll positions:
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await shot(page, 'blueprint-uc1-step2-context-task');
    console.log('  step2 captured — context+task');

    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await shot(page, 'blueprint-uc1-step3-prompt');
    console.log('  step3 captured — prompt');

    await page.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await shot(page, 'blueprint-uc1-step4-execute');
    console.log('  step4 captured — execute');

    await page.evaluate(() => window.scrollTo({ top: 1700, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await shot(page, 'blueprint-uc1-step5-verify');
    console.log('  step5 captured — verify');

    await page.evaluate(() => window.scrollTo({ top: 2200, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await shot(page, 'blueprint-uc1-step6-iterate');
    console.log('  step6 captured — iterate');

    // Demonstrate copy button by clicking it
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    await page.waitForTimeout(400);
    const copyBtn = await page.locator('button:has-text("Copy prompt")').first();
    if (await copyBtn.count() > 0) {
      await copyBtn.click();
      await page.waitForTimeout(700);
      await shot(page, 'blueprint-uc1-step3b-copied');
      console.log('  step3b captured — copied');
    }

    await ctx.close();
  }

  // ─────────── BLUEPRINT — Use Case 2: Critique handoff ───────────
  console.log(`\n[walkthrough] BLUEPRINT uc2 — Critique handoff`);
  {
    // Seed sessionStorage isn't supported by addInitScript directly; we
    // navigate to home first, set sessionStorage in-page, then navigate.
    const ctx = await makeContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      try {
        sessionStorage.setItem(
          'visualWorkspace:pendingBuildPrompt',
          '# Pricing page: rewrite hero from feature-y to buyer-y\n\n' +
          '## Why\nA pin captured during a Critique session on /pricing flagged that the headline "Executive Accelerator Pricing" tells visitors WHAT this is, not WHO it’s for. An exec landing here wants to know which tier matches their stage.\n\n' +
          '## Implementation expectations\n- Rewrite the hero headline to lead with the operator situation\n- Position the tiers as outcomes ("Get to your first AI system" / "Operate AI at scale") not labels\n- Keep the existing visual structure\n- Do not bundle unrelated copy edits elsewhere on the page\n\n' +
          '## Verification\n- `npx tsc --noEmit` clean\n- Open /pricing in a new tab and confirm the hero reads as intended\n- Update PROGRESS.md with the change'
        );
        sessionStorage.setItem('visualWorkspace:pendingBuildSourceRoute', '/pricing');
        sessionStorage.setItem('visualWorkspace:lastSessionTouchedAt', new Date().toISOString());
      } catch (_e) { /* ignore */ }
    });
    await page.goto(`${BASE}/portal/project/blueprint?build=visual-workspace`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await shot(page, 'blueprint-uc2-step1-handoff-landing');
    console.log('  step1 captured — handoff landed');

    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await shot(page, 'blueprint-uc2-step2-handoff-prompt');
    console.log('  step2 captured — handoff prompt visible');

    await ctx.close();
  }

  await browser.close();
  console.log(`\n[walkthrough] Done. Captures in ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
