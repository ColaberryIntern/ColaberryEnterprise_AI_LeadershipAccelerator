/**
 * C7.4's two deliverables: the one-page intake map, and the questionnaire itself.
 */
const D = require('./c74Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .wn { display:inline-block; padding:1px 6px; border-radius:9px; font-size:7pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .sec { border:1px solid var(--border); border-radius:6px; padding:9px 12px; margin:0 0 8px; }
  .sec .hd { font-weight:700; font-size:10.5pt; }
  .sec .why { font-size:8.5pt; color:var(--ink); margin:3px 0 6px; }
  .qi { border-bottom:1px dashed var(--border); padding:5px 0; }
  .qi:last-child { border-bottom:none; }
  .slot { border:1px dashed var(--border); border-radius:4px; background:var(--bg-alt);
          min-height:20px; margin-top:4px; }
`;

const chip = (w) => `<span class="wn" style="background:${w.color}">${esc(w.k)}</span>`;

function countsByWhen() {
  const c = {};
  for (const i of D.items()) c[i.when.k] = (c[i.when.k] || 0) + 1;
  return c;
}

function sectionCards(short) {
  return D.SECTIONS.map((s) => `<div class="sec">
    <div class="hd">${s.s}. ${esc(s.name)}</div>
    <div class="why">${esc(s.why)}</div>
    ${s.items.map((i) => `<div class="qi">
      ${chip(i.when)} ${esc(i.q)}
      ${short ? '' : '<div class="slot">&nbsp;</div>'}
    </div>`).join('')}
  </div>`).join('');
}

function buildVisual() {
  const counts = countsByWhen();
  const css = `${baseCss()}
    ${SHARED}
    .wrap { padding:0; }
    h1 { font-size:16pt; }
    h2 { font-size:10.5pt; margin:9px 0 5px; }
    body { font-size:9pt; }
    .cols { display:flex; gap:13px; align-items:flex-start; }
    .col { flex:1; }
    .takeaway { padding:9px 12px; margin:0 0 9px; }
    .takeaway .headline { font-size:10.5pt; }
    table { font-size:8.2pt; margin:3px 0 6px; }
    td, th { padding:3px 6px; }
    .sec { padding:6px 9px; margin:0 0 5px; }
    .sec .hd { font-size:9.4pt; }
    .qi { padding:3px 0; font-size:8.2pt; }`;

  const body = `<div class="wrap">
    <h1>C7.4 &middot; Pilot Discovery Questionnaire</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; ${D.items().length} items across
      ${D.SECTIONS.length} sections &middot; post-signature intake</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE())}</div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>What is due when</h2>
        <table>
          <tr><th style="width:54%">Deadline</th><th>Items</th></tr>
          ${Object.entries(counts).map(([k, v]) => `<tr><td>${esc(k)}</td>
            <td><b>${v}</b></td></tr>`).join('')}
          <tr><td><b>Total</b></td><td><b>${D.items().length}</b></td></tr>
        </table>
        <div class="note" style="padding:7px 10px"><b>This fills a gap the blueprint named.</b>
          C2.2 stage 0 records that "no structured business-problem intake form exists" and
          that today it is "a conversation and a document" which "does not scale past" ten
          problems. This is that form.</div>
        <div class="note warn" style="padding:7px 10px"><b>Security is asked before access,
          and the build enforces the order.</b> Section 4 captures what may not be touched,
          what is regulated and which models are prohibited. Only then does section 5 ask for
          access. A constraint discovered after a credential request costs the first week.</div>
      </div>
      <div class="col">
        <h2>The sections</h2>
        <table>
          <tr><th style="width:8%">#</th><th>Section</th><th style="width:16%">Items</th>
            <th style="width:20%">Day one</th></tr>
          ${D.SECTIONS.map((s) => `<tr><td>${s.s}</td><td><b>${esc(s.name)}</b></td>
            <td>${s.items.length}</td>
            <td>${s.items.filter((i) => i.when === D.WHEN.DAY0).length}</td></tr>`).join('')}
          <tr><td></td><td><b>Total</b></td><td><b>${D.items().length}</b></td>
            <td><b>${D.countWhen(D.WHEN.DAY0)}</b></td></tr>
        </table>
        <div class="meta">The full ${D.items().length} questions, each with its deadline
          and an answer slot, are in the questionnaire itself.</div>
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'C7.4 - Pilot Discovery Questionnaire', css, body });
}

function buildDocument() {
  const counts = countsByWhen();
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }`;

  const body = `<div class="wrap">
    <h1>C7.4 &middot; Pilot Discovery Questionnaire</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; Ticket C7.4 &middot; blocks C7.5 and C7.6</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Capture everything needed from a customer before day
      one of a pilot, with each item marked by deadline rather than all required up front,
      baseline capture explicit, and security and data constraints captured before access is
      requested.
      <br><br>
      <b>What was delivered.</b> ${D.items().length} items across ${D.SECTIONS.length}
      sections, each with a deadline, filling a gap the C2.2 blueprint named out loud.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE())}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <table>
      <tr><th style="width:54%">Deadline</th><th>Items</th></tr>
      ${Object.entries(counts).map(([k, v]) => `<tr><td>${esc(k)}</td>
        <td><b>${v}</b></td></tr>`).join('')}
      <tr><td><b>Total</b></td><td><b>${D.items().length}</b></td></tr>
    </table>

    <div class="pagebreak"></div>
    <h2>The questionnaire</h2>
    ${sectionCards(false)}

    <h2>Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>
  </div>`;

  return htmlDoc({ title: 'C7.4 - Pilot Discovery Questionnaire', css, body });
}

module.exports = { buildVisual, buildDocument };
