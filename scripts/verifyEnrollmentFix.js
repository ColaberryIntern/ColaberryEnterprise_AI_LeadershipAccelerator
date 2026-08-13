/**
 * verifyEnrollmentFix.js — one-off verification capture for the dead-enrollment-
 * funnel fix (b1c71248). Public, unauthenticated flow: no token needed.
 * Confirms cohorts populate and the Enroll submit button is no longer
 * hard-disabled, for the students who reported "registration failing".
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { createSafeContext, safeScreenshot, writeCaptureSummary } = require('./captureHelpers');

const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  __dirname, '..', 'docs', 'screenshots', `${new Date().toISOString().slice(0, 10)}-enrollment-fix-verify`
);

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await createSafeContext(browser, { token: null, label: 'safe' });
  const page = await ctx.newPage();
  const entries = [];

  try {
    await page.goto(`${BASE}/enroll`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500); // let the /api/cohorts fetch + render settle

    const r1 = await safeScreenshot(page, path.join(OUT_DIR, '01-enroll-page-loaded.png'), { fullPage: true });
    entries.push({ file: '01-enroll-page-loaded.png', ...r1, note: 'Initial /enroll load' });

    // Cohort options actually present in #cohort_id (the direct evidence the
    // funnel is no longer dead — this select was empty for 6 days per b1c71248).
    const cohortOptionTexts = await page.evaluate(() => {
      const s = document.querySelector('#cohort_id');
      if (!s) return null; // null = selector not found (loading/error state, not empty)
      return Array.from(s.options).map(o => o.textContent.trim()).filter(Boolean);
    });

    const submitDisabled = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[type="submit"]'));
      const submit = btns.find(b => /enroll|submit|continue|pay/i.test(b.textContent || ''));
      return submit ? submit.disabled : null;
    });

    console.log('COHORT_OPTIONS=' + JSON.stringify(cohortOptionTexts));
    console.log('SUBMIT_DISABLED=' + submitDisabled);

    fs.writeFileSync(path.join(OUT_DIR, 'dom_check.json'), JSON.stringify({
      url: `${BASE}/enroll`,
      captured_at: new Date().toISOString(),
      cohort_options: cohortOptionTexts,
      submit_button_disabled: submitDisabled,
    }, null, 2));

    // If a cohort selector exists, select the first real (non-placeholder) option
    // and screenshot the populated form — visual proof beyond the DOM dump.
    const select = await page.$('#cohort_id');
    if (select) {
      const values = await select.evaluate(el => Array.from(el.options).map(o => o.value));
      const firstReal = values.find(v => v);
      if (firstReal) {
        await select.selectOption(firstReal);
        await page.waitForTimeout(300);
        const r2 = await safeScreenshot(page, path.join(OUT_DIR, '02-cohort-selected.png'), { fullPage: true });
        entries.push({ file: '02-cohort-selected.png', ...r2, note: 'Cohort selected from the (now populated) dropdown' });
      }
    }
  } catch (err) {
    console.error('VERIFY_ERROR: ' + err.message);
    const rErr = await safeScreenshot(page, path.join(OUT_DIR, '99-error-state.png'), { fullPage: true }).catch(() => null);
    if (rErr) entries.push({ file: '99-error-state.png', ...rErr, note: 'Captured on error: ' + err.message });
  } finally {
    writeCaptureSummary(OUT_DIR, entries);
    await browser.close();
  }
})();
