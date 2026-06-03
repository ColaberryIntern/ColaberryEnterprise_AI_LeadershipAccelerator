#!/usr/bin/env node
// Build a fully self-contained M4 V8 standalone HTML file. Reads the
// press-ready HTML (tmp/m4-pressready.html), finds every img reference
// via background-image url() and <img src>, inlines each as base64 data:
// URI, and outputs docs/m4-v8-standalone.html ready to send David. He
// can open it in any browser, share via email, or embed in a web page —
// no asset dependencies, no PDF reader needed.
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '../../..');
const HTML_IN = path.join(REPO, 'tmp/m4-pressready.html');
const HTML_OUT = path.join(REPO, 'docs/m4-v8-standalone.html');
const IMG_BASE = path.join(REPO, 'docs');

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp' })[ext] || 'application/octet-stream';
}

function inlineImage(relPath) {
  // Resolve against docs/ (the natural base for the multi-mockup doc + base href used in press-ready HTML)
  let abs = path.join(IMG_BASE, relPath);
  if (!fs.existsSync(abs)) {
    // Try absolute
    abs = path.resolve(REPO, relPath);
  }
  if (!fs.existsSync(abs)) {
    console.warn('  MISSING:', relPath, '(left as-is)');
    return null;
  }
  const buf = fs.readFileSync(abs);
  const mime = mimeFor(abs);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

(async () => {
  let html = fs.readFileSync(HTML_IN, 'utf8');

  // Strip the <base href="file:///..."> line — we're inlining images so no base needed
  html = html.replace(/<base [^>]*>/g, '');

  // Inline background-image url('img/...') references
  const urlRe = /url\(['"]?(img\/[^'")]+)['"]?\)/g;
  const seen = new Set();
  html = html.replace(urlRe, (m, p) => {
    if (!seen.has(p)) { seen.add(p); console.log('  bg-image:', p); }
    const data = inlineImage(p);
    return data ? `url('${data}')` : m;
  });

  // Inline <img src="img/..."> references
  const imgRe = /<img([^>]*?)src=['"](img\/[^'"]+)['"]([^>]*)>/g;
  html = html.replace(imgRe, (m, pre, src, post) => {
    if (!seen.has(src)) { seen.add(src); console.log('  img-src:', src); }
    const data = inlineImage(src);
    return data ? `<img${pre}src="${data}"${post}>` : m;
  });

  // V9 FIX (David 2026-06-03 4:06 PM): the previous wrapper used
  //   aspect-ratio: 7.25 / 4.8
  // which forced a fixed height. When the inner .ad-mockup's intrinsic
  // content height exceeded that computed height the bottom ~1/3 got
  // clipped in browser. David reported this 4-5 times. Fix: drop the
  // aspect-ratio constraint entirely. Let the inner .ad-mockup self-size
  // via its own aspect-ratio: 1.54/1. Wrapper just centers + pads.
  html = html.replace(
    /\.press-wrapper\s*\{[^}]*\}/,
    '.press-wrapper { width: 100%; max-width: 1100px; padding: 18px; box-sizing: border-box; background: white; margin: 24px auto; box-shadow: 0 8px 32px rgba(15,23,42,0.12); border-radius: 8px; }'
  );
  // Also drop the @page rule and replace body bg with a light gray so it doesn't look raw
  html = html.replace(/@page\s*\{[^}]*\}/, '@page { size: 7.25in 4.8in; margin: 0; }');
  html = html.replace(/body\s*\{[^}]*\}/, 'body { margin: 0; padding: 0; font-family: Inter, Arial, sans-serif; background: #f1f5f9; }');

  fs.writeFileSync(HTML_OUT, html);
  console.log('\nSTANDALONE:', HTML_OUT);
  console.log('Size:', (fs.statSync(HTML_OUT).size / 1024).toFixed(1), 'KB');
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
