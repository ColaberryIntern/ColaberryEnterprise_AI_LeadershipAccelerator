/**
 * SV0.2 renderers: one-page landscape VISUAL (posted first) + DOCUMENT. Both read sv02Data.compute().
 */
const { esc, baseCss, barChart, SEV, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');
const D = require('./sv02Data');

const IND_COLOR = { AgTech: '#2f7d32', Utilities: '#1f5fa8', Manufacturing: '#7a4fa3', Energy: '#b26a00', ClimateTech: '#0f8a8a', Healthcare: '#c2185b', 'Conversational AI': '#5a6b85' };

function heatmap(coverage, total) {
  const cw = 15; const ch = 15; const lw = 104;
  const rows = coverage.map((f, y) => {
    const cells = f.cells.map((ok, x) => `<rect x="${lw + x * cw}" y="${y * ch}" width="${cw - 2}" height="${ch - 2}" rx="2" fill="${ok ? SEV.ok : SEV.bad}" opacity="${ok ? 0.85 : 0.9}"/>`).join('');
    return `<text x="0" y="${y * ch + 11}" font-size="9" fill="${TOKENS.INK}">${esc(f.label)}</text>${cells}
      <text x="${lw + total * cw + 4}" y="${y * ch + 11}" font-size="9" font-weight="700" fill="${f.n === total ? SEV.ok : SEV.watch}">${f.n}/${total}</text>`;
  }).join('');
  const axis = Array.from({ length: total }, (_, i) => (i % 5 === 0 ? `<text x="${lw + i * cw + 2}" y="${coverage.length * ch + 10}" font-size="7" fill="${TOKENS.MUTED}">${i + 1}</text>` : '')).join('');
  const w = lw + total * cw + 40;
  return `<svg viewBox="0 0 ${w} ${coverage.length * ch + 14}" width="100%" role="img">${rows}${axis}</svg>`;
}

const VISUAL_CSS = `${baseCss()} body{font-size:9pt} h1{font-size:16pt} .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .panel{border:1px solid ${TOKENS.BORDER};border-radius:6px;padding:8px 10px} .panel h3{margin:0 0 6px;font-size:9.5pt}
  .takeaway{padding:8px 12px;margin-bottom:10px} .takeaway .headline{font-size:10.5pt} .cards{margin:6px 0 10px} .card .n{font-size:17pt}
  .decide{background:#fff8e6;border-left:5px solid ${SEV.watch};padding:8px 10px;border-radius:0 5px 5px 0;font-size:8.6pt}`;

function buildVisual() {
  const d = D.compute();
  const top = d.capabilities.slice(0, 12).map(([label, value]) => ({ label, value }));
  const body = `
  <h1>&#128218; SV0.2 &middot; 39 client case studies, turned into cited evidence</h1>
  <div class="meta">Services Upgrade &middot; deterministic extraction (no AI) &middot; every number verified word-for-word against its source PDF</div><div class="rule"></div>
  <div class="takeaway"><div class="label">Takeaway</div><div class="headline">&#9989; All ${d.total} whitepapers are now structured evidence across ${d.industries.length} industries and ${d.capabilityCount} capabilities, with zero confidential client names. &#9888;&#65039; Only ${d.withMetrics} of ${d.total} carry a quantified result, so most services will rest on "what we built", not "what it saved".</div></div>
  <div class="cards">
    <div class="card"><div class="n">${d.total}</div><div class="k">&#128196; case studies</div></div>
    <div class="card"><div class="n">${d.industries.length}</div><div class="k">&#127981; industries</div></div>
    <div class="card"><div class="n">${d.capabilityCount}</div><div class="k">&#129513; capabilities tagged</div></div>
    <div class="card"><div class="n" style="color:${d.withMetrics < d.total / 2 ? SEV.watch : SEV.ok}">${d.withMetrics}</div><div class="k">&#128200; with a cited metric</div></div>
    <div class="card"><div class="n" style="color:${SEV.ok}">0</div><div class="k">&#128274; client names exposed</div></div>
  </div>
  <div class="grid">
    <div>
      <div class="panel"><h3>&#127981; Case studies by industry</h3>${barChart({ rows: d.industries.map(([label, value]) => ({ label, value, color: IND_COLOR[label] })), width: 520, barH: 13, gap: 4, labelW: 120 })}</div>
      <div class="panel" style="margin-top:8px"><h3>&#128678; Field coverage, all ${d.total} papers (green = present)</h3>${heatmap(d.coverage, d.total)}</div>
    </div>
    <div>
      <div class="panel"><h3>&#129513; Top capabilities we have delivered (papers)</h3>${barChart({ rows: top, width: 520, barH: 12, gap: 4, labelW: 210 })}</div>
      <div class="decide" style="margin-top:8px"><strong>&#128073; What this feeds:</strong> SV0.3 groups these ${d.total} case studies into proposed services for your M1 decision. Thin spots to watch: cited metrics (${d.withMetrics}/${d.total}) and a named partner (ALLIN) in ${d.namedPartnerFiles} titles.</div>
    </div>
  </div>
  <div class="meta" style="margin-top:6px">Source: docs/services/whitepaper_manifest.json (committed); PDFs in Basecamp &gt; Services Upgrade &gt; 01 - Source whitepapers.</div>`;
  return htmlDoc({ title: 'SV0.2 visual', css: VISUAL_CSS, body });
}

function buildDocument() {
  const d = D.compute();
  const chip = (t, c) => `<span class="chip" style="background:${c}">${esc(t)}</span>`;
  const body = `
  <h1>SV0.2 &middot; Whitepaper evidence manifest</h1>
  <div class="meta">Services Upgrade (Basecamp list 10506775132) &middot; 2026-11-13 &middot; session CC-20261113-s9v4</div><div class="rule"></div>
  <p><strong>ASKED:</strong> turn Colaberry's client whitepapers into one structured, page-cited record each, so services can be built on facts.</p>
  <p><strong>DELIVERED:</strong> <code>docs/services/whitepaper_manifest.json</code>: ${d.total} records, ${d.outcomeCount} cited outcomes, ${d.capabilityCount} capability tags; a deterministic extractor; a client-name gate; 26 passing unit tests.</p>
  <div class="takeaway"><div class="label">Takeaway</div><div class="headline">The evidence base is broad (AgTech and Utilities lead) and clean (no client names), but metric-light: ${d.withMetrics} of ${d.total} papers state a quantified result. Services v2 should claim delivered capability, and quote numbers only where a paper does.</div></div>
  <h2>How it was built</h2>
  <div class="mermaid">flowchart LR
  P[39 PDFs<br/>Basecamp vault] --> T[pdftotext -layout]
  T --> H[heading map<br/>summary / problem / solution / tech / outcome]
  H --> V[capability vocabulary<br/>30 fixed tags]
  H --> O[outcome sentences]
  O --> X{number verbatim<br/>in source?}
  X -- no --> F[build fails]
  X -- yes --> G{client name<br/>in any field?}
  G -- yes --> F
  G -- no --> M[whitepaper_manifest.json]</div>
  <h2>The ${d.total} case studies</h2>
  <table><tr><th>#</th><th>Title</th><th>Industry</th><th>Caps</th><th>Metrics</th><th>Gaps</th></tr>
  ${d.records.map((r) => `<tr><td>${r.n}</td><td>${esc(r.title)}</td><td>${chip(r.industry, IND_COLOR[r.industry] || '#5a6b85')}</td><td>${r.caps}</td>
    <td style="background:${r.outcomes ? '#e7f4e8' : '#fff4e0'}">${r.outcomes}</td><td style="font-size:7.8pt">${esc(r.gaps.join('; ') || '-')}</td></tr>`).join('')}</table>
  <h2>Sample cited outcomes</h2>
  <table><tr><th>Case study</th><th>Outcome (verbatim)</th><th>Page</th></tr>
  ${d.topOutcomes.map((o) => `<tr><td>${esc(o.title)}</td><td>${esc(o.text)}</td><td>${o.page}</td></tr>`).join('')}</table>
  <h2>Decisions taken without you (logged)</h2>
  <ul><li>The PDFs are NOT committed to git (the repo is public). The manifest stores each file's sha256 and Basecamp upload id instead.</li>
  <li>The client-name list lives outside the repo; the gate found 0 hits in fields, titles, filenames and full text.</li>
  <li>"ALLIN" is named in ${d.namedPartnerFiles} of Colaberry's own published titles; treated as a partner name, not a confidential client. Flag at M1 if that is wrong.</li>
  <li>One paper (Data Capability Development) is a talent/staffing story, not an AI build; it is kept, and SV0.3 maps it to the talent services.</li></ul>
  <h2>What this does not establish</h2>
  <ul><li>Capability tags are keyword matches: they show a paper mentions a technique, not how deep the work went.</li>
  <li>The papers are Colaberry's own marketing documents; their outcome numbers are quoted, not independently verified.</li>
  <li>"Gaps" mark fields the parser could not find under a heading; the information may still be in the paper's prose.</li></ul>`;
  return htmlDoc({ title: 'SV0.2 document', css: baseCss(), body });
}

module.exports = { buildVisual, buildDocument };
