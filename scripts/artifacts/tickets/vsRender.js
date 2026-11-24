/**
 * Voice AI Studio (Basecamp list 10542482938) ticket artifacts: ONE renderer for every VS ticket.
 *
 * Each ticket is a data entry in vsData.js. Both PDFs read the same entry, so a number on the
 * one-page visual cannot drift from the same number in the document (same rule as sv01).
 *
 * The visual leads with the decision Ali has to make next, not with what was built: a status
 * report is not a decision (feedback rule, 21 Nov). The six-phase ladder sits underneath so the
 * reader always knows where this ticket is on the road to retiring Synthflow.
 *
 * Privacy: entries must never carry the authorized test phone number, a CallSid in full, a
 * transcript, or a secret. assertSafe() refuses to render anything that looks like one.
 */
const { esc, baseCss, barChart, SEV, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const PHASES = [
  ['P1', 'Foundation', 'R00-R01'],
  ['P2', 'Voice engines', 'R02-R03'],
  ['P3', 'Intelligence + Studio', 'R04-R06'],
  ['P4', 'Hardening + pilot', 'R07-R08'],
  ['P5', 'Migrate + sunset', 'R09-R10'],
  ['P6', 'Package', 'R11'],
];
const STATE_COLOR = { done: SEV.ok, active: TOKENS.CHERRY, blocked: SEV.bad, waiting: SEV.watch, todo: '#b8c0cc' };

/** Digits-only scan for any 10+ digit run that is not an id we expect (Basecamp ids are 11 digits and allowed only in URLs). */
function assertSafe(entry) {
  const text = JSON.stringify(entry).replace(/https?:\/\/[^"\s]+/g, '');
  const phoneLike = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g) || [];
  if (phoneLike.length) throw new Error(`refusing to render: phone-like string(s) present: ${phoneLike.length}`);
  if (/\bCA[0-9a-f]{32}\b/i.test(text)) throw new Error('refusing to render: full Twilio CallSid present (redact to CA...last4)');
  if (/sk-[A-Za-z0-9]{10,}|xi-api-key|Bearer\s+[A-Za-z0-9._-]{12,}/.test(text)) throw new Error('refusing to render: secret-like string present');
}

function ladder(states) {
  return `<div class="ladder">${PHASES.map(([id, name, rel], i) => {
    const s = states[i] || 'todo';
    return `<div class="step" style="border-top:5px solid ${STATE_COLOR[s]}"><div class="sid">${id} &middot; ${esc(rel)}</div><div class="sname">${esc(name)}</div><div class="sstate" style="color:${STATE_COLOR[s]}">${esc(s.toUpperCase())}</div></div>`;
  }).join('')}</div>`;
}

const VISUAL_CSS = `${baseCss()}
  body{font-size:9pt} h1{font-size:15pt} .takeaway{padding:8px 12px;margin-bottom:8px} .takeaway .headline{font-size:10.5pt}
  .cards{margin:6px 0 8px} .card .n{font-size:16pt}
  .grid{display:grid;grid-template-columns:1.05fr 1fr;gap:12px}
  .panel{border:1px solid ${TOKENS.BORDER};border-radius:6px;padding:7px 10px;margin-bottom:8px}
  .panel h3{margin:0 0 5px;font-size:9.5pt}
  .decide{background:#fff8e6;border-left:5px solid ${SEV.watch};padding:8px 10px;border-radius:0 5px 5px 0;font-size:8.8pt;margin-bottom:8px}
  .ladder{display:flex;gap:6px;margin:4px 0 8px} .step{flex:1;border:1px solid ${TOKENS.BORDER};border-radius:5px;padding:4px 6px;background:#fff}
  .sid{font-size:7pt;color:${TOKENS.MUTED}} .sname{font-weight:700;font-size:8.3pt} .sstate{font-size:7.2pt;font-weight:700}
  table{font-size:7.9pt;margin:3px 0} td,th{padding:2.5px 6px} .mermaid svg{max-height:165px}`;

function cardsHtml(cards) {
  return `<div class="cards">${cards.map((c) => `<div class="card"><div class="n" style="color:${c.color || TOKENS.CHERRY}">${esc(c.n)}</div><div class="k">${esc(c.k)}</div></div>`).join('')}</div>`;
}
function rowsTable(rows, head) {
  return `<table>${head ? `<tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : ''}${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
}

function buildVisual(e) {
  assertSafe(e);
  const body = `
  <h1>${esc(e.code)} &middot; ${esc(e.short)}</h1>
  <div class="meta">Voice AI Studio (replace Synthflow) &middot; ${esc(e.date)} &middot; session ${esc(e.session)} &middot; status ${esc(e.status)}</div>
  <div class="rule"></div>
  <div class="takeaway"><div class="label">Takeaway</div><div class="headline">${esc(e.takeaway)}</div></div>
  ${cardsHtml(e.cards)}
  <div class="decide"><strong>Your next decision:</strong> ${esc(e.decision)}</div>
  <div class="grid">
    <div>
      <div class="panel"><h3>Where this sits on the road to retiring Synthflow</h3>${ladder(e.ladder)}</div>
      <div class="panel"><h3>Acceptance checks</h3>${rowsTable(e.checks.map((c) => [c[1] ? 'PASS' : 'OPEN', c[0]]), ['Result', 'Check'])}</div>
    </div>
    <div>
      <div class="panel"><h3>${esc(e.diagramTitle || 'How it fits')}</h3><div class="mermaid">${e.mermaid}</div></div>
      ${e.bars ? `<div class="panel"><h3>${esc(e.bars.title)}</h3>${barChart({ rows: e.bars.rows, max: e.bars.max, width: 460, barH: 13, gap: 4, labelW: 160 })}</div>` : ''}
    </div>
  </div>
  <div class="meta">Evidence: ${esc(e.evidenceLine)}</div>`;
  return htmlDoc({ title: `${e.code} visual`, css: VISUAL_CSS, body });
}

function buildDocument(e) {
  assertSafe(e);
  const body = `
  <h1>${esc(e.code)} &middot; ${esc(e.title)}</h1>
  <div class="meta">Voice AI Studio (Basecamp list 10542482938) &middot; ${esc(e.date)} &middot; session ${esc(e.session)} &middot; status ${esc(e.status)}</div><div class="rule"></div>
  <p><strong>ASKED:</strong> ${esc(e.asked)}</p>
  <p><strong>DELIVERED:</strong> ${esc(e.delivered)}</p>
  <div class="takeaway"><div class="label">Takeaway</div><div class="headline">${esc(e.takeaway)}</div></div>
  <h2>Diagram</h2><div class="mermaid">${e.mermaid}</div>
  ${e.sections.map((s) => `<h2>${esc(s.h)}</h2>${s.rows ? rowsTable(s.rows, s.head) : ''}${s.p ? s.p.map((x) => `<p>${esc(x)}</p>`).join('') : ''}${s.ul ? `<ul>${s.ul.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`).join('')}
  <h2>Acceptance checks</h2>${rowsTable(e.checks.map((c) => [c[1] ? 'PASS' : 'OPEN', c[0]]), ['Result', 'Check'])}
  <h2>Evidence</h2>${rowsTable(e.evidence, ['What', 'Value'])}
  <h2>What this does not establish</h2><ul>${e.notEstablished.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return htmlDoc({ title: `${e.code} document`, css: baseCss(), body });
}

module.exports = { buildVisual, buildDocument, assertSafe, PHASES };
