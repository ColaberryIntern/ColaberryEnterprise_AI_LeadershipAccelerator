/**
 * Render a case study's own metrics as a dashboard-style COVER image.
 *
 * WHY A DASHBOARD. Most subjects worth a case study have no interface to screenshot —
 * a classifier, a scheduled agent, a guardrail library. The skill's preference order
 * puts "a screenshot of the thing running" first and "a dashboard of the system's own
 * data" second, and this is the second: a Power BI-shaped view built from figures the
 * record already carries and can already defend.
 *
 * It is a picture OF THE RECORD. Every number is passed in from the approved snapshot,
 * so the cover cannot claim something the case study does not.
 *
 * WHAT IT REFUSES TO DO. It draws no trend line, because a set of counts from one
 * commit is not a series, and a line implying change over time would be the chart
 * lying about its own data. Nothing is normalised across different units.
 *
 * Usage:
 *   node scripts/renderCaseStudyDashboard.js --in cover.json --out frontend/public/site-v2/<name>.png
 *
 * cover.json:
 *   { "eyebrow": "...", "title": "...", "standfirst": "...",
 *     "kpis":  [{ "value": "14", "label": "...", "note": "..." }],
 *     "bars":  [{ "label": "...", "value": 46, "of": 292, "display": "46 of 292" }],
 *     "chips": ["typescript", "react"], "foot": "..." }
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const IN = argOf('--in', null);
const OUT = argOf('--out', null);
if (!IN || !OUT) { console.error('need --in <cover.json> --out <file.png>'); process.exit(1); }

const d = JSON.parse(fs.readFileSync(IN, 'utf8'));
const esc = (x) => String(x == null ? '' : x)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const kpis = (d.kpis || []).map((k) => `<div class="kpi">
  <b>${esc(k.value)}</b><span>${esc(k.label)}</span>${k.note ? `<i>${esc(k.note)}</i>` : ''}
</div>`).join('');

const bars = (d.bars || []).map((b) => {
  const pct = b.of ? Math.round((b.value / b.of) * 100) : 100;
  return `<div class="bar">
    <div class="bl">${esc(b.label)}</div>
    <div class="bt"><i style="width:${pct}%"></i></div>
    <div class="bv">${esc(b.display || b.value)}</div>
  </div>`;
}).join('');

const chips = (d.chips || []).map((c) => `<span>${esc(c)}</span>`).join('');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{--bg:#F8F8F7;--card:#FFF;--fg:#1A1A1A;--muted:#6B6B6B;--accent:#2E6A86;
        --soft:#EAF2F6;--line:#D8D8D8;--ink:#12262F}
  *{box-sizing:border-box}
  body{margin:0;font-family:Roboto,system-ui,sans-serif;background:var(--bg)}
  #cover{width:1200px;background:var(--bg)}
  .top{background:var(--ink);color:#fff;padding:34px 44px 30px}
  .eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8FB8C8;margin:0 0 12px}
  h1{margin:0;font-size:38px;font-weight:700;letter-spacing:-.025em;line-height:1.1;max-width:22ch}
  .sf{margin:14px 0 0;color:#B8C7CE;font-size:15.5px;line-height:1.5;max-width:70ch}
  .body{padding:28px 44px 34px}
  .kpis{display:grid;grid-template-columns:repeat(${Math.max(1, (d.kpis || []).length)},1fr);
        gap:14px;margin-bottom:26px}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:20px 22px;
       box-shadow:0 3px 8px rgba(26,26,26,.06)}
  .kpi b{display:block;font-size:40px;font-weight:700;letter-spacing:-.03em;color:var(--accent);line-height:1}
  .kpi span{display:block;font-size:12.5px;color:var(--fg);margin-top:9px;line-height:1.35}
  .kpi i{display:block;font-style:normal;font-size:11px;color:var(--muted);margin-top:5px}
  .bar{display:grid;grid-template-columns:240px 1fr 118px;align-items:center;gap:16px;
       padding:11px 0;border-bottom:1px solid var(--line)}
  .bar:last-of-type{border-bottom:0}
  .bl{font-size:13.5px}
  .bt{height:14px;background:var(--soft);border-radius:3px;overflow:hidden}
  .bt i{display:block;height:100%;background:var(--accent);border-radius:3px}
  .bv{text-align:right;font-weight:700;font-size:14.5px;font-variant-numeric:tabular-nums}
  .chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:22px}
  .chips span{font-size:11.5px;background:var(--soft);color:var(--accent);padding:4px 10px;border-radius:4px}
  .foot{margin-top:20px;padding-top:14px;border-top:1px solid var(--line);
        font-size:11px;color:var(--muted);line-height:1.7}
</style></head><body>
<div id="cover">
  <div class="top">
    <p class="eyebrow">${esc(d.eyebrow || '')}</p>
    <h1>${esc(d.title || '')}</h1>
    ${d.standfirst ? `<p class="sf">${esc(d.standfirst)}</p>` : ''}
  </div>
  <div class="body">
    ${kpis ? `<div class="kpis">${kpis}</div>` : ''}
    ${bars}
    ${chips ? `<div class="chips">${chips}</div>` : ''}
    ${d.foot ? `<div class="foot">${esc(d.foot)}</div>` : ''}
  </div>
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 });
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await p.locator('#cover').screenshot({ path: OUT });
  await browser.close();
  console.log(`rendered ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB) — ${(d.kpis || []).length} KPIs, ${(d.bars || []).length} bars`);
})().catch((e) => { console.error('RENDER_FAILED', e && e.message); process.exit(1); });
