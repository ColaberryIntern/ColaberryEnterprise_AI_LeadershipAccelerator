/**
 * buildWeeks — assemble Weeks 2–12 Deep Dive Field Guides from their content specs.
 *
 * Loads each spec (authored per the brief), runs the deterministic generator
 * (buildFieldGuide) to produce the full guide, VALIDATES it hard (15 sections,
 * machinery present + byte-identical to Week 1, JS parses, < 60 KB, no emoji, no
 * stray script/style in content), then writes:
 *   - docs/deep-dive/wk{N}-{slug}-field-guide.html
 *   - backend/src/data/deepDiveWeek{N}Html.ts  (base64, for the backend image)
 *
 * Run: node scripts/deep-dive/buildWeeks.js [specDir]
 * specDir defaults to the session scratchpad specs dir.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buildGuide } = require('./buildFieldGuide');

const REPO = path.resolve(__dirname, '../..');
const SPEC_DIR = process.argv[2] || path.resolve(__dirname, 'specs');

const WEEKS = [
  { n: 2, slug: 'solution-architect' },
  { n: 3, slug: 'project-manager' },
  { n: 4, slug: 'software-engineer' },
  { n: 5, slug: 'ux-designer' },
  { n: 6, slug: 'qa-engineer' },
  { n: 7, slug: 'integration-engineer' },
  { n: 8, slug: 'ai-engineer' },
  { n: 9, slug: 'data-architect' },
  { n: 10, slug: 'devops-engineer' },
  { n: 11, slug: 'governance-lead' },
  { n: 12, slug: 'ai-solution-architect' },
];

// Real pictographic emoji only (the design legitimately uses ✓ → — · … which are
// NOT emoji). Flags the supplementary emoji plane, regional flags, the emoji
// variation selector, and a few common BMP emoji.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{2705}\u{274C}\u{274E}\u{2757}\u{2764}\u{2B50}\u{2728}\u{26A0}\u{2B55}\u{1F600}-\u{1F64F}]/u;
const MAX_BYTES = 62 * 1024;   // safe margin under the ~64KB srcDoc truncation threshold

const tpl = fs.readFileSync(path.join(REPO, 'docs/deep-dive/wk1-business-analysis-command-center.html'), 'utf8');
const STYLE_TPL = tpl.slice(tpl.indexOf('<style>'), tpl.indexOf('</style>') + 8);
const SCRIPT_TPL = tpl.slice(tpl.indexOf('<script>\n(function(){'), tpl.indexOf('</script>', tpl.indexOf('<script>\n(function(){')) + 9);

function validate(html, week) {
  const errs = [];
  if ((html.match(/<section data-sec/g) || []).length !== 15) errs.push('not 15 sections');
  if ((html.match(/<a class="ri"/g) || []).length !== 15) errs.push('not 15 nav items');
  if (html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8) !== STYLE_TPL) errs.push('STYLE drifted from wk1');
  const s = html.indexOf('<script>\n(function(){');
  if (html.slice(s, html.indexOf('</script>', s) + 9) !== SCRIPT_TPL) errs.push('SCRIPT drifted from wk1');
  if (!html.includes('id="uploadBtn"')) errs.push('missing uploadBtn');
  if (!html.includes('data-ck="upload"')) errs.push('missing upload checklist item');
  if (!html.includes('class="startbanner"')) errs.push('missing startbanner');
  if (!html.includes('id="promptText"')) errs.push('missing promptText');
  if (Buffer.byteLength(html) > MAX_BYTES) errs.push('> 62KB (' + Buffer.byteLength(html) + ')');
  // no emoji
  if (EMOJI.test(html)) errs.push('contains emoji');
  // content must not carry its own <style>/<script> beyond the two we control
  if ((html.match(/<style/g) || []).length !== 1) errs.push('extra <style> in content');
  if ((html.match(/<script/g) || []).length !== 2) errs.push('extra <script> in content (expect 2: metadata + logic)');
  // JS parses
  const code = [...html.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n');
  try { new vm.Script(code); } catch (e) { errs.push('JS parse: ' + e.message); }
  return errs;
}

const results = [];
for (const w of WEEKS) {
  const specPath = path.join(SPEC_DIR, `wk${w.n}.js`);
  if (!fs.existsSync(specPath)) { results.push(`WK${w.n}: SPEC MISSING (${specPath})`); continue; }
  let spec;
  try { delete require.cache[require.resolve(specPath)]; spec = require(specPath); }
  catch (e) { results.push(`WK${w.n}: spec load error: ${e.message}`); continue; }
  let html;
  try { html = buildGuide(spec); }
  catch (e) { results.push(`WK${w.n}: generate error: ${e.message}`); continue; }
  const errs = validate(html, w.n);
  if (errs.length) { results.push(`WK${w.n} (${spec.role}): FAIL — ${errs.join('; ')}`); continue; }
  const htmlPath = path.join(REPO, `docs/deep-dive/wk${w.n}-${w.slug}-field-guide.html`);
  fs.writeFileSync(htmlPath, html);
  const b64 = Buffer.from(html, 'utf8').toString('base64');
  const modPath = path.join(REPO, `backend/src/data/deepDiveWeek${w.n}Html.ts`);
  fs.writeFileSync(modPath, `// AUTO-GENERATED from docs/deep-dive/wk${w.n}-${w.slug}-field-guide.html - do not hand-edit (regen via scripts/deep-dive/buildWeeks.js).\nexport const DEEP_DIVE_WK${w.n}_HTML_B64 = '${b64}';\n`);
  results.push(`WK${w.n} (${spec.role}): OK — ${Buffer.byteLength(html)} bytes -> ${path.basename(htmlPath)}`);
}
console.log(results.join('\n'));
