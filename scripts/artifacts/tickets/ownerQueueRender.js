/**
 * The one-page triage of "06 - Owner Decisions and Blockers".
 *
 * Built to answer one question in a glance: of the eight things the alert says are pressing, how
 * many does Ali actually have to decide? The answer is two, and the page leads with that number
 * rather than with the list, because the list is what made it look like eight.
 */
const D = require('./ownerQueueData');
const { TOKENS, SEV, esc, baseCss } = require('../artifactTheme');

/** Status colors carry meaning here and nowhere else on the page. */
const STATUS = {
  shipped: { color: SEV.ok, label: 'SHIPPED' },
  answered: { color: SEV.ok, label: 'ANSWERED' },
  parked: { color: TOKENS.MUTED, label: 'PARKED' },
  premise: { color: SEV.watch, label: 'CHECK PREMISE' },
  live: { color: TOKENS.CHERRY, label: 'DECIDE' },
};

function buildVisual() {
  const css = `
  body { font-size: 9.1pt; }
  h1 { font-size: 15pt; }
  h2 { font-size: 9.5pt; margin: 7px 0 3px; }
  .kpi .card { text-align: center; }
  .kpi .card .n { font-size: 17pt; }
  .cards { margin: 6px 0 8px; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 8px; }
  .takeaway .headline { font-size: 11pt; }
  .tiny { font-size: 7.5pt; color: ${TOKENS.MUTED}; }
  table { font-size: 7.7pt; margin: 3px 0 4px; }
  th, td { padding: 3px 5px; vertical-align: top; }
  .code { font-weight: 700; white-space: nowrap; }
  .said { color: ${TOKENS.MUTED}; white-space: nowrap; }
  .panel {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.CHERRY};
    border-radius: 5px; padding: 6px 9px; background: #fff; margin-top: 6px;
  }
  .panel .hd {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px;
  }
  .panel .bd { font-size: 7.8pt; line-height: 1.35; }
  `;

  const kpi = `
  <div class="cards kpi">
    <div class="card"><div class="n" style="color:${TOKENS.INK}">${D.SUMMARY.listed}</div>
      <div class="k">Open items the alert lists</div></div>
    <div class="card"><div class="n" style="color:${SEV.ok}">${D.SUMMARY.shipped + D.SUMMARY.answered}</div>
      <div class="k">Already shipped or answered</div></div>
    <div class="card"><div class="n" style="color:${TOKENS.MUTED}">${D.SUMMARY.parked}</div>
      <div class="k">Parked by their own ticket text</div></div>
    <div class="card"><div class="n" style="color:${TOKENS.CHERRY}">${D.SUMMARY.actuallyLive}</div>
      <div class="k">Decisions actually waiting on you</div></div>
  </div>`;

  const rows = D.ITEMS.map((i) => {
    const s = STATUS[i.status];
    return `<tr>
      <td class="code">${esc(i.code)}</td>
      <td><span class="chip" style="background:${s.color}">${s.label}</span></td>
      <td class="said">${esc(i.overdueSaid)}</td>
      <td><strong>${esc(i.truth)}</strong><div class="tiny">${esc(i.evidence)}</div></td>
    </tr>`;
  }).join('');

  const body = `
  <h1>Eight items on the list. Two are decisions.</h1>
  <div class="meta">06 - Owner Decisions and Blockers &middot; triaged against the code and the
  database on ${D.CHECKED_ON}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The correction</div>
    <div class="headline">The alert proposes deciding ${D.SUMMARY.claimedDecisions} items in one
    sitting. ${D.SUMMARY.shipped} have shipped, 1 is already answered in writing, and
    ${D.SUMMARY.parked} are parked by their own ticket text.</div>
    <div>${esc(D.WHY_STALE)}</div>
  </div>

  ${kpi}

  <table>
    <thead><tr><th>Ticket</th><th>Status</th><th>Alert said</th>
      <th>What is actually true, and how to check it</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="panel">
    <div class="hd">If you decide one thing, decide AF6.3</div>
    <div class="bd">Measured today: <strong>${D.KEYSTONE.draft} of ${D.KEYSTONE.capabilities}
    capabilities are draft</strong>, <strong>${D.KEYSTONE.confirmed} are confirmed</strong>, and
    the build-authorization table holds <strong>${D.KEYSTONE.authorizations} rows</strong> &mdash;
    no domain anywhere has an authorized build. "How a capability leaves draft" is the gate behind
    AF7.1, behind every Release 2, and behind all ${D.KEYSTONE.buildersDue} builder tickets due
    ${D.KEYSTONE.dueDate}. One decision unblocks ${D.KEYSTONE.buildersDue} people.</div>
  </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Owner queue triage</title>
<style>${baseCss()}${css}</style></head><body>${body}</body></html>`;
}

module.exports = { buildVisual };
