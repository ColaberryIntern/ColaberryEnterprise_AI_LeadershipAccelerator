/**
 * Capture screenshots of a repository's OWN interface.
 *
 * WHY. A generated chart is not a screenshot, and dressing one up as product UI is
 * the substitution the publish rules exist to prevent. When a project ships a real
 * interface — even static pages — the honest cover is a capture of THAT.
 *
 * It serves the given directory over a local static server so relative assets, CSS
 * and scripts resolve the way they do in the product, then screenshots named pages.
 * Nothing is composed, annotated or restyled: what the page renders is what is
 * captured.
 *
 * Usage:
 *   node scripts/captureRepoUiScreenshots.js --root <dir> --out <dir> \
 *     --page index.html:coreops-console --page guardrails.html:coreops-guardrails
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const all = (n) => args.reduce((acc, a, i) => (a === n && args[i + 1] ? [...acc, args[i + 1]] : acc), []);
const ROOT = argOf('--root', null);
const OUT = argOf('--out', null);
const PAGES = all('--page');
const HEIGHT = Number(argOf('--height', 900));
if (!ROOT || !OUT || !PAGES.length) {
  console.error('need --root <dir> --out <dir> and at least one --page <file.html>:<name>');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  // Contain reads to ROOT: a served directory must not become a file-read primitive.
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(path.resolve(ROOT))) { res.writeHead(403).end(); return; }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  fs.mkdirSync(OUT, { recursive: true });

  for (const spec of PAGES) {
    const [file, name] = spec.split(':');
    const page = await browser.newPage({ viewport: { width: 1440, height: HEIGHT }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
    await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1200);
    const len = (await page.locator('body').innerText()).trim().length;
    // A blank capture is worse than none: it would publish an empty frame as proof.
    if (len < 40) {
      console.log(`  SKIPPED ${file} — rendered ${len} chars, refusing to publish an empty frame`);
      await page.close();
      continue;
    }
    const out = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: out });
    console.log(`  captured ${name}.png (${Math.round(fs.statSync(out).size / 1024)} KB, ${len} chars`
      + `${errors.length ? `, ${errors.length} page errors` : ''})`);
    await page.close();
  }

  await browser.close();
  server.close();
})().catch((e) => { console.error('CAPTURE_FAILED', e && e.message); process.exit(1); });
