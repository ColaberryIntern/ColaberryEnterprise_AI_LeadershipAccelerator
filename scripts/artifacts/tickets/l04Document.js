/**
 * The L0.4 document: the traceability matrix itself.
 *
 * Structure follows what the ticket asks for - every requirement mapped to a ticket and to
 * evidence - and then says plainly where that mapping is weak, because a matrix that hides its
 * own soft joins is worse than no matrix. A reader who trusts a confident-looking grid and acts
 * on it is in a worse position than one who knows which rows to check.
 *
 * SELF-CHECK. build() asserts the register against the per-group counts and the stated totals
 * before it renders anything. The register was transcribed from a terminal read, so a
 * transcription slip is the likeliest defect in this whole artifact, and it is the one defect
 * that would quietly change every conclusion drawn from it. The assertion is deliberately
 * redundant with the numbers it checks: that is what makes it able to catch them.
 */
const D = require('./l04Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const CONF = {
  stated: { label: 'stated by the PR', bg: '#eaf5ea', fg: '#2f7d32' },
  inferred: { label: 'inferred here', bg: '#fff6e8', fg: '#8a5200' },
  unmapped: { label: 'no ticket exists', bg: '#fdf3f2', fg: '#b3261e' },
};

const CSS = `${baseCss()}
  body { font-size: 9.5pt; }
  h1 { font-size: 19pt; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 9pt; margin: 0 0 14px; }
  h2 { font-size: 11pt; margin: 20px 0 7px; padding-top: 7px;
       border-top: 2px solid var(--cherry); }
  h3 { font-size: 9.5pt; margin: 13px 0 4px; }
  .takeaway { background: var(--cherry-bg); border-left: 4px solid var(--cherry);
              padding: 11px 14px; margin: 0 0 14px; }
  table { font-size: 8.2pt; width: 100%; margin: 7px 0 11px; }
  th { padding: 4px 6px; font-size: 7.4pt; }
  td { padding: 4px 6px; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pill { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 7pt;
          font-weight: 700; white-space: nowrap; }
  .gap { border-left: 3px solid var(--border); padding: 2px 0 2px 11px; margin: 0 0 11px; }
  .gap.bad { border-left-color: #b3261e; }
  .gap.watch { border-left-color: #b26a00; }
  .gap h3 { margin: 0 0 3px; }
  .gap p { margin: 0; font-size: 8.8pt; }
  .grp { background: var(--bg-alt); font-weight: 700; font-size: 7.8pt;
         text-transform: uppercase; letter-spacing: .05em; }
  .done { color: #2f7d32; font-weight: 700; }
  .open { color: #b26a00; font-weight: 700; }
  .ev { font-size: 7.6pt; }
  ul { margin: 5px 0 11px; padding-left: 18px; }
  li { margin-bottom: 4px; font-size: 8.8pt; }
  .foot { margin-top: 18px; font-size: 7.4pt; color: var(--muted);
          border-top: 1px solid var(--border); padding-top: 7px; }
`;

/** PR numbers landing on a ticket id, as a display string. */
function evidenceFor(id) {
  const hits = D.MAP.filter((m) => m.id === id);
  if (!hits.length) return '';
  return hits.map((m) => '#' + m.pr).join(', ');
}

function gapBlocks() {
  return D.GAPS.map((g) => `<div class="gap ${g.sev}">
    <h3>${esc(g.h)}</h3>
    <p>${esc(g.d)}</p>
  </div>`).join('');
}

function mapTable() {
  return D.MAP.map((m) => {
    const c = CONF[m.conf];
    const pr = D.PRS.find((p) => p.pr === m.pr) || {};
    return `<tr>
      <td><code>#${m.pr}</code><br><span style="color:#718096;font-size:7.2pt">${esc(pr.date || '')}</span></td>
      <td>${esc(pr.t || '')}</td>
      <td>${m.id ? '<strong>' + esc(m.id) + '</strong>' : '<span style="color:#b3261e">none</span>'}
          ${m.state ? '<br><span class="' + (m.state === 'DONE' ? 'done' : 'open') + '" style="font-size:7.2pt">' + esc(m.state) + '</span>' : ''}</td>
      <td><span class="pill" style="background:${c.bg};color:${c.fg}">${esc(c.label)}</span></td>
      <td class="num">${pr.files || '?'} files<br>${pr.tests != null ? pr.tests + ' test' : ''}</td>
      <td class="ev">${esc(m.note)}</td>
    </tr>`;
  }).join('');
}

function registerTable() {
  let html = '';
  D.BOARD.forEach((grp, gi) => {
    const rows = D.TICKETS.filter((t) => t.g === gi);
    html += `<tr><td class="grp" colspan="5">${esc(grp.g)} &middot; ${grp.open} open, ${grp.done} done</td></tr>`;
    html += rows.map((t) => {
      const ev = evidenceFor(t.id);
      return `<tr>
        <td><strong>${esc(t.id)}</strong></td>
        <td>${esc(t.t)}</td>
        <td class="${t.s === 'DONE' ? 'done' : 'open'}">${esc(t.s)}</td>
        <td style="white-space:nowrap">${esc(t.who)}<br><span style="color:#718096;font-size:7.2pt">${esc(t.due || 'no date')}</span></td>
        <td class="ev">${ev ? esc(ev) : '<span style="color:#b3261e">none</span>'}</td>
      </tr>`;
    }).join('');
  });
  return html;
}

function build() {
  // ---- SELF-CHECK, before a single row is rendered ----
  if (D.TICKETS.length !== D.TOTALS.all) {
    throw new Error(`register holds ${D.TICKETS.length} tickets, totals claim ${D.TOTALS.all}`);
  }
  D.BOARD.forEach((grp, gi) => {
    const rows = D.TICKETS.filter((t) => t.g === gi);
    const open = rows.filter((t) => t.s === 'OPEN').length;
    const done = rows.filter((t) => t.s === 'DONE').length;
    if (open !== grp.open || done !== grp.done) {
      throw new Error(
        `group ${gi} "${grp.g}": register says ${open} open / ${done} done, ` +
        `board counts say ${grp.open} / ${grp.done}`,
      );
    }
  });
  const open = D.TICKETS.filter((t) => t.s === 'OPEN').length;
  const done = D.TICKETS.filter((t) => t.s === 'DONE').length;
  if (open !== D.TOTALS.open || done !== D.TOTALS.done) {
    throw new Error(`register totals ${open}/${done}, stated totals ${D.TOTALS.open}/${D.TOTALS.done}`);
  }
  // Every mapped ticket id must exist in the register, or the map points at nothing.
  const ids = new Set(D.TICKETS.map((t) => t.id));
  for (const m of D.MAP) {
    if (m.id && !ids.has(m.id)) throw new Error(`map row #${m.pr} points at unknown ticket ${m.id}`);
    if (m.id) {
      const reg = D.TICKETS.find((t) => t.id === m.id);
      if (reg.s !== m.state) {
        throw new Error(`map row #${m.pr} says ${m.id} is ${m.state}, register says ${reg.s}`);
      }
    }
  }

  const files = D.PRS.reduce((n, p) => n + p.files, 0);
  const tests = D.PRS.reduce((n, p) => n + p.tests, 0);
  const adds = D.PRS.reduce((n, p) => n + p.adds, 0);
  const openWithEvidence = new Set(D.MAP.filter((m) => m.state === 'OPEN' && m.id).map((m) => m.id));
  const openBare = D.TOTALS.open - openWithEvidence.size;
  const unmappedFiles = D.MAP
    .filter((m) => m.conf === 'unmapped')
    .reduce((n, m) => n + (D.PRS.find((p) => p.pr === m.pr) || { files: 0 }).files, 0);

  const body = `
<h1>Colaberry Live traceability matrix</h1>
<p class="sub">
  Ticket ${esc(D.META.ticket)} &middot; ${esc(D.META.project)} &middot; ${esc(D.META.list)}<br>
  Board read live ${esc(D.META.date)} &middot; session ${esc(D.META.session)}
</p>

<div class="takeaway">
  <strong>The board and the work have been running separately since 2026-10-30.</strong>
  ${D.PRS.length} pull requests have merged against this initiative, ${files} files and
  ${adds.toLocaleString('en-US')} lines. Of the ${D.TOTALS.open} open tickets,
  ${openWithEvidence.size} have merged, deployed code against them and <em>none of those
  ${openWithEvidence.size} carries a review state</em>, so the board renders identical empty
  checkboxes for work that is live in production and work nobody has started. A further
  ${unmappedFiles} files across 2 pull requests correspond to no ticket at all. And
  ${openBare} open tickets have no code against them, which is the honest size of what is
  genuinely left.
</div>

<h2>1. Where every figure in this document comes from</h2>
<ul>
  <li><strong>The board</strong> - status, owner, due date and the register - was read live from
      Basecamp on ${esc(D.META.date)} by a GET-only script run inside the production backend
      container, so that the token could be refreshed from the CCPP vault. It is live fact, not
      recollection, and not the stale ticket-definition module committed in the repository.</li>
  <li><strong>Pull request figures</strong> were computed locally with
      <code>git diff --numstat &lt;merge&gt;^1 &lt;merge&gt;</code> against each merge commit, so
      each row is the diff that merge actually introduced. Merge-from-main commits on the same
      branches were excluded; counting them would have inflated one row to 951 files.</li>
  <li><strong>The joins</strong> between the two are authored, and each one states its own
      confidence. ${D.MAP.filter((m) => m.conf === 'stated').length} are stated by the pull
      request title itself. ${D.MAP.filter((m) => m.conf === 'inferred').length} are inferred in
      this document. ${D.MAP.filter((m) => m.conf === 'unmapped').length} map to nothing.</li>
  <li><strong>The register was transcribed by hand</strong> from a terminal read, which makes a
      transcription slip the likeliest defect here. The build therefore asserts the register
      against the per-group counts, the stated totals, and every ticket id the map refers to,
      and refuses to render if any disagree. This PDF existing is that check passing.</li>
</ul>

<h2>2. What the mapping exposes</h2>
${gapBlocks()}

<h2>3. Pull request to ticket</h2>
<table>
  <thead><tr><th>PR</th><th>Title</th><th>Ticket</th><th>Join</th><th class="num">Size</th><th>What landed</th></tr></thead>
  <tbody>${mapTable()}</tbody>
</table>

<h2>4. The register: every ticket, and the evidence against it</h2>
<p style="font-size:8.8pt;margin:0 0 7px">
  ${D.TOTALS.all} tickets. The evidence column holds merged pull requests only. An empty
  evidence cell against a DONE ticket is not a defect: most of the closed work predates this
  branch series and was migrated with its evidence in the ticket body. An empty cell against an
  OPEN ticket is the thing to read.
</p>
<table>
  <thead><tr><th>ID</th><th>Requirement</th><th>State</th><th>Owner / due</th><th>Evidence</th></tr></thead>
  <tbody>${registerTable()}</tbody>
</table>

<h2>5. What this document does not establish</h2>
<ul>
  ${D.UNVERIFIED.map((u) => `<li>${esc(u)}</li>`).join('')}
</ul>

<h2>6. Proposed, not applied</h2>
<p style="font-size:8.8pt">
  Nothing here has been written back to Basecamp. The project's own rule is that a session works
  a ticket to a review state and stops, and that Ali closes it after validating the artifact, so
  these are proposals for your decision rather than actions taken:
</p>
<ul>
  <li><strong>L7.4</strong> - set READY FOR ALI REVIEW - PROD VERIFIED for the producer-control
      half, and add a note that the auto-end safety net is not built. Do not close it.</li>
  <li><strong>L7.3</strong> - set READY FOR ALI REVIEW - PROD VERIFIED for clip markers and the
      segment rundown, and note that Prompt Drops, polls and QR state remain. Do not close it.</li>
  <li><strong>L4.6</strong> - needs your judgment first: PR 3131 claimed it on 2026-10-16. Either
      it is closeable now, or the ticket is wider than the PR and should say so.</li>
  <li><strong>L5.3 and L10.1</strong> - need your memory of the 2026-10-20 airing. Six launch
      tickets sit behind them, so this is the most valuable correction on the board.</li>
  <li><strong>Two new tickets</strong> for PRs 3536 and 3540, written after the fact with
      migrated completion evidence, per the project's own rule that a plan must represent the
      whole initiative and not only what remains.</li>
  <li><strong>Reset the dates.</strong> All ${D.TOTALS.open} open tickets are past due, so due
      date currently carries no priority information at all.</li>
</ul>

<div class="foot">
  ${esc(D.META.title)} &middot; ticket ${esc(D.META.ticket)} &middot; ${esc(D.META.date)} &middot;
  session ${esc(D.META.session)} &middot; ${D.PRS.length} pull requests, ${files} files,
  ${tests} test files, ${adds.toLocaleString('en-US')} lines added &middot;
  built from the same data module as the one-page visual
</div>`;

  return htmlDoc({ title: 'L0.4 Colaberry Live traceability matrix', css: CSS, body });
}

module.exports = { build };
