/**
 * Render a Case Study's own `architecture.diagramSource` to a PNG.
 *
 * WHY THIS EXISTS. A record whose only visual is a mermaid block reads as text-only
 * and fails the readiness image checks ("no approved screenshot, architecture image,
 * photograph or demo"). The tempting fix is to attach a stock photograph, and that is
 * precisely what the publish rules forbid: an atmosphere image is not evidence of
 * shipped behaviour.
 *
 * So the image is generated from the record's OWN diagram source. It depicts this
 * system and nothing else, and it cannot drift from the record, because it is rendered
 * from the record.
 *
 * Usage:
 *   node scripts/renderCaseStudyDiagram.js --in <mermaid.txt> --out <file.png>
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const IN = argOf('--in', null);
const OUT = argOf('--out', null);
if (!IN || !OUT) { console.error('need --in <mermaid.txt> --out <file.png>'); process.exit(1); }

const source = fs.readFileSync(IN, 'utf8');
// The same rule the server enforces. Refusing here too means a diagram that would be
// dropped by projectDiagramSource never becomes an image either — the picture and the
// record cannot disagree about what is renderable.
if (source.includes('<')) {
  console.error('REFUSED: diagram source contains "<"; projectDiagramSource would drop it.');
  process.exit(1);
}

const page = (src) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
  body{margin:0;background:#F8F8F7;font-family:Roboto,system-ui,sans-serif}
  #wrap{display:inline-block;padding:40px 44px;background:#F8F8F7}
</style></head><body>
<div id="wrap"><pre class="mermaid">${src}</pre></div>
<script>
  mermaid.initialize({startOnLoad:true,theme:'base',themeVariables:{
    primaryColor:'#EAF2F6',primaryBorderColor:'#2E6A86',primaryTextColor:'#12262F',
    lineColor:'#6B6B6B',secondaryColor:'#FFFFFF',tertiaryColor:'#F8F8F7',
    fontFamily:'Roboto, system-ui, sans-serif',fontSize:'14px'}});
</script></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  await p.setContent(page(source), { waitUntil: 'networkidle' });
  // Wait for mermaid to replace the <pre> with an <svg>, rather than a fixed sleep.
  await p.waitForSelector('#wrap svg', { timeout: 20000 });
  await p.waitForTimeout(400);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await p.locator('#wrap').screenshot({ path: OUT });
  await browser.close();
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`rendered ${OUT} (${kb} KB) from ${source.split('\n').length} lines of mermaid`);
})().catch((e) => { console.error('RENDER_FAILED', e && e.message); process.exit(1); });
