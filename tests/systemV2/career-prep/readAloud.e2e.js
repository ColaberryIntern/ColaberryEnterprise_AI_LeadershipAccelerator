/**
 * Career Prep v27, CP5.8 (Ali 2026-11-21, option B): the read-aloud warm-up in a real browser (Edge), against the BUILT
 * app with the platform API answered from fixtures (fakeApi.js). Shares harness.js with the Release 1 suite.
 *
 * Checks:
 *   RA1 Record asks for the MICROPHONE ONLY (no camera), shows the line, the mic level moves, and nothing is recorded or
 *       uploaded before Go
 *   RA2 Go then Stop uploads ONE audio-only attempt carrying the line id, and the result shows the three parts (pace,
 *       smoothness, completeness), the one score, and that fillers, accent and pronunciation are never scored
 *   RA3 the scored warm-up fits a phone (390 wide): no horizontal scroll in the room's scroll containers, and no part
 *       label (Pace, Smoothness, Completeness) breaks mid-word
 *
 * The fake microphone is a real MediaStream from a Web Audio oscillator, so the level meter has something to hear.
 * Usage (repo root): node tests/systemV2/career-prep/readAloud.e2e.js, or runAll.js (env: see harness.js)
 */
const { BASE, check, newPage, tid, runSuite } = require('./harness');

const FAKE_MIC = `
  window.__gumCalls = [];
  const fakeVideoGum = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async (c) => {
    window.__gumCalls.push(JSON.stringify(c));
    if (c && c.audio && !c.video) {
      const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
      gain.gain.value = 0.8; osc.connect(gain); const dest = ctx.createMediaStreamDestination(); gain.connect(dest); osc.start();
      return dest.stream;
    }
    return fakeVideoGum(c);
  };
`;

async function toWarmUp(browser, viewport) {
  const { ctx, page, errors, api } = await newPage(browser, viewport ? { viewport } : {});
  await ctx.addInitScript(FAKE_MIC);
  page.setDefaultTimeout(8000);
  await page.goto(`${BASE}/portal/career/room`);
  await page.click(tid('cp-card-i1'));
  await page.click('[data-testid="cp-card-plan:days"]');
  await page.click(tid('cp-card-start'));
  await page.waitForSelector(tid('cp-session'));
  return { ctx, page, errors, api };
}

async function flowReadAloud(browser) {
  const errs = [];
  const { ctx, page, errors, api } = await toWarmUp(browser);
  try {
    await page.click(tid('cp-ra-record'));
    await page.waitForSelector(tid('cp-ra-line'));
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="cp-ra-level"]')?.getAttribute('aria-valuenow')) > 0, null, { timeout: 4000 }).catch(() => undefined);
    const armed = await page.evaluate(() => ({
      gum: window.__gumCalls, line: document.querySelector('[data-testid="cp-ra-line"]')?.textContent,
      level: Number(document.querySelector('[data-testid="cp-ra-level"]')?.getAttribute('aria-valuenow')),
      go: !!document.querySelector('[data-testid="cp-ra-go"]'), camera: !!document.querySelector('[data-testid="cp-try"] video'),
    }));
    check('RA1 Record asks for the microphone only, shows the line, the mic level moves, nothing uploaded before Go',
      armed.gum.length === 1 && /"audio":true/.test(armed.gum[0]) && /"video":false/.test(armed.gum[0]) && /^The problem was simple/.test(armed.line || '')
        && armed.level > 0 && armed.go && !armed.camera && api.state.readAloudUploads.length === 0, JSON.stringify({ ...armed, uploads: api.state.readAloudUploads.length }));
    await page.click(tid('cp-ra-go'));
    await page.click(tid('cp-ra-stop'));
    await page.waitForSelector(tid('cp-ra-result'), { timeout: 10000 });
    const done = await page.evaluate(() => ({
      score: document.querySelector('[data-testid="cp-ra-score"]')?.textContent,
      parts: ['pace', 'smoothness', 'completeness'].map((k) => !!document.querySelector(`[data-testid="cp-ra-part-${k}"]`)),
      never: /Filler words, accent and pronunciation are never scored/.test(document.querySelector('[data-testid="cp-ra-result"]')?.textContent || ''),
    }));
    const up = api.state.readAloudUploads;
    check('RA2 Go then Stop uploads ONE audio-only attempt with the line id; the three parts, the score and "never scored" show',
      up.length === 1 && up[0].lineId === 'ra-02' && up[0].audio && !up[0].video && done.score === '91' && done.parts.every(Boolean) && done.never,
      JSON.stringify({ up, done }));
  } catch (e) {
    check('RA1/RA2 the read-aloud flow ran', false, String(e && e.message).split('\n')[0].slice(0, 200));
  }
  errs.push(...errors);
  await ctx.close();
  return errs;
}

async function flowPhone(browser) {
  const { ctx, page, errors } = await toWarmUp(browser, { width: 390, height: 844 });
  try {
    await page.click(tid('cp-ra-record'));
    await page.click(tid('cp-ra-go'));
    await page.click(tid('cp-ra-stop'));
    await page.waitForSelector(tid('cp-ra-result'), { timeout: 10000 });
    const wide = await page.evaluate(() => [document.documentElement, ...document.querySelectorAll('.cp-room *')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)).map((el) => el.className).slice(0, 3)
      .concat(document.documentElement.scrollWidth > innerWidth + 1 ? ['page'] : []));
    const labels = await page.evaluate(() => [...document.querySelectorAll('.cp-ra-name')].map((el) => {
      const r = document.createRange(); r.selectNodeContents(el);
      return { text: el.textContent, lines: new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size, clipped: el.scrollWidth > el.clientWidth + 1 };
    }));
    check('RA3 the scored warm-up fits a phone (390): no horizontal scroll, no part label broken mid-word',
      wide.length === 0 && labels.length === 3 && labels.every((l) => l.lines === 1 && !l.clipped), JSON.stringify({ wide, labels }));
  } catch (e) {
    check('RA3 the phone read-aloud ran', false, String(e && e.message).split('\n')[0].slice(0, 200));
  }
  await ctx.close();
  return errors;
}

runSuite(4, async (browser) => {
  const errs = [...await flowReadAloud(browser), ...await flowPhone(browser)];
  check('RA4 zero console errors in the read-aloud flows', errs.length === 0, errs.slice(0, 3).join(' | '));
});
