// Inline every img/ reference in an HTML file as base64 data URI so the file
// works standalone when downloaded.
const fs = require('fs');
const path = require('path');

const IN = process.argv[2];
const OUT = process.argv[3] || IN.replace(/\.html$/, '-standalone.html');
if (!IN) { console.error('usage: node inline-html-images.js <input.html> [output.html]'); process.exit(1); }

const BASE = path.dirname(path.resolve(IN));

function dataUriFor(rel) {
  const abs = path.resolve(BASE, rel);
  if (!fs.existsSync(abs)) { console.warn('  MISS:', rel); return null; }
  const ext = path.extname(rel).toLowerCase().slice(1);
  const mime = ext === 'png' ? 'image/png'
            : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
            : ext === 'svg' ? 'image/svg+xml'
            : ext === 'gif' ? 'image/gif'
            : 'application/octet-stream';
  const b64 = fs.readFileSync(abs).toString('base64');
  return `data:${mime};base64,${b64}`;
}

let html = fs.readFileSync(IN, 'utf8');

// Track unique replacements
const seen = {};
let count = 0;

// <img src="img/..."> in HTML
html = html.replace(/(<img[^>]*\s)src="(img\/[^"]+)"/g, (m, pre, p) => {
  if (seen[p] === undefined) { seen[p] = dataUriFor(p); if (seen[p]) count++; }
  return seen[p] ? `${pre}src="${seen[p]}"` : m;
});

// url('img/...') and url("img/...") and url(img/...) in CSS
html = html.replace(/url\(\s*(['"]?)(img\/[^'")]+)\1\s*\)/g, (m, q, p) => {
  if (seen[p] === undefined) { seen[p] = dataUriFor(p); if (seen[p]) count++; }
  return seen[p] ? `url(${seen[p]})` : m;
});

fs.writeFileSync(OUT, html);
const inSize = fs.statSync(IN).size;
const outSize = fs.statSync(OUT).size;
console.log(`Wrote ${OUT}`);
console.log(`  size: ${(inSize/1024).toFixed(1)} KB -> ${(outSize/1024).toFixed(1)} KB`);
console.log(`  images inlined: ${count}`);
