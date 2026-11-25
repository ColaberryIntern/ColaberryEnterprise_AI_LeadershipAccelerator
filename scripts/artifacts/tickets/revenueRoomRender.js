/**
 * The Revenue Room ladder's artifacts: a one-page visual and a document, per ticket.
 *
 * The visual leads with WHAT IS WAITING ON ALI, not with what shipped. All three tickets are
 * live and verified, so a status report would be the wrong artifact: nothing here is waiting on
 * engineering, and a reader who has to reach the second screen to learn that has been handed a
 * progress update instead of a decision aid.
 *
 * The funnel chart earns its place on page one because it is the evidence behind the single
 * most likely misreading of this product: the column does not add up, and the overlap is
 * visible in the bars rather than asserted in a sentence.
 */
const D = require('./revenueRoomData');
const { TOKENS, SEV, esc, baseCss, barChart } = require('../artifactTheme');

const foot = (t) => `To-do ${t.id} &middot; Revenue Room &middot; state as of ${D.AS_OF} `
  + `&middot; every status read from the running containers, not inferred from a merge`;

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

/**
 * The overlapping stages are drawn in cherry and the clean ones in green, because the value
 * being shown is not size, it is "does this row get counted twice". Colour carries the finding.
 */
const funnelChart = (width, labelW, barH, gap) => barChart({
  rows: D.FUNNEL.map((r) => ({
    label: r.label,
    value: r.count,
    display: String(r.count),
    color: r.overlaps ? TOKENS.CHERRY : SEV.ok,
  })),
  width,
  labelW,
  barH,
  gap,
  max: 300,
});

const askRows = () => D.TAIWO.asks.map((a) => `<tr>
  <td><strong>${esc(a.q)}</strong><div class="sub">${esc(a.a)}</div></td>
  <td class="st"><span class="chip" style="background:${a.state === 'BUILT' ? TOKENS.CHERRY : SEV.ok}">${esc(a.state)}</span></td>
</tr>`).join('');

const decisionCards = () => D.DECISIONS.map((o, i) => `<div class="opt${i === 0 ? ' picked' : ''}">
  <div class="ok">${esc(o.key)}${i === 0 ? ' &middot; do this first' : ''}</div>
  <div class="ot">${esc(o.title)}</div>
  <div class="ob">${esc(o.body)}</div>
  <div class="oc"><strong>If it waits:</strong> ${esc(o.cost)}</div>
</div>`).join('');

const trapRows = () => D.TRAPS.map((t) => `<tr>
  <td><strong>${esc(t.trap)}</strong><div class="sub">${esc(t.why)}</div></td>
</tr>`).join('');

const ladderRow = (k) => D.LADDER.map((s) => `<span class="step ${s[k] ? 'on' : 'off'}">${esc(s.step)}</span>`).join('');

/* ------------------------------------------------------------------ visual */

function buildVisual(ticketKey) {
  const t = D.TICKETS[ticketKey];
  const e = D.EVIDENCE[ticketKey];
  const css = `
  body { font-size: 9pt; }
  h1 { font-size: 16pt; margin-bottom: 2px; }
  .lede { font-size: 10pt; margin: 0 0 9px; }
  .lede strong { color: var(--cherry-deep); }
  .cols { display: flex; gap: 13px; align-items: flex-start; }
  .col { flex: 1; }
  .col.wide { flex: 1.2; }
  h2 { font-size: 9.5pt; margin: 0 0 5px; border-bottom: 1.5px solid var(--cherry-bg);
       padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3.5px 4px; border-bottom: 1px solid var(--border); vertical-align: top;
       font-size: 8.6pt; }
  td.st { width: 66px; text-align: right; }
  .sub { color: var(--muted); font-size: 7.6pt; line-height: 1.3; }
  .chip { color: #fff; border-radius: 9px; padding: 1.5px 7px; font-size: 7.2pt;
          font-weight: 700; white-space: nowrap; display: inline-block; }
  .opt { border: 1px solid var(--border); border-left: 3px solid var(--muted);
         border-radius: 4px; padding: 5px 7px; margin-bottom: 5px; background: #fff; }
  .opt.picked { border-left-color: var(--cherry); background: var(--cherry-bg); }
  .ok { font-size: 7.4pt; font-weight: 700; color: var(--cherry-deep); letter-spacing: .4px; }
  .ot { font-size: 9pt; font-weight: 700; margin: 1px 0 2px; }
  .ob { font-size: 7.8pt; line-height: 1.35; }
  .oc { font-size: 7.4pt; color: var(--muted); margin-top: 3px; }
  .step { display: inline-block; font-size: 7pt; font-weight: 700; border-radius: 8px;
          padding: 1.5px 6px; margin-right: 3px; }
  .step.on { background: ${SEV.ok}; color: #fff; }
  .step.off { background: var(--border); color: var(--muted); }
  .foot { margin-top: 8px; font-size: 7pt; color: var(--muted); }
  .risk { border-left: 3px solid var(--cherry); background: var(--cherry-bg);
          padding: 5px 7px; border-radius: 4px; font-size: 7.9pt; line-height: 1.35; }
  `;

  const body = `
  <h1>${esc(t.key)} &middot; ${esc(t.title)}</h1>
  <p class="lede">${esc(t.subtitle)}. <strong>Live and verified in production.</strong>
     Nothing on this ticket is waiting on engineering &mdash; what is left is on the right.</p>

  <div style="margin-bottom:8px">${ladderRow(ticketKey)}</div>

  <div class="cols">
    <div class="col wide">
      <h2>The membership funnel, as production reports it</h2>
      ${funnelChart(300, 104, 13, 5)}
      <div class="sub" style="margin-top:4px">Cherry marks a stage that is counted twice.
        This column does not sum to 296, and that is the design.</div>

      <h2 style="margin-top:9px">The two ways this card gets misread</h2>
      <table>${trapRows()}</table>
      <div class="sub" style="margin-top:3px">Both now print on the card itself, not only in a
        reply, because the next reader will not have the email.</div>
    </div>

    <div class="col">
      <h2>What ${esc(D.TAIWO.who.split(',')[0])} asked, ${esc(D.TAIWO.when)}</h2>
      <table>${askRows()}</table>

      <h2 style="margin-top:9px">Why this needed a refactor, not a query</h2>
      <div class="risk"><strong>${esc(D.CONSTRAINT.risk)}.</strong> ${esc(D.CONSTRAINT.body)}</div>
      <div class="sub" style="margin-top:4px">${esc(D.CONSTRAINT.fix)}</div>
    </div>

    <div class="col">
      <h2>Waiting on you</h2>
      ${decisionCards()}
      <div class="sub"><strong>Evidence:</strong> ${esc(e.tests)} new tests &middot;
        ${esc(e.mutations)} mutations killed &middot; ${esc(e.gates)} CI gates &middot;
        ${esc(e.suites)}.</div>
    </div>
  </div>
  <div class="foot">${foot(t)}</div>`;

  return shell({ title: `${t.key} - ${t.title}`, body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument(ticketKey) {
  const t = D.TICKETS[ticketKey];
  const e = D.EVIDENCE[ticketKey];

  const ASKED = {
    r12: 'Give the active needs_evidence qualification rows a project to belong to, so the '
      + 'second pipeline tier can be named, priced and shown instead of being invisible.',
    r25: 'Break everything in the revenue tab down by brand, defaulting to Colaberry Training, '
      + 'with FDE hiring under the Refactored.ai brand and enterprise sales under its own.',
    r26: 'Make the Revenue Room data points clickable so they show a list of the students or '
      + 'leads that fall within each category.',
  }[ticketKey];

  const DELIVERED = {
    r12: 'The rows are NOT orphaned and nothing was linked. A delivery project is created when '
      + 'a bid is approved for pursuit, so the assessment stage has none by design. The tier now '
      + 'renders as a count with no names, with its cause stated on the page.',
    r25: 'One brand filter at the top of the Revenue Room scopes all seven blocks of the tab, '
      + 'including the four top tiles, which each carry a single stream\'s figure.',
    r26: 'All nine membership funnel counts are clickable and open the named people in that '
      + 'category with their email, derived from the same classifier that produces the count.',
  }[ticketKey];

  const TAKEAWAY = {
    r12: 'The ticket assumed a broken write path. The measurement said otherwise, one-sidedly: '
      + 'a delivery project appears only at approval, 19 of 26 there, and never once across 246 '
      + 'rows at the two earlier stages. So the fix was a display, not a backfill &mdash; and the '
      + 'real finding is that the linking screen exists, works, and has never been used.',
    r25: 'Each of the four tiles across the top is one stream\'s figure wearing a board-level '
      + 'label. Filtering to Refactored.ai while they stood would have shown Colaberry Training\'s '
      + '$54,900 under the Refactored.ai heading: not a cosmetic bug, but the page asserting a '
      + 'number about a brand that has booked nothing.',
    r26: 'Taiwo\'s first question was the important one. The data IS accurate, and the two things '
      + 'that make it look wrong are now printed on the card. Her actual request did not exist '
      + 'anywhere and now works for all nine stages.',
  }[ticketKey];

  const css = `
  h1 { font-size: 17pt; margin-bottom: 3px; }
  h2 { font-size: 11pt; margin: 15px 0 5px; border-bottom: 1.5px solid var(--cherry-bg);
       padding-bottom: 3px; }
  .pair { border-left: 3px solid var(--cherry); background: var(--cherry-bg);
          padding: 8px 11px; border-radius: 4px; margin-bottom: 10px; }
  .pair .k { font-size: 8pt; font-weight: 700; color: var(--cherry-deep); letter-spacing: .5px; }
  .pair .v { font-size: 10pt; line-height: 1.4; margin-bottom: 6px; }
  .take { font-size: 10.5pt; line-height: 1.45; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; font-size: 8.5pt; color: var(--muted); border-bottom: 1px solid var(--border);
       padding: 4px; }
  td { padding: 5px 4px; border-bottom: 1px solid var(--border); vertical-align: top;
       font-size: 9.5pt; }
  td.n { text-align: right; width: 54px; font-weight: 700; }
  li { margin-bottom: 5px; line-height: 1.4; font-size: 9.5pt; }
  .foot { margin-top: 14px; font-size: 8pt; color: var(--muted); }
  .chip { color: #fff; border-radius: 9px; padding: 1.5px 7px; font-size: 7.6pt;
          font-weight: 700; display: inline-block; }
  `;

  const body = `
  <h1>${esc(t.key)} &middot; ${esc(t.title)}</h1>
  <div style="font-size:9pt;color:var(--muted);margin-bottom:10px">
    ${esc(t.subtitle)} &middot; completion record, ${esc(D.AS_OF)}</div>

  <div class="pair">
    <div class="k">ASKED</div><div class="v">${esc(ASKED)}</div>
    <div class="k">DELIVERED</div><div class="v" style="margin-bottom:0">${esc(DELIVERED)}</div>
  </div>

  <h2>Takeaway</h2>
  <p class="take">${TAKEAWAY}</p>

  <h2>The membership funnel, measured against production</h2>
  <table>
    <tr><th>Stage</th><th style="text-align:right">Count</th><th>What it means</th></tr>
    ${D.FUNNEL.map((r) => `<tr><td>${esc(r.label)}</td><td class="n">${r.count}</td>
      <td style="font-size:8.8pt;color:var(--muted)">${esc(r.note)}</td></tr>`).join('')}
  </table>
  <p style="font-size:8.8pt;color:var(--muted);margin-top:5px">Reproduced with a read-only SQL
    script written independently of the page code. Reading the page to verify the page proves
    only that it agrees with itself.</p>

  <h2>The two misreadings, and what each one costs</h2>
  <ul>${D.TRAPS.map((x) => `<li><strong>${esc(x.trap)}.</strong> ${esc(x.why)}
    <em>${esc(x.cost)}</em></li>`).join('')}</ul>

  <h2>Evidence</h2>
  <table>
    <tr><td>New tests</td><td class="n">${esc(e.tests)}</td><td>Written for this ticket.</td></tr>
    <tr><td>Mutation check</td><td class="n">${esc(e.mutations)}</td>
      <td>Killed, with an unmutated control run first so an already-red suite could not read as kills.</td></tr>
    <tr><td>CI gates</td><td class="n">${esc(e.gates)}</td><td>Passing at the merged commit.</td></tr>
    <tr><td>Suites</td><td class="n"></td><td>${esc(e.suites)}.</td></tr>
  </table>
  <p style="font-size:9pt;margin-top:6px"><strong>Verified in production</strong> by reading the
    running containers, not the merge: the compiled modules and the registered route inside
    accelerator-backend, and the shipped copy inside the served nginx chunk. Each check was paired
    with a control from an already-live change, because an absent marker and a grep looking in the
    wrong place are indistinguishable without one.</p>

  <h2>What this does not establish</h2>
  <ul>${D.NOT_ESTABLISHED.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>

  <h2>Waiting on a human</h2>
  <ul>${D.DECISIONS.map((x) => `<li><strong>${esc(x.title)}</strong> &mdash; ${esc(x.body)}
    <em>If it waits: ${esc(x.cost)}</em></li>`).join('')}</ul>

  <div class="foot">${foot(t)}<br>Pull request: ${esc(t.pr)}</div>`;

  return shell({ title: `${t.key} - completion record`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
