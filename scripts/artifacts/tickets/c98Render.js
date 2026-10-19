/**
 * C9.8's two deliverables: the one-page brief and the full weekly synthesis.
 *
 * The one-pager IS the brief for anyone who reads one thing. It leads with the fact that
 * there were no buyer conversations, because every other number on the page has to be read
 * in that light, and it ends in the decisions.
 */
const D = require('./c98Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .b { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7pt;
       font-weight:700; color:#fff; white-space:nowrap; }
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:11px 14px;
           margin:0 0 14px; border-radius:0 5px 5px 0; }
  .dec { border:2px solid var(--cherry); border-radius:6px; padding:9px 12px; margin:10px 0 0; }
  .dec .lab { font-size:7.6pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
              color:var(--cherry-deep); margin-bottom:3px; }
  .sec { border:1px solid var(--border); border-left:4px solid var(--muted);
         border-radius:5px; padding:8px 11px; margin:0 0 7px; page-break-inside:avoid; }
  .sec h3 { margin:0 0 3px; font-size:10pt; }
  .sec .lab { font-size:7.2pt; font-weight:700; text-transform:uppercase;
              letter-spacing:.05em; color:var(--muted); margin-top:4px; }
  .zero { background:#fdf3f2; border:1px solid #f0c9c4; border-left:5px solid #b3261e;
          border-radius:0 5px 5px 0; padding:10px 13px; margin:0 0 10px; }
  .zero .n { font-size:17pt; font-weight:700; color:#b3261e; line-height:1; }
`;

const chip = (b) => `<span class="b" style="background:${b.color}">${esc(b.k)}</span>`;

function zeroBanner() {
  return `<div class="zero">
    <div class="n">${D.CONVERSATIONS.count} buyer conversations in the period</div>
    <div style="margin-top:4px">Six of the ten questions this brief asks can only be
    answered by a buyer. Nobody has said anything yet, so those six are answered NO EVIDENCE
    with the reason rather than filled in, and the other four are answered from our own
    evidence work and labelled as such.</div>
  </div>`;
}

/**
 * `short` gives the first sentence of each finding. Ten full findings run to 341px, which
 * is most of a landscape page before the decisions have had any room; the document carries
 * all of it.
 */
function sectionTable(short) {
  const finding = (s) => (short
    ? `${s.finding.split('. ')[0].replace(/\.+$/, '')}.`
    : s.finding);
  return `<table>
    <tr><th style="width:24%">Weekly question</th><th style="width:13%">Basis</th>
      <th>Finding</th></tr>
    ${D.SECTIONS.map((s) => `<tr><td><b>${esc(s.q)}</b></td><td>${chip(s.basis)}</td>
      <td>${esc(finding(s))}</td></tr>`).join('')}
  </table>`;
}

/**
 * `soonest` shows only the decisions dated inside the next three days. All seven do not fit
 * on a landscape page beside the ten questions, and the ones with a date this week are the
 * ones a reader can act on today; the document lists every row.
 */
function decisionTable(soonest) {
  const CUTOFF = '2026-10-22';
  const rows = soonest ? D.DECISIONS.filter((d) => d.neededBy <= CUTOFF) : D.DECISIONS;
  const hidden = D.DECISIONS.length - rows.length;
  return `<table>
    <tr><th>Decision</th><th style="width:16%">Raised by</th>
      <th style="width:13%">Needed by</th><th style="width:9%">Status</th></tr>
    ${rows.map((d) => `<tr><td><b>${esc(d.decision)}</b></td>
      <td>${esc(d.raisedBy)}</td><td>${esc(d.neededBy)}</td><td>${esc(d.status)}</td></tr>`).join('')}
    ${hidden ? `<tr><td colspan="4"><i>and ${hidden} more, all listed in the
      document</i></td></tr>` : ''}
  </table>`;
}

/* ------------------------------------------------------------------ *
 * One page
 * ------------------------------------------------------------------ */

function buildVisual() {
  const css = `${baseCss()}
    ${SHARED}
    body { font-size:8.6pt; }
    h1 { font-size:15pt; }
    h2 { font-size:9.8pt; margin:7px 0 4px; }
    table { font-size:7.5pt; margin:2px 0 5px; }
    td, th { padding:3px 5px; }
    .note { padding:6px 9px; margin:5px 0; font-size:7.9pt; }
    .dec { padding:7px 10px; }
    .zero { padding:8px 11px; margin:0 0 8px; }
    .zero .n { font-size:15pt; }`;

  const body = `<div>
    <h1>C9.8 &middot; Weekly Market Feedback, Brief 1</h1>
    <div class="meta">${esc(D.CADENCE.thisBrief)} &middot; cadence: ${esc(D.CADENCE.due)}</div>
    <div class="rule"></div>

    ${zeroBanner()}
    ${sectionTable(true)}

    <h2>Decisions this brief raises</h2>
    ${decisionTable(true)}

    <div class="note warn"><b>The index itself has gone stale, which is the decay this
      ticket exists to prevent.</b> ${esc(D.CADENCE.gap)}</div>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C9.8 - Weekly Market Feedback, Brief 1', css, body });
}

/* ------------------------------------------------------------------ *
 * The document
 * ------------------------------------------------------------------ */

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:920px; margin:0 auto; padding:28px 22px 56px; }`;

  const body = `<div class="wrap">
    <h1>C9.8 &middot; Weekly Market Feedback Synthesis</h1>
    <div class="meta">${esc(D.CADENCE.thisBrief)} &middot; Ticket C9.8 &middot;
      artifact location: 10 - Results, Evidence &amp; Learnings</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Every Friday from 16 October, synthesise the week:
      what resonated, what confused buyers, what created meetings, what blocked purchase,
      what feature was requested, what nobody cared about, which ICP is strongest, pricing
      objections, competitor mentions, and what should stop being built. End every brief
      with an explicit decision or an explicit no-change. The named failure is writing a
      brief nobody acts on.
      <br><br>
      <b>What was delivered.</b> Brief 1, answering all ten questions: six NO EVIDENCE with
      the reason, because there have been no buyer conversations, and four from preparatory
      evidence that is labelled as our own work rather than the market's.
      ${D.DECISIONS.length} decisions raised in the Master Index column shape and
      ${D.NO_CHANGES.length} explicit no-changes recorded.
    </div>

    ${zeroBanner()}
    <p><b>How that was established.</b> ${esc(D.CONVERSATIONS.evidence)}</p>

    <h2>The ten questions</h2>
    ${D.SECTIONS.map((s) => `<div class="sec">
      <h3>${esc(s.q)} ${chip(s.basis)}</h3>
      <div>${esc(s.finding)}</div>
      <div class="lab">Why that is the answer</div>
      <div class="meta" style="color:var(--ink)">${esc(s.why)}</div>
    </div>`).join('')}

    <div class="pagebreak"></div>
    <h2>Decisions raised, in the Master Index section 5 shape</h2>
    ${decisionTable()}
    ${D.DECISIONS.map((d) => `<div class="sec">
      <h3>${esc(d.decision)}</h3>
      <div class="meta" style="color:var(--ink)">${esc(d.note)}</div>
    </div>`).join('')}

    <h2>Explicit no-changes</h2>
    <p>The ticket allows a brief to end in a decision or an explicit no-change. Recording
    the second is what stops a weekly cadence from manufacturing churn to justify itself.</p>
    ${D.NO_CHANGES.map((n) => `<div class="sec">
      <h3>${esc(n.subject)}</h3><div>${esc(n.statement)}</div>
    </div>`).join('')}

    <h2>The cadence, and why this brief is late</h2>
    <table>
      <tr><th style="width:22%">Field</th><th>Position</th></tr>
      <tr><td><b>Required</b></td><td>${esc(D.CADENCE.due)}</td></tr>
      <tr><td><b>This brief</b></td><td>${esc(D.CADENCE.thisBrief)}</td></tr>
      <tr><td><b>The gap it closes</b></td><td>${esc(D.CADENCE.gap)}</td></tr>
      <tr><td><b>Automatic?</b></td><td>${esc(D.CADENCE.automation)}</td></tr>
    </table>

    <h2>Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C9.8 - Weekly Market Feedback Synthesis', css, body });
}

module.exports = { buildVisual, buildDocument };
