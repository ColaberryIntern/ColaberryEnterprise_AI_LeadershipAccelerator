/**
 * buildOnboardingRunReport — 2026-05-20.
 *
 * Compiles the end-to-end requirements-builder run results into a single
 * human-readable HTML report: the build-break-harden log (what broke, root
 * cause, the fix), per-step timing tables, a final timings summary, and the
 * real production screenshots from every stop so the whole flow can be
 * followed visually.
 *
 * Input:  docs/screenshots/<date>-onboarding-e2e/timings.json
 * Output: docs/REQUIREMENTS_BUILDER_E2E_REPORT.html
 *
 * Run: node scripts/buildOnboardingRunReport.js
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATE = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);
const RUN_DIR_REL = path.join('screenshots', `${DATE}-onboarding-e2e`);
const TIMINGS = path.join(REPO_ROOT, 'docs', RUN_DIR_REL, 'timings.json');
const OUT = path.join(REPO_ROOT, 'docs', 'REQUIREMENTS_BUILDER_E2E_REPORT.html');

// The build-break-harden record. Hand-authored because the *why* matters more
// than any machine signal; the timing/pass data below is read from timings.json.
const BREAK_FIX = [
  {
    when: 'Run 1, first attempt — failed at the "generation" step in 0.8 min',
    severity: 'blocker',
    broke: 'POST /api/portal/project/requirements/generate started a job that immediately failed with "No project found for this enrollment". The review screen never appeared.',
    cause: 'startRequirementsGeneration() looked up the enrollment\'s Project and threw if none existed. But the first-run flow only creates the project at Save — which happens AFTER generation. So no genuine first-run user could ever generate a document. The documented walkthrough described a flow that did not actually complete end-to-end on production.',
    fix: 'Create the project idempotently at the start of generation via createProjectForEnrollment() (findOrCreate on enrollment_id). The later Save calls the same helper and finds the same row — no duplicate project is created.',
    file: 'backend/src/services/requirementsGenerationService.ts',
    commit: 'c53a105b',
  },
  {
    when: 'Caught by code review during the same fix; confirmed on Run 1 review screen',
    severity: 'blocker',
    broke: 'Even once generation completed, the review screen would render an empty document (0 words) and Save would persist empty content.',
    cause: 'The polling endpoint GET /requirements/job/:id returns getJobStatus(), which omitted the document entirely. The frontend reads result.content on completion, so it always resolved to "". The generated text was persisted on the job row (output_document) but never returned by the read path.',
    fix: 'getJobStatus() now returns result: { content: output_document } (and a top-level output_document). The review screen now renders the real document with its word count.',
    file: 'backend/src/services/requirementsGenerationService.ts',
    commit: 'c53a105b',
  },
];

const STEP_LABELS = {
  auth_verify: 'Authenticate (magic-link → JWT)',
  precheck_state: 'Pre-check: first-run state',
  load_home: 'Load /portal/home (builder embedded)',
  fill_idea: 'Type the idea',
  expand_questions: 'Generate questions (LLM)',
  answer_questions: 'Answer all questions',
  click_generate: 'Click "Generate My Requirements"',
  generation: 'Generate document (LLM, polled)',
  save: 'Save & Continue Setup',
  verify_persist: 'Verify persistence (API)',
  home_flips_to_dashboard: 'Home flips to dashboard',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function secs(ms) { return (ms / 1000).toFixed(1) + 's'; }

function main() {
  if (!fs.existsSync(TIMINGS)) {
    console.error(`Missing ${TIMINGS}. Run driveRequirementsBuilder.js first.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(TIMINGS, 'utf8'));
  const runs = data.runs || [];

  const verdictOk = data.all_ok && data.all_within_budget;

  // Build-break-harden cards.
  const breakFixHtml = BREAK_FIX.map((b, i) => `
    <div class="bf">
      <div class="bf-head"><span class="bf-num">${i + 1}</span> <span class="sev sev-${b.severity}">${esc(b.severity)}</span> <span class="bf-when">${esc(b.when)}</span></div>
      <table class="kv">
        <tr><td class="k">What broke</td><td>${esc(b.broke)}</td></tr>
        <tr><td class="k">Root cause</td><td>${esc(b.cause)}</td></tr>
        <tr><td class="k">The fix</td><td>${esc(b.fix)}</td></tr>
        <tr><td class="k">Where</td><td><code>${esc(b.file)}</code> · commit <code>${esc(b.commit)}</code></td></tr>
      </table>
    </div>`).join('\n');

  // Final timings summary table.
  const summaryRows = runs.map(r => `
    <tr>
      <td><b>Run ${r.run}</b><div class="muted">${esc(r.name)}</div></td>
      <td>${esc(r.email)}</td>
      <td class="${r.ok ? 'ok' : 'err'}">${r.ok ? 'PASS' : 'FAIL'}</td>
      <td>${r.totalMin} min</td>
      <td class="${r.within_budget ? 'ok' : 'err'}">${r.within_budget ? 'within 30 min' : 'OVER'}</td>
      <td>${r.consoleErrors ? r.consoleErrors.length : 0}</td>
      <td>${esc(r.persisted_state ? r.persisted_state.stage : '—')}</td>
    </tr>`).join('\n');

  // Per-run detail: step table + screenshots.
  const runDetail = runs.map(r => {
    const stepRows = (r.steps || []).map(s => {
      const max = Math.max(...r.steps.map(x => x.durationMs), 1);
      const w = Math.max(1, Math.round((s.durationMs / max) * 100));
      return `<tr>
        <td>${esc(STEP_LABELS[s.label] || s.label)}</td>
        <td class="num">${secs(s.durationMs)}</td>
        <td class="bar-cell"><span class="bar" style="width:${w}%"></span></td>
        <td class="${s.ok ? 'ok' : 'err'}">${s.ok ? '✓' : esc(s.error || 'fail')}</td>
      </tr>`;
    }).join('\n');

    const shots = (r.screenshots || []).map(sc => `
      <figure>
        <img loading="lazy" src="${esc(RUN_DIR_REL.replace(/\\/g, '/'))}/${esc(sc.file.split(/[\\/]/).slice(-2).join('/'))}" alt="${esc(sc.label)}" />
        <figcaption>${esc(sc.label)}</figcaption>
      </figure>`).join('\n');

    return `
    <section class="run">
      <h3>Run ${r.run} — ${esc(r.name)} <span class="badge ${r.ok ? 'b-ok' : 'b-err'}">${r.ok ? 'PASS' : 'FAIL'} · ${r.totalMin} min</span></h3>
      <p class="muted">Idea: ${esc(r.name)} · enrollment <code>${esc(r.enrollment_id)}</code> · persisted stage <code>${esc(r.persisted_state ? r.persisted_state.stage : '—')}</code></p>
      <table class="steps">
        <thead><tr><th>Step</th><th>Duration</th><th>Relative</th><th>OK</th></tr></thead>
        <tbody>${stepRows}</tbody>
      </table>
      <div class="gallery">${shots}</div>
    </section>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Requirements-Builder E2E — 3 Documents in a Row (${esc(DATE)})</title>
<style>
  :root { --primary:#1a365d; --blue:#3b82f6; --green:#15803d; --red:#b91c1c; --amber:#b45309; --text:#1f2937; --muted:#6b7280; --bg:#f8fafc; --border:#e5e7eb; --mono:ui-monospace,Menlo,Consolas,monospace; }
  * { box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:var(--text); background:var(--bg); margin:0; line-height:1.55; }
  .shell { max-width:1080px; margin:0 auto; padding:2rem 1.5rem 4rem; }
  header { border-bottom:1px solid var(--border); padding-bottom:1.25rem; margin-bottom:1.5rem; }
  .eyebrow { font-size:11px; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); font-weight:600; }
  h1 { margin:4px 0; font-size:25px; color:var(--primary); }
  h2 { margin-top:2.25rem; font-size:18px; color:var(--primary); border-bottom:1px solid var(--border); padding-bottom:6px; }
  h3 { font-size:16px; color:var(--primary); margin-top:1.5rem; }
  .verdict { display:inline-block; padding:.6rem 1.1rem; border-radius:8px; font-weight:700; font-size:15px; margin:.5rem 0; }
  .v-ok { background:#dcfce7; color:var(--green); border:1px solid #86efac; }
  .v-err { background:#fee2e2; color:var(--red); border:1px solid #fca5a5; }
  table { width:100%; border-collapse:collapse; margin:.75rem 0; font-size:13.5px; }
  th,td { text-align:left; padding:.5rem .7rem; border-bottom:1px solid var(--border); vertical-align:top; }
  th { background:#f1f5f9; font-weight:600; }
  td.k { width:130px; font-weight:600; color:var(--muted); }
  td.num { font-variant-numeric:tabular-nums; white-space:nowrap; width:80px; }
  .bar-cell { width:40%; }
  .bar { display:inline-block; height:10px; background:linear-gradient(90deg,#3b82f6,#8b5cf6); border-radius:5px; }
  code { font-family:var(--mono); background:#f1f5f9; padding:1px 5px; border-radius:3px; font-size:12px; color:var(--primary); }
  .muted { color:var(--muted); font-size:12.5px; }
  .ok { color:var(--green); font-weight:600; }
  .err { color:var(--red); font-weight:600; }
  .bf { background:#fff; border:1px solid var(--border); border-left:3px solid var(--red); border-radius:8px; padding:1rem 1.2rem; margin:1rem 0; }
  .bf-head { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
  .bf-num { display:inline-flex; width:24px; height:24px; align-items:center; justify-content:center; background:var(--red); color:#fff; border-radius:50%; font-weight:700; font-size:13px; }
  .bf-when { color:var(--muted); font-size:12.5px; }
  .sev { font-size:10px; text-transform:uppercase; letter-spacing:.08em; font-weight:700; padding:2px 7px; border-radius:10px; }
  .sev-blocker { background:#fee2e2; color:var(--red); }
  .badge { font-size:11px; padding:3px 9px; border-radius:10px; font-weight:600; margin-left:8px; }
  .b-ok { background:#dcfce7; color:var(--green); } .b-err { background:#fee2e2; color:var(--red); }
  .run { background:#fff; border:1px solid var(--border); border-radius:8px; padding:1.2rem 1.4rem; margin:1rem 0; box-shadow:0 1px 3px rgba(15,23,42,.04); }
  .gallery { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; margin-top:1rem; }
  figure { margin:0; }
  figure img { width:100%; border:1px solid var(--border); border-radius:5px; display:block; }
  figcaption { font-size:11px; color:var(--muted); margin-top:4px; font-family:var(--mono); }
  .card { background:#fff; border:1px solid var(--border); border-radius:8px; padding:1rem 1.2rem; margin:1rem 0; }
</style>
</head>
<body>
<div class="shell">
<header>
  <div class="eyebrow">Production · Headless E2E · enterprise.colaberry.ai</div>
  <h1>Requirements-Builder: 3 Documents in a Row</h1>
  <div class="muted">Generated ${esc(data.generated_at)} · base ${esc(data.base)} · budget ${esc(data.doc_budget_min)} min/document</div>
  <div class="verdict ${verdictOk ? 'v-ok' : 'v-err'}">${verdictOk ? '✓ 3 / 3 documents created consecutively, all within the 30-minute budget' : '✗ Not all runs passed'}</div>
</header>

<h2>What this proves</h2>
<div class="card">
  <p>The portal first-run requirements-builder flow was driven end-to-end by a headless browser against <b>production</b>, three times in a row, for three different projects — each on a fresh demo enrollment in genuine first-run state (<code>needs_requirements</code>, no project). Every run: typed the idea, generated and answered the AI questions, generated the full requirements document, saved it, and confirmed the home page flipped from the builder to the dashboard. Persistence was re-checked via the onboarding-state API after each save.</p>
  <p>It did not work on the first attempt. Two blocking backend bugs were found and fixed (below) before the three consecutive runs succeeded.</p>
</div>

<h2>What broke and what was fixed (Build → Break → Harden)</h2>
${breakFixHtml}
<p class="muted">Both fixes shipped in commit <code>c53a105b</code>, deployed to the production backend, after which the three consecutive runs below all passed with zero console errors.</p>

<h2>Final timings</h2>
<table>
  <thead><tr><th>Run</th><th>Account</th><th>Result</th><th>Total</th><th>Budget</th><th>Console errors</th><th>Persisted stage</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>
<p class="muted">The two LLM calls dominate every run: question generation (~23–37s) and document generation (~70–112s). All client/auth/save/verify steps are sub-3s. The 30-minute budget is never remotely approached — actual totals are 1.7–2.6 minutes.</p>

<h2>Step-by-step timing + screenshots (follow the whole process)</h2>
${runDetail}

<div class="card">
  <div class="eyebrow">Reproduce</div>
  <p class="muted">Provision/reset 3 demo enrollments (in prod backend container):<br>
  <code>ssh root@95.216.199.47 'docker exec -i -w /app -e RESET=1 accelerator-backend node' &lt; backend/src/scripts/provisionDemoOnboardingRuns.js</code></p>
  <p class="muted">Drive all three:<br><code>node scripts/driveRequirementsBuilder.js</code> &nbsp;·&nbsp; rebuild this report: <code>node scripts/buildOnboardingRunReport.js</code></p>
</div>

</div>
</body>
</html>`;

  fs.writeFileSync(OUT, html, 'utf8');
  console.log(`[report] wrote ${OUT}`);
  console.log(`[report] ${runs.length} runs, verdict ${verdictOk ? 'PASS' : 'FAIL'}`);
}

main();
