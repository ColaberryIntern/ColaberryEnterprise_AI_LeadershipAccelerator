/**
 * Which published detail page actually DRAWS the architecture diagram?
 *
 * The API serves `architecture.diagramSource` on all three surfaces, so any page that does not
 * show a chart is dropping it in its own renderer, not missing the data.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const SLUG = 'your-repositories-already-wrote-your-resume';
const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i > -1 ? process.argv[i + 1] : path.join(__dirname, '..', 'docs', 'screenshots', 'r2r-diagram');
})();

const STOPS = [
  ['enterprise', `https://enterprise.colaberry.ai/stories/${SLUG}`],
  ['training', `https://training.colaberry.com/student-projects/${SLUG}`],
  ['ai-flotation', `https://aiflotation.com/results/${SLUG}`],
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [name, url] of STOPS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message.slice(0, 120)));
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    } catch (e) { problems.push('nav: ' + e.message.split('\n')[0]); }
    await page.waitForTimeout(6000);

    const r = await page.evaluate(() => {
      const txt = document.body.innerText || '';
      const svgs = Array.from(document.querySelectorAll('svg'));
      const mermaidSvg = svgs.filter((s) => (s.id || '').toLowerCase().includes('mermaid')
        || (s.getAttribute('aria-roledescription') || '').includes('flowchart')
        || /flowchart|mermaid/i.test(s.className.baseVal || ''));
      const pres = Array.from(document.querySelectorAll('pre, code'))
        .filter((p) => /flowchart TD/.test(p.textContent || ''));
      return {
        mentionsFlowchartText: /flowchart TD/.test(txt),
        mermaidSvgCount: mermaidSvg.length,
        biggestMermaidSvg: mermaidSvg.length
          ? Math.max(...mermaidSvg.map((s) => s.getBoundingClientRect().height | 0)) : 0,
        rawSourceInPre: pres.length,
        hasArchitectureHeading: /architecture|what was built/i.test(txt),
        totalSvgs: svgs.length,
      };
    });
    console.log(JSON.stringify({ surface: name, ...r, problems: problems.slice(0, 3) }));
    await page.screenshot({ path: path.join(OUT, `${name}-detail.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => { console.error('CHECK_FAILED', e.message); process.exit(1); });
