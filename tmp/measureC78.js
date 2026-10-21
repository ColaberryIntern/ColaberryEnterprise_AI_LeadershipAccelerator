/**
 * Measure the C7.8 one-pager against the real usable page, and say WHERE it overflows.
 *
 * The build refuses at 2 pages but cannot say by how much. Letter portrait at a 14mm
 * margin leaves 710 x 950 CSS pixels, so this renders at that width and reports the
 * height of every section - which turns "cut something" into "cut this".
 */
const path = require('path');
const { chromium } = require('playwright');
const R = require(path.join(__dirname, '..', 'scripts', 'artifacts', 'tickets', 'c78c79Render'));

const W = 710;
// Letter portrait is 11in = 1056px at 96dpi; two 14mm margins take 106px, leaving 950.
// An earlier 940 here was a guess on the safe side, which made a passing page look like
// it was 3px over and nearly cost a round of pointless trimming.
const H = 950;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(R.buildC78OnePager(), { waitUntil: 'networkidle' });

  // NOT scrollHeight: with a 940px viewport it never reports less than 940, so it can
  // show overflow but cannot tell "fits exactly" from "fits with room to spare". The
  // bottom edge of the last element is the real content height.
  const total = await page.evaluate(() => {
    const kids = [...document.body.children];
    if (!kids.length) return 0;
    return Math.ceil(Math.max(...kids.map((n) => n.getBoundingClientRect().bottom)));
  });
  const sections = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('h1, h2').forEach((h) => {
      let px = 0;
      let n = h.nextElementSibling;
      while (n && !/^H[12]$/.test(n.tagName)) { px += n.getBoundingClientRect().height; n = n.nextElementSibling; }
      out.push({ heading: h.textContent.trim().slice(0, 46), px: Math.round(px + h.getBoundingClientRect().height) });
    });
    return out;
  });

  console.log(`total ${total}px against ${H}px usable  (over by ${Math.max(0, total - H)}px)\n`);
  for (const s of sections) console.log(`  ${String(s.px).padStart(5)}px  ${s.heading}`);
  await browser.close();
})();
