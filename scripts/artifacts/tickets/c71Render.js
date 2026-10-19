/**
 * C7.1's two deliverables: the one-page scorecard, and the standard behind it.
 *
 * The worked examples are rendered from the same `scoreOf` the assertions use, so the
 * numbers printed here cannot drift from the numbers the build checks.
 */
const D = require('./c71Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .gate { border:1px solid #f3c9c6; background:#fdf3f2; border-left:4px solid #b3261e;
          border-radius:0 6px 6px 0; padding:8px 11px; margin:0 0 7px; }
  .gate .hd { font-weight:700; }
  .gate .why { font-size:8.6pt; margin-top:4px; }
  .vt { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7.4pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .ex { border:1px solid var(--border); border-radius:6px; padding:7px 10px; margin:0 0 6px; }
  .ex .sc { font-size:15pt; font-weight:700; }
`;

const vchip = (t) => `<span class="vt" style="background:${t.color}">${esc(t.verdict)}</span>`;

function gateCards(short) {
  // On the one-pager the gates are a list of names. The test and the reasoning are what the
  // document is for, and repeating them on both costs the page its second column.
  return D.GATES.map((g) => `<div class="gate">
    <div class="hd">G${g.n}. ${esc(g.name)}</div>
    ${short ? '' : `<div style="margin-top:3px">${esc(g.test)}</div>
    <div class="why"><b>Why it can never be waived.</b> ${esc(g.why)}</div>`}
  </div>`).join('');
}

/**
 * `short` drops the anchor column. Measured: with anchors the table is 447px on its own,
 * which is most of a landscape page. The anchors are what the document is for.
 */
function criteriaTable(short) {
  const total = D.CRITERIA.reduce((a, c) => a + c.weight, 0);
  if (short) {
    return `<table>
      <tr><th style="width:8%">#</th><th>Criterion</th><th style="width:18%">Weight</th></tr>
      ${D.CRITERIA.map((c) => `<tr><td>${c.n}</td><td><b>${esc(c.name)}</b></td>
        <td><b>${c.weight}</b></td></tr>`).join('')}
      <tr><td></td><td><b>Total</b></td><td><b>${total}</b></td></tr>
    </table>`;
  }
  return `<table>
    <tr><th style="width:6%">#</th><th style="width:40%">Criterion</th>
      <th style="width:10%">Weight</th><th>What a 3 looks like</th></tr>
    ${D.CRITERIA.map((c) => `<tr><td>${c.n}</td><td><b>${esc(c.name)}</b></td>
      <td><b>${c.weight}</b></td><td class="meta">${esc(c.anchor)}</td></tr>`).join('')}
    <tr><td></td><td><b>Total</b></td><td><b>${total}</b></td><td></td></tr>
  </table>`;
}

function thresholdTable() {
  return `<table>
    <tr><th style="width:18%">Score</th><th style="width:26%">Verdict</th><th>What it means</th></tr>
    ${D.THRESHOLDS.map((t, i) => {
    const hi = i === 0 ? 100 : D.THRESHOLDS[i - 1].min - 1;
    return `<tr><td><b>${t.min} to ${hi}</b></td><td>${vchip(t)}</td>
      <td>${esc(t.action)}</td></tr>`;
  }).join('')}
  </table>`;
}

function exampleCards(short) {
  return D.EXAMPLES.map((e) => {
    const s = D.scoreOf(e.scores);
    const v = D.verdictOf(e);
    const failed = e.gates.map((g, i) => (g ? null : `G${i + 1}`)).filter(Boolean);
    return `<div class="ex">
      <div><span class="sc" style="color:${v.color}">${s}</span>
        &nbsp;${vchip(v)} &nbsp;<b>${esc(e.name)}</b></div>
      <div class="meta" style="margin-top:3px">
        ${failed.length ? `Fails ${failed.join(' and ')}. ` : 'Passes all three gates. '}
        ${short ? '' : esc(e.note)}</div>
    </div>`;
  }).join('');
}

function buildVisual() {
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
    table { font-size:8pt; margin:3px 0 6px; }
    td, th { padding:3px 6px; }
    .gate { padding:6px 9px; margin:0 0 5px; }`;

  const body = `<div class="wrap">
    <h1>C7.1 &middot; Lighthouse Customer Selection Standard</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; three gates, six weighted criteria,
      three bands &middot; governs which deals we accept</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>The three gates. Fail one, decline at any score</h2>
        ${gateCards(true)}
        <h2>The bands</h2>
        ${thresholdTable()}
      </div>
      <div class="col">
        <h2>The weighted criteria</h2>
        ${criteriaTable(true)}
        <h2>Worked examples</h2>
        <table>
          <tr><th style="width:14%">Score</th><th style="width:30%">Verdict</th>
            <th>Opportunity</th></tr>
          ${D.EXAMPLES.map((e) => {
    const sc = D.scoreOf(e.scores);
    const v = D.verdictOf(e);
    const failed = e.gates.map((g, i) => (g ? null : `G${i + 1}`)).filter(Boolean);
    return `<tr><td><b style="color:${v.color};font-size:11pt">${sc}</b></td>
      <td>${vchip(v)}</td><td>${esc(e.name)}${failed.length
      ? `<div class="meta">fails ${failed.join(' and ')}</div>` : ''}</td></tr>`;
  }).join('')}
        </table>
        <div class="meta">The second one is why this exists: it scores above the top
          threshold and is declined anyway, on a gate.</div>
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'C7.1 - Lighthouse Customer Selection Standard', css, body });
}

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }`;

  const body = `<div class="wrap">
    <h1>C7.1 &middot; Lighthouse Customer Selection Standard</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; Ticket C7.1 &middot; blocks C9.6 and C9.7</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Define what makes a good first customer so the first
      five are chosen rather than accepted: a scorecard with weighted criteria, pass/fail
      thresholds, the non-waivable criteria named, and usable to decline a deal rather than
      only to accept one.
      <br><br>
      <b>What was delivered.</b> Three gates, six weighted criteria summing to 100, three
      bands, and four worked examples including one that scores above the top threshold and
      is declined anyway. The arithmetic is checked at build time so the standard cannot
      quietly become one nothing fails.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>1. The three gates, which are never waived</h2>
    <p>A gate is pass or fail. An opportunity that fails any gate is declined whatever it
    scores, which is what stops a high total papering over a missing fundamental.</p>
    ${gateCards(false)}

    <h2>2. The weighted criteria</h2>
    <p>Each is scored 0 to 3 and weighted. The weights sum to 100 and the build fails if they
    ever stop doing so.</p>
    ${criteriaTable(false)}
    <table>
      <tr><th style="width:12%">Score</th><th>Means</th></tr>
      ${D.SCALE.map((s) => `<tr><td><b>${s.v}</b></td><td>${esc(s.label)}</td></tr>`).join('')}
    </table>

    <h2>3. The bands</h2>
    ${thresholdTable()}

    <div class="pagebreak"></div>
    <h2>4. Worked examples, including the one that matters</h2>
    <p>A selection standard is only real if it declines something. The second example scores
    above the top threshold and is declined on a gate, which is the case this document exists
    for. A build assertion fails if no example does that.</p>
    ${exampleCards(false)}

    <h2>5. How to use it to decline</h2>
    <p>Score the opportunity, check the gates first, and write one sentence naming the gate
    or the weakest criterion. Record the decline. The ticket&rsquo;s own success metric is
    that we turn down at least one poor-fit deal because of this document, and an unrecorded
    decline cannot evidence that.</p>

    <h2>6. Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>

    <div class="note"><b>What needs your decision:</b> the weights, and any decision to waive
    a gate. The weights are a judgment and are meant to be argued with. The gates are not,
    and changing one is a decision rather than a tuning exercise.</div>
  </div>`;

  return htmlDoc({ title: 'C7.1 - Lighthouse Customer Selection Standard', css, body });
}

module.exports = { buildVisual, buildDocument };
