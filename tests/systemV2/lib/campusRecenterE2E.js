/**
 * C23 fidelity hygiene: the recenter rules R2-R5 and R7-R11 in a real browser (CAMPUS_DESIGN_PARITY_PROMPT.md 2.1).
 *
 * Each rule: move the camera well away from the whole campus (zoom in twice, drag 300 px), fire the rule's event, wait
 * 1.6 s, and the map's viewBox must be the whole campus again within 1 world unit. R1 and R6 are fidelity views 13 and 14.
 * Camera behavior does not depend on the audience, so one member account runs it (reduce motion on: moves are instant).
 *
 * Called from campus.e2e.js (which owns the stack checks, the step log and newPage); kept here because that file is over
 * the size ceiling.
 */
const VB = "document.querySelector('svg.cm-map.has-camera').getAttribute('viewBox')";
const SETTLE = 1600;

const parse = (s) => String(s || '').split(' ').map(Number);
const same = (a, b) => a.length === 4 && b.length === 4 && a.every((v, i) => Math.abs(v - b[i]) <= 1);

async function viewBox(page) { return parse(await page.evaluate(VB)); }

async function openHome(page, base) {
  await page.goto(`${base}/portal/campus`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="cm-home"] svg.cm-map.has-camera', { timeout: 30_000 });
  await page.waitForTimeout(SETTLE);
  return viewBox(page);
}

/** Zoom in twice and drag 300 px, then prove the camera really moved (a rule that passes without moving proves nothing). */
async function disturb(page, must, base) {
  await page.click('[data-testid="cm-zoom-in"]');
  await page.click('[data-testid="cm-zoom-in"]');
  await page.evaluate(() => {
    const s = document.querySelector('svg.cm-map.has-camera');
    s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 400 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 800, clientY: 400 }));
    window.dispatchEvent(new PointerEvent('pointerup', {}));
  });
  await page.waitForTimeout(400);
  must(!same(await viewBox(page), base), 'the camera did not move away from the whole campus before the rule fired');
}

async function backAtBase(page, must, base, rule) {
  await page.waitForTimeout(SETTLE);
  const now = await viewBox(page);
  must(same(now, base), `${rule}: viewBox ${now.join(' ')} is not the whole campus ${base.join(' ')}`);
}

async function tapBuilding(page, id) {
  await page.click(`.cm-home g[data-building="${id}"]`);
  await page.waitForSelector(`[data-testid="cm-card"][data-building="${id}"]`, { timeout: 15_000 });
}

/** The ten rules, as steps on one desktop page and one phone page. */
async function runRecenter({ browser, audience, jwt, urls, step, must, newPage }) {
  const { page, context, errors } = await newPage(browser, jwt);
  const B = urls.base;
  let base = null;
  try {
    await step(audience, 'R3 recenter: Esc with a card open', async () => {
      base = await openHome(page, B);
      await disturb(page, must, base);
      await tapBuilding(page, 'library');
      await page.keyboard.press('Escape');
      await backAtBase(page, must, base, 'R3');
    });
    await step(audience, 'R2 recenter: Step outside inside a room', async () => {
      await disturb(page, must, base);
      await tapBuilding(page, 'library');
      await page.click('[data-testid="cm-inside-out"]');
      // stepping out of the room returns to the card; closing the last card is the return to the campus
      if (await page.locator('[data-testid="cm-card"]').count()) await page.click('[data-testid="cm-arrive-back"]');
      await backAtBase(page, must, base, 'R2');
    });
    await step(audience, 'R4 recenter: finishing the tour', async () => {
      await disturb(page, must, base);
      await page.click('[data-testid="cm-concierge"] [data-testid="cm-cc-tour-start"]');
      await page.waitForSelector('[data-testid="cm-card"] [data-testid="cm-tour"]', { timeout: 15_000 });
      for (let i = 0; i < 14; i += 1) {
        const label = (await page.locator('[data-testid="cm-tour-next"]').textContent()) || '';
        await page.click('[data-testid="cm-tour-next"]');
        if (!label.startsWith('Next:')) break;
        await page.waitForSelector(`[data-testid="cm-card"] [data-testid="cm-tour"][data-stop="${i + 2}"]`, { timeout: 15_000 });
      }
      await page.waitForSelector('[data-testid="cm-card"]', { state: 'detached', timeout: 15_000 });
      await backAtBase(page, must, base, 'R4');
    });
    for (const [name, open, close] of [
      ['the Wayfinder', '[data-testid="cm-topbar-search"]', 'Escape'],
      ['the list', '[data-testid="cm-topbar-list"]', 'Escape'],
      ['the Me panel', '[data-testid="cm-stats-me"]', 'Escape'],
      ['the bell', '[data-testid="cm-stats-bell"] button', '[data-testid="cm-stats-bell"] button'],
      ['the inbox', '[data-testid="cm-stats-messages"]', 'Escape'], // C23 phase 3
    ]) {
      await step(audience, `R10 recenter: closing ${name}`, async () => {
        await disturb(page, must, base);
        await page.click(open);
        await page.waitForTimeout(400);
        if (close === 'Escape') await page.keyboard.press('Escape'); else await page.click(close);
        await backAtBase(page, must, base, `R10 (${name})`);
      });
    }
    await step(audience, 'R11 recenter: the tab is visible again', async () => {
      await disturb(page, must, base);
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await backAtBase(page, must, base, 'R11');
    });
    await step(audience, 'R8 recenter: coming back to /portal/campus from a page', async () => {
      await disturb(page, must, base);
      await page.goto(`${B}/portal/library`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="cm-locbar"]', { timeout: 30_000 });
      await page.goto(`${B}/portal/campus`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="cm-home"] svg.cm-map.has-camera', { timeout: 30_000 });
      await backAtBase(page, must, base, 'R8');
    });
    await step(audience, 'R5 recenter: a resize re-bases the whole campus', async () => {
      await disturb(page, must, base);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(SETTLE);
      const after = await viewBox(page);
      const fresh = await openHome(page, B); // the whole campus at the new size, measured from a clean load
      must(same(after, fresh), `R5: after the resize the viewBox is ${after.join(' ')}, the whole campus at 1280x800 is ${fresh.join(' ')}`);
      await page.setViewportSize({ width: 1440, height: 900 });
    });
    await step(audience, 'R9 recenter: entering through the gate ends on the whole campus', async () => {
      // its own context: newPage's init script marks the gate seen on every load, so the gate would never show
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        await ctx.addInitScript(([t]) => {
          localStorage.setItem('participant_token', t);
          localStorage.setItem('colaberry.campus.settings.v1', JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
        }, [jwt]);
        const g = await ctx.newPage();
        await g.goto(`${B}/portal/campus`, { waitUntil: 'domcontentloaded' });
        const gate = await g.waitForSelector('[data-testid="cm-gate-enter"]', { timeout: 30_000 }).catch(() => null);
        must(!!gate, 'the gate did not show on a first visit');
        await g.click('[data-testid="cm-gate-enter"]');
        await g.waitForSelector('[data-testid="cm-home"] svg.cm-map.has-camera', { timeout: 30_000 });
        await backAtBase(g, must, base, 'R9');
      } finally {
        await ctx.close();
      }
    });
    await step(audience, 'recenter steps raise no page errors', async () => { must(errors.length === 0, errors.slice(0, 3).join(' | ')); });
  } finally {
    await context.close();
  }

  const phone = await newPage(browser, jwt, { width: 390, height: 844 });
  try {
    await step(audience, 'R7 recenter: the phone tab bar Map button', async () => {
      const pbase = await openHome(phone.page, B);
      await tapBuilding(phone.page, 'library');
      await phone.page.waitForTimeout(400);
      must(!same(await viewBox(phone.page), pbase), 'opening a card did not move the phone camera');
      await phone.page.click('nav.cm-tabbar > button.cm-tab'); // the one button in the tab bar is Map
      await backAtBase(phone.page, must, pbase, 'R7');
    });
  } finally {
    await phone.context.close();
  }
}

module.exports = { runRecenter };
