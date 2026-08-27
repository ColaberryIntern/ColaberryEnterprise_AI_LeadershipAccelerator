/**
 * Capture the PUBLIC-FACING pages of refactored.ai as they exist today.
 *
 * Scope is deliberately the ~11 marketing pages, not all 1,931 URLs in the sitemap.
 * The other 1,908 are /learn/ lesson pages and /course/ pages — that is the course
 * catalogue, it is the actual IP, and scraping rendered HTML is the wrong way to move
 * it when the source of truth for that content lives in the curriculum system. Mixing
 * the two would also bloat the repo with ~100MB of generated pages.
 *
 * This is Ali's own site. Requests are sequential with a delay so the capture cannot
 * behave like a load test against his own production box.
 */
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
const BASE = 'https://www.refactored.ai';

const PAGES = [
  '/',
  '/individuals/',
  '/enterprise/',
  '/contact-us/',
  '/feedback/',
  '/enterprise-feedback/',
  '/privacy/',
  '/terms/',
  '/thank-you/',
  '/public-library/',
  '/organizations/',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(path.join(OUT, 'pages'), { recursive: true });

  const manifest = [];
  const assets = new Set();

  for (const p of PAGES) {
    const url = BASE + p;
    let status = 0, body = '';
    try {
      const res = await fetch(url, { redirect: 'follow' });
      status = res.status;
      body = await res.text();
    } catch (e) {
      manifest.push({ path: p, status: 0, error: e.message });
      console.log(`  ${String(0).padStart(3)}  ${p}  (${e.message})`);
      await sleep(400);
      continue;
    }

    if (status === 200 && body) {
      // Flat filename so the folder stays readable: "/enterprise/" -> "enterprise.html"
      const name = (p === '/' ? 'index' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_')) + '.html';
      fs.writeFileSync(path.join(OUT, 'pages', name), body, 'utf8');

      for (const m of body.matchAll(/(?:src|href)="([^"]+\.(?:css|js|png|jpe?g|svg|gif|woff2?))[^"]*"/gi)) {
        assets.add(m[1].startsWith('//') ? 'https:' + m[1] : m[1]);
      }

      const title = (body.match(/<title[^>]*>([^<]*)/i) || [, ''])[1].trim();
      const text = body.replace(/<script[\s\S]*?<\/script>/gi, '')
                       .replace(/<style[\s\S]*?<\/style>/gi, '')
                       .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      // Buffer.byteLength, NOT body.length: the latter counts UTF-16 code units, so any
      // multi-byte character makes the recorded size disagree with the file on disk.
      manifest.push({ path: p, status, file: 'pages/' + name, bytes: Buffer.byteLength(body, 'utf8'), title, textChars: text.length });
      console.log(`  ${status}  ${p.padEnd(24)} ${String(body.length).padStart(7)} bytes  "${title.slice(0, 40)}"`);
    } else {
      manifest.push({ path: p, status });
      console.log(`  ${status}  ${p}`);
    }
    await sleep(400); // his own production box — do not hammer it
  }

  const assetList = [...assets].sort();
  fs.writeFileSync(path.join(OUT, 'assets-referenced.txt'), assetList.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
    captured_from: BASE,
    captured_note: 'Public marketing pages only. The 1,715 /learn/ and 193 /course/ pages are deliberately excluded.',
    pages: manifest,
    assets_referenced: assetList.length,
  }, null, 2), 'utf8');

  const ok = manifest.filter((m) => m.status === 200).length;
  console.log(`\n  captured ${ok}/${PAGES.length} pages, ${assetList.length} distinct assets referenced`);
}

main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
