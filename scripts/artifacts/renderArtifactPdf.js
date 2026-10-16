/**
 * HTML -> PDF for ticket artifacts, with the two checks that stop a finished-looking lie.
 *
 * ## Check 1: the page count is MEASURED, never computed
 *
 * Ali's rule is that an important visual gets its own PDF of at most ONE page. "One page" is a
 * property of the rendered output, not of the author's intention: a table one row too long, a font
 * that falls back, a margin rounded up, and a one-page design silently becomes two. So the page
 * count is read back out of the PDF bytes after rendering, and `maxPages` is enforced by throwing.
 *
 * This is the same discipline as measuring a delivered video with ffprobe instead of adding up the
 * clip lengths: the renderer is allowed to disagree with the plan, and it usually wins.
 *
 * ## Check 2: a Mermaid diagram that did not render is a hard failure
 *
 * Mermaid needs a layout engine, so unlike the SVG charts it cannot be a pure function. If its
 * script does not load, `<div class="mermaid">graph TD...</div>` renders as the literal source
 * text -- or as nothing -- and the PDF still looks complete. Every mermaid block must have become
 * an `<svg>` before a PDF is emitted, or this throws.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/** Pinned, because an artifact rendered six months from now should look the same. */
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';

/** Count pages by reading the PDF's own object types. The only answer that is not a guess. */
function countPdfPages(buf) {
  const raw = buf.toString('latin1');
  // `/Type /Page` with a non-`s` follower, so `/Type /Pages` (the tree node) is not counted.
  const byType = (raw.match(/\/Type\s*\/Page(?![s])/g) || []).length;
  if (byType > 0) return byType;
  // Chromium always writes /Type /Page, so a zero here means the file is not a PDF we understand.
  throw new Error('could not determine the page count — refusing to vouch for this PDF');
}

const MERMAID_BOOT = `
  window.__mermaidState = 'pending';
  (async () => {
    try {
      if (!document.querySelector('.mermaid')) { window.__mermaidState = 'none'; return; }
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = ${JSON.stringify(MERMAID_CDN)};
        s.onload = res; s.onerror = () => rej(new Error('mermaid script failed to load'));
        document.head.appendChild(s);
      });
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'strict',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        themeVariables: {
          primaryColor: '#FFF0F1', primaryBorderColor: '#FB2832', primaryTextColor: '#2d3748',
          lineColor: '#718096', fontSize: '13px',
          secondaryColor: '#f7fafc', tertiaryColor: '#ffffff',
        },
      });
      await window.mermaid.run({ querySelector: '.mermaid' });
      window.__mermaidState = 'done';
    } catch (e) {
      window.__mermaidState = 'error: ' + e.message;
    }
  })();
`;

/**
 * Render one PDF.
 *
 * @param {string} html      full document HTML
 * @param {string} outPath   where to write
 * @param {boolean} landscape
 * @param {number} maxPages  throw if the rendered PDF exceeds this
 * @param {string} margin    CSS length for all four margins
 */
async function renderPdf({ html, outPath, landscape = false, maxPages = 0, margin = '14mm' }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // `domcontentloaded` rather than `load`: nothing here depends on external images, and waiting
    // on `load` with a blocked CDN would hang instead of failing with a readable message.
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: MERMAID_BOOT });

    const state = await page.waitForFunction(
      () => (window.__mermaidState !== 'pending' ? window.__mermaidState : null),
      { timeout: 30000 },
    ).then((h) => h.jsonValue());

    if (String(state).startsWith('error')) {
      throw new Error(`mermaid did not render (${state}) — refusing to emit a PDF with a `
        + 'diagram-shaped hole in it');
    }
    if (state === 'done') {
      // Trust the DOM, not the promise: assert every block actually became an svg.
      const unrendered = await page.$$eval('.mermaid', (els) =>
        els.filter((el) => !el.querySelector('svg')).length);
      if (unrendered > 0) {
        throw new Error(`${unrendered} mermaid block(s) produced no <svg> — refusing to emit`);
      }
    }
    await page.emulateMedia({ media: 'print' });

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const buf = await page.pdf({
      format: 'Letter',
      landscape,
      printBackground: true,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
    });

    const pages = countPdfPages(buf);
    if (maxPages && pages > maxPages) {
      throw new Error(
        `${path.basename(outPath)} rendered ${pages} pages, limit is ${maxPages}. `
        + 'Not written. Cut content rather than raising the limit — the limit is the deliverable.',
      );
    }
    fs.writeFileSync(outPath, buf);
    return { outPath, pages, bytes: buf.length, mermaid: state };
  } finally {
    await browser.close();
  }
}

/** Wrap body markup in a complete document with the shared stylesheet. */
function htmlDoc({ title, css, body }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title><style>${css}</style></head><body>${body}</body></html>`;
}

module.exports = { renderPdf, htmlDoc, countPdfPages };
