#!/usr/bin/env node
/**
 * Render the review HTML for a captureViewAsPortalSections.js run.
 *
 * Reads <capture dir>/_summary.json + _members.json and writes a walkthrough in
 * the docs/<SPRINT>_REVIEW.html pattern: one stop per member with the access
 * matrix (did each section load), the screenshot gallery, pre-flagged issues,
 * a verdict + notes, and the compile bar that turns the operator's pass into a
 * Markdown prompt. Real screenshots only — nothing here is a mockup.
 *
 * Usage:
 *   node scripts/renderViewAsReview.js --capture docs/screenshots/<dir> \
 *        --out docs/<NAME>_REVIEW.html --title "..." [--intro "..."] [--facts facts.json]
 *
 *   facts.json (optional): { "<email>": ["bullet", "bullet"] } — what shipped for that member.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const CAPTURE = path.resolve(opt('capture', null) || '');
const OUT = path.resolve(opt('out', 'docs/VIEW_AS_REVIEW.html'));
const TITLE = opt('title', 'View-as access review');
const INTRO = opt('intro', '');
const FACTS = opt('facts', null) ? JSON.parse(fs.readFileSync(opt('facts'), 'utf8')) : {};

if (!fs.existsSync(path.join(CAPTURE, '_summary.json'))) { console.error('no _summary.json in --capture dir'); process.exit(2); }
const summary = JSON.parse(fs.readFileSync(path.join(CAPTURE, '_summary.json'), 'utf8'));
const members = JSON.parse(fs.readFileSync(path.join(CAPTURE, '_members.json'), 'utf8'));
const entries = Array.isArray(summary) ? summary : (summary.entries || summary.captures || []);
const rel = (p) => path.relative(path.dirname(OUT), path.join(CAPTURE, p)).replace(/\\/g, '/');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const byMember = new Map();
for (const e of entries) {
  if (!byMember.has(e.email)) byMember.set(e.email, []);
  byMember.get(e.email).push(e);
}
const sections = members.sections || [];
const okCount = entries.filter((e) => e.ok).length;

const matrixHeader = sections.map((s) => `<th title="${esc(s.route)}">${esc(s.label)}</th>`).join('');
const matrixRows = members.members.map((m) => {
  const cells = sections.map((s) => {
    const e = (byMember.get(m.email) || []).find((x) => x.route === s.route);
    if (!e) return '<td class="c-miss">—</td>';
    const cls = e.ok ? 'c-ok' : 'c-bad';
    const why = e.ok ? `HTTP ${e.status}` : (e.error || e.errorText || (e.bouncedToLogin ? 'bounced to login' : 'thin page'));
    return `<td class="${cls}" title="${esc(why)}">${e.ok ? '✓' : '✕'}</td>`;
  }).join('');
  return `<tr><th class="rowhead">${esc(m.member)}<br><span class="muted">${esc(m.email)}</span></th>${cells}<td class="tot">${m.sectionsOk}/${m.sections}</td></tr>`;
}).join('\n');

const stops = members.members.map((m, i) => {
  const list = byMember.get(m.email) || [];
  const first = list.find((e) => e.route === '/portal/today');
  const intern = list.find((e) => e.route === '/portal/internship');
  const hero = [first, intern].filter(Boolean).map((e) => `
      <div class="screenshot">
        <a href="${rel(e.file)}" target="_blank"><img src="${rel(e.file)}" alt="${esc(m.member)} — ${esc(e.section)}" loading="lazy"></a>
        <div class="caption">${esc(e.section)} · enterprise.colaberry.ai${esc(e.route)} · HTTP ${esc(e.status)}${e.h1 ? ' · “' + esc(e.h1) + '”' : ''}</div>
      </div>`).join('');
  const gallery = list.map((e) => `
        <a class="thumb ${e.ok ? '' : 'thumb-bad'}" href="${e.file ? rel(e.file) : '#'}" target="_blank" title="${esc(e.section)} — ${e.ok ? 'loaded' : (e.error || e.errorText || 'did not load')}">
          ${e.file ? `<img src="${rel(e.file)}" alt="${esc(e.section)}" loading="lazy">` : '<div class="nofile">no capture</div>'}
          <span>${e.ok ? '✓' : '✕'} ${esc(e.section)}</span>
        </a>`).join('');
  const facts = (FACTS[m.email] || []).map((f) => `<li>${esc(f)}</li>`).join('');
  const flagged = list.filter((e) => !e.ok).map((e) => `<li><label><input type="checkbox" data-issue="${esc(m.email)}:${esc(e.route)}">${esc(e.section)} did not load — ${esc(e.error || e.errorText || (e.bouncedToLogin ? 'bounced to login' : 'page had almost no content'))}</label></li>`).join('');
  const thin = list.filter((e) => e.ok && e.textLength < 400).map((e) => `<li><label><input type="checkbox" data-issue="${esc(m.email)}:${esc(e.route)}:thin">${esc(e.section)} loaded but looks sparse (${e.textLength} chars of text) — worth a look</label></li>`).join('');
  return `
  <div class="stop" id="stop-${i + 1}">
    <span class="stop-num">${i + 1}</span><span class="stop-title">${esc(m.member)}</span>
    <div class="muted">${esc(m.email)} · enrollment <code>${esc(m.enrollment_id)}</code> · view-as landed on <code>${esc(m.landedOn.replace('https://enterprise.colaberry.ai', ''))}</code> · <strong>${m.sectionsOk}/${m.sections} sections loaded</strong></div>
    <h3>① See it — what ${esc(m.member.split(' ')[0])} sees</h3>
    <div class="pair">${hero}</div>
    <div class="gallery">${gallery}</div>
    ${facts ? `<div class="what-shipped"><strong>② What shipped here</strong><ul>${facts}</ul></div>` : ''}
    <div class="possible">
      <strong>③ Possible changes — toggle if you want any of these looked at:</strong>
      <ul>${flagged}${thin}${(!flagged && !thin) ? '<li class="muted">Nothing pre-flagged: every section loaded with real content.</li>' : ''}
        <li><label><input type="checkbox" data-issue="${esc(m.email)}:other">Something else in the screenshots above</label></li>
      </ul>
    </div>
    <div class="verdict">
      <strong>④ Your verdict</strong><br>
      <label><input type="radio" name="v${i + 1}" value="ok">👍 Good</label>
      <label><input type="radio" name="v${i + 1}" value="iterate">⚠ Iterate</label>
      <label><input type="radio" name="v${i + 1}" value="cut">✕ Problem</label>
      <textarea placeholder="Notes for ${esc(m.member.split(' ')[0])}…" data-notes="${esc(m.email)}"></textarea>
    </div>
  </div>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLE)}</title>
<style>
  :root { --bg:#fafafa; --text:#1f2937; --muted:#6b7280; --primary:#1a365d; --accent:#38a169; --warn:#d97706; --danger:#e53e3e; --border:#e5e7eb; --card:#ffffff; --frame:#0f172a; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif; background:var(--bg); color:var(--text); line-height:1.55; padding-bottom:200px; }
  .wrap { max-width:1100px; margin:0 auto; padding:2.5rem 1.5rem; }
  h1 { font-size:28px; color:var(--primary); letter-spacing:-0.01em; margin-bottom:.25rem; }
  h2 { font-size:20px; color:var(--primary); margin-top:2.5rem; }
  h3 { font-size:16px; color:var(--primary); margin-top:1.25rem; }
  .lede { color:var(--muted); font-size:15px; max-width:820px; }
  .muted { color:var(--muted); font-size:13px; }
  .stop { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:1.75rem; margin:2rem 0; box-shadow:0 1px 3px rgba(0,0,0,.04); }
  .stop-num { display:inline-block; background:var(--primary); color:#fff; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; font-weight:700; font-size:13px; margin-right:8px; vertical-align:middle; }
  .stop-title { display:inline-block; vertical-align:middle; font-size:18px; font-weight:700; color:var(--primary); }
  .screenshot { background:var(--frame); border-radius:8px; padding:14px; margin:1rem 0; box-shadow:0 4px 14px rgba(0,0,0,.1); }
  .screenshot img { width:100%; max-height:520px; object-fit:cover; object-position:top; display:block; border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,.18); }
  .screenshot .caption { color:#9ca3af; font-size:11.5px; margin-top:8px; text-align:center; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
  @media (max-width:800px) { .pair { grid-template-columns:1fr; } }
  .gallery { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; margin:1rem 0; }
  .thumb { display:block; text-decoration:none; color:var(--text); border:1px solid var(--border); border-radius:6px; overflow:hidden; background:#fff; }
  .thumb img { width:100%; height:100px; object-fit:cover; object-position:top; display:block; }
  .thumb span { display:block; font-size:12px; padding:5px 7px; }
  .thumb-bad { border-color:var(--danger); } .thumb-bad span { color:var(--danger); }
  .nofile { height:100px; display:flex; align-items:center; justify-content:center; color:var(--muted); font-size:12px; }
  .what-shipped { background:#f0fdf4; border-left:3px solid var(--accent); padding:.75rem 1rem; border-radius:4px; margin:1rem 0; }
  .what-shipped strong { color:#166534; } .what-shipped ul { margin:6px 0 0; padding-left:22px; } .what-shipped li { font-size:14px; margin:3px 0; }
  .possible { background:#fffbeb; border-left:3px solid var(--warn); padding:.75rem 1rem; border-radius:4px; margin:1rem 0; }
  .possible strong { color:#92400e; } .possible ul { margin:6px 0 0; padding-left:22px; list-style:none; } .possible li { font-size:14px; margin:6px 0; }
  .possible input[type="checkbox"] { margin-right:8px; vertical-align:middle; }
  .verdict { background:#f9fafb; border:1px solid var(--border); padding:1rem; border-radius:4px; margin:1rem 0; }
  .verdict label { display:inline-flex; align-items:center; margin-right:18px; cursor:pointer; font-size:14px; }
  .verdict input[type="radio"] { margin-right:5px; }
  .verdict textarea { width:100%; min-height:70px; margin-top:8px; padding:8px; border:1px solid var(--border); border-radius:4px; font-family:inherit; font-size:13px; box-sizing:border-box; resize:vertical; }
  table { width:100%; border-collapse:collapse; margin:1rem 0; font-size:13px; }
  th, td { text-align:center; padding:6px 6px; border-bottom:1px solid var(--border); vertical-align:middle; }
  th { background:#f3f4f6; font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
  th.rowhead { text-align:left; text-transform:none; font-size:13px; color:var(--text); letter-spacing:0; background:#fff; }
  .c-ok { color:#166534; background:#f0fdf4; font-weight:700; } .c-bad { color:#991b1b; background:#fef2f2; font-weight:700; } .c-miss { color:var(--muted); }
  .tot { font-weight:700; }
  code { background:#f3f4f6; padding:1px 5px; border-radius:3px; font-size:12px; }
  .kpi { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; margin:1.25rem 0; }
  .kpi div { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:1rem; }
  .kpi b { display:block; font-size:26px; color:var(--primary); }
  .compile-bar { position:fixed; bottom:0; left:0; right:0; background:#fff; border-top:1px solid var(--border); padding:12px 24px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 -2px 10px rgba(0,0,0,.06); z-index:10; }
  .compile-bar button { background:var(--primary); color:#fff; border:0; padding:10px 18px; border-radius:6px; font-weight:600; cursor:pointer; margin-left:8px; }
  .compile-bar button.alt { background:#e5e7eb; color:var(--text); }
  .modal-bg { display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:20; align-items:center; justify-content:center; }
  .modal-bg.show { display:flex; }
  .modal { background:#fff; border-radius:8px; max-width:800px; width:92%; max-height:80vh; overflow:auto; padding:1.5rem; }
  .modal pre { white-space:pre-wrap; font-size:12.5px; background:#f9fafb; padding:1rem; border-radius:4px; }
  .modal-actions { display:flex; justify-content:flex-end; gap:8px; }
  .modal-actions button { border:0; padding:8px 14px; border-radius:6px; cursor:pointer; font-weight:600; }
  .modal-actions .copy { background:var(--primary); color:#fff; } .modal-actions .close { background:#e5e7eb; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(TITLE)}</h1>
  <p class="lede">${INTRO}</p>
  <div class="kpi">
    <div><b>${members.members.length}</b>members captured</div>
    <div><b>${okCount} / ${entries.length}</b>sections loaded</div>
    <div><b>${sections.length}</b>sections per member</div>
    <div><b>${esc((members.captured_at || '').slice(0, 16).replace('T', ' '))} UTC</b>captured, read-only View-as</div>
  </div>
  <h2>Access matrix</h2>
  <p class="muted">✓ = the page loaded under that member's own read-only session with real content and no error text; ✕ = it bounced to login, showed an error, or rendered almost nothing. Hover a cell for the reason. Every screenshot below is the real production page at 1440px, captured through <code>scripts/captureViewAsPortalSections.js</code>.</p>
  <div style="overflow-x:auto"><table><thead><tr><th class="rowhead">Member</th>${matrixHeader}<th>Loaded</th></tr></thead><tbody>${matrixRows}</tbody></table></div>
  ${stops}
  <div class="stop">
    <span class="stop-title">Overall</span>
    <div class="verdict">
      <textarea placeholder="Anything you want to land in the next pass…" data-notes="overall" style="min-height:100px"></textarea>
    </div>
  </div>
</div>
<div class="compile-bar">
  <div id="stats">0 / ${members.members.length} members voted</div>
  <div><button class="alt" onclick="resetAll()">Reset</button><button onclick="compile()">Compile feedback</button></div>
</div>
<div class="modal-bg" id="modalBg"><div class="modal">
  <h3>Feedback — copy + paste back to Claude Code</h3>
  <pre id="modalContent"></pre>
  <div class="modal-actions"><button class="copy" onclick="copyPrompt()">Copy to clipboard</button><button class="close" onclick="closeModal()">Close</button></div>
</div></div>
<script>
  function updateStats() {
    const voted = document.querySelectorAll('input[type="radio"]:checked').length;
    document.getElementById('stats').textContent = voted + ' / ${members.members.length} members voted';
  }
  document.addEventListener('change', updateStats); updateStats();
  function compile() {
    let out = '# ${esc(TITLE)} — operator feedback\\n\\n';
    document.querySelectorAll('.stop[id]').forEach((stop, i) => {
      const title = stop.querySelector('.stop-title').textContent;
      const r = stop.querySelector('input[type="radio"]:checked');
      const notes = stop.querySelector('textarea[data-notes]');
      const issues = []; stop.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => issues.push(cb.parentElement.textContent.trim()));
      out += '## ' + (i + 1) + ' — ' + title + '\\nVerdict: **' + (r ? r.value : '(no verdict)') + '**\\n';
      if (issues.length) out += 'Flagged:\\n' + issues.map(s => '- ' + s).join('\\n') + '\\n';
      if (notes && notes.value.trim()) out += 'Notes:\\n' + notes.value.trim() + '\\n';
      out += '\\n';
    });
    const overall = document.querySelector('textarea[data-notes="overall"]');
    if (overall && overall.value.trim()) out += '## Overall\\n' + overall.value.trim() + '\\n';
    document.getElementById('modalContent').textContent = out;
    document.getElementById('modalBg').classList.add('show');
  }
  function copyPrompt() { navigator.clipboard.writeText(document.getElementById('modalContent').textContent).then(() => { const b = document.querySelector('.modal-actions .copy'); const o = b.textContent; b.textContent = '✓ Copied'; setTimeout(() => b.textContent = o, 1500); }); }
  function closeModal() { document.getElementById('modalBg').classList.remove('show'); }
  function resetAll() { if (!confirm('Clear all verdicts, checkboxes, and notes?')) return; document.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false); document.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false); document.querySelectorAll('textarea').forEach(t => t.value = ''); updateStats(); }
</script>
</body>
</html>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`[review] ${members.members.length} members, ${okCount}/${entries.length} sections ok → ${OUT}`);
