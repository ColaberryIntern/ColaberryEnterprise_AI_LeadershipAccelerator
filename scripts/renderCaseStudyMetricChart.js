/**
 * Render a Case Study's own measured metrics to a PNG chart.
 *
 * WHY. The readiness rubric wants two publicly viewable images and warns that one
 * leaves the page "a wall of text". The dishonest fix is a stock photograph; the
 * honest one is a picture OF THE DATA. Every number drawn here is read from the
 * record's approved snapshot, so the chart cannot say anything the record does not.
 *
 * It draws no axis it cannot justify and invents no trend: these are counts from one
 * commit, so they are drawn as counts, not as a line implying change over time.
 *
 * Usage: node scripts/renderCaseStudyMetricChart.js --in <metrics.json> --out <file.png> --title "..."
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const IN = argOf('--in', null);
const OUT = argOf('--out', null);
const TITLE = argOf('--title', 'What the change was made of');
if (!IN || !OUT) { console.error('need --in <metrics.json> --out <file.png>'); process.exit(1); }

const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const bars = JSON.parse(fs.readFileSync(IN, 'utf8'));
const max = Math.max(...bars.map((b) => b.value));

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{--bg:#F8F8F7;--card:#fff;--fg:#1A1A1A;--muted:#6B6B6B;--accent:#2E6A86;--soft:#EAF2F6;--line:#D8D8D8}
  body{margin:0;background:var(--bg);font-family:Roboto,system-ui,sans-serif;color:var(--fg)}
  #wrap{display:inline-block;padding:40px 44px;background:var(--bg);width:820px;box-sizing:border-box}
  h1{font-size:24px;font-weight:700;letter-spacing:-.02em;margin:0 0 4px}
  .sub{font-size:13px;color:var(--muted);margin:0 0 30px}
  .row{display:grid;grid-template-columns:210px 1fr 96px;align-items:center;gap:16px;
       padding:13px 0;border-bottom:1px solid var(--line)}
  .row:last-child{border-bottom:0}
  .lab{font-size:14px}
  .lab small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}
  .track{height:16px;background:var(--soft);border-radius:3px;overflow:hidden}
  .fill{height:100%;background:var(--accent);border-radius:3px}
  .fill.alt{background:#8FB8C8}
  .val{text-align:right;font-weight:700;font-size:17px;font-variant-numeric:tabular-nums}
  .foot{margin-top:26px;font-size:11.5px;color:var(--muted);line-height:1.7;
        border-top:1px solid var(--line);padding-top:14px}
</style></head><body><div id="wrap">
<h1>${esc(TITLE)}</h1>
<p class="sub">Counts from one commit. Not a trend, and not a comparison with anything else.</p>
${bars.map((b) => `<div class="row">
  <div class="lab">${esc(b.label)}${b.note ? `<small>${esc(b.note)}</small>` : ''}</div>
  <div class="track"><div class="fill${b.alt ? ' alt' : ''}" style="width:${Math.round((b.value / max) * 100)}%"></div></div>
  <div class="val">${esc(b.display || b.value)}</div>
</div>`).join('')}
<div class="foot">${esc(argOf('--foot', ''))}</div>
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await p.locator('#wrap').screenshot({ path: OUT });
  await browser.close();
  console.log(`rendered ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB) from ${bars.length} measured values`);
})().catch((e) => { console.error('RENDER_FAILED', e && e.message); process.exit(1); });
