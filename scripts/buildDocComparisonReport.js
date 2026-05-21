/**
 * buildDocComparisonReport — 2026-05-21.
 *
 * Renders the requirements-generator comparison (AI Project Architect vs the
 * regular single-call LLM) into a report, from the controlled run in
 * docs/doc-comparison/{metrics.json,architect.md,regular.md}.
 *
 * Run: node scripts/buildDocComparisonReport.js
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'docs', 'doc-comparison');
const OUT = path.resolve(__dirname, '..', 'docs', 'REQUIREMENTS_GENERATOR_COMPARISON.html');

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Pull a representative body excerpt (skip the title, grab a mid-doc slice).
function excerpt(text, approxStart, len) {
  const slice = text.slice(approxStart, approxStart + len);
  return slice.replace(/^[^\n]*\n/, '').trim();
}

function main() {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, 'metrics.json'), 'utf8'));
  const architect = fs.readFileSync(path.join(DIR, 'architect.md'), 'utf8');
  const regular = fs.readFileSync(path.join(DIR, 'regular.md'), 'utf8');

  // Find a comparable section in each for a density sample.
  const archIdx = Math.max(0, architect.indexOf('Core Capabilities'));
  const regIdx = Math.max(0, regular.indexOf('Functional Requirements'));
  const archExcerpt = excerpt(architect, archIdx, 1400);
  const regExcerpt = excerpt(regular, regIdx, 1400);

  const sectionList = (arr) => arr.map(s => `<li>${esc(s)}</li>`).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Requirements Generator Comparison — Architect vs Regular LLM</title>
<style>
  :root{--primary:#1a365d;--blue:#3b82f6;--purple:#8b5cf6;--green:#15803d;--amber:#b45309;--red:#b91c1c;--text:#1f2937;--muted:#6b7280;--bg:#f8fafc;--border:#e5e7eb;--mono:ui-monospace,Menlo,Consolas,monospace;}
  *{box-sizing:border-box;} body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--text);background:var(--bg);margin:0;line-height:1.6;}
  .shell{max-width:1040px;margin:0 auto;padding:2rem 1.5rem 4rem;}
  header{border-bottom:1px solid var(--border);padding-bottom:1.25rem;margin-bottom:1.5rem;}
  .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:600;}
  h1{margin:4px 0;font-size:25px;color:var(--primary);} h2{margin-top:2.4rem;font-size:19px;color:var(--primary);border-bottom:1px solid var(--border);padding-bottom:6px;}
  h3{font-size:15px;color:var(--primary);margin:1.3rem 0 .4rem;}
  p{font-size:14.5px;} li{font-size:14px;margin:3px 0;}
  table{width:100%;border-collapse:collapse;margin:.8rem 0;font-size:14px;} th,td{text-align:left;padding:.55rem .8rem;border-bottom:1px solid var(--border);vertical-align:top;}
  th{background:#f1f5f9;font-weight:600;} td.k{width:230px;font-weight:600;color:var(--muted);}
  .arch{color:var(--purple);font-weight:700;} .reg{color:var(--blue);font-weight:700;}
  code{font-family:var(--mono);background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:12.5px;color:var(--primary);}
  .big{font-size:30px;font-weight:800;line-height:1;} .unit{font-size:12px;color:var(--muted);font-weight:600;}
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:1rem 0;}
  .card{background:#fff;border:1px solid var(--border);border-radius:10px;padding:1.1rem 1.3rem;}
  .card.a{border-top:4px solid var(--purple);} .card.b{border-top:4px solid var(--blue);}
  .pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 9px;border-radius:10px;}
  .pill.a{background:#f3e8ff;color:var(--purple);} .pill.b{background:#dbeafe;color:var(--blue);}
  pre{background:#0f172a;color:#e2e8f0;border-radius:8px;padding:.9rem 1rem;font-family:var(--mono);font-size:11.5px;line-height:1.5;overflow-x:auto;white-space:pre-wrap;max-height:340px;overflow-y:auto;}
  .note{background:#fffbeb;border-left:3px solid var(--amber);border-radius:0 6px 6px 0;padding:10px 14px;font-size:13.5px;margin:1rem 0;}
  .key{background:#eff6ff;border-left:3px solid var(--blue);border-radius:0 6px 6px 0;padding:10px 14px;font-size:13.5px;margin:1rem 0;}
  .rec{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:1rem 1.2rem;margin:1rem 0;}
  ul.cols{columns:2;}
</style></head><body><div class="shell">
<header>
  <div class="eyebrow">Controlled comparison · same idea · production</div>
  <h1>Requirements document: AI Project Architect vs the regular LLM</h1>
  <div class="muted">Generated ${esc(m.generated_at)} · idea: "ShelfSense Inventory" (multi-location retail inventory) · ${esc(m.idea_chars)}-char idea</div>
</header>

<p>Both generators were run on the <b>same idea</b>. The Architect's doc was the one already built during the E2E; the regular doc was generated fresh (job-only, not saved). This isolates the real question: for the same starting point, what does each produce, how big can it get, and which fits a basic workflow vs a full build.</p>

<h2>Headline numbers</h2>
<div class="cards">
  <div class="card a">
    <span class="pill a">AI PROJECT ARCHITECT</span>
    <div style="margin-top:8px"><span class="big arch">${m.architect.words.toLocaleString()}</span> <span class="unit">words · ~${m.architect.est_pages} pages</span></div>
    <div class="muted" style="font-size:12.5px;margin-top:4px">${m.architect.chars.toLocaleString()} chars · ${m.architect.headings.h1} chapters · ${m.architect.headings.h2} sections · ${m.architect.headings.h3} sub-points</div>
    <div style="font-size:13px;margin-top:8px">Input: <b>${m.idea_chars}-char idea only</b> → <b class="arch">${m.explosion.architect_x}× explosion</b></div>
  </div>
  <div class="card b">
    <span class="pill b">REGULAR LLM (gpt-4o-mini)</span>
    <div style="margin-top:8px"><span class="big reg">${m.regular.words.toLocaleString()}</span> <span class="unit">words · ~${m.regular.est_pages} pages</span></div>
    <div class="muted" style="font-size:12.5px;margin-top:4px">${m.regular.chars.toLocaleString()} chars · ${m.regular.headings.h2} sections · ${m.regular.headings.h3} sub-points</div>
    <div style="font-size:13px;margin-top:8px">Input: <b>${m.regular_prompt_chars}-char prompt</b> (idea + questionnaire) → <b class="reg">${m.explosion.regular_x}× explosion</b></div>
  </div>
</div>
<p style="text-align:center;font-size:15px"><b>The Architect doc is ${m.explosion.architect_vs_regular_size}× the size of the regular doc</b> from the same idea.</p>

<h2>Input → output: what each accepts and explodes to</h2>
<table>
  <tr><th>Dimension</th><th>AI Project Architect</th><th>Regular LLM</th></tr>
  <tr><td class="k">What you feed it</td><td>Just the <b>idea</b> (a sentence/paragraph). It runs its own feature-discovery, so it doesn't take the questionnaire.</td><td>The <b>idea + everything from the questionnaire</b> (selected capabilities), assembled into one prompt.</td></tr>
  <tr><td class="k">Input size accepted</td><td>Practically a paragraph→page (no hard cap; chat-driven).</td><td>Bounded only by model context (~128K tokens ≈ ~96K words) — you can feed a large questionnaire.</td></tr>
  <tr><td class="k">Output produced (this run)</td><td><span class="arch">${m.architect.words.toLocaleString()} words</span> (${m.architect.chars.toLocaleString()} chars)</td><td><span class="reg">${m.regular.words.toLocaleString()} words</span> (${m.regular.chars.toLocaleString()} chars)</td></tr>
  <tr><td class="k">Explosion ratio</td><td class="arch">${m.explosion.architect_x}× the idea</td><td class="reg">${m.explosion.regular_x}× the prompt</td></tr>
  <tr><td class="k">How it generates</td><td>8 phases + per-chapter writes, each chapter gated to ≥${m.architect_config.chapter_min_words} words and <b>retried if short</b>, then assembled. Dozens of LLM calls.</td><td><b>One</b> ${m.regular_config.model} call, max_tokens ${m.regular_config.max_tokens.toLocaleString()}, temp ${m.regular_config.temperature}.</td></tr>
  <tr><td class="k">Time (measured)</td><td>~14–16 min</td><td>~70–103 s</td></tr>
</table>

<h2>How big could each get? (the ceiling)</h2>
<div class="key"><b>This is the core architectural difference.</b> A single LLM call is limited two ways: a hard <code>max_tokens</code> cap, and the model's own tendency to "wrap up." The Architect sidesteps both by writing chapter-by-chapter with enforced minimums.</div>
<table>
  <tr><th></th><th>Regular LLM (single call)</th><th>AI Project Architect (multi-chapter)</th></tr>
  <tr><td class="k">Hard ceiling</td><td>max_tokens ${m.regular_config.max_tokens.toLocaleString()} ≈ <b>~12,000 words</b> in one response</td><td><b>Effectively unbounded</b> — each chapter is its own call; add chapters to grow</td></tr>
  <tr><td class="k">Practical reality</td><td>It was asked for <b>≥6,000 words</b> and produced <b class="reg">${m.regular.words.toLocaleString()}</b> (~24%). gpt-4o-mini self-limits to ~1,500–3,000 words regardless of the ask.</td><td>Hit <b class="arch">${m.architect.words.toLocaleString()}</b> words by enforcing ≥${m.architect_config.chapter_min_words}/chapter and retrying short chapters.</td></tr>
  <tr><td class="k">To make it bigger</td><td>Requires architecture change: multi-pass / chunked sections / a higher-tier model. Bumping max_tokens alone won't help — the model still wraps up early.</td><td>Already chunked; raise chapter count or per-chapter minimum.</td></tr>
</table>
<div class="note"><b>Takeaway:</b> the regular path's limit isn't really the token cap — it's that one prompt asking for "a big document" yields a thin one. The Architect's value is the <i>scaffolding</i> (per-chapter generation + quality gates), not a smarter model.</div>

<h2>Structure: what's actually in each</h2>
<div class="cards">
  <div class="card a"><span class="pill a">ARCHITECT — ${m.architect.headings.h2} sections across ${m.architect.headings.h1} chapters</span>
    <ul class="cols">${sectionList(m.architect.sections)}</ul>
    <p class="muted" style="font-size:12px">A <b>build guide</b>: purpose/context, personas, capabilities, non-goals, full architecture (stack, data model, infra, CI/CD, security), execution phases, milestones, even go-to-market.</p>
  </div>
  <div class="card b"><span class="pill b">REGULAR — ${m.regular.headings.h2} sections</span>
    <ul class="cols">${sectionList(m.regular.sections)}</ul>
    <p class="muted" style="font-size:12px">A classic <b>SRS outline</b>: all the right headings (functional, non-functional, architecture, data, API, security, testing, roadmap) — but ~90 words/section, so more outline than specification.</p>
  </div>
</div>

<h2>Density sample (same idea — judge the depth yourself)</h2>
<div class="cards">
  <div><div class="pill a">ARCHITECT · "Core Capabilities"</div><pre>${esc(archExcerpt)}</pre></div>
  <div><div class="pill b">REGULAR · "Functional Requirements"</div><pre>${esc(regExcerpt)}</pre></div>
</div>

<h2>Quality: basic workflow vs full build</h2>
<table>
  <tr><th>Factor</th><th>AI Project Architect</th><th>Regular LLM</th></tr>
  <tr><td class="k">Uses your questionnaire?</td><td class="reg" style="color:var(--red)">No — built from the idea alone</td><td class="arch" style="color:var(--green)">Yes — folds in selected capabilities (tailored)</td></tr>
  <tr><td class="k">Depth / implementation-readiness</td><td class="arch" style="color:var(--green)">High — architecture, data models, phases, risks</td><td style="color:var(--amber)">Thin — correct headings, light detail</td></tr>
  <tr><td class="k">Right-sized for a basic workflow?</td><td style="color:var(--red)">Overkill — 23 pages, much you won't need</td><td class="arch" style="color:var(--green)">Yes — 2 focused pages, tailored to choices</td></tr>
  <tr><td class="k">Speed</td><td style="color:var(--red)">~15 min</td><td class="arch" style="color:var(--green)">~1.5 min</td></tr>
  <tr><td class="k">Cost (LLM calls)</td><td style="color:var(--red)">Dozens (phases + chapters + retries)</td><td class="arch" style="color:var(--green)">One cheap call (~$0.001)</td></tr>
  <tr><td class="k">Reliability of build-out</td><td style="color:var(--amber)">Big doc → many requirements; clustering can choke (the activateProject bug)</td><td class="arch" style="color:var(--green)">Small doc → fast, clean clustering</td></tr>
</table>

<h2>Recommendation</h2>
<div class="rec">
  <p><b>Basic workflow / quick start →</b> the <span class="reg">regular LLM</span>. It's tailored to the questionnaire, 10× faster, ~free, and right-sized. Its one weakness is depth — and that's fixable.</p>
  <p><b>Full enterprise system / "design my whole AI org" →</b> the <span class="arch">Architect</span>. The chapter-by-chapter scaffolding is the only way to reliably reach 13K+ implementation-ready words.</p>
  <p style="margin-bottom:0"><b>Two product gaps worth closing:</b></p>
  <ul style="margin-top:4px">
    <li><b>The Architect ignores the questionnaire.</b> The richest doc is built from the idea alone — feeding it the user's selected capabilities would make the 23-page output actually match what they asked for.</li>
    <li><b>The regular path under-delivers on length</b> (1,450 words for a 6,000-word ask). A 2-pass "expand each section" step (mini version of the Architect's approach) would get it to ~4–6K words while staying fast and tailored — likely the best option for most non-enterprise projects.</li>
  </ul>
</div>

<p class="muted" style="font-size:12px;margin-top:2rem">Raw data: <code>docs/doc-comparison/metrics.json</code> · full docs: <code>architect.md</code>, <code>regular.md</code>. Reproduce: <code>node scripts/compareDocGenerators.js && node scripts/buildDocComparisonReport.js</code>.</p>
</div></body></html>`;

  fs.writeFileSync(OUT, html, 'utf8');
  console.log(`[report] wrote ${OUT}`);
}
main();
