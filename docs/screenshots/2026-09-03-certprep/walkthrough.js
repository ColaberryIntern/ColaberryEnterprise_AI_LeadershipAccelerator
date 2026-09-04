/**
 * Cert Prep browser walkthrough — screenshots of the REAL rendered application.
 *
 * Drives the CRA dev server on :3098, which talks to the backend on :3099, which
 * is on the isolated accelerator_cert_dev database. Two fixture students:
 * a Week 6 one (the fence is closed) and a Week 11 one (open).
 *
 * Authenticates by writing the participant token straight into localStorage,
 * which is where portalApi's interceptor reads it from. That is the same key the
 * real login flow writes, so the app cannot tell the difference — no login form
 * is stubbed and no auth is bypassed.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = 'http://localhost:3098';
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const TOKENS = {
  week6: fs.readFileSync(path.join(__dirname,'tok_w6.txt'), 'utf8').trim(),
  week11: fs.readFileSync(path.join(__dirname,'tok_w11.txt'), 'utf8').trim(),
};

const results = [];

async function shot(page, name, note) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const errors = page.__errors || [];
  results.push({ name, file, note, consoleErrors: errors.length });
  console.log(`  saved ${name}.png${errors.length ? `  (${errors.length} console errors)` : ''}`);
}

async function asStudent(browser, token, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.__errors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.__errors.push(m.text()); });
  page.on('pageerror', (e) => page.__errors.push(String(e)));

  // Seed the token on the app origin, then navigate — same key the login writes.
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => localStorage.setItem('participant_token', t), token);
  console.log(`\n[${label}] authenticated`);
  return { context, page };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  // ── Week 6: the fence is closed ───────────────────────────────────────────
  {
    const { context, page } = await asStudent(browser, TOKENS.week6, 'week 6');
    await page.goto(`${APP}/portal/cert-prep`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await shot(page, '01-week6-locked', 'Week 6 — Cert Prep not yet open');

    const text = await page.evaluate(() => document.body.innerText);
    console.log(`  copy check: mentions Week 7 = ${/Week 7/i.test(text)}`);
    console.log(`  copy check: shows a score  = ${/\b\d{3}\b\s*(of|\/)\s*1000/i.test(text)}`);
    await context.close();
  }

  // ── Week 11: the dashboard ────────────────────────────────────────────────
  {
    const { context, page } = await asStudent(browser, TOKENS.week11, 'week 11');
    await page.goto(`${APP}/portal/cert-prep`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await shot(page, '02-week11-overview', 'Week 11 — readiness + domain overview');

    // Domain Map tab
    const domainsTab = page.locator('button.cp-tab', { hasText: 'Domain Map' });
    if (await domainsTab.count()) {
      await domainsTab.first().click();
      await page.waitForTimeout(1200);
      await shot(page, '03-domain-map', 'All five domains with official weights and objectives');
    }

    // Build Evidence tab
    const evidenceTab = page.locator('button.cp-tab', { hasText: 'Build Evidence' });
    if (await evidenceTab.count()) {
      await evidenceTab.first().click();
      await page.waitForTimeout(2000);
      await shot(page, '04-build-evidence', '30 objectives, none verified, each routed to a build');
    }

    // Practice → start a set, answer one question
    const practiceTab = page.locator('button.cp-tab', { hasText: 'Practice' });
    if (await practiceTab.count()) {
      await practiceTab.first().click();
      await page.waitForTimeout(800);
      await shot(page, '05-practice-choices', 'Practice options');

      const mixed = page.locator('button.cp-action', { hasText: 'Mixed practice' });
      if (await mixed.count()) {
        await mixed.first().click();
        await page.waitForTimeout(3500);
        await shot(page, '06-question-before-answer', 'A question — no answer key on screen');

        const bodyBefore = await page.evaluate(() => document.body.innerText);

        const option = page.locator('button.cp-option').first();
        if (await option.count()) {
          await option.click();
          await page.waitForTimeout(400);
          const submit = page.locator('button', { hasText: 'Submit answer' });
          if (await submit.count()) {
            await submit.first().click();
            await page.waitForTimeout(2500);
            await shot(page, '07-question-after-answer', 'Rationale revealed only after submitting');
          }
        }
        const bodyAfter = await page.evaluate(() => document.body.innerText);
        console.log(`  rationale hidden before answering = ${bodyBefore.length < bodyAfter.length}`);
      }
    }

    // Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${APP}/portal/cert-prep`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await shot(page, '08-mobile', 'Mobile viewport');

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(`  horizontal overflow on mobile = ${overflow}`);

    await context.close();
  }

  await browser.close();

  console.log('\n──── walkthrough summary ────');
  results.forEach((r) => console.log(`${r.name.padEnd(28)} ${r.consoleErrors} console errors  ${r.note}`));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\nscreenshots in ${OUT}`);
})();
