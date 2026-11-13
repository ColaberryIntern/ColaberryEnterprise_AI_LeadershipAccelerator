/**
 * SV0.3 renderers: the M1 decision VISUAL (posted first) and the taxonomy DOCUMENT. Both read sv03Data.compute().
 */
const { esc, baseCss, SEV, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');
const D = require('./sv03Data');

const ACTION = { UPDATE: '#1f5fa8', NEW: '#2f7d32', MERGE: '#7a4fa3' };
const STRENGTH = { strong: SEV.ok, moderate: SEV.watch, thin: SEV.bad };
const SHORT = { AgTech: 'Ag', ClimateTech: 'Clim', 'Conversational AI': 'Conv', Energy: 'Enrg', Healthcare: 'Hlth', Manufacturing: 'Mfg', Utilities: 'Util' };
const heat = (n) => (n === 0 ? '<td class="h0"></td>' : `<td class="h" style="background:rgba(47,125,50,${Math.min(0.25 + n * 0.2, 0.95)});color:${n > 2 ? '#fff' : '#123'}">${n}</td>`);
const chip = (t, c) => `<span class="chip" style="background:${c}">${esc(t)}</span>`;

const VISUAL_CSS = `${baseCss()} body{font-size:8.6pt} h1{font-size:15pt} .rule{margin:6px 0 8px}
  .takeaway{padding:7px 11px;margin-bottom:8px} .takeaway .headline{font-size:10pt}
  .grid{display:grid;grid-template-columns:1.55fr 1fr;gap:10px}
  table.m{font-size:7.6pt;margin:0} table.m td,table.m th{padding:2px 4px} table.m th{font-size:6.8pt;text-align:center}
  td.h{text-align:center;font-weight:700} td.h0{background:#f4f6f8} .bar{height:7px;border-radius:3px;display:inline-block;vertical-align:middle}
  .q{border:1px solid ${TOKENS.BORDER};border-radius:6px;padding:6px 8px;margin-bottom:6px;background:#fff}
  .q b{color:${TOKENS.CHERRY_DEEP}} .q .opt{font-size:7.8pt;color:${TOKENS.INK};margin-top:2px}
  .flow{border:1px solid ${TOKENS.BORDER};border-radius:6px;padding:4px}`;

function buildVisual() {
  const d = D.compute();
  const rows = d.services.map((s) => `<tr>
    <td>${chip(s.action, ACTION[s.action])}</td><td style="white-space:nowrap">${esc(s.name.length > 46 ? s.name.slice(0, 45) + '…' : s.name)}</td>
    ${d.industries.map((i) => heat(s.perIndustry[i])).join('')}
    <td style="white-space:nowrap"><span class="bar" style="width:${s.evidence * 9}px;background:${STRENGTH[s.strength]}"></span> ${s.evidence}</td>
    <td style="text-align:center">${s.metrics ? `<b style="color:${SEV.ok}">${s.metrics}</b>` : '<span style="color:#b26a00">0</span>'}</td></tr>`).join('');
  const body = `
  <h1>&#129517; SV0.3 &middot; Services v2: your M1 decision on one page</h1>
  <div class="meta">Services Upgrade &middot; proposal from ${d.caseStudies} case studies &middot; nothing reaches the Gov AI until M3</div><div class="rule"></div>
  <div class="takeaway"><div class="label">Takeaway</div><div class="headline">&#9989; Proposed: upgrade ${d.counts.UPDATE} existing services with real evidence and add ${d.counts.NEW} industry services, taking the Gov AI's catalog from ${d.activeNow} to ${d.activeAfterM3} active services, every one backed by delivered case studies. All ${d.caseStudies} case studies have a home.</div></div>
  <div class="grid">
    <div>
      <table class="m"><tr><th>Action</th><th style="text-align:left">Service</th>${d.industries.map((i) => `<th>${SHORT[i] || esc(i)}</th>`).join('')}<th>Evidence</th><th>Metrics</th></tr>${rows}</table>
      <div class="meta">Cells = case studies per industry (darker = more). Evidence bar: <span style="color:${SEV.ok}">&#9632; 3+ strong</span> <span style="color:${SEV.watch}">&#9632; 2 moderate</span> <span style="color:${SEV.bad}">&#9632; 1 thin</span>. Metrics = cited, verbatim-verified outcome sentences.</div>
    </div>
    <div>
      <div class="flow"><div class="mermaid">flowchart LR
      A[${d.caseStudies} case studies] --> B[${d.services.length} services]
      B --> C{M1<br/>you approve}
      C --> D[SV1-SV2<br/>load as growth]
      D --> E{M3<br/>you approve}
      E --> F[active<br/>Gov AI reads]</div></div>
      <div style="margin-top:6px;font-weight:700;color:${TOKENS.CHERRY_DEEP}">&#128073; Answer these on the SV0.3 ticket, then check M1:</div>
      <div class="q"><b>1.</b> Approve the ${d.counts.NEW} NEW services as listed?<div class="opt">A) Yes, all &nbsp; B) Yes, except &hellip; &nbsp; C) Rework the list</div></div>
      <div class="q"><b>2.</b> "${d.retiredTopMatch.name}" was retired but was the Gov AI's most-matched service (${d.retiredTopMatch.matches} matches). Restore it?<div class="opt">A) Restore as active (recommended: bids ask for it) &nbsp; B) Keep retired</div></div>
      <div class="q"><b>3.</b> OK to name the partner ALLIN in "Digital Financial Inclusion"?<div class="opt">A) Yes, it is in our published titles &nbsp; B) Anonymize it</div></div>
      <div class="q"><b>4.</b> The 7 UPDATEs rewrite existing descriptions (old vs new in the document). Approve?<div class="opt">A) Yes &nbsp; B) Keep old wording for &hellip;</div></div>
    </div>
  </div>`;
  return htmlDoc({ title: 'SV0.3 visual', css: VISUAL_CSS, body });
}

function buildDocument() {
  const d = D.compute();
  const card = (s) => `
  <div style="border:1px solid ${TOKENS.BORDER};border-left:5px solid ${ACTION[s.action]};border-radius:0 6px 6px 0;padding:8px 11px;margin:9px 0;page-break-inside:avoid">
    <div>${chip(s.action, ACTION[s.action])} ${chip(`${s.evidence} case stud${s.evidence === 1 ? 'y' : 'ies'}`, STRENGTH[s.strength])} <strong style="font-size:11pt">${esc(s.name)}</strong> <span class="meta">[${esc(s.category)}]</span></div>
    <p style="margin:5px 0"><strong>Gov AI will read:</strong> ${esc(s.description)}</p>
    ${s.old ? `<p class="meta" style="margin:3px 0"><strong>Today:</strong> ${esc(s.old.description || '(empty)')} &middot; category ${esc(s.old.category || 'none')} &middot; ${s.old.keywords} keywords &middot; ${s.old.naics} NAICS</p>` : ''}
    <p style="margin:3px 0;font-size:8.6pt"><strong>Keywords:</strong> ${s.keywords.map(esc).join(', ')}</p>
    <p style="margin:3px 0;font-size:8.6pt"><strong>NAICS:</strong> ${s.naics.map((n) => `${n.code} ${esc(n.title)}`).join('; ')} &middot; <strong>PSC:</strong> ${s.psc.map((p) => `${p.code} ${esc(p.title)}`).join('; ')}</p>
    <p style="margin:3px 0;font-size:8.6pt"><strong>Evidence:</strong> ${s.caseStudies.map((f) => esc(f.replace(/\.pdf$/, ''))).join(' &middot; ')}</p>
    <p class="meta" style="margin:3px 0"><strong>Why:</strong> ${esc(s.rationale)}</p></div>`;
  const body = `
  <h1>SV0.3 &middot; Services v2 taxonomy proposal</h1>
  <div class="meta">Services Upgrade (Basecamp list 10506775132) &middot; 2026-11-13 &middot; session CC-20261113-s9v4 &middot; status: PROPOSED (awaiting M1)</div><div class="rule"></div>
  <p><strong>ASKED:</strong> map our case studies onto upgraded or new services, keeping existing ids so past bid matches stay valid. <strong>DELIVERED:</strong> <code>docs/services/taxonomy_v2.json</code> (${d.counts.UPDATE} UPDATE, ${d.counts.NEW} NEW, 0 MERGE), a validator that enforces the Gov AI Compatibility Contract (33 tests passing), and this decision document.</p>
  <div class="takeaway"><div class="label">Takeaway</div><div class="headline">Approve at M1 and the Gov AI's catalog grows from ${d.activeNow} to ${d.activeAfterM3} active services, each backed by delivered case studies, with every existing id preserved. Four questions on the one-page visual are the whole decision.</div></div>
  <h2>Rules every proposed service passes (validated in CI)</h2>
  <ul><li>Lead sentence of 200 characters or fewer (the Gov AI reads only the first 200).</li><li>3 to 12 keywords, at least one NAICS code, 4-character PSC codes.</li>
  <li>UPDATE keeps the existing id; no retired id is silently revived; no id is claimed twice.</li><li>Every case study in the manifest is assigned; one-paper services are flagged thin.</li><li>Active plus new stays under the 80-service prompt cap.</li></ul>
  <h2>Upgrades to existing services (${d.counts.UPDATE})</h2>${d.services.filter((s) => s.action === 'UPDATE').map(card).join('')}
  <h2 class="pagebreak">New services (${d.counts.NEW}, land as growth)</h2>${d.services.filter((s) => s.action === 'NEW').map(card).join('')}
  <h2>Left as they are (${d.untouched.length})</h2><ul>${d.untouched.map((u) => `<li>${esc(u.name)} (${u.status})</li>`).join('')}</ul>
  <h2>What this does not establish</h2>
  <ul><li>NAICS and PSC codes reuse those already on our active services where possible; new ones (541715, 541370, 541620) should be confirmed against SAM before a bid relies on them.</li>
  <li>Evidence counts measure how many papers back a service, not contract value or recency.</li>
  <li>Whether the Gov AI rates more bids "have" with this catalog is measured in SV4.3, not assumed here.</li></ul>`;
  return htmlDoc({ title: 'SV0.3 document', css: baseCss(), body });
}

module.exports = { buildVisual, buildDocument };
