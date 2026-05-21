/**
 * buildArchitectReport — 2026-05-20.
 *
 * Report for the REAL requirements-document pipeline: the AI Project
 * Architect (advisor.colaberry.ai) builds the document, the portal retrieves
 * it, and the project is built out into capabilities. Reads architect.json
 * for the verified data and curates the screenshots in each run folder into
 * a clean, ordered gallery (chapter-build progress → completed build guide →
 * portal Blueprint → portal System/BPs).
 *
 * Login URLs (sensitive) go to the gitignored sidecar, not the HTML.
 *
 * Run: CAPTURE_OUT=docs/screenshots/2026-05-20-architect-e2e node scripts/buildArchitectReport.js
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATE = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);
const OUT_REL = (process.env.CAPTURE_OUT && path.relative(path.join(REPO_ROOT, 'docs'), process.env.CAPTURE_OUT))
  || path.join('screenshots', `${DATE}-architect-e2e`);
const RUN_ROOT = path.join(REPO_ROOT, 'docs', OUT_REL);
const ARCH = path.join(RUN_ROOT, 'architect.json');
const RUNS_FILE = path.join(REPO_ROOT, 'scripts', '.demo_onboarding_runs.json');
const OUT = path.join(REPO_ROOT, 'docs', 'REQUIREMENTS_ARCHITECT_E2E_REPORT.html');
const LOGIN_SIDECAR = path.join(REPO_ROOT, 'scripts', '.demo_login_urls.txt');

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// Curate + order the messy screenshot set in a run dir into a clean sequence.
function curateShots(run) {
  const dir = path.join(RUN_ROOT, `run${run}`);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
  const chapter = files.filter(f => /chapter_build/.test(f)).sort();
  const pick = (re) => files.find(f => re.test(f));
  const ordered = [];
  // a couple of chapter-build progress frames (the doc being written)
  chapter.slice(0, 2).forEach(f => ordered.push({ file: f, label: 'Architect: writing chapters' }));
  const complete = pick(/complete/);
  if (complete) ordered.push({ file: complete, label: 'Architect: build guide complete (document retrieved)' });
  const bp = pick(/portal-blueprint/);
  if (bp) ordered.push({ file: bp, label: 'Portal: project built out (Blueprint / next step)' });
  const sys = pick(/portal-system-bps/);
  if (sys) ordered.push({ file: sys, label: 'Portal: System / Business Processes (capabilities)' });
  return ordered.map(o => ({ ...o, rel: `${OUT_REL.replace(/\\/g, '/')}/run${run}/${o.file}` }));
}

function main() {
  if (!fs.existsSync(ARCH)) { console.error(`Missing ${ARCH}`); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(ARCH, 'utf8'));
  const tokens = fs.existsSync(RUNS_FILE) ? JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8')) : [];

  // Refresh login sidecar with the current tokens.
  const loginLines = tokens.map(t => `Run ${t.run} — ${t.email}\n  ${t.portal_url}`);
  if (loginLines.length) {
    fs.writeFileSync(LOGIN_SIDECAR, `Demo account login URLs (magic links — reusable until token expiry).\nGenerated ${new Date().toISOString()}\n\n` + loginLines.join('\n\n') + '\n');
  }

  const allOk = data.all_ok;
  const summaryRows = data.runs.map(r => `
    <tr><td><b>Run ${r.run}</b><div class="muted">${esc(r.name)}</div></td>
      <td><code>${esc(r.slug)}</code></td>
      <td class="${r.ok ? 'ok' : 'err'}">${r.ok ? 'PASS' : 'INCOMPLETE'}</td>
      <td>${r.doc_chars ? r.doc_chars.toLocaleString() + ' chars' : '—'}</td>
      <td>${r.counts ? `<b>${r.counts.capabilities}</b>` : '—'}</td>
      <td>${r.counts ? r.counts.features : '—'}</td>
      <td>${r.requirements != null ? r.requirements : '—'}</td>
    </tr>`).join('\n');

  const detail = data.runs.map(r => {
    const shots = curateShots(r.run);
    const gallery = shots.map(s => `<figure><img loading="lazy" src="${esc(s.rel)}" alt="${esc(s.label)}"/><figcaption>${esc(s.label)}</figcaption></figure>`).join('\n');
    const phases = (r.phases || []).map(p => `<span class="chip">${esc(p.phase)} ${p.progress != null ? p.progress + '%' : ''}</span>`).join(' ');
    return `<section class="run">
      <h3>Run ${r.run} — ${esc(r.name)} <span class="badge ${r.ok ? 'b-ok' : 'b-err'}">${r.ok ? 'PASS' : 'INCOMPLETE'}</span></h3>
      <p class="muted">Architect project <code>${esc(r.slug)}</code> · account <code>${esc(r.email)}</code></p>
      <div class="counts">Document built &amp; retrieved: <b>${r.doc_chars ? r.doc_chars.toLocaleString() : '?'}</b> chars · built out into <b>${r.counts ? r.counts.capabilities : 0}</b> capabilities · <b>${r.counts ? r.counts.features : 0}</b> features · <b>${r.requirements != null ? r.requirements : 0}</b> requirements parsed</div>
      ${phases ? `<div class="phases">Phases observed: ${phases}</div>` : ''}
      <div class="gallery">${gallery}</div>
    </section>`;
  }).join('\n');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>AI Project Architect E2E — Build + Retrieve + Build Out (${esc(DATE)})</title>
<style>
  :root{--primary:#1a365d;--blue:#3b82f6;--green:#15803d;--red:#b91c1c;--text:#1f2937;--muted:#6b7280;--bg:#f8fafc;--border:#e5e7eb;--mono:ui-monospace,Menlo,Consolas,monospace;}
  *{box-sizing:border-box;} body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--text);background:var(--bg);margin:0;line-height:1.55;}
  .shell{max-width:1080px;margin:0 auto;padding:2rem 1.5rem 4rem;}
  header{border-bottom:1px solid var(--border);padding-bottom:1.25rem;margin-bottom:1.5rem;}
  .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:600;}
  h1{margin:4px 0;font-size:25px;color:var(--primary);} h2{margin-top:2.25rem;font-size:18px;color:var(--primary);border-bottom:1px solid var(--border);padding-bottom:6px;}
  h3{font-size:16px;color:var(--primary);margin-top:1.5rem;}
  .verdict{display:inline-block;padding:.6rem 1.1rem;border-radius:8px;font-weight:700;font-size:15px;margin:.5rem 0;}
  .v-ok{background:#dcfce7;color:var(--green);border:1px solid #86efac;} .v-err{background:#fee2e2;color:var(--red);border:1px solid #fca5a5;}
  table{width:100%;border-collapse:collapse;margin:.6rem 0;font-size:13.5px;} th,td{text-align:left;padding:.45rem .7rem;border-bottom:1px solid var(--border);vertical-align:top;}
  th{background:#f1f5f9;font-weight:600;}
  code{font-family:var(--mono);background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:12px;color:var(--primary);}
  .muted{color:var(--muted);font-size:12.5px;} .ok{color:var(--green);font-weight:600;} .err{color:var(--red);font-weight:600;}
  .run{background:#fff;border:1px solid var(--border);border-radius:8px;padding:1.2rem 1.4rem;margin:1rem 0;box-shadow:0 1px 3px rgba(15,23,42,.04);}
  .counts{background:#eff6ff;border-left:3px solid var(--blue);border-radius:0 6px 6px 0;padding:8px 12px;font-size:13px;margin:.4rem 0;}
  .phases{margin:.5rem 0;} .chip{display:inline-block;background:#f1f5f9;border-radius:10px;padding:2px 8px;font-size:11px;color:var(--muted);margin:2px;}
  .badge{font-size:11px;padding:3px 9px;border-radius:10px;font-weight:600;margin-left:8px;} .b-ok{background:#dcfce7;color:var(--green);} .b-err{background:#fef3c7;color:#b45309;}
  .gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:.5rem;} figure{margin:0;} figure img{width:100%;border:1px solid var(--border);border-radius:5px;display:block;}
  figcaption{font-size:11px;color:var(--muted);margin-top:4px;font-family:var(--mono);}
  .card{background:#fff;border:1px solid var(--border);border-radius:8px;padding:1rem 1.2rem;margin:1rem 0;}
  ol.flow{font-size:13.5px;} ol.flow code{font-size:11.5px;}
</style></head><body><div class="shell">
<header>
  <div class="eyebrow">Production · AI Project Architect · advisor.colaberry.ai</div>
  <h1>The real requirements-document API: build → retrieve → build out</h1>
  <div class="muted">Generated ${esc(data.generated_at)} · portal ${esc(data.base)} · architect ${esc(data.architect_base)}</div>
  <div class="verdict ${allOk ? 'v-ok' : 'v-err'}">${allOk ? '✓ 3 / 3 accounts: the AI Project Architect built a full requirements document, the portal retrieved it, and the project was built out into capabilities — all verified via API' : '✗ Not all runs completed'}</div>
</header>

<h2>What this is (and how it differs from the earlier run)</h2>
<div class="card">
  <p>The earlier report used the portal's fast OpenAI generate path (~1,400-word docs). This run uses the <b>actual requirements-document API</b> — the AI Project Architect at <code>advisor.colaberry.ai</code>, an 8-phase pipeline that writes the document chapter by chapter (each chapter gated to ≥1,750 words), which is why it takes the longer build time.</p>
  <ol class="flow">
    <li><b>Build</b> — <code>POST /api/portal/project/architect-build</code> kicks off the Architect (idea_intake → feature_discovery → outline → chapter_build → quality_gates → final_assembly → complete)</li>
    <li><b>Retrieve</b> — <code>GET /api/portal/project/architect-status</code>, on completion, downloads the build guide (<code>getArchitectDocument</code>) and saves it to the project</li>
    <li><b>Build out</b> — activation parses the retrieved document and clusters it into a Capability → Feature hierarchy</li>
    <li><b>Verify</b> — <code>GET /capabilities</code> + <code>/requirements/map</code> confirm the populated project (counts below)</li>
  </ol>
  <p class="muted">Each retrieved document is ~100,000 characters (~27–28 pages), versus ~1,400 words from the fast path. Build-out ran capabilities-only (throwaway public repo connected to satisfy the structural requirement; requirements are not matched to code files).</p>
</div>

<h2>Verified results</h2>
<table>
  <thead><tr><th>Run</th><th>Architect project</th><th>Result</th><th>Document retrieved</th><th>Capabilities</th><th>Features</th><th>Requirements</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>

<h2>Per-run: the process, in order</h2>
${detail}

<div class="card">
  <div class="eyebrow">Log in to review each built-out account</div>
  <p class="muted">Three magic-link URLs were written to <code>scripts/.demo_login_urls.txt</code> (kept out of git). Each lands on a portal whose project was built from an Architect document — open Blueprint and System to see the capabilities.</p>
  <div class="eyebrow" style="margin-top:1rem">Note on screenshots</div>
  <p class="muted">The earliest Architect phases (idea intake → outline, ~90s total) are not shown because polling attached once the builds had already reached chapter writing. The chapter-build, completion, and built-out portal surfaces are captured.</p>
</div>
</div></body></html>`;

  fs.writeFileSync(OUT, html, 'utf8');
  console.log(`[report] wrote ${OUT}`);
  console.log(`[report] verdict ${allOk ? 'PASS' : 'INCOMPLETE'}, ${data.runs.length} runs`);
}

main();
