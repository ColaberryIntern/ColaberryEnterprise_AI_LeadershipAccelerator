/**
 * SV0.1 renderers: a one-page landscape VISUAL (posted first) and the full DOCUMENT. Both read sv01Data.compute().
 */
const { esc, baseCss, barChart, stackBar, SEV, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');
const D = require('./sv01Data');

const C = { active: SEV.ok, growth: SEV.watch, retired: SEV.bad, have: SEV.ok, partial: SEV.watch, new: '#5a6b85' };
const tick = (ok) => `<td style="text-align:center;background:${ok ? '#e7f4e8' : '#fbe9e7'};color:${ok ? SEV.ok : SEV.bad};font-weight:700">${ok ? '&#10004;' : '&#10008;'}</td>`;

const VISUAL_CSS = `${baseCss()}
  body{font-size:9pt} h1{font-size:16pt} .grid{display:grid;grid-template-columns:1fr 1.1fr;gap:12px}
  .takeaway{padding:8px 12px;margin-bottom:10px} .takeaway .headline{font-size:10.5pt} .cards{margin:6px 0 10px}
  .rt td{padding:1.5px 5px;font-size:7.6pt;line-height:1.25} .rt th{padding:2px 5px;font-size:6.8pt} .rt td:first-child{white-space:nowrap}
  .card .n{font-size:17pt} .panel{border:1px solid ${TOKENS.BORDER};border-radius:6px;padding:8px 10px}
  .panel h3{margin:0 0 6px;font-size:9.5pt} table{font-size:8pt;margin:4px 0} td,th{padding:3px 6px}
  .decide{background:#fff8e6;border-left:5px solid ${SEV.watch};padding:8px 10px;border-radius:0 5px 5px 0;font-size:8.8pt}`;

function buildVisual() {
  const d = D.compute();
  const matchRows = [
    { label: 'Still active today', value: d.matchesByStatus.active, color: C.active },
    { label: 'Moved to growth', value: d.matchesByStatus.growth, color: C.growth },
    { label: 'Now RETIRED', value: d.matchesByStatus.retired, color: C.retired },
  ];
  const body = `
  <h1>&#129517; SV0.1 &middot; Our Services baseline: what the Gov AI sees today</h1>
  <div class="meta">Services Upgrade &middot; snapshot ${d.takenOn} &middot; ${d.bids} real AI vettings ${d.dates.first} to ${d.dates.last} &middot; read-only</div>
  <div class="rule"></div>
  <div class="takeaway"><div class="label">Takeaway</div><div class="headline">&#9888;&#65039; ${d.retiredMatchPct}% of the Gov AI's service matches (${d.matchesByStatus.retired} of ${d.totalMatches}) point to services that are now RETIRED, and only ${d.ready} of ${d.activeCount} active services meet every Gov AI field rule. The catalog the AI reads is thinner than the work we have delivered.</div></div>
  <div class="cards">
    <div class="card"><div class="n">${d.rows}</div><div class="k">&#128218; catalog rows</div></div>
    <div class="card"><div class="n" style="color:${SEV.ok}">${d.byStatus.active}</div><div class="k">&#9989; active (AI reads these)</div></div>
    <div class="card"><div class="n">${d.bids}</div><div class="k">&#127963;&#65039; bids AI-vetted</div></div>
    <div class="card"><div class="n">${d.havePct}%</div><div class="k">capabilities rated "have"</div></div>
    <div class="card"><div class="n" style="color:${SEV.bad}">${d.retiredHavePct}%</div><div class="k">of "have" rests on retired services</div></div>
  </div>
  <div class="grid">
    <div>
      <div class="panel"><h3>&#128202; Catalog by status (${d.rows} rows)</h3>${stackBar({ parts: [
        { label: `Active ${d.byStatus.active}`, value: d.byStatus.active, color: C.active },
        { label: `Growth ${d.byStatus.growth}`, value: d.byStatus.growth, color: C.growth },
        { label: `Retired ${d.byStatus.retired}`, value: d.byStatus.retired, color: C.retired }], height: 22 })}</div>
      <div class="panel" style="margin-top:8px"><h3>&#129302; ${d.capabilities} capabilities the AI derived across ${d.bids} bids</h3>${stackBar({ parts: [
        { label: `Have ${d.assess.have}`, value: d.assess.have, color: C.have },
        { label: `Partial ${d.assess.partial}`, value: d.assess.partial, color: C.partial },
        { label: `New ${d.assess.new}`, value: d.assess.new, color: C.new }], height: 22 })}</div>
      <div class="panel" style="margin-top:8px"><h3>&#128269; Where those ${d.totalMatches} service matches point today</h3>${barChart({ rows: matchRows, width: 560, barH: 16, gap: 6, labelW: 150 })}</div>
      <div class="decide" style="margin-top:8px"><strong>&#128073; Your next decision (M1, after SV0.3):</strong> approve a Services v2 list that replaces the retired generics with evidence-backed services from our 39 case studies, so "have" rests on real delivered work. Nothing in production changes until M3.</div>
    </div>
    <div>
      <div class="panel"><h3>&#128678; Gov AI readiness of the ${d.activeCount} ACTIVE services</h3>
        <table class="rt"><tr><th>Service</th>${d.rules.map((r) => `<th style="text-align:center">${esc(r)}</th>`).join('')}</tr>
        ${d.readiness.map((r) => `<tr><td>${esc(r.name.length > 40 ? r.name.slice(0, 39) + '…' : r.name)}</td>${r.cells.map(tick).join('')}</tr>`).join('')}</table></div>
    </div>
  </div>
  <div class="meta" style="margin-top:6px">Source: service_offerings and gov_ai_vettings (tenant "refactored"), read-only SQL export ${d.takenOn}; verdicts kept in Basecamp, not the public repo.</div>`;
  return htmlDoc({ title: 'SV0.1 visual', css: VISUAL_CSS, body });
}

function buildDocument() {
  const d = D.compute();
  const body = `
  <h1>SV0.1 &middot; Our Services catalog snapshot and Gov AI baseline</h1>
  <div class="meta">Services Upgrade (Basecamp list 10506775132) &middot; ${d.takenOn} &middot; session CC-20261113-s9v4</div><div class="rule"></div>
  <p><strong>ASKED:</strong> freeze today's Our Services catalog and record what the Gov Contracts AI says today, so every later ticket can prove it made the AI better, not worse.</p>
  <p><strong>DELIVERED:</strong> a committed snapshot of all ${d.rows} catalog rows, a private record of ${d.bids} real AI vettings (${d.capabilities} capability verdicts), a tested baseline script for a fresh post-deploy run, and this analysis.</p>
  <div class="takeaway"><div class="label">Takeaway</div><div class="headline">The Gov AI's "have" verdicts mostly rest on retired generic services (${d.retiredHavePct}% of ${d.assess.have}). Today's ${d.activeCount} active services are better described, but only ${d.ready} pass every field rule, and none carries case-study evidence. That is the gap Services v2 closes.</div></div>
  <h2>How the baseline was taken</h2>
  <div class="mermaid">flowchart LR
  A[service_offerings<br/>${d.rows} rows] -->|read-only SQL| S[catalog_${d.takenOn}.json<br/>committed]
  B[gov_ai_vettings<br/>${d.bids} completed] -->|read-only SQL| V[stored verdicts<br/>Basecamp only]
  S --> X[sv01 data module]
  V --> X
  X --> P1[1-page visual]
  X --> P2[this document]
  R[snapshotServiceCatalogBaseline.ts] -.after deploy.-> F[fresh 5-bid run<br/>for SV4.3]</div>
  <h2>Catalog today</h2>
  <table><tr><th>Status</th><th>Rows</th><th>What it means for the Gov AI</th></tr>
  <tr><td><span class="chip" style="background:${C.active}">active</span></td><td>${d.byStatus.active}</td><td>Sent to the capability-fit prompt; can be matched.</td></tr>
  <tr><td><span class="chip" style="background:${C.growth}">growth</span></td><td>${d.byStatus.growth}</td><td>Excluded from fit (Ali, 2026-10-16); reporting only.</td></tr>
  <tr><td><span class="chip" style="background:${C.retired}">retired</span></td><td>${d.byStatus.retired}</td><td>Invisible to the AI; kept for history.</td></tr></table>
  <h2>What the AI said across ${d.bids} bids</h2>
  <p>Verdicts: ${Object.entries(d.verdicts).map(([k, v]) => `${esc(k)} ${v}`).join(' &middot; ')}. Capabilities: have ${d.assess.have}, partial ${d.assess.partial}, new ${d.assess.new}.</p>
  <h3>Most-matched services (and where they stand today)</h3>
  <table><tr><th>Service</th><th>Status today</th><th>Matches</th></tr>
  ${d.topMatched.map((m) => `<tr><td>${esc(m.name)}</td><td><span class="chip" style="background:${C[m.status]}">${m.status}</span></td><td>${m.n}</td></tr>`).join('')}</table>
  <h2>Gov AI readiness of active services</h2>
  <table><tr><th>Service</th><th>Category</th>${d.rules.map((r) => `<th>${esc(r)}</th>`).join('')}</tr>
  ${d.readiness.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.category || '-')}</td>${r.cells.map(tick).join('')}</tr>`).join('')}</table>
  <h2>Files</h2>
  <ul><li><code>docs/services/baseline/catalog_${d.takenOn}.json</code> (committed, Zod-validated, ${d.rows} rows; two runs byte-identical).</li>
  <li><code>capability_fit_stored_${d.takenOn}.json</code> (Basecamp, Services Upgrade folder; excluded from git by <code>.gitignore</code> because the repo is public).</li>
  <li><code>backend/src/scripts/snapshotServiceCatalogBaseline.ts</code> (live mode after deploy; <code>--from-export</code> offline mode; <code>--catalog-only</code>; <code>--help</code>).</li></ul>
  <h2>What this does not establish</h2>
  <ul><li>The stored verdicts were produced against the catalog as it stood when each bid was vetted (${d.dates.first} to ${d.dates.last}); the retired share shows drift, not that those verdicts were wrong at the time.</li>
  <li>No fresh AI call was made yet. Running unmerged code against production was refused by the safety classifier, correctly; the fresh 5-bid run happens after deploy through the documented path and becomes the SV4.3 comparison point.</li>
  <li>Readiness rules are field checks, not a judgment of how good a description is.</li></ul>`;
  return htmlDoc({ title: 'SV0.1 document', css: baseCss(), body });
}

module.exports = { buildVisual, buildDocument };
