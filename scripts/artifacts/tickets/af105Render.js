/**
 * AF10.5's one-page visual and its spec document.
 *
 * The visual leads with what production said rather than with the roster, because the roster is
 * the expected deliverable and the production read is what stopped a bug: routing mail on
 * "backed" would have filed Colaberry staff email onto three interns' agent tickets.
 */
const D = require('./af105Data');
const { TOKENS, SEV, esc, baseCss } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; merged ${D.MERGED_ON} in PR #${D.PR} `
  + '&middot; one roster, keyed on the sign-in email';

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const PANEL_CSS = (SEVbad) => `
  .cols { display: flex; gap: 12px; align-items: flex-start; }
  .col { flex: 1; }
  .panel {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 5px; padding: 6px 9px; background: #fff;
  }
  .panel.warn { border-top-color: ${SEVbad}; }
  .panel .hd {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px;
  }
  .panel .bd { font-size: 7.7pt; line-height: 1.35; }
`;

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  const css = `
  body { font-size: 9.1pt; }
  h1 { font-size: 15pt; }
  .card .n { font-size: 16pt; }
  .kpi .card { text-align: center; }
  .kpi .card.good .n { color: ${SEV.ok}; }
  h2 { font-size: 9.5pt; margin: 6px 0 3px; }
  .mermaid { font-size: 7.8pt; }
  .tiny { font-size: 7.5pt; color: ${TOKENS.MUTED}; }
  .cards { margin: 6px 0 8px; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 8px; }
  .takeaway .headline { font-size: 11pt; }
  ${PANEL_CSS(SEV.bad)}
  /* Stacked rather than two columns: "assigned_domain_without_ticket" is 30 monospace characters
     and overflowed a fixed label column, which the containment audit caught. Stacking removes the
     constraint instead of shrinking the type until it happens to fit. */
  .kind { font-size: 7.5pt; padding: 2.5px 0; border-bottom: 1px solid ${TOKENS.BORDER}; }
  .kind .k { display: block; font-family: Consolas, monospace; font-size: 7.1pt;
             color: ${TOKENS.CHERRY_DEEP}; }
  .kind .v { display: block; line-height: 1.3; }
  `;

  const kpi = `
  <div class="cards kpi">
    <div class="card good"><div class="n">1</div><div class="k">Change to add an intern</div></div>
    <div class="card good"><div class="n">3 / 3</div>
      <div class="k">Scripts reading one roster</div></div>
    <div class="card good"><div class="n">7 / 7</div>
      <div class="k">Addresses routed, tickets matched</div></div>
    <div class="card"><div class="n">2</div>
      <div class="k">Assumptions production overturned</div></div>
  </div>`;

  const flow = `
  <div class="mermaid">
  graph LR
    A["agent_domain_projects<br/>student_project_id"] --> B["projects<br/>enrollment_id"]
    B --> C["enrollments<br/>EMAIL"]
    C --> D["the mail sweep"]
    C --> E["the Basecamp sync"]
    C --> F["the daily report"]
  </div>`;

  const kinds = D.QUIET_FAILURE.kinds.map(([k, v]) => `
    <div class="kind"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');

  const body = `
  <h1>One roster, keyed on the sign-in email, and production corrected it before it shipped.</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">A name is not an identity. "Sarbjit Kaur" matches two active
    enrollments.</div>
    <div>One of them holds the marketing agent; the other holds nothing. A name-keyed lookup is a
    coin flip for her, so the roster keys on the sign-in email and DERIVES the display name from
    the enrollment, reporting it when the two disagree rather than trusting it.</div>
  </div>

  ${kpi}
  ${flow}

  <div class="cols">
    ${D.OVERTURNED.map((o) => `
    <div class="col panel warn">
      <div class="hd" style="color:${SEV.bad}">Production overturned this</div>
      <div class="bd"><strong>${esc(o.title)}.</strong> ${esc(o.found)}</div>
      <div class="bd" style="margin-top:4px"><em>${esc(o.consequence)}</em></div>
    </div>`).join('')}
    <div class="col panel">
      <div class="hd">Ticket matching stops failing quietly</div>
      <div class="bd">${esc(D.QUIET_FAILURE.was)}</div>
      <div style="margin-top:4px">${kinds}</div>
    </div>
  </div>
  <div class="tiny" style="margin-top:4px">${esc(D.QUIET_FAILURE.result)} ${esc(D.PROOF)}</div>`;

  return shell({ title: `${D.TICKET} one-page visual`, body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const css = `
  h2 { margin-top: 18px; }
  table { width: 100%; }
  td.p { font-family: Consolas, monospace; font-size: 8.2pt; }
  `;

  const kindRows = D.QUIET_FAILURE.kinds.map(([k, v]) => `
    <tr><td class="p">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');

  const body = `
  <h1>${D.TICKET}: one roster, keyed on the sign-in email</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">Adding an intern is one repoint of one column, and all three scripts
    pick them up without being edited.</div>
    <div>${esc(D.DELIVERED)}</div>
  </div>

  <h2>Asked</h2>
  <p>${esc(D.ASKED)}</p>

  <h2>No schema change was needed, which is the finding</h2>
  <p class="p">${esc(D.KEY.chain)}</p>
  <p>${esc(D.KEY.why)}</p>

  <h2>Why the email and not the name</h2>
  <p>${esc(D.KEY.notTheName)}</p>

  <h2>Running it against production first overturned two assumptions</h2>
  <p>The resolver was run against production before anything was wired to it. Both assumptions in
  the first draft were wrong, and one was a bug about to ship.</p>
  ${D.OVERTURNED.map((o, i) => `
  <h3>${i + 1}. ${esc(o.title)}</h3>
  <p>${esc(o.found)}</p>
  <p><strong>${esc(o.consequence)}</strong></p>`).join('')}

  <h2>Ticket matching stops failing quietly</h2>
  <p>${esc(D.QUIET_FAILURE.was)} ${esc(D.QUIET_FAILURE.now)}</p>
  <table>
    <thead><tr><th>Problem</th><th>Catches</th></tr></thead>
    <tbody>${kindRows}</tbody>
  </table>
  <p>${esc(D.QUIET_FAILURE.result)}</p>

  <h2>Proof the rewiring changed nothing</h2>
  <p>${esc(D.PROOF)}</p>`;

  return shell({ title: `${D.TICKET} specification`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
