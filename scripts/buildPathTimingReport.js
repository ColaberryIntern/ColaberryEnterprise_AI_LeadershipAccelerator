/**
 * buildPathTimingReport — 2026-05-21.
 *
 * Renders the per-path timing comparison (Workflow / Full Project / Fully
 * Autonomous) from docs/screenshots/2026-05-21-path-timing/timings.json:
 * per-step durations, Architect phase breakdown, totals, capability/
 * requirement counts, and the screenshots from each path, in order.
 *
 * Run: node scripts/buildPathTimingReport.js
 */
const fs = require('fs');
const path = require('path');

const DIR_REL = path.join('screenshots', '2026-05-21-path-timing');
const ROOT = path.resolve(__dirname, '..', 'docs', DIR_REL);
const OUT = path.resolve(__dirname, '..', 'docs', 'BUILD_PATH_TIMING_REPORT.html');

const STEP_LABELS = {
  load_chooser: 'Load chooser', choose_idea: 'Choose tier + type idea',
  generate_questions: 'AI generates questions', answer_questions: 'Answer questions',
  document_generation: 'Generate document (LLM, 2-pass)', save_and_build_out: 'Save + build out (cluster)',
  connect_repo_start: 'Connect repo + start build', architect_build: 'Architect builds the document',
  retrieve_and_build_out: 'Retrieve doc + build out (cluster)',
};
const ORDER = { workflow: 0, full: 1, autonomous: 2 };
const COLORS = { workflow: '#10b981', full: '#3b82f6', autonomous: '#8b5cf6' };

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function mmss(ms) { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; }

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'timings.json'), 'utf8'));
  const runs = data.results.slice().sort((a, b) => (ORDER[a.path] ?? 9) - (ORDER[b.path] ?? 9));

  const summaryRows = runs.map(r => `
    <tr>
      <td><b style="color:${COLORS[r.path]}">${esc(r.name)}</b></td>
      <td class="${r.ok ? 'ok' : 'err'}">${r.ok ? 'PASS' : 'FAIL'}</td>
      <td><b>${r.totalMin} min</b></td>
      <td>${r.caps ?? '—'}</td>
      <td>${r.reqs ?? '—'}</td>
      <td>${r.doc_words ? r.doc_words.toLocaleString() + ' words' : (r.path === 'workflow' ? '~2.5K words' : '~13K+ words')}</td>
      <td class="muted">${r.path === 'workflow' ? 'Regular LLM + 2-pass · no repo · no demo' : (r.path === 'autonomous' ? 'Architect (autonomous/deepest) · repo · live demo' : 'Architect (professional) · repo · live demo')}</td>
    </tr>`).join('');

  const detail = runs.map(r => {
    const steps = r.steps || [];
    const max = Math.max(...steps.map(s => s.durationMs), 1);
    const stepRows = steps.map(s => {
      const w = Math.max(1, Math.round((s.durationMs / max) * 100));
      return `<tr><td>${esc(STEP_LABELS[s.label] || s.label)}</td><td class="num">${mmss(s.durationMs)}</td>
        <td class="bar-cell"><span class="bar" style="width:${w}%;background:${COLORS[r.path]}"></span></td>
        <td class="${s.ok ? 'ok' : 'err'}">${s.ok ? '✓' : 'fail'}</td></tr>`;
    }).join('');
    const phases = r.phases ? `<div class="phases"><span class="lbl">Architect phases:</span> ${r.phases.map(p => `${esc(p.phase)} <span class="muted">@${(p.atMs / 60000).toFixed(1)}m</span>`).join(' → ')}</div>` : '';
    let shots = [];
    try { shots = fs.readdirSync(path.join(ROOT, r.path)).filter(f => f.endsWith('.png')).sort(); } catch {}
    const gallery = shots.map(f => `<figure><img loading="lazy" src="${DIR_REL.replace(/\\/g, '/')}/${r.path}/${f}" alt="${esc(f)}"/><figcaption>${esc(f.replace(/^\d+-|\.png$/g, ''))}</figcaption></figure>`).join('');
    return `<section class="run">
      <h3 style="color:${COLORS[r.path]}">${esc(r.name)} <span class="badge">${r.totalMin} min · ${r.caps} caps · ${r.reqs} reqs</span></h3>
      <table class="steps"><thead><tr><th>Step</th><th>Duration</th><th>Share</th><th></th></tr></thead><tbody>${stepRows}</tbody></table>
      ${phases}
      <div class="gallery">${gallery}</div>
    </section>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Build Path Timing — Workflow vs Full vs Autonomous</title>
<style>
  :root{--primary:#1a365d;--text:#1f2937;--muted:#6b7280;--bg:#f8fafc;--border:#e5e7eb;--green:#15803d;--red:#b91c1c;--mono:ui-monospace,Menlo,Consolas,monospace;}
  *{box-sizing:border-box;} body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--text);background:var(--bg);margin:0;line-height:1.55;}
  .shell{max-width:1040px;margin:0 auto;padding:2rem 1.5rem 4rem;}
  header{border-bottom:1px solid var(--border);padding-bottom:1.25rem;margin-bottom:1.5rem;}
  .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:600;}
  h1{margin:4px 0;font-size:25px;color:var(--primary);} h2{margin-top:2.3rem;font-size:18px;color:var(--primary);border-bottom:1px solid var(--border);padding-bottom:6px;}
  h3{font-size:17px;margin-top:1.4rem;}
  table{width:100%;border-collapse:collapse;margin:.7rem 0;font-size:13.5px;} th,td{text-align:left;padding:.5rem .7rem;border-bottom:1px solid var(--border);vertical-align:top;}
  th{background:#f1f5f9;font-weight:600;} td.num{font-variant-numeric:tabular-nums;white-space:nowrap;width:90px;}
  .bar-cell{width:42%;} .bar{display:inline-block;height:11px;border-radius:5px;}
  code{font-family:var(--mono);background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:12px;}
  .muted{color:var(--muted);} .ok{color:var(--green);font-weight:600;} .err{color:var(--red);font-weight:600;}
  .run{background:#fff;border:1px solid var(--border);border-radius:8px;padding:1.1rem 1.3rem;margin:1rem 0;box-shadow:0 1px 3px rgba(15,23,42,.04);}
  .badge{font-size:11px;font-weight:600;color:var(--muted);background:#f1f5f9;border-radius:10px;padding:3px 9px;margin-left:8px;}
  .phases{font-size:12.5px;margin:.4rem 0 .8rem;background:#f8fafc;border-left:3px solid var(--border);padding:6px 12px;border-radius:0 6px 6px 0;} .phases .lbl{font-weight:600;}
  .gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:.5rem;} figure{margin:0;} figure img{width:100%;border:1px solid var(--border);border-radius:5px;display:block;}
  figcaption{font-size:11px;color:var(--muted);margin-top:4px;font-family:var(--mono);}
  .card{background:#fff;border:1px solid var(--border);border-radius:8px;padding:1rem 1.2rem;margin:1rem 0;font-size:14px;}
  ul li{font-size:14px;margin:4px 0;}
</style></head><body><div class="shell">
<header>
  <div class="eyebrow">Production · same idea · headless E2E with timing</div>
  <h1>Build paths: how long each takes, end to end</h1>
  <div class="muted">Generated ${esc(data.generated_at)} · idea: "AI handles all the annoying life stuff" (personal-assistant workflow)</div>
</header>

<h2>Side by side</h2>
<table>
  <thead><tr><th>Path</th><th>Result</th><th>Total time</th><th>Capabilities</th><th>Requirements</th><th>Document</th><th>What runs</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>
<div class="card">
  <b>Read in one line:</b> Workflow is a ~3-minute, no-repo draft that still builds out into capabilities; Full Project is a ~13-minute Architect build; Fully Autonomous is a ~21-minute build that goes much deeper (≈8× the requirements). The wait in the two Architect paths is almost entirely the <code>chapter_build</code> phase — everything else (idea, questions, retrieval, clustering) is seconds to ~2 minutes.
</div>

<h2>Per-path breakdown</h2>
${detail}

<h2>What the numbers say</h2>
<div class="card"><ul>
  <li><b>Workflow ≈ 3 min.</b> The two-pass document generation (~1m45s) and the no-repo build-out (~35s) are the only real costs. Good for a quick, tailored automation spec. (This path was previously broken — it saved a doc but built out 0 capabilities; now fixed.)</li>
  <li><b>Full Project ≈ 13 min.</b> ~11 min of that is the Architect writing chapters; idea→questions is &lt;1 min, and retrieval + clustering is ~1.5 min. Produces a full implementation-grade spec.</li>
  <li><b>Fully Autonomous ≈ 21 min.</b> Same shape, but the deepest setting spends ~17.5 min writing far more — <b>331 requirements vs 42</b> and <b>18 capabilities vs 8</b>. Worth it only when you want the exhaustive build guide.</li>
  <li><b>The wait is the chapter phase.</b> In both Architect paths, the user is essentially watching chapters get written — which is exactly what the live preview demo is for.</li>
</ul></div>

<p class="muted" style="font-size:12px;margin-top:2rem">Raw data: <code>docs/screenshots/2026-05-21-path-timing/timings.json</code>. Reproduce: <code>node scripts/documentBuildPaths.js</code> then <code>node scripts/buildPathTimingReport.js</code>.</p>
</div></body></html>`;

  fs.writeFileSync(OUT, html, 'utf8');
  console.log(`[report] wrote ${OUT}`);
}
main();
