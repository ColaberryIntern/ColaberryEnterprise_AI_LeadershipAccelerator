/**
 * buildFullPipelineReport — 2026-05-20.
 *
 * Merges the two phases into one report covering the complete pipeline:
 *   generation (timings.json: idea → questions → generate → review → save)
 *   build-out  (buildout.json: activate → cluster → capabilities/features)
 *
 * Produces a token-free, committable HTML with per-run timing tables, the
 * verified capability/feature/requirement counts, and every screenshot in
 * order (01..12) so each stage can be reviewed in sequence.
 *
 * Login URLs (magic links, sensitive) are NOT embedded — they are written to
 * a gitignored sidecar scripts/.demo_login_urls.txt for local use.
 *
 * Run: CAPTURE_OUT=docs/screenshots/2026-05-20-buildout-e2e node scripts/buildFullPipelineReport.js
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATE = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);
const OUT_REL = (process.env.CAPTURE_OUT && path.relative(path.join(REPO_ROOT, 'docs'), process.env.CAPTURE_OUT))
  || path.join('screenshots', `${DATE}-buildout-e2e`);
const RUN_ROOT = path.join(REPO_ROOT, 'docs', OUT_REL);
const TIMINGS = path.join(RUN_ROOT, 'timings.json');
const BUILDOUT = path.join(RUN_ROOT, 'buildout.json');
const RUNS_FILE = path.join(REPO_ROOT, 'scripts', '.demo_onboarding_runs.json');
const OUT = path.join(REPO_ROOT, 'docs', 'REQUIREMENTS_BUILD_OUT_E2E_REPORT.html');
const LOGIN_SIDECAR = path.join(REPO_ROOT, 'scripts', '.demo_login_urls.txt');

const GEN_STEP_LABELS = {
  auth_verify: 'Authenticate (magic-link → JWT)', precheck_state: 'Pre-check: first-run state',
  load_home: 'Load /portal/home (builder embedded)', fill_idea: 'Type the idea',
  expand_questions: 'Generate questions (LLM)', answer_questions: 'Answer all questions',
  click_generate: 'Click "Generate My Requirements"', generation: 'Generate document (LLM, polled)',
  save: 'Save requirements doc', verify_persist: 'Verify persistence (API)',
  home_flips_to_dashboard: 'Home flips to dashboard',
};
const BO_STEP_LABELS = {
  auth_verify: 'Authenticate', precheck_gate: 'Pre-check: doc saved + gate satisfied',
  load_blueprint_before: 'Blueprint (before build-out)', post_activate: 'POST /setup/activate (build-out API)',
  activation: 'Cluster requirements → capabilities (LLM, polled)', verify_buildout: 'Verify capabilities via API',
  load_blueprint_after: 'Blueprint (built out)', load_system_bps: 'System · Business Processes',
  load_system_overview: 'System · overview',
};

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function secs(ms) { return (ms / 1000).toFixed(1) + 's'; }

function stepTable(steps, labels) {
  const max = Math.max(...steps.map(s => s.durationMs), 1);
  return steps.map(s => {
    const w = Math.max(1, Math.round((s.durationMs / max) * 100));
    return `<tr><td>${esc(labels[s.label] || s.label)}</td><td class="num">${secs(s.durationMs)}</td>
      <td class="bar-cell"><span class="bar" style="width:${w}%"></span></td>
      <td class="${s.ok ? 'ok' : 'err'}">${s.ok ? '✓' : esc(s.error || 'fail')}</td></tr>`;
  }).join('\n');
}
function gallery(shots) {
  return (shots || []).map(sc => {
    const rel = sc.file.split(/[\\/]/).slice(-2).join('/');
    return `<figure><img loading="lazy" src="${esc(OUT_REL.replace(/\\/g, '/'))}/${esc(rel)}" alt="${esc(sc.label)}"/><figcaption>${esc(sc.label)}</figcaption></figure>`;
  }).join('\n');
}

function main() {
  for (const f of [TIMINGS, BUILDOUT]) {
    if (!fs.existsSync(f)) { console.error(`Missing ${f}`); process.exit(1); }
  }
  const gen = JSON.parse(fs.readFileSync(TIMINGS, 'utf8'));
  const bo = JSON.parse(fs.readFileSync(BUILDOUT, 'utf8'));
  const tokens = fs.existsSync(RUNS_FILE) ? JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8')) : [];

  // Write login sidecar (gitignored) + collect for the report's "accounts" table (email only).
  const loginLines = [];
  const merged = gen.runs.map(g => {
    const b = bo.runs.find(r => r.run === g.run) || {};
    const tok = tokens.find(t => t.run === g.run);
    if (tok) loginLines.push(`Run ${g.run} — ${tok.email}\n  ${tok.portal_url}`);
    const genMs = g.totalMs || 0;
    const boMs = b.totalMs || 0;
    return { run: g.run, name: g.name, email: g.email, gen: g, bo: b, genMin: g.totalMin, boMin: b.totalMin, totalMin: +((genMs + boMs) / 60000).toFixed(2), counts: b.counts };
  });
  if (loginLines.length) {
    fs.writeFileSync(LOGIN_SIDECAR, `Demo account login URLs (magic links — reusable until token expiry).\nGenerated ${new Date().toISOString()}\n\n` + loginLines.join('\n\n') + '\n');
    console.log(`[report] wrote login sidecar ${LOGIN_SIDECAR}`);
  }

  const allOk = gen.all_ok && bo.all_ok;

  const summaryRows = merged.map(m => `
    <tr><td><b>Run ${m.run}</b><div class="muted">${esc(m.name)}</div></td>
      <td>${esc(m.email)}</td>
      <td class="ok">${m.gen.ok && m.bo.ok ? 'PASS' : 'FAIL'}</td>
      <td>${m.genMin} min</td><td>${m.boMin} min</td><td><b>${m.totalMin} min</b></td>
      <td>${m.counts ? `<b>${m.counts.capabilities}</b> caps · ${m.counts.features} feats · ${m.counts.requirements} reqs` : '—'}</td>
    </tr>`).join('\n');

  const detail = merged.map(m => `
    <section class="run">
      <h3>Run ${m.run} — ${esc(m.name)} <span class="badge ${m.gen.ok && m.bo.ok ? 'b-ok' : 'b-err'}">${m.gen.ok && m.bo.ok ? 'PASS' : 'FAIL'}</span></h3>
      <p class="muted">Account <code>${esc(m.email)}</code> · enrollment <code>${esc(m.gen.enrollment_id)}</code></p>
      ${m.counts ? `<div class="counts">Built out: <b>${m.counts.capabilities}</b> capabilities · <b>${m.counts.features}</b> features · <b>${m.counts.requirements}</b> requirements parsed${m.counts.map_summary ? ` · ${m.counts.map_summary.matched || 0}/${m.counts.map_summary.total || m.counts.requirements} matched to code (no repo connected → 0 expected)` : ''}</div>` : ''}
      <h4>Phase 1 — Generate &amp; save the requirements document (${m.genMin} min)</h4>
      <table class="steps"><thead><tr><th>Step</th><th>Duration</th><th>Relative</th><th>OK</th></tr></thead><tbody>${stepTable(m.gen.steps, GEN_STEP_LABELS)}</tbody></table>
      <h4>Phase 2 — Build out the project from the document (${m.boMin} min)</h4>
      <table class="steps"><thead><tr><th>Step</th><th>Duration</th><th>Relative</th><th>OK</th></tr></thead><tbody>${stepTable(m.bo.steps, BO_STEP_LABELS)}</tbody></table>
      <h4>Every stage, in order</h4>
      <div class="gallery">${gallery([...(m.gen.screenshots || []), ...(m.bo.screenshots || [])])}</div>
    </section>`).join('\n');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Full Pipeline E2E — Generate + Build Out (${esc(DATE)})</title>
<style>
  :root{--primary:#1a365d;--blue:#3b82f6;--green:#15803d;--red:#b91c1c;--text:#1f2937;--muted:#6b7280;--bg:#f8fafc;--border:#e5e7eb;--mono:ui-monospace,Menlo,Consolas,monospace;}
  *{box-sizing:border-box;} body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--text);background:var(--bg);margin:0;line-height:1.55;}
  .shell{max-width:1080px;margin:0 auto;padding:2rem 1.5rem 4rem;}
  header{border-bottom:1px solid var(--border);padding-bottom:1.25rem;margin-bottom:1.5rem;}
  .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:600;}
  h1{margin:4px 0;font-size:25px;color:var(--primary);} h2{margin-top:2.25rem;font-size:18px;color:var(--primary);border-bottom:1px solid var(--border);padding-bottom:6px;}
  h3{font-size:16px;color:var(--primary);margin-top:1.5rem;} h4{font-size:13.5px;color:var(--primary);margin:1.1rem 0 .3rem;}
  .verdict{display:inline-block;padding:.6rem 1.1rem;border-radius:8px;font-weight:700;font-size:15px;margin:.5rem 0;}
  .v-ok{background:#dcfce7;color:var(--green);border:1px solid #86efac;} .v-err{background:#fee2e2;color:var(--red);border:1px solid #fca5a5;}
  table{width:100%;border-collapse:collapse;margin:.6rem 0;font-size:13.5px;} th,td{text-align:left;padding:.45rem .7rem;border-bottom:1px solid var(--border);vertical-align:top;}
  th{background:#f1f5f9;font-weight:600;} td.num{font-variant-numeric:tabular-nums;white-space:nowrap;width:80px;}
  .bar-cell{width:38%;} .bar{display:inline-block;height:10px;background:linear-gradient(90deg,#3b82f6,#8b5cf6);border-radius:5px;}
  code{font-family:var(--mono);background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:12px;color:var(--primary);}
  .muted{color:var(--muted);font-size:12.5px;} .ok{color:var(--green);font-weight:600;} .err{color:var(--red);font-weight:600;}
  .run{background:#fff;border:1px solid var(--border);border-radius:8px;padding:1.2rem 1.4rem;margin:1rem 0;box-shadow:0 1px 3px rgba(15,23,42,.04);}
  .counts{background:#eff6ff;border-left:3px solid var(--blue);border-radius:0 6px 6px 0;padding:8px 12px;font-size:13px;margin:.4rem 0;}
  .badge{font-size:11px;padding:3px 9px;border-radius:10px;font-weight:600;margin-left:8px;} .b-ok{background:#dcfce7;color:var(--green);} .b-err{background:#fee2e2;color:var(--red);}
  .gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:.5rem;} figure{margin:0;} figure img{width:100%;border:1px solid var(--border);border-radius:5px;display:block;}
  figcaption{font-size:11px;color:var(--muted);margin-top:4px;font-family:var(--mono);}
  .card{background:#fff;border:1px solid var(--border);border-radius:8px;padding:1rem 1.2rem;margin:1rem 0;}
  ol.flow{font-size:13.5px;} ol.flow code{font-size:11.5px;}
</style></head><body><div class="shell">
<header>
  <div class="eyebrow">Production · Headless E2E · enterprise.colaberry.ai</div>
  <h1>Requirements → Built-Out Project: full pipeline on 3 accounts</h1>
  <div class="muted">Generated ${esc(bo.generated_at)} · base ${esc(bo.base)}</div>
  <div class="verdict ${allOk ? 'v-ok' : 'v-err'}">${allOk ? '✓ 3 / 3 accounts: document generated, saved, AND built out into capabilities/features — verified via API' : '✗ Not all runs passed'}</div>
</header>

<h2>What this proves</h2>
<div class="card">
  <p>For three different projects, on three fresh demo accounts, the entire pipeline ran end-to-end against <b>production</b>: the requirements document was generated and saved, then the real build-out API parsed it and clustered it into a Capability → Feature hierarchy. Each account now has a populated project you can log into and review.</p>
  <ol class="flow">
    <li>Generate document — <code>POST /api/portal/project/requirements/generate</code> → polled via <code>/requirements/job/:id</code></li>
    <li>Retrieve &amp; save — the generated doc is read back and saved via <code>POST /api/portal/project/setup/requirements</code></li>
    <li><b>Build out</b> — <code>POST /api/portal/project/setup/activate</code> parses the doc into a RequirementsMap and clusters it into capabilities/features (polled via <code>/setup/activation-progress</code>)</li>
    <li>Verify — <code>GET /capabilities</code> and <code>/requirements/map</code> confirm the project was populated (counts below)</li>
  </ol>
  <p class="muted">Build-out ran in "capabilities only" mode: no GitHub repo was connected, so requirements are parsed and clustered but not matched to code files (the "0 matched" figure is expected). The clustering uses an LLM, so capability/feature counts vary per project.</p>
</div>

<h2>Final results</h2>
<table>
  <thead><tr><th>Run</th><th>Account</th><th>Result</th><th>Generate</th><th>Build out</th><th>Total</th><th>Built-out structure (verified via API)</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>

<h2>Per-run: timings + every screenshot in sequence</h2>
${detail}

<div class="card">
  <div class="eyebrow">Log in to review each account</div>
  <p class="muted">Three magic-link login URLs were written to <code>scripts/.demo_login_urls.txt</code> (kept out of git). Open any one in a fresh browser to land on that account's portal and view its built-out System / Blueprint.</p>
  <div class="eyebrow" style="margin-top:1rem">Reproduce</div>
  <p class="muted"><code>ssh ... -e RESET=1 ... node &lt; backend/src/scripts/provisionDemoOnboardingRuns.js</code> → <code>node scripts/driveRequirementsBuilder.js</code> → <code>ssh ... node &lt; backend/src/scripts/enableDemoBuildOut.js</code> → <code>node scripts/captureBuildOut.js</code> → <code>node scripts/buildFullPipelineReport.js</code></p>
</div>
</div></body></html>`;

  fs.writeFileSync(OUT, html, 'utf8');
  console.log(`[report] wrote ${OUT}`);
  console.log(`[report] verdict ${allOk ? 'PASS' : 'FAIL'}, ${merged.length} runs`);
}

main();
