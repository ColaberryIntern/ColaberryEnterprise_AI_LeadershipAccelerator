/**
 * AF6.1's one-page visual and its decision-record document.
 *
 * The visual leads with the fact that made this ticket hard rather than with the ruling: the
 * retire group and the behavior group were never one decision, and the five that remain are
 * the only ones where the judgment was genuinely difficult. A reader who takes one thing from
 * the page should take that the parked five include the busiest agent in the fleet.
 *
 * The page does NOT present sixteen decisions as a finished job. Five of twenty-one are
 * undecided, the ticket's own first acceptance criterion is therefore unmet, and both facts are
 * on the page rather than in a footnote.
 */
const D = require('./af61Data');
const { TOKENS, SEV, esc, baseCss } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; ruled ${D.DECIDED_ON} by `
  + `${D.DECIDED_BY} &middot; measured ${D.MEASURED_ON} from ai_agent_activity_logs, `
  + 'never agent_runs &middot; nothing retired, disabled or modified';

const decided = D.GROUP_A.n + D.GROUP_B.n;
const n = (v) => Number(v).toLocaleString('en-US');

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  const css = `
  @page { size: A4 landscape; }
  h2 { font-size: 9.5pt; margin: 3px 0 2px; border-bottom-width: 1px; padding-bottom: 2px; }
  .takeaway { padding: 7px 11px; margin-bottom: 5px; }
  .takeaway .headline { font-size: 11pt; }
  .cards { margin: 3px 0 5px; gap: 8px; }
  .card { padding: 6px 9px; text-align: center; }
  .tiny { font-size: 7.4pt; color: ${TOKENS.MUTED}; }
  .cols { display: flex; gap: 9px; align-items: stretch; margin-top: 2px; }
  .col { flex: 1; }
  .panel {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 5px; padding: 6px 9px; background: #fff;
  }
  .panel.bad { border-top-color: ${SEV.bad}; }
  .panel.watch { border-top-color: ${SEV.watch}; }
  .panel .hd {
    font-size: 7.4pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px;
  }
  .panel .bd { font-size: 7.6pt; line-height: 1.24; margin-bottom: 2px; }
  .names { font-family: Consolas, monospace; font-size: 6.9pt; line-height: 1.3;
           color: ${TOKENS.MUTED}; }
  table.g { width: 100%; border-collapse: collapse; font-size: 7.3pt; margin-top: 2px; }
  table.g td, table.g th { padding: 1px 5px; border-bottom: 1px solid ${TOKENS.BORDER};
                           text-align: left; }
  table.g th { font-size: 6.9pt; text-transform: uppercase; letter-spacing: .04em;
               color: ${TOKENS.MUTED}; font-weight: 700; }
  table.g td.num { text-align: right; font-family: Consolas, monospace; }
  table.g td.nm { font-family: Consolas, monospace; }
  .warnrow td { background: #fff8ec; }
  `;

  const parked = D.GROUP_C.rows.map((r) => `
    <tr class="${r.d30 === 0 || r.name === 'forecast_engine' ? 'warnrow' : ''}">
      <td class="nm">${esc(r.name)}</td>
      <td class="num">${n(r.act)}</td>
      <td class="num">${n(r.d30)}</td>
      <td class="num">${esc(r.last)}</td>
      <td>${esc(r.note)}</td>
    </tr>`).join('');

  const body = `
  <h1>Sixteen ruled on. Eight actually resolved. The rest include the busiest agent we run.</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The ruling</div>
    <div class="headline">${esc(D.HEADLINE.ruling)}</div>
    <div>${esc(D.HEADLINE.why)}</div>
  </div>

  <div class="cards">
    <div class="card"><div class="n" style="color:${SEV.bad}">${D.GROUP_A.n}</div>
      <div class="k">Retire &mdash; zero runs between all eight</div></div>
    <div class="card"><div class="n" style="color:${SEV.ok}">${D.GROUP_B.n}</div>
      <div class="k">Absorb &mdash; all active within the hour</div></div>
    <div class="card"><div class="n" style="color:${SEV.watch}">${D.GROUP_C.n}</div>
      <div class="k">Parked &mdash; live, and no owner recorded</div></div>
    <div class="card"><div class="n">${D.GROUP_A.n} / ${D.TOTAL}</div>
      <div class="k">Actually resolved &mdash; ${decided} were ruled on</div></div>
  </div>

  <h2>The five parked rows, measured ${esc(D.MEASURED_ON)}</h2>
  <table class="g">
    <thead><tr><th>Agent</th><th style="text-align:right">Activity rows</th>
      <th style="text-align:right">Last 30 days</th><th style="text-align:right">Last activity</th>
      <th>Why it is not a tidy-up</th></tr></thead>
    <tbody>${parked}</tbody>
  </table>
  <div class="tiny" style="margin-top:2px"><strong>Five production-only rows, not "the five live
  rows": thirteen of the 21 are live.</strong> All five enabled at observe, no owner, no autonomy
  source, created 2026-03-11 by the March governance seed &mdash; the missing owner is why they
  were unresolved, and parking does not supply one.</div>

  <div class="cols">
    <div class="col panel bad">
      <div class="hd">Group A &mdash; retire, and why it is safe</div>
      <div class="bd">${esc(D.GROUP_A.evidence)}</div>
      <div class="names">${D.GROUP_A.names.map(esc).join(' &middot; ')}</div>
    </div>
    <div class="col panel">
      <div class="hd">Group B &mdash; absorb, never retire</div>
      <div class="bd">${esc(D.GROUP_B.evidence)}</div>
      <div class="bd"><strong>${esc(D.GROUP_B.risk)}</strong></div>
    </div>
    <div class="col panel watch">
      <div class="hd">What parking costs, said plainly</div>
      ${D.PARKED_COST.map((c) => `<div class="bd">&bull; ${esc(c)}</div>`).join('')}
    </div>
  </div>

  <div class="tiny" style="margin-top:3px"><strong>Nothing was retired, disabled or
  modified.</strong> One SELECT, then close. Execution happens under AF3.3, where it is reviewed
  as a change rather than as a side effect of writing a document.</div>`;

  return shell({ title: `${D.TICKET} one-page visual`, body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const css = `
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 6px 0 10px; }
  td, th { padding: 4px 7px; border-bottom: 1px solid ${TOKENS.BORDER}; text-align: left;
           vertical-align: top; }
  th { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: ${TOKENS.MUTED}; }
  td.p, td.nm { font-family: Consolas, monospace; font-size: 8.4pt; }
  td.num { text-align: right; font-family: Consolas, monospace; }
  li { margin-bottom: 5px; }
  `;

  const groupB = D.GROUP_B.rows.map(([name, runs, d30, last]) => `
    <tr><td class="nm">${esc(name)}</td><td class="num">${n(runs)}</td>
    <td class="num">${n(d30)}</td><td class="num">${esc(last)}</td></tr>`).join('');

  const groupC = D.GROUP_C.rows.map((r) => `
    <tr><td class="nm">${esc(r.name)}</td><td class="num">${n(r.act)}</td>
    <td class="num">${n(r.d30)}</td><td class="num">${esc(r.last)}</td>
    <td>${esc(r.note)}</td></tr>`).join('');

  const criteria = D.CRITERIA.map((c) => `
    <tr>
      <td><strong>${c.n}</strong></td>
      <td>${esc(c.text)}</td>
      <td><span class="chip" style="background:${c.met ? SEV.ok : SEV.bad}">${c.met ? 'MET' : 'NOT MET'}</span></td>
      <td>${esc(c.evidence)}</td>
    </tr>`).join('');

  const body = `
  <h1>${esc(D.TICKET)} &mdash; decision record for the 21 legacy agents that belong to no domain</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="note">
    <strong>ASKED:</strong> a recorded decision for each of the 21 unresolved legacy agents, with
    the five live production rows decided individually.<br/><br/>
    <strong>DELIVERED:</strong> the ruling of ${esc(D.DECIDED_ON)} recorded against all 21, with
    every figure re-measured that day. ${esc(D.RULING.consequence)}
  </div>

  <h2>The ruling</h2>
  <p><strong>${esc(D.RULING.text)}</strong> (${esc(D.RULING.answer)}, ${esc(D.DECIDED_BY)},
  ${esc(D.DECIDED_ON)}; decision package posted ${esc(D.PACKAGE_ON)}.)</p>
  <p>${esc(D.HEADLINE.why)}</p>
  <p>${esc(D.HEADLINE.parked)}</p>

  <h2>Group A &mdash; RETIRE (${D.GROUP_A.n})</h2>
  <p>${esc(D.GROUP_A.evidence)}</p>
  <p><strong>Risk:</strong> ${esc(D.GROUP_A.risk)}</p>
  <p class="p">${D.GROUP_A.names.map(esc).join(' &middot; ')}</p>

  <h2>Group B &mdash; ABSORB (${D.GROUP_B.n})</h2>
  <p>${esc(D.GROUP_B.evidence)}</p>
  <p><strong>${esc(D.GROUP_B.risk)}</strong></p>
  <table>
    <thead><tr><th>Agent</th><th style="text-align:right">Runs</th>
      <th style="text-align:right">Last 30 days</th><th style="text-align:right">Last activity</th></tr></thead>
    <tbody>${groupB}</tbody>
  </table>

  <h2>Group C &mdash; PARKED (${D.GROUP_C.n})</h2>
  <div class="note warn"><strong>${esc(D.GROUP_C.correction)}</strong></div>
  <p>${esc(D.GROUP_C.shared)}</p>
  <table>
    <thead><tr><th>Agent</th><th style="text-align:right">Activity rows</th>
      <th style="text-align:right">Last 30 days</th><th style="text-align:right">Last activity</th>
      <th>Note</th></tr></thead>
    <tbody>${groupC}</tbody>
  </table>

  <h2>What parking costs</h2>
  <ul>${D.PARKED_COST.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>

  <h2>What this unblocks, and what it does not</h2>
  <p>${esc(D.UNBLOCKS.now)}</p>
  <p><strong>${esc(D.UNBLOCKS.not)}</strong></p>

  <h2>Nothing was changed</h2>
  <p><strong>${esc(D.NO_WRITE.claim)}</strong> ${esc(D.NO_WRITE.how)}</p>
  <p>${esc(D.NO_WRITE.acceptance)}</p>

  <h2>A defect in the measurement itself</h2>
  <div class="note warn">
    <p>${esc(D.MEASUREMENT_DEFECT.what)}</p>
    <p><strong>${esc(D.MEASUREMENT_DEFECT.worse)}</strong></p>
    <p>${esc(D.MEASUREMENT_DEFECT.fix)}</p>
  </div>

  <h2>Acceptance criteria</h2>
  <table>
    <thead><tr><th>#</th><th>Criterion</th><th>State</th><th>Evidence</th></tr></thead>
    <tbody>${criteria}</tbody>
  </table>
  <p><strong>REVIEW STATE: READY FOR ALI REVIEW - DOCUMENT.</strong> The ticket is not closed.
  Five of twenty-one remain undecided, so its first acceptance criterion is unmet by design
  rather than by oversight.</p>`;

  return shell({ title: `${D.TICKET} decision record`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
