/**
 * The one-page visual and the completion document for each of the eight ungrouped Agent Factory
 * tickets closed on 2026-11-28.
 *
 * Both read `af14CloseoutData.js`, so the figure on the picture and the figure in the prose are
 * the same figure by construction.
 *
 * ## Why every visual carries the same two strips
 *
 * Each of these eight tickets is individually finished. Read together they would say the
 * program is moving, and the measurement says otherwise: zero candidate rows, zero build
 * authorizations, zero decided change requests, zero stored artifacts. So the STATE strip is on
 * every visual, under the ticket's own good news.
 *
 * The COVERAGE line is there for a different reason. The audit that produced these eight
 * verdicts had already miscounted its own scope once, reporting 25 open tickets when the real
 * figure was 39. An audit that got its own denominator wrong has to print that on its work
 * before asking anybody to trust its verdicts.
 */
const D = require('./af14CloseoutData');
const { TOKENS, SEV, esc, baseCss } = require('../artifactTheme');

const TONE = { ok: SEV.ok, good: SEV.ok, watch: SEV.watch, warn: SEV.watch, bad: SEV.bad };

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const foot = (t) => `${esc(t.code)} &middot; Agent Factory &middot; ${esc(t.settledBy)}`
  + ` &middot; production measured ${esc(D.MEASURED_ON)}`;

/** The six counts that say what a builder is actually waiting on. */
const stateHtml = () => `<div class="pipe">${D.STATE.map(([label, n, tone]) => `
  <div class="cell" style="border-bottom-color:${TONE[tone]}">
    <div class="n" style="color:${TONE[tone]}">${n}</div><div class="l">${esc(label)}</div></div>`).join('')}</div>`;

/**
 * The audit's own arithmetic, stated because the first pass of it was wrong.
 *
 * Only the first letter is lowered, never the whole label: a blanket toLowerCase turned
 * "Read by the 27 Nov pass" into "27 nov" on the first render.
 */
const lede = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const coverageHtml = () => `<div class="cov">${D.COVERAGE.map(([label, n], i) => `
  <span class="seg"><b>${n}</b> ${esc(lede(label))}</span>${i < D.COVERAGE.length - 1 ? '<span class="sep">&middot;</span>' : ''}`).join('')}</div>`;

const ladderHtml = (t) => `<div class="ladder">${t.ladder.map(([stage, ok, note]) => `
  <div class="step" style="background:${ok ? SEV.ok : SEV.watch}">
    <div class="s">${esc(stage)} ${ok ? '&#10003;' : '&#9888;'}</div>
    <div class="d">${esc(note)}</div></div>`).join('')}</div>`;

const kpiHtml = (t) => `<div class="cards kpi">${t.kpi.map(([n, k, tone]) => `
  <div class="card"><div class="n" style="color:${TONE[tone]}">${esc(n)}</div>
  <div class="k">${esc(k)}</div></div>`).join('')}</div>`;

const VISUAL_CSS = `
  body { font-size: 9.1pt; }
  h1 { font-size: 15pt; }
  h2 { font-size: 9.5pt; margin: 7px 0 3px; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 8px; }
  .takeaway .headline { font-size: 11pt; }
  .cards { margin: 6px 0 8px; }
  .kpi .card { text-align: center; }
  .kpi .card .n { font-size: 16pt; }
  .ladder { display: flex; gap: 5px; margin: 4px 0 8px; }
  .step { flex: 1; border-radius: 4px; padding: 4px 6px; color: #fff; }
  .step .s { font-size: 8.2pt; font-weight: 700; }
  .step .d { font-size: 6.8pt; opacity: .95; line-height: 1.25; }
  .pipe { display: flex; gap: 4px; margin: 4px 0 8px; }
  .pipe .cell { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-bottom-width: 3px;
    border-radius: 4px; padding: 4px 6px; background: #fff; text-align: center; }
  .pipe .cell .n { font-size: 13pt; font-weight: 700; line-height: 1.1; }
  .pipe .cell .l { font-size: 6.6pt; color: ${TOKENS.MUTED}; line-height: 1.2; }
  .cov { margin: 2px 0 8px; font-size: 7.4pt; color: ${TOKENS.MUTED};
    border: 1px dashed ${TOKENS.BORDER}; border-radius: 4px; padding: 4px 8px; background: #fff; }
  .cov b { color: ${TOKENS.CHERRY_DEEP}; font-size: 8.4pt; }
  .cov .sep { margin: 0 5px; opacity: .5; }
  .cols { display: flex; gap: 10px; align-items: flex-start; }
  .col { flex: 1; }
  .panel { border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${SEV.watch};
    border-radius: 5px; padding: 6px 9px; background: #fff; }
  .panel.ship { border-top-color: ${TOKENS.LEAF}; }
  .panel .hd { font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px; }
  .panel .bd { font-size: 7.4pt; line-height: 1.34; }
  ul { margin: 0; padding-left: 13px; }
  li { margin-bottom: 2px; }
  .tiny { font-size: 7.1pt; color: ${TOKENS.MUTED}; margin-top: 4px; line-height: 1.35; }
  .tiny b { color: ${TOKENS.CHERRY_DEEP}; }
`;

function buildVisual(key) {
  const t = D.TICKETS[key];
  const newLine = D.NEW_TICKETS.map(([c]) => c).join(' and ');
  const body = `
  <h1>${esc(t.headline)}</h1>
  <div class="meta">${foot(t)}</div>
  <div class="rule"></div>
  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">${esc(t.delivered)}</div>
    <div>${esc(t.asked)}</div>
  </div>
  ${kpiHtml(t)}
  <h2>The shipping ladder, not collapsed into "done"</h2>
  ${ladderHtml(t)}
  <h2>What a builder is actually waiting on, measured ${esc(D.MEASURED_ON)}</h2>
  ${stateHtml()}
  <h2>This audit's own arithmetic, because its first pass got it wrong</h2>
  ${coverageHtml()}
  <div class="cols">
    <div class="col">
      <div class="panel ship">
        <div class="hd">What settles it</div>
        <div class="bd"><ul>${t.shipped.slice(0, 4).map(([f, w]) => `<li><strong>${esc(f)}</strong> ${esc(w)}</li>`).join('')}</ul></div>
      </div>
    </div>
    <div class="col">
      <div class="panel">
        <div class="hd">What this does NOT establish</div>
        <div class="bd"><ul>${t.notEstablished.slice(0, 2).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
      </div>
    </div>
  </div>
  <div class="tiny">Six of the eight tickets closed today were already fixed before this audit looked,
  and one of them was fixed within hours of its own ticket being written. So this set does not show
  eight problems solved this week: it shows that the list lagged the system, and builders were told
  things about their own work that had stopped being true. Two defects found on the way are filed as
  <b>${esc(newLine)}</b>, and six tickets stay open with the measurement that keeps them open.</div>`;
  return shell({ title: `${t.code} one-page visual`, body, extraCss: VISUAL_CSS });
}

const DOC_CSS = `
  h2 { margin-top: 17px; }
  table { width: 100%; }
  td.p { font-family: Consolas, monospace; font-size: 8.2pt; }
  .gap { color: ${SEV.bad}; font-weight: 700; }
`;

const chip = (ok, y = 'YES', n = 'NO') =>
  `<span class="chip" style="background:${ok ? SEV.ok : SEV.watch}">${ok ? y : n}</span>`;

function buildDocument(key) {
  const t = D.TICKETS[key];
  const shippedRows = t.shipped.map(([f, w]) => `<tr><td class="p">${esc(f)}</td><td>${esc(w)}</td></tr>`).join('');
  const evidenceRows = t.evidence.map(([c, r, ok]) =>
    `<tr><td>${esc(c)}</td><td><strong>${esc(r)}</strong></td><td style="width:52px">${chip(ok, 'PASS', 'GAP')}</td></tr>`).join('');
  const ladderRows = t.ladder.map(([s, ok, d]) =>
    `<tr><td><strong>${esc(s)}</strong></td><td>${esc(d)}</td><td style="width:52px">${chip(ok)}</td></tr>`).join('');
  const stateRows = D.STATE.map(([l, n]) => `<tr><td>${esc(l)}</td><td><strong>${n}</strong></td></tr>`).join('');
  const covRows = D.COVERAGE.map(([l, n]) => `<tr><td>${esc(l)}</td><td><strong>${n}</strong></td></tr>`).join('');
  const newRows = D.NEW_TICKETS.map(([c, id, title]) =>
    `<tr><td><strong>${esc(c)}</strong></td><td>${esc(title)}</td>`
    + `<td class="p">${id}</td></tr>`).join('');
  const keepRows = D.KEEPING.map(([c, what, why]) =>
    `<tr><td><strong>${esc(c)}</strong></td><td>${esc(what)}</td><td>${esc(why)}</td></tr>`).join('');

  const body = `
  <h1>${esc(t.headline)}</h1>
  <div class="meta">${foot(t)}</div>
  <div class="rule"></div>
  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">${esc(t.delivered)}</div>
    <div>${esc(t.asked)}</div>
  </div>

  <h2>Takeaway</h2>
  <p>This ticket is finished and is being closed on that basis. It is one of eight closed together
  on 28 Nov 2026 after an audit of the 27 ungrouped todos on this list, which an earlier pass had
  never read. Six of the eight were already fixed before the audit looked, and one was fixed within
  hours of its own ticket being written. So the honest reading of this set is not that eight
  problems were solved this week. It is that the list lagged the system.</p>

  <h2>This audit's own coverage</h2>
  <p>The 27 Nov pass read the eleven groups on this list and nothing else, and reported 25 open
  tickets. The real figure was 39, because a todo sitting directly on a list is not returned by any
  of that list's groups. Stated here first, because an audit that got its own denominator wrong has
  to say so before it asks anyone to trust its verdicts.</p>
  <table><thead><tr><th>Counted</th><th>Number</th></tr></thead><tbody>${covRows}</tbody></table>

  <h2>What settles this ticket</h2>
  <table><thead><tr><th>File, surface or finding</th><th>What it is</th></tr></thead><tbody>${shippedRows}</tbody></table>

  <h2>Evidence, checked rather than recalled</h2>
  <p>Production figures are SELECTs against <code>accelerator_prod</code>. Code state is
  <code>git show origin/main</code>. Deployed state is a grep of the bundle the running container
  actually serves. Merge state is <code>gh pr view</code>, never a ticket comment claiming a merge.</p>
  <table><thead><tr><th>Check</th><th>Result</th><th></th></tr></thead><tbody>${evidenceRows}</tbody></table>

  <h2>The shipping ladder</h2>
  <p>Built, merged, deployed, and used by a real person are four different states. Collapsing them
  into "done" is how a feature nobody has run reads as a feature that works.</p>
  <table><thead><tr><th>Stage</th><th>Evidence</th><th></th></tr></thead><tbody>${ladderRows}</tbody></table>

  <h2>What a builder is actually waiting on, measured ${esc(D.MEASURED_ON)}</h2>
  <p>Closing eight tickets does not move any of these. They are here so that a reader of this
  document does not mistake eight finished tickets for a program in motion.</p>
  <table><thead><tr><th>Thing counted</th><th>Count</th></tr></thead><tbody>${stateRows}</tbody></table>

  <h2>What this does not establish</h2>
  <ul>${t.notEstablished.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>

  <h2>What this audit found on the way</h2>
  <p>Two defects, both filed today, neither of which existed as a ticket before.</p>
  <table><thead><tr><th>Ticket</th><th>What it is</th><th>Id</th></tr></thead><tbody>${newRows}</tbody></table>

  <h2>What stays open</h2>
  <p>Six of the fourteen open ungrouped tickets keep their defect. Each line is the measurement that
  keeps it open, not a restatement of the ticket.</p>
  <table><thead><tr><th>Ticket</th><th>What is wrong</th><th>Measured</th></tr></thead><tbody>${keepRows}</tbody></table>

  <h2>Links</h2>
  <p>Ticket: https://app.basecamp.com/3945211/buckets/${D.BUCKET}/todos/${t.id}</p>`;

  return shell({ title: `${t.code} completion document`, body, extraCss: DOC_CSS });
}

module.exports = { buildVisual, buildDocument };
