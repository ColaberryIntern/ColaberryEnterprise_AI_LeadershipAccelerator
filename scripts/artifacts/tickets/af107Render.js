/**
 * AF10.7's one-page visual and its spec document.
 *
 * Two things lead, in this order. First that NOTHING HAS BEEN POSTED -- the runner is dry, there
 * is no cron, and the first live post is Ali's to authorize; an artifact that read as "shipped"
 * would invite a close that authorizes seven irreversible Basecamp writes by accident. Second the
 * cohort snapshot, because the dry run measured what the interns have actually committed and one
 * of them has committed nothing.
 */
const D = require('./af107Data');
const { TOKENS, SEV, esc, baseCss, barChart } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; merged ${D.MERGED_ON} in PR #${D.PR} `
  + '&middot; DRY RUN ONLY, nothing posted';

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const docColor = (k) => (k === 0 ? SEV.bad : (k < D.DRY_RUN.total ? SEV.watch : SEV.ok));

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
  .kpi .card.bad .n { color: ${SEV.bad}; }
  h2 { font-size: 9.5pt; margin: 6px 0 3px; }
  .tiny { font-size: 7.5pt; color: ${TOKENS.MUTED}; }
  .cards { margin: 6px 0 8px; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 8px; }
  .takeaway .headline { font-size: 11pt; }
  .panel {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 5px; padding: 6px 9px; background: #fff;
  }
  .panel.warn { border-top-color: ${SEV.bad}; }
  .panel .hd {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px;
  }
  .panel .bd { font-size: 7.7pt; line-height: 1.35; }
  table { font-size: 7.6pt; margin: 3px 0 4px; }
  th, td { padding: 2px 5px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  td.p { font-family: Consolas, monospace; font-size: 7pt; }
  `;

  const kpi = `
  <div class="cards kpi">
    <div class="card bad"><div class="n">0</div><div class="k">Comments posted so far</div></div>
    <div class="card good"><div class="n">${D.DRY_RUN.examined} / ${D.DRY_RUN.examined}</div>
      <div class="k">Tickets examined, every repo readable</div></div>
    <div class="card bad"><div class="n">0 / ${D.DRY_RUN.total}</div>
      <div class="k">Release 0 docs from Victoria</div></div>
    <div class="card"><div class="n">58</div>
      <div class="k">Comments on one ticket, vs a 15-row page</div></div>
  </div>`;

  const rows = D.DRY_RUN.rows.map(([agent, repo, comments, docs]) => `
    <tr>
      <td><strong>${esc(agent)}</strong></td>
      <td class="p">${esc(repo)}</td>
      <td class="num">${comments}</td>
      <td class="num"><strong style="color:${docColor(docs)}">${docs} of ${D.DRY_RUN.total}</strong></td>
    </tr>`).join('');

  const body = `
  <h1>Every Release 0 document, readable from the ticket. Nothing posted yet.</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">The code is merged and proven against production, and it has posted
    nothing. The first live post is yours to authorize.</div>
    <div>Posting is a Basecamp write as you, to seven interns' tickets, and
    <strong>a posted comment cannot be retracted by this code</strong> -- recovery from a bad run
    is a human deleting comments by hand across seven tickets. Registering a schedule would have
    been worse than asking: it would start the posting on the next deploy, smuggling the approval
    through a deploy.</div>
  </div>

  ${kpi}

  <h2>The dry run doubles as a document-progress snapshot of the cohort</h2>
  <table>
    <thead><tr><th>Agent</th><th>Builder's repo</th><th class="num">Comments</th>
      <th class="num">Release 0 documents</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="tiny">Measured from what the interns actually committed, not from what anyone
  reported. Every repo readable, every ticket title matched the convention, nothing errored.</div>

  <div class="cols" style="margin-top:7px">
    <div class="col panel warn">
      <div class="hd" style="color:${SEV.bad}">The pagination hazard is live, not theoretical</div>
      <div class="bd">${esc(D.PAGINATION.fact)} ${esc(D.PAGINATION.incident)}</div>
    </div>
    <div class="col panel">
      <div class="hd">Why the fingerprint hashes status, not just content</div>
      <div class="bd">${esc(D.FINGERPRINT.trap)} ${esc(D.FINGERPRINT.named)}</div>
      <div class="bd" style="margin-top:4px">${esc(D.FINGERPRINT.fix)}</div>
    </div>
    <div class="col panel">
      <div class="hd">The three acceptance criteria</div>
      ${D.CRITERIA.map((c) => `
        <div class="bd" style="margin-bottom:4px">
          <span class="chip" style="background:${SEV.ok}">MET</span>
          ${esc(c.text)}
        </div>`).join('')}
    </div>
  </div>
  <div class="tiny" style="margin-top:4px">${esc(D.PAGINATION.fix)}</div>`;

  return shell({ title: `${D.TICKET} one-page visual`, body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const css = `
  h2 { margin-top: 18px; }
  table { width: 100%; }
  td.p { font-family: Consolas, monospace; font-size: 8.2pt; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  `;

  const rows = D.DRY_RUN.rows.map(([agent, repo, comments, docs]) => `
    <tr><td><strong>${esc(agent)}</strong></td><td class="p">${esc(repo)}</td>
    <td class="num">${comments}</td>
    <td class="num"><span class="chip" style="background:${docColor(docs)}">${docs} of ${D.DRY_RUN.total}</span></td></tr>`).join('');

  const criteriaRows = D.CRITERIA.map((c) => `
    <tr><td style="width:18px">${c.n}</td>
    <td>${esc(c.text)}<div class="meta">${esc(c.evidence)}</div></td>
    <td style="width:52px"><span class="chip" style="background:${SEV.ok}">MET</span></td></tr>`).join('');

  const docsChart = barChart({
    rows: D.DRY_RUN.rows.map(([agent, , , docs]) => ({
      label: agent, value: docs, display: `${docs} of ${D.DRY_RUN.total}`, color: docColor(docs),
    })),
    width: 620,
    labelW: 110,
    barH: 15,
    gap: 5,
    max: D.DRY_RUN.total,
  });

  const body = `
  <h1>${D.TICKET}: every document an intern produces, readable from the ticket</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">All three acceptance criteria are met, and NOTHING HAS BEEN POSTED.</div>
    <div>${esc(D.NOT_POSTED.state)} The reversible step comes first, deliberately.</div>
  </div>

  <h2>Why nothing has been posted</h2>
  <p>${esc(D.NOT_POSTED.why)}</p>
  <p>${esc(D.NOT_POSTED.why2)}</p>

  <h2>The dry run</h2>
  <p>Run ${esc(D.DRY_RUN.where)}. Exit ${D.DRY_RUN.exit}, ${D.DRY_RUN.lines} lines,
  ${D.DRY_RUN.examined} tickets examined, <code>sent=${D.DRY_RUN.sent}</code>.</p>
  <table>
    <thead><tr><th>Agent</th><th>Builder's repo</th><th class="num">Comments</th>
      <th class="num">Release 0 documents</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <figure>${docsChart}
    <figcaption class="meta">${esc(D.DRY_RUN.note)}</figcaption>
  </figure>

  <h2>The pagination hazard is live, not theoretical</h2>
  <p>${esc(D.PAGINATION.fact)}</p>
  <p>${esc(D.PAGINATION.incident)}</p>
  <p>${esc(D.PAGINATION.fix)}</p>

  <h2>Why the fingerprint hashes status, not just content</h2>
  <p>${esc(D.FINGERPRINT.trap)}</p>
  <p>${esc(D.FINGERPRINT.named)}</p>
  <p>${esc(D.FINGERPRINT.fix)}</p>

  <h2>The three acceptance criteria</h2>
  <table>
    <thead><tr><th></th><th>Criterion and evidence</th><th></th></tr></thead>
    <tbody>${criteriaRows}</tbody>
  </table>`;

  return shell({ title: `${D.TICKET} specification`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
