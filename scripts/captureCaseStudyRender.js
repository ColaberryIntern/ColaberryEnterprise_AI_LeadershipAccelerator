/**
 * captureCaseStudyRender.js — photograph a published Case Study page as a reader sees it.
 *
 * WHY THIS EXISTS. On 2026-11-05 a record passed every snapshot-level audit and still
 * rendered four of its most visible sections as nothing, because the projection drops a
 * section authored against the wrong shape SILENTLY. The API tells you a section is
 * populated; only a picture tells you the page is worth looking at. This is the step that
 * was missing.
 *
 * Routes every capture through scripts/captureHelpers.js, so no PNG can exceed the
 * MAX_SAFE_WIDTH ceiling that once killed a session. The full-page image is then sliced
 * into readable vertical segments, because a 12,000px-tall screenshot is unreadable
 * whatever its width.
 *
 * Usage:
 *   node scripts/captureCaseStudyRender.js <url> <outDir> [--segment-height=1500]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { chromium } = require('playwright');
const {
  createSafeContext, boundedFullPage, writeCaptureSummary, SAFE_VIEWPORT,
} = require('./captureHelpers');

const ARGS = process.argv.slice(2);
const URL = ARGS.find((a) => a.startsWith('http'));
const OUT_DIR = ARGS.find((a) => !a.startsWith('http') && !a.startsWith('--'));
const SEGMENT_HEIGHT = Number(
  (ARGS.find((a) => a.startsWith('--segment-height=')) || '').split('=')[1] || 1500,
);
const SEGMENT_WIDTH = 1100;

if (!URL || !OUT_DIR) {
  console.error('Usage: node scripts/captureCaseStudyRender.js <url> <outDir> [--segment-height=N]');
  process.exit(1);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await createSafeContext(browser, { viewport: SAFE_VIEWPORT });
  const page = await context.newPage();

  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`));

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  // The page is a single-page app: wait for real text, not just the shell.
  await page.waitForFunction(
    () => document.body && document.body.innerText.trim().length > 800,
    { timeout: 60000 },
  ).catch(() => console.warn('[capture] body text stayed thin; capturing anyway'));
  // Let lazy sections settle and any entrance animation finish at rest.
  await page.waitForTimeout(2500);

  // SCROLL THE WHOLE PAGE BEFORE CAPTURING. The figure bands render their images with
  // loading="lazy", so a fullPage screenshot taken without scrolling photographs empty
  // frames under real captions and looks exactly like a data fault. Walk to the bottom in
  // viewport steps, then wait for every <img> to report complete.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 220));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => {
    const imgs = Array.from(document.images);
    return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }, { timeout: 45000 }).catch(() => console.warn('[capture] some images never completed'));
  await page.waitForTimeout(1200);

  const imageReport = await page.evaluate(() => Array.from(document.images)
    .map((i) => ({ ok: i.complete && i.naturalWidth > 0, src: (i.currentSrc || i.src).slice(-58) }))
    .filter((x) => !x.ok));
  if (imageReport.length) {
    console.warn(`[capture] ${imageReport.length} image(s) did not load:`);
    imageReport.forEach((x) => console.warn(`   ! ${x.src}`));
  } else {
    console.log('[capture] every image on the page loaded');
  }

  const full = path.join(OUT_DIR, 'full.png');
  const res = await boundedFullPage(page, full, { label: 'safe' });

  const meta = await sharp(full).metadata();
  console.log(`[capture] full page ${meta.width}x${meta.height}`);

  // Slice into readable segments, downscaled to SEGMENT_WIDTH.
  const scale = SEGMENT_WIDTH / meta.width;
  const scaledHeight = Math.round(meta.height * scale);
  const scaled = path.join(OUT_DIR, 'scaled.png');
  await sharp(full).resize(SEGMENT_WIDTH, scaledHeight).toFile(scaled);

  const entries = [{ file: 'full.png', ...res }];
  const count = Math.ceil(scaledHeight / SEGMENT_HEIGHT);
  for (let i = 0; i < count; i += 1) {
    const top = i * SEGMENT_HEIGHT;
    const height = Math.min(SEGMENT_HEIGHT, scaledHeight - top);
    const file = `segment-${String(i + 1).padStart(2, '0')}.png`;
    await sharp(scaled)
      .extract({ left: 0, top, width: SEGMENT_WIDTH, height })
      .toFile(path.join(OUT_DIR, file));
    entries.push({ file, originalWidth: meta.width, finalWidth: SEGMENT_WIDTH, downscaled: true });
    console.log(`[capture] ${file}  ${SEGMENT_WIDTH}x${height}`);
  }

  // What the reader would see as empty: a heading with nothing under it.
  const emptyHeadings = await page.evaluate(() => {
    const out = [];
    for (const h of document.querySelectorAll('h1,h2,h3')) {
      const text = (h.innerText || '').trim();
      if (!text) continue;
      let next = h.nextElementSibling;
      let seen = '';
      while (next && !/^H[123]$/.test(next.tagName)) {
        seen += (next.innerText || '').trim();
        if (seen.length > 20) break;
        next = next.nextElementSibling;
      }
      if (seen.trim().length < 20) out.push(text.slice(0, 70));
    }
    return out;
  });

  writeCaptureSummary(OUT_DIR, entries);
  fs.writeFileSync(
    path.join(OUT_DIR, 'render-report.json'),
    `${JSON.stringify({
      url: URL, fullWidth: meta.width, fullHeight: meta.height,
      segments: count, emptyHeadings, consoleProblems: problems.slice(0, 10),
    }, null, 2)}\n`,
  );

  console.log(`\n[capture] headings with nothing under them: ${emptyHeadings.length}`);
  emptyHeadings.forEach((h) => console.log(`   - ${h}`));
  console.log(`[capture] console errors: ${problems.length}`);
  problems.slice(0, 6).forEach((p) => console.log(`   ! ${p}`));

  await browser.close();
}

main().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
