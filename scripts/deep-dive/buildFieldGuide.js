/**
 * buildFieldGuide — deterministic generator for Deep Dive "Field Guide" HTML.
 *
 * Every Week 1+ Field Guide shares the SAME chrome + machinery (brand CSS, the
 * scroll-dwell read-tracker, the host postMessage contract, the 3-step gate, the
 * upload box). Rather than hand-copy that into 11 files (and risk drift/bugs), this
 * generator lifts the shared parts VERBATIM from the canonical Week 1 guide and
 * injects only the per-week CONTENT (title, 15 section bodies, build prompt). So the
 * machinery is provably identical everywhere and each guide stays < 64 KB.
 *
 * Usage: const {buildGuide} = require('./buildFieldGuide'); const html = buildGuide(spec);
 * Spec shape: see WK2 example in buildWeeks.js. Keep bodies clean HTML using the
 * shared classes (.card .kpis .kpi .kv .flow .callout .good/.bad .table-wrap .q etc.).
 */
const fs = require('fs');
const path = require('path');

const TEMPLATE = path.resolve(__dirname, '../../docs/deep-dive/wk1-business-analysis-command-center.html');

function slice(html, startTag, endTag) {
  const s = html.indexOf(startTag);
  const e = html.indexOf(endTag, s);
  if (s < 0 || e < 0) throw new Error('template marker not found: ' + startTag);
  return html.slice(s, e + endTag.length);
}

// The 15 shared nav icons (section skeleton is fixed across every discipline).
function extractNavIcons(navHtml) {
  const icons = [];
  const re = /<a class="ri"[^>]*>\s*<span class="num">\d+<\/span>\s*(<svg[\s\S]*?<\/svg>)\s*<\/a>/g;
  let m;
  while ((m = re.exec(navHtml))) icons.push(m[1]);
  if (icons.length !== 15) throw new Error('expected 15 nav icons, got ' + icons.length);
  return icons;
}

// Decode any HTML entities the author already wrote, THEN escape once — so a title
// like "KPIs &amp; success" or "KPIs & success" both yield a single, correct &amp;
// (not the double-escaped &amp;amp; bug). Used for title/eyebrow/navLabel/tag/role and
// the build prompt (whose textContent must decode back to the literal characters).
const decodeEntities = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#3?9;/g, "'");
const esc = (s) => decodeEntities(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildGuide(spec) {
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const STYLE = slice(tpl, '<style>', '</style>');
  const SCRIPT = slice(tpl, '<script>\n(function(){', '</script>');   // the LAST script (logic)
  const NAV = slice(tpl, '<nav class="rail"', '</nav>');
  const ICONS = extractNavIcons(NAV);

  const { week, role, tag, sections, buildPrompt } = spec;
  if (!Array.isArray(sections) || sections.length !== 15) throw new Error('spec.sections must have exactly 15 entries (week ' + week + ')');

  // Build the nav from the section list (labels per week; icons + separators shared).
  const navItems = sections.map((s, i) => {
    const n = String(i + 1).padStart(2, '0');
    const sep = (i === 8 || i === 12) ? '\n      <span class="sep"></span>' : '';   // after #8 and #12
    return `${sep}\n      <a class="ri" href="#${s.id}" title="${esc(s.navLabel)}"><span class="num">${n}</span>${ICONS[i]}</a>`;
  }).join('');

  // Section 1 (dashboard) gets the "Start here" build-prompt banner injected right
  // after its heading — the evident, required first step. Section 15 (build & submit)
  // gets the gate checklist + upload box. Both are machinery-linked and generator-owned.
  const startBanner =
    `\n        <div class="startbanner">\n` +
    `          <div class="sbt"><b>Start here.</b> Copy this prompt and run it in your own <b>Claude Code</b> — it builds your ${esc(role)} Field Guide (~5–10 min). Read the sections below while it builds. <em>You can't complete this Deep Dive until you've run it.</em></div>\n` +
    `          <button class="buildcta" id="copyPromptBtn3" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy the build prompt</button>\n` +
    `        </div>`;

  const gateBlock =
    `\n        <div class="card checklist" id="checklist">\n` +
    `          <div class="sub">Complete this Deep Dive — finish all 3 steps</div>\n` +
    `          <div class="ck" data-ck="read"><span class="box"></span><span>Read all 15 sections</span></div>\n` +
    `          <div class="ck" data-ck="copy"><span class="box"></span><span>Click "Copy the build prompt" &amp; run it in Claude Code</span></div>\n` +
    `          <div class="ck" data-ck="upload"><span class="box"></span><span>Upload your Field Guide</span></div>\n` +
    `        </div>\n` +
    `        <div class="donebar" id="donebar"><span class="dcheck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg></span><div><b>All 3 steps done.</b> Mark this Deep Dive complete to lock in your <b>100 points</b>.</div></div>\n` +
    `        <div class="uploadbox">\n` +
    `          <div class="big">Upload your Field Guide</div>\n` +
    `          <p class="muted" style="margin:.3rem 0 .5rem">Built it? Upload the HTML file here. Points are awarded on the first valid upload; you can replace it any time.</p>\n` +
    `          <button class="btn work" id="uploadBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg> Choose HTML file</button>\n` +
    `        </div>`;

  const sectionsHtml = sections.map((s, i) => {
    const inject = i === 0 ? startBanner : (i === 14 ? gateBlock : '');
    const afterHeading = i === 0 ? inject + '\n' + s.body : s.body + (i === 14 ? '\n' + inject : '');
    return `      <section data-sec id="${s.id}">\n        <span class="eyebrow">${esc(s.eyebrow)}</span>\n        <h2>${esc(s.title)}</h2>\n${afterHeading}\n      </section>`;
  }).join('\n\n');

  const meta = JSON.stringify({
    guide_type: role + ' Field Guide', curriculum_type: 'deep_dive', week,
    discipline: role, student_id: '{{STUDENT_ID}}', project_id: '{{PROJECT_ID}}',
    repository: '{{GITHUB_REPO}}', generated_by: 'Claude Code', version: '1.0.0',
    project_context_mode: 'generic_industry_example',
  }, null, 2);

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(role)} Field Guide — Week ${week} Deep Dive</title>
<!-- DEEP DIVE · right-side panel (max ~560px). WEEK ${week} = ${esc(role)}.
  Self-contained (inline CSS+JS, no external libs). Generated by scripts/deep-dive/buildFieldGuide.js -->
<script type="application/json" id="deepdive-metadata">
${meta}
</script>
${STYLE}
</head>
<body>
<div class="panel" id="panel">

  <div class="printcover">
    <img class="logo" src="/colaberry-logo-transparent.png" alt="Colaberry">
    <h1>${esc(role)} Field Guide</h1>
    <div class="meta">Week ${week} · Deep Dive · ${esc(role)} · Enterprise AI Leadership Accelerator</div>
  </div>

  <div class="phead">
    <img class="logo" src="/colaberry-logo-transparent.png" alt="Colaberry">
    <span class="tag">${esc(tag)}</span>
    <span class="search">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="search" type="search" placeholder="Search…" aria-label="Search" />
    </span>
    <button class="hbtn" id="exportBtn" title="Export / print to PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5h20v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>Export</button>
  </div>

  <div class="pbody">
    <nav class="rail" id="rail" aria-label="Sections">${navItems}
    </nav>

    <div class="pcontent" id="content">

${sectionsHtml}

      <div class="actionbar">
        <div class="prog">
          <div class="ptext"><span>Progress</span><span><b id="pcount">0</b> / 15 sections read</span></div>
          <div class="bar"><i id="pfill"></i></div>
        </div>
        <button class="btn work" id="copyPromptBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy build prompt</button>
      </div>

      <!-- The build prompt is intentionally NOT shown — the Copy buttons put it on the clipboard. -->
      <pre id="promptText" style="display:none">${esc(buildPrompt)}</pre>

    </div>
  </div>
</div>

${SCRIPT}
</body>
</html>
`;
}

module.exports = { buildGuide };
