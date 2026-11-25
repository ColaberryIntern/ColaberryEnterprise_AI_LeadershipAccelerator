/**
 * Weekly Live Studio (WL) ticket close-out artifacts: the one-page VISUAL and the DOCUMENT.
 *
 * Every WL ticket closes with two PDFs built from that ticket's own close-out record, so no two
 * tickets ever carry the same bytes (Ali, 2026-11-24: a PDF may appear once per task and on at most
 * three tasks). The record is a plain JSON object:
 *
 *   {
 *     code, title, closedOn, session,              // "WL0.2", ticket title, YYYY-MM-DD, CC-...
 *     takeaway,                                     // one sentence: what is now true
 *     asked,                                        // what the ticket asked for, in plain words
 *     delivered: [ "..." ],                         // what was delivered
 *     flow: [ { label, sub } ],                     // 3 to 6 boxes for the visual's picture
 *     chart: { title, max, rows: [ { label, value, display, color } ] },  // optional bar chart
 *     checks: [ { name, status, evidence } ],       // status: pass | fail | n/a
 *     verifier: { score, of, verdict, notes },      // loop-task-verifier result
 *     pr, deploy,                                   // strings, "none" when not applicable
 *     notEstablished: [ "..." ],                    // what this does NOT prove
 *     evidence: [ "..." ]                           // commands, files, commits
 *   }
 */
const { esc, baseCss, barChart } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const STATUS = { pass: ['#2f7d32', 'PASS'], fail: ['#b3261e', 'FAIL'], 'n/a': ['#718096', 'N/A'] };

function chip(status) {
  const [c, t] = STATUS[status] || STATUS['n/a'];
  return `<span style="display:inline-block;padding:1px 8px;border-radius:9px;font-size:8pt;font-weight:700;color:#fff;background:${c}">${t}</span>`;
}

function visualCss() {
  return `${baseCss()}
  .wl-flow { display:flex; gap:8px; align-items:stretch; margin:10px 0 12px; }
  .wl-box { flex:1; border:1.5px solid var(--border); border-top:5px solid var(--cherry); border-radius:6px;
            padding:8px 10px; background:#fff; }
  .wl-box b { display:block; font-size:10pt; line-height:1.25; }
  .wl-box span { font-size:8pt; color:var(--muted); }
  .wl-arrow { align-self:center; color:var(--cherry); font-weight:700; font-size:14pt; }
  .wl-checks { columns:2; column-gap:18px; font-size:8.6pt; }
  .wl-checks div { break-inside:avoid; margin:0 0 5px; }`;
}

function buildVisual(r) {
  const passed = r.checks.filter((c) => c.status === 'pass').length;
  const flow = r.flow.map((f, i) => `${i ? '<div class="wl-arrow">&#8594;</div>' : ''}<div class="wl-box"><b>${esc(f.label)}</b><span>${esc(f.sub || '')}</span></div>`).join('');
  const body = `
  <div class="meta">Weekly Live Studio &middot; ${esc(r.code)} &middot; closed ${esc(r.closedOn)} &middot; ${esc(r.session)}</div>
  <h1>${esc(r.code)}: ${esc(r.title)}</h1>
  <div class="rule"></div>
  <div class="takeaway"><div class="label">Takeaway</div><div class="headline">${esc(r.takeaway)}</div></div>
  <div class="cards">
    <div class="card"><div class="n">${esc(r.verifier.score)}/${esc(r.verifier.of)}</div><div class="k">Verifier score (${esc(r.verifier.verdict)})</div></div>
    <div class="card"><div class="n">${passed}/${r.checks.length}</div><div class="k">Acceptance checks passed</div></div>
    <div class="card"><div class="n" style="font-size:12pt">${esc(r.pr)}</div><div class="k">Pull request</div></div>
    <div class="card"><div class="n" style="font-size:12pt">${esc(r.deploy)}</div><div class="k">Deploy</div></div>
  </div>
  <div class="wl-flow">${flow}</div>
  ${r.chart ? `<h3 style="margin:6px 0 4px">${esc(r.chart.title)}</h3><div style="max-width:780px">${barChart({ rows: r.chart.rows, max: r.chart.max, width: 760, barH: 22, labelW: 230 })}</div>` : ''}
  <div class="wl-checks" style="margin-top:10px">${r.checks.map((c) => `<div>${chip(c.status)} ${esc(c.name)}</div>`).join('')}</div>`;
  return htmlDoc({ title: `${r.code} visual`, css: visualCss(), body });
}

function buildDocument(r) {
  const list = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const body = `
  <div class="meta">Weekly Live Studio &middot; Basecamp Ali Personal &middot; ${esc(r.session)} &middot; closed ${esc(r.closedOn)}</div>
  <h1>${esc(r.code)}: ${esc(r.title)}</h1>
  <div class="rule"></div>
  <div class="takeaway"><div class="label">Takeaway</div><div class="headline">${esc(r.takeaway)}</div></div>
  <h2>What was asked</h2><p>${esc(r.asked)}</p>
  <h2>What was delivered</h2>${list(r.delivered)}
  <h2>Acceptance checks</h2>
  <table><thead><tr><th>Check</th><th>Status</th><th>Evidence</th></tr></thead><tbody>
  ${r.checks.map((c) => `<tr><td>${esc(c.name)}</td><td>${chip(c.status)}</td><td>${esc(c.evidence || '')}</td></tr>`).join('')}
  </tbody></table>
  <h2>Independent verification</h2>
  <p><b>${esc(r.verifier.verdict)}</b>, ${esc(r.verifier.score)} of ${esc(r.verifier.of)}. ${esc(r.verifier.notes || '')}</p>
  <h2>Pull request and deploy</h2><p>PR: ${esc(r.pr)}. Deploy: ${esc(r.deploy)}.</p>
  <h2>What this does not establish</h2>${list(r.notEstablished)}
  <h2>Evidence</h2>${list(r.evidence)}`;
  return htmlDoc({ title: `${r.code} document`, css: baseCss(), body });
}

/** No em or en dashes anywhere in an artifact (house rule). Throws so a bad record never renders. */
function assertNoDashes(r) {
  const bad = JSON.stringify(r).match(/[–—]/);
  if (bad) throw new Error(`${r.code}: close-out record contains an em or en dash; rewrite it`);
}

module.exports = { buildVisual, buildDocument, assertNoDashes };
