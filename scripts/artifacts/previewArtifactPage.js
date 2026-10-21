/**
 * Render an artifact page to a PNG at its REAL page box, and audit it, before building the PDF.
 *
 * ## Why this exists
 *
 * `renderArtifactPdf` enforces a page limit by counting `/Type /Page` in the emitted bytes and
 * throwing. That is the right gate, but it tells you only THAT the page overflowed, never by how
 * much or which block did it, so fitting a dense one-pager becomes guess, rebuild, guess again.
 *
 * Building AF10.2's one-pager took five rebuilds for exactly that reason, and the first four were
 * spent on a wrong number. The preview used 1754x1240 ("A4 landscape at 150dpi") and reported the
 * page as 60 percent empty. **That was the preview being wrong, not the page.** Chromium lays a
 * PDF out in CSS pixels at 96dpi, so A4 landscape minus 9mm margins is 1054x726. A 1240px-tall
 * viewport invents 500px of room the page does not have.
 *
 * The damage was not cosmetic: a nearly full page looked half empty, so content was ADDED, and the
 * build then threw at two pages. Once the preview matched the page box, its measurement agreed
 * with the build every time.
 *
 * **A preview that is not the real surface is not verification.**
 *
 * ## Two things it reports that a page-count gate cannot
 *
 * 1. A per-block height budget, so you cut the block that is actually costing you the page rather
 *    than shaving margins at random.
 * 2. A containment audit: content wider than its own box, or sticking out past the page. This
 *    catches the pill-overflowing-its-own-box failure that a page-width check passes, because the
 *    box is nowhere near the page edge.
 *
 * ## What it still cannot do
 *
 * It cannot tell you the page looks wrong. On AF10.2 it reported zero problems for a layout whose
 * left column dead-ended 350px above its neighbors, and whose "Before" value of zero rendered as a
 * 1px sliver because it was drawn with a bar chart. Both were obvious on sight and invisible to
 * every check. **Look at the PNG.** This tool exists to make looking cheap, not to replace it.
 *
 * Usage:
 *   const { previewPage } = require('./previewArtifactPage');
 *   const r = await previewPage({ html: R.buildVisual(), outPath: 'preview.png',
 *                                 landscape: true, marginMm: 9 });
 *   if (!r.fits) process.exit(1);
 */
const { chromium } = require('playwright');

/** Chromium lays out print in CSS pixels at 96dpi. This is the conversion, not a guess. */
const MM_TO_PX = 96 / 25.4;

/** A4, the only size `renderArtifactPdf` emits. */
const A4_MM = { w: 210, h: 297 };

/** Screenshot width ceiling. A wider PNG has made a session unrecoverable here before. */
const MAX_PNG_WIDTH = 1800;

/**
 * The real page box in CSS pixels.
 *
 * Note the deliberate 2px safety margin on the reported budget: Chromium's PRINT layout has
 * slightly less usable height than the same box measured on screen, so a page measuring exactly
 * equal to the box still paginates. Leave headroom rather than trimming to the boundary.
 */
function pageBox({ landscape = false, marginMm = 14 }) {
  const w = landscape ? A4_MM.h : A4_MM.w;
  const h = landscape ? A4_MM.w : A4_MM.h;
  return {
    width: Math.round((w - marginMm * 2) * MM_TO_PX),
    height: Math.round((h - marginMm * 2) * MM_TO_PX),
    safeHeight: Math.round((h - marginMm * 2) * MM_TO_PX) - 2,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.html       the page, exactly as it will be handed to renderPdf
 * @param {string} opts.outPath    where to write the PNG
 * @param {boolean} opts.landscape must match what renderPdf is given
 * @param {number} opts.marginMm   must match what renderPdf is given
 * @param {boolean} opts.quiet     suppress the console report
 * @returns {Promise<{fits:boolean, contentHeight:number, pageHeight:number,
 *                    overflowBy:number, problems:Array, budget:Array, outPath:string}>}
 */
async function previewPage({ html, outPath, landscape = false, marginMm = 14, quiet = false }) {
  const box = pageBox({ landscape, marginMm });
  const scale = Math.max(1, Math.min(2, MAX_PNG_WIDTH / box.width));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: box.width, height: box.height },
      deviceScaleFactor: scale,
    });
    await page.setContent(html, { waitUntil: 'networkidle' });

    // Same assertion renderArtifactPdf makes: a mermaid block that produced no SVG means the
    // diagram is silently absent, and the page still looks finished.
    await page.waitForFunction(() => {
      const els = document.querySelectorAll('.mermaid');
      return els.length === 0 || Array.from(els).every((e) => e.querySelector('svg'));
    }, null, { timeout: 30000 });

    const budget = await page.evaluate(() => Array.from(document.body.children).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: el.className.toString().slice(0, 24),
        height: Math.round(r.height),
        top: Math.round(r.top),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44),
      };
    }));

    const problems = await page.evaluate(() => {
      const bad = [];
      const docW = document.documentElement.scrollWidth;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.tagName !== 'svg' && el.closest('svg') === null
            && el.scrollWidth > el.clientWidth + 2
            && getComputedStyle(el).overflow === 'visible') {
          bad.push({ why: 'content wider than its own box', tag: el.tagName,
            cls: el.className.toString().slice(0, 24),
            text: (el.textContent || '').trim().slice(0, 60) });
        }
        if (r.right > docW + 2) {
          bad.push({ why: 'sticks out past the page', tag: el.tagName,
            cls: el.className.toString().slice(0, 24),
            text: (el.textContent || '').trim().slice(0, 60) });
        }
      }
      return bad.slice(0, 15);
    });

    // NOT scrollHeight. `document.documentElement.scrollHeight` never reports less than the
    // viewport, so for any page that actually fits it returns the viewport height and this tool
    // would cry overflow at a page with room to spare -- sending you to cut content that did not
    // need cutting, which is the exact failure it exists to prevent. Measure the bottom edge of
    // the real content instead, and fall back to scrollHeight only when that is larger.
    const contentHeight = await page.evaluate(() => {
      let bottom = 0;
      for (const el of document.body.children) {
        // mermaid injects a zero-height tooltip host at the end; it is not content.
        if (el.className && el.className.toString().includes('mermaidTooltip')) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0) continue;
        bottom = Math.max(bottom, r.bottom);
      }
      return Math.max(Math.ceil(bottom), 0) || document.documentElement.scrollHeight;
    });
    const overflowBy = contentHeight - box.safeHeight;
    const fits = overflowBy <= 0;

    // Clipped to the page box, NOT fullPage: what the PDF's first page will actually show.
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, ...box } });

    if (!quiet) {
      console.log(`page box ${box.width}x${box.height} css px `
        + `(A4 ${landscape ? 'landscape' : 'portrait'}, ${marginMm}mm margins), png scale ${scale.toFixed(2)}`);
      console.log('\nheight budget by top-level block:');
      for (const b of budget) {
        console.log(`  ${String(b.height).padStart(4)}px  top=${String(b.top).padStart(4)}  `
          + `<${b.tag} ${b.cls}>  ${b.text}`);
      }
      console.log(`\ncontainment problems: ${problems.length}`);
      for (const p of problems) console.log(`  ${p.why}: <${p.tag} ${p.cls}> "${p.text}"`);
      console.log(`\ncontent ${contentHeight}px vs usable ${box.safeHeight}px -> `
        + (fits ? `fits, ${-overflowBy}px to spare` : `OVERFLOWS BY ${overflowBy}px, WILL PAGINATE`));
      console.log(`\nwrote ${outPath}`);
      console.log('NOW LOOK AT IT. Every check above passed a page that was visibly wrong at least once.');
    }

    return { fits, contentHeight, pageHeight: box.safeHeight, overflowBy, problems, budget, outPath };
  } finally {
    await browser.close();
  }
}

module.exports = { previewPage, pageBox, MM_TO_PX, MAX_PNG_WIDTH };
