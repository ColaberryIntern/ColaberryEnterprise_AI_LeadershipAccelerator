/**
 * C3.8's tracker: a one-page board, a document, and the CSV that IS the tracker.
 *
 * The CSV is the deliverable people keep using; the PDFs are how it gets read the first time.
 */
const D = require('./c38Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const st = (s) => `<span class="st" style="background:${s.color}">${esc(s.k)}</span>`;
const sev = (s) => (s === 'HIGH' ? '#b3261e' : s === 'MEDIUM' ? '#b26a00' : '#555f6d');

const SHARED = `
  .st { display:inline-block; padding:0 6px; border-radius:8px; font-size:6.6pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .risk { border-left:5px solid #b3261e; background:#fdf3f2; border-radius:0 6px 6px 0;
          padding:9px 13px; margin:0 0 9px; }
  .risk .sv { font-weight:700; font-size:7.6pt; letter-spacing:.06em; }
  .late { color:#b3261e; font-weight:700; }
  .row { border:1px solid var(--border); border-radius:6px; padding:8px 12px; margin:0 0 7px; }
  .row h3 { margin:0; font-size:10.5pt; display:inline; }
  .row .id { font-family:Consolas,monospace; font-weight:700; color:var(--cherry);
             margin-right:6px; }
  .lbl { font-size:7.2pt; letter-spacing:.07em; text-transform:uppercase; color:var(--muted);
         font-weight:700; margin-top:5px; }
`;

function trackerTable(compact) {
  const t = D.byTrack();
  return Object.entries(t).map(([track, rows]) => `
  <h3 style="margin:9px 0 3px">${esc(track)}</h3>
  <table><tr><th style="width:6%">ID</th><th style="width:${compact ? 26 : 20}%">Who</th>
  <th style="width:13%">State</th><th style="width:9%">Owner</th>
  ${compact ? '' : '<th>Next action</th>'}<th style="width:11%">Due</th></tr>
  ${rows.map((r) => `<tr>
    <td><code>${esc(r.id)}</code></td>
    <td><strong>${esc(r.who)}</strong></td>
    <td>${st(r.state)}</td>
    <td>${esc(r.owner)}</td>
    ${compact ? '' : `<td>${esc(r.next)}</td>`}
    <td${r.due < D.TODAY ? ' class="late"' : ''}>${esc(r.due)}${
      r.due < D.TODAY ? '<br>' + D.daysLate(r.due) + 'd late' : ''}</td>
  </tr>`).join('')}</table>`).join('');
}

function buildDocument() {
  const css = `${baseCss()}
    .wrap { max-width:940px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }
    ${SHARED}`;

  const body = `<div class="wrap">
  <h1>Partner conversation tracker</h1>
  <div class="meta">C3.8 &middot; AI Capability Commercialization &middot; state as at
    ${esc(D.ACCESS)} &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked for every partner
  conversation in one place so nothing is dropped and state is never reconstructed from memory.
  <strong>Delivered: ${D.ROWS.length} rows across ${Object.keys(D.byTrack()).length} tracks, each
  with an owner, a state, a next action and a date, seeded from the C3.3 and C3.6 target maps AND
  from the five conversations already logged on this ticket.</strong> Four risks are recorded
  separately, because some of what is wrong here is not a late action.</div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

  <h2>Risks, worst first</h2>
  ${D.RISKS.map((r) => `<div class="risk" style="border-left-color:${sev(r.sev)};${
    r.sev === 'LOW' ? 'background:#f7fafc' : ''}">
    <span class="sv" style="color:${sev(r.sev)}">${esc(r.sev)}</span>
    &middot; <code>${esc(r.id)}</code> &middot; row <code>${esc(r.row)}</code>
    <div style="font-weight:700;margin:3px 0">${esc(r.r)}</div>
    <div>${esc(r.d)}</div>
    <div class="lbl">What closes it</div><div>${esc(r.fix)}</div></div>`).join('')}

  <h2>The tracker</h2>
  ${trackerTable(false)}

  <h2>Every row in full</h2>
  ${D.ROWS.map((r) => `<div class="row">
    <span class="id">${esc(r.id)}</span><h3>${esc(r.who)}</h3>
    <div class="meta">${esc(r.track)} &middot; ${st(r.state)} &middot; owner ${esc(r.owner)}
      &middot; last touch ${r.last ? esc(r.last) : 'never'}
      &middot; due ${esc(r.due)}${r.due < D.TODAY
        ? ' <span class="late">(' + D.daysLate(r.due) + ' days late)</span>' : ''}</div>
    <div class="lbl">Where it stands</div><div>${esc(r.what)}</div>
    <div class="lbl">Next action</div><div>${esc(r.next)}</div>
    <div class="meta">Source: ${esc(r.src)}</div>
  </div>`).join('')}

  <h2>How this stays current</h2>
  <ul>
  <li>The CSV beside this document is the tracker. These PDFs are how it gets read the first
  time; the CSV is what gets updated.</li>
  <li>Every row carries the ticket or log entry it came from, so a disputed state is settled by
  reading a source rather than by remembering.</li>
  <li>A row with no next action and no date fails the build. That is the whole point of the
  ticket, so it is enforced rather than intended.</li>
  <li><strong>Master Index integration:</strong> this tracker is filed in 03 - Strategic
  Partnerships and should be linked from the Master Index under the partnerships group. That
  link is a manual edit to the Master Index document and has NOT been made by this build.</li>
  </ul>
  </div>`;
  return htmlDoc({ title: 'C3.8 Partner conversation tracker', css, body });
}

function buildVisual() {
  const css = `${baseCss()}
    body { font-size:8.4pt; }
    h1 { font-size:15.5pt; }
    h2 { font-size:8.7pt; margin:5px 0 3px; border:0; padding:0; text-transform:uppercase;
         letter-spacing:.07em; color:var(--ink); }
    h3 { font-size:8.2pt; margin:7px 0 2px; }
    .cols { display:flex; gap:14px; } .col { flex:1; min-width:0; }
    .takeaway { padding:6px 11px; margin-bottom:5px; }
    .takeaway .headline { font-size:10.5pt; } .takeaway .label { font-size:7pt; }
    table { font-size:6.9pt; margin:2px 0 4px; } th { padding:2px 4px; font-size:6.2pt; }
    td { padding:2px 4px; }
    ${SHARED}
    .risk { padding:5px 9px; margin:0 0 4px; font-size:7.1pt; }
    .foot { margin-top:5px; font-size:6.6pt; color:var(--muted);
            border-top:1px solid var(--border); padding-top:4px; }`;

  const late = D.overdue();
  const body = `
  <h1>Partner conversation tracker</h1>
  <div class="meta">C3.8 &middot; ${D.ROWS.length} rows, ${late.length} overdue &middot; state as
    at ${esc(D.ACCESS)} &middot; one page</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  <div class="cols">
    <div class="col">
      <h2>Risks, worst first</h2>
      ${D.RISKS.map((r) => `<div class="risk" style="border-left-color:${sev(r.sev)};${
        r.sev === 'LOW' ? 'background:#f7fafc' : ''}">
        <span class="sv" style="color:${sev(r.sev)}">${esc(r.sev)}</span>
        <strong>${esc(r.r)}</strong></div>`).join('')}
      <div class="risk" style="border-left-color:#b3261e">
        <strong>The one to act on today.</strong> Ask Nishant for the text of every remaining
        touch before 19 October, and for what actually went out on 12 and 15 October. A
        correction is cheap now and expensive once a partner conversation starts.</div>
    </div>
    <div class="col">
      <h2>The board</h2>
      ${trackerTable(true)}
    </div>
  </div>

  <div class="foot">Seeded from the C3.3 and C3.6 target maps and from the five conversations
  already logged on this ticket, so it is a record rather than a plan. Every row carries an
  owner, a state, a next action and a date; a row missing any of those fails the build. The CSV
  beside this is the tracker that gets updated.</div>`;
  return htmlDoc({ title: 'C3.8 Partner tracker, one page', css, body });
}

function buildCsv() {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['id', 'track', 'who', 'state', 'owner', 'last_touch', 'where_it_stands',
    'next_action', 'due', 'days_late', 'source'];
  const nl = String.fromCharCode(10);
  let csv = head.map(q).join(',') + nl;
  for (const r of D.ROWS) {
    csv += [r.id, r.track, r.who, r.state.k, r.owner, r.last || '', r.what, r.next, r.due,
      r.due < D.TODAY ? D.daysLate(r.due) : 0, r.src].map(q).join(',') + nl;
  }
  return csv;
}

module.exports = { buildDocument, buildVisual, buildCsv };
