#!/usr/bin/env node
/*
 * build-standalone — put demo-spec.json inside the demo page, so the result is ONE
 * file that opens with a double-click, attaches to an email, or drops into a slide.
 *
 *   node tools/build-standalone.mjs <demo dir> [out.html]
 *
 * <demo dir> holds index.html (the engine) and demo-spec.json. Default out: <demo dir>/standalone.html
 */
import fs from 'node:fs';
import path from 'node:path';

const [dir = 'demo', outArg] = process.argv.slice(2);
const engine = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'demo-spec.json'), 'utf8'));
const slot = '<script type="application/json" id="demo-spec">{}</script>';
if (!engine.includes(slot)) { console.error('index.html has no empty demo-spec slot. Is it the engine file?'); process.exit(1); }
// "</" inside JSON would end the script tag early; "<\/" is the same string to JSON.parse.
const json = JSON.stringify(spec).replace(/<\//g, '<\\/');
const name = (spec.app && spec.app.name) || 'Connected';
const html = engine
  .replace(slot, () => `<script type="application/json" id="demo-spec">${json}</script>`)
  .replace('<title>Connected demo</title>', () => `<title>${name} Connected Demo</title>`);
const out = outArg || path.join(dir, 'standalone.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
