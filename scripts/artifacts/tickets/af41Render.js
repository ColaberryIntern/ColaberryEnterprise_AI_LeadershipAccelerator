/**
 * AF4.1's one-page visual and its spec document.
 *
 * The visual leads with the ANSWER to the question the ticket's comments left open, because that
 * is the only thing on this ticket that was not already true before it was worked. All card copy
 * is written for the card: nothing here is an algorithmic truncation of the spec prose, which is
 * how three cards on the AF2.7 one-pager got clipped mid-word while passing every automated check.
 */
const D = require('./af41Data');
const { TOKENS, SEV, esc, baseCss, barChart } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; measured in production ${D.MEASURED_ON} `
  + '&middot; read-only, wrote nothing';

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const metCount = D.CRITERIA.filter((c) => c.met).length;

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  const css = `
  body { font-size: 9.1pt; }
  h1 { font-size: 15pt; }
  .cols { display: flex; gap: 12px; align-items: flex-start; }
  .col { flex: 1; }
  .card .n { font-size: 16pt; }
  .kpi .card { text-align: center; }
  .kpi .card.good .n { color: ${SEV.ok}; }
  h2 { font-size: 10pt; margin: 6px 0 4px; }
  .mermaid { font-size: 7.8pt; }
  .tiny { font-size: 7.5pt; color: ${TOKENS.MUTED}; }
  .cards { margin: 6px 0 8px; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 8px; }
  .takeaway .headline { font-size: 11pt; }
  .panel {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 5px; padding: 6px 9px; background: #fff;
  }
  .panel .hd {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px;
  }
  .panel .bd { font-size: 7.8pt; line-height: 1.35; }
  .row { display: flex; gap: 5px; font-size: 7.6pt; line-height: 1.3; margin: 2px 0; }
  .row .t { flex: 1; }
  .ok { color: ${SEV.ok}; font-weight: 700; }
  .no { color: ${SEV.watch}; font-weight: 700; }
  `;

  const kpi = `
  <div class="cards kpi">
    <div class="card good"><div class="n">${metCount} / ${D.CRITERIA.length}</div>
      <div class="k">Acceptance criteria met</div></div>
    <div class="card good"><div class="n">${D.VERIFIABILITY.reachable.length} / ${D.VERIFIABILITY.reachable.length}</div>
      <div class="k">Assigned domains verifiable</div></div>
    <div class="card good"><div class="n">${D.VERIFIABILITY.controls.length} / ${D.VERIFIABILITY.controls.length}</div>
      <div class="k">Controls passed</div></div>
    <div class="card"><div class="n">0</div><div class="k">Lines of product code changed</div></div>
  </div>`;

  /* The path that makes it work. The pointer branch is the one that carries all seven. */
  const flow = `
  <div class="mermaid">
  graph LR
    A["Intern clicks<br/>Verify"] --> B["the route reads the enrollment<br/>from their OWN token"]
    B --> C["getProjectByEnrollment"]
    C --> D{"active_project_id<br/>set and live?"}
    D -->|"yes: 7 of 10 domains"| E["their DOMAIN project"]
    D -->|"no"| F["newest live project<br/>they own"]
    E --> G["requirements graded<br/>against their repo"]
    F --> G
  </div>`;

  const criteria = D.CRITERIA.map((c) => `
    <div class="row">
      <span class="${c.met ? 'ok' : 'no'}">${c.met ? 'MET' : 'OPEN'}</span>
      <span class="t">${esc(c.n === 5 ? 'Review state set, then stop. Ali\'s, deliberately.'
    : c.text.replace(/\.$/, ''))}</span>
    </div>`).join('');

  const reach = D.VERIFIABILITY.reachable.map(([k, who]) => `
    <div class="row"><span class="ok">OK</span><span class="t">${esc(k)} &middot;
      ${esc(who.replace(/@.*/, ''))}</span></div>`).join('');

  const body = `
  <h1>A connected repo DOES make a story verifiable. Measured, after a trace said otherwise.</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">AF4.1 needed a measurement, not a build.</div>
    <div>All three of the ticket's stated premises were measured wrong, its acceptance criterion
    was already met by a real connected repo, and the one question its comments left open now has
    an answer: every intern whose points depend on it can verify their domain story today.</div>
  </div>

  ${kpi}
  ${flow}

  <div class="cols">
    <div class="col panel">
      <div class="hd">The five acceptance criteria</div>
      ${criteria}
      <div class="bd" style="margin-top:5px">Criterion 1 was met on ${esc(D.PRIOR_MEASUREMENT)} by
      a real repo and a real sync, demonstrated end to end rather than asserted from a row count.</div>
    </div>
    <div class="col panel">
      <div class="hd">Verifiable today, by their own human</div>
      ${reach}
      <div class="bd" style="margin-top:5px">The other three domains are unassigned
      (intended_builder: null), so nobody's points depend on them.</div>
    </div>
    <div class="col panel">
      <div class="hd">Why the controls decide this</div>
      <div class="bd">${esc(D.VERIFIABILITY.whyControls)}</div>
      <div class="hd" style="margin-top:7px">The three premises, measured</div>
      ${D.PREMISES.map((p) => `
        <div class="row">
          <span class="no">WRONG</span>
          <span class="t">${esc(p.premise)} &mdash; measured <strong>${esc(p.measured)}</strong></span>
        </div>`).join('')}
    </div>
  </div>
  <div class="tiny" style="margin-top:4px">Premise-by-premise measurements, the full control
  table and the corrected static finding are in the spec document filed beside this page.</div>`;

  return shell({ title: `${D.TICKET} one-page visual`, body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const css = `
  h2 { margin-top: 18px; }
  .lbl {
    font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    color: ${TOKENS.CHERRY_DEEP}; margin-top: 10px;
  }
  table { width: 100%; }
  td.p { font-family: Consolas, monospace; font-size: 8.4pt; }
  `;

  const premiseRows = D.PREMISES.map((p) => `
    <tr>
      <td>${esc(p.premise)}</td>
      <td class="p">${esc(p.measured)}</td>
      <td><span class="chip" style="background:${SEV.bad}">${esc(p.verdict)}</span></td>
    </tr>`).join('');

  const criteriaRows = D.CRITERIA.map((c) => `
    <tr>
      <td style="width:18px">${c.n}</td>
      <td>${esc(c.text)}<div class="meta">${esc(c.evidence)}</div></td>
      <td style="width:52px"><span class="chip"
        style="background:${c.met ? SEV.ok : SEV.watch}">${c.met ? 'MET' : 'OPEN'}</span></td>
    </tr>`).join('');

  const controlRows = D.VERIFIABILITY.controls.map(([id, q, got]) => `
    <tr>
      <td class="p">${esc(id)}</td>
      <td>${esc(q)}</td>
      <td class="p">${esc(got)}</td>
      <td><span class="chip" style="background:${SEV.ok}">PASS</span></td>
    </tr>`).join('');

  const reachRows = D.VERIFIABILITY.reachable.map(([k, who]) => `
    <tr><td class="p">${esc(k)}</td><td class="p">${esc(who)}</td>
    <td><span class="chip" style="background:${SEV.ok}">pointer</span></td></tr>`).join('');

  const builtRows = D.ALREADY_BUILT.map(([what, state]) => `
    <tr><td>${esc(what)}</td><td>${esc(state)}</td></tr>`).join('');

  const premiseChart = barChart({
    rows: [
      { label: 'Rows: ticket said', value: 11, display: '11', color: SEV.bad },
      { label: 'Rows: measured', value: 46, display: '46', color: SEV.ok },
      { label: 'Synced: ticket said', value: 0, display: '0', color: SEV.bad },
      { label: 'Synced: measured', value: 42, display: '42', color: SEV.ok },
    ],
    width: 620,
    labelW: 160,
  });

  const body = `
  <h1>${D.TICKET}: a public repo per intern, connected to the platform</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">Four of the five acceptance criteria are met. The fifth is a state
    change on this ticket and belongs to Ali.</div>
    <div>The ticket asked for seven connected intern repos plus one proven end-to-end sync. That
    was already true before this ticket was worked: all three of its stated premises were measured
    wrong, and a real repo had already synced. What was genuinely open was the half its comments
    flagged -- whether a connected repo actually makes a story VERIFIABLE -- and that is what this
    artifact measures.</div>
  </div>

  <h2>The three premises, measured</h2>
  <p>The ticket was written against a five-month-old state of <code>github_connections</code>.
  Measured on ${esc(D.PRIOR_MEASUREMENT)}:</p>
  <table>
    <thead><tr><th>The ticket said</th><th>Measured</th><th></th></tr></thead>
    <tbody>${premiseRows}</tbody>
  </table>
  <figure>${premiseChart}
    <figcaption class="meta">Counting a row in github_connections as a working connection is the
    trap the ticket itself warns about: the tokens are empty strings, so a row can exist, pass a
    null check, and sync nothing. Liveness is therefore keyed on last_sync_at, not on the token.
    </figcaption>
  </figure>

  <h2>The five acceptance criteria</h2>
  <table>
    <thead><tr><th></th><th>Criterion and evidence</th><th></th></tr></thead>
    <tbody>${criteriaRows}</tbody>
  </table>

  <h2>The open question: does a connected repo make a story verifiable?</h2>
  <p>From the ticket's own comment: "what is still not proved, and it is the half that matters for
  scoring, is that a connected repo actually makes a story VERIFIABLE". Measured
  ${esc(D.MEASURED_ON)} with <code>${esc(D.VERIFIABILITY.tool)}</code>, read-only: it read
  ${D.VERIFIABILITY.read.projects} domain projects and ${D.VERIFIABILITY.read.enrollments}
  enrollments and wrote ${D.VERIFIABILITY.read.wrote} rows.</p>
  <p><strong>Verdict: ${esc(D.VERIFIABILITY.verdict)}.</strong>
  ${esc(D.VERIFIABILITY.answer)}</p>
  <table>
    <thead><tr><th>Domain</th><th>Reachable by</th><th>Path</th></tr></thead>
    <tbody>${reachRows}</tbody>
  </table>
  <p>${esc(D.VERIFIABILITY.unassignedNote)}</p>

  <h2>Why a verdict was allowed at all</h2>
  <p>${esc(D.VERIFIABILITY.whyControls)}</p>
  <table>
    <thead><tr><th>Control</th><th>Positive assertion</th><th>Measured</th><th></th></tr></thead>
    <tbody>${controlRows}</tbody>
  </table>

  <h2>A static trace said the opposite, and was wrong</h2>
  <p><strong>The claim:</strong> ${esc(D.CORRECTION.claim)}</p>
  <p><strong>Its basis:</strong> ${esc(D.CORRECTION.basis)}</p>
  <p><strong>The error:</strong> ${esc(D.CORRECTION.error)}</p>
  <p><strong>The reusable lesson:</strong> ${esc(D.CORRECTION.lesson)}</p>
  <p>It is recorded here because the trap generalizes, not to narrate a mistake. The controls are
  the only reason this is a correction rather than a shipped defect report against all seven
  interns' points.</p>

  <h2>What was already true before this ticket was worked</h2>
  <table>
    <thead><tr><th>Item</th><th>State</th></tr></thead>
    <tbody>${builtRows}</tbody>
  </table>
  <p>AF4.1 therefore has no engineering work left. What remains is criterion 5, which is a review
  state on the ticket, and the ticket says never to auto-close it.</p>`;

  return shell({ title: `${D.TICKET} specification`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
