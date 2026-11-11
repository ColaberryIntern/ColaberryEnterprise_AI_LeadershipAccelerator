/**
 * l05Visual — the one page Ali actually reads before the record PDF.
 *
 * THE HEADLINE IS THE DIVERGENCE, not the progress. A migration report's natural one-pager is a
 * progress bar, and a progress bar here would be actively misleading: 22 of 87 todos complete
 * says "a quarter done" about a board that is no longer describing the same system as the plan it
 * came from. The number worth one page is that the two plans overlap on less than half.
 *
 * WHY THE PHASE CHART IS SEVEN SMALL STACKED BARS and not one big one. Each phase has exactly
 * eight parent tasks, so the bars are directly comparable without a scale, and the eye reads
 * "Phase 5 is entirely red" instantly. A single aggregate bar would hide which phase the gap is
 * in, which is the only actionable thing on the page.
 *
 * EVERY NUMBER AND EVERY COLOR IS DERIVED. `sev()` maps a count to a color, so a phase cannot be
 * drawn green while reporting missing tickets; `selfCheck` asserts the mapping rather than the
 * output, so changing the data changes the picture.
 */
const D = require('./l05Data');
const { TOKENS, esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

/**
 * Clip to a word boundary. Cutting mid-word ("and protected a", "host, series, audi") looks like
 * a rendering bug rather than a deliberate abbreviation, and every automated check passes it —
 * it was visible only by looking at the page.
 */
function clip(s, n) {
  const str = String(s);
  if (str.length <= n) return str;
  const cut = str.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:]$/, '')}…`;
}

/** Count of missing tickets to color. Green only at zero: "almost none" is not none. */
function sev(none) {
  if (none === 0) return TOKENS.SEV.ok;
  if (none <= 2) return TOKENS.SEV.watch;
  return TOKENS.SEV.bad;
}

/** Seven rows of eight tasks, drawn to a common scale so the phases compare by eye. */
function phaseChart() {
  const W = 760;
  const labelW = 250;
  const plotW = W - labelW - 40;
  const rowH = 22;
  const gap = 6;
  const per = D.TOTALS.tasks / D.PHASES.length; // 8, derived rather than assumed
  const rows = D.PHASES.map((ph, i) => {
    const b = D.TOTALS.byPhase[ph.id];
    const y = i * (rowH + gap);
    const seg = (n, x, color) => (n === 0 ? '' : `<rect x="${labelW + x}" y="${y}" `
      + `width="${(n / per) * plotW}" height="${rowH}" fill="${color}"/>`
      + (n >= 1 ? `<text x="${labelW + x + ((n / per) * plotW) / 2}" y="${y + rowH * 0.7}" `
        + `font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${n}</text>` : ''));
    const wCov = (b.covered / per) * plotW;
    const wPar = (b.partial / per) * plotW;
    return `
      <text x="0" y="${y + rowH * 0.7}" font-size="10" fill="${TOKENS.INK}">
        <tspan font-weight="700">${ph.id}.</tspan> ${esc(clip(ph.title, 46))}</text>
      ${seg(b.covered, 0, TOKENS.SEV.ok)}
      ${seg(b.partial, wCov, TOKENS.SEV.watch)}
      ${seg(b.none, wCov + wPar, TOKENS.SEV.bad)}`;
  }).join('');
  const h = D.PHASES.length * (rowH + gap);
  return `<svg viewBox="0 0 ${W} ${h}" width="100%" role="img">${rows}</svg>`;
}

function build() {
  const T = D.TOTALS;
  // Grouped by phase so the page says WHERE the hole is, not just how big it is.
  const gaps = D.PHASES.map((ph) => {
    const ts = D.TASKS.filter((t) => t.id.startsWith(`P${ph.id}-`) && t.coverage === 'NONE');
    if (!ts.length) return '';
    // The work clause is clipped to keep this to one page. The full clause, and the gap note for
    // every task, are in the Markdown document; this page's job is to show WHERE the holes are.
    return `<div class="gap">
      <div class="gh" style="color:${sev(ts.length)}">Phase ${ph.id} &middot; ${ts.length}</div>
      ${ts.map((t) => `<div class="gi"><code>${t.id}</code> ${esc(clip(t.work, 52))}</div>`).join('')}
    </div>`;
  }).join('');

  const css = `${baseCss()}
    /* No @page size rule here. renderArtifactPdf already asks Playwright for Letter landscape,
       and declaring a different paper size in CSS makes Chrome lay out to one size while the PDF
       is emitted at another — which showed up as a phantom second page, not as an error. */
    body { font-size: 9pt; }
    h1 { font-size: 16pt; }
    h2 { font-size: 11pt; margin: 12px 0 6px; }
    .lede { font-size: 9.5pt; margin: 0 0 8px; }
    .rule { margin: 7px 0 10px; }
    .takeaway, .note { padding: 8px 11px; margin: 8px 0; }
    .cards { margin: 8px 0 10px; }
    .card { padding: 7px 9px; }
    .card .n { font-size: 19pt; }
    .two { display: flex; gap: 14px; align-items: flex-start; }
    .two > div { flex: 1; }
    .key { display: flex; gap: 12px; font-size: 8pt; margin: 5px 0 0; }
    .key span.s { width: 9px; height: 9px; border-radius: 2px; display: inline-block;
                  margin-right: 4px; }
    .gaps { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
    .gap { flex: 1 1 46%; border: 1px solid var(--border); border-radius: 5px; padding: 6px 8px; }
    .gh { font-size: 7.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
          margin-bottom: 3px; }
    .gi { font-size: 7.8pt; line-height: 1.28; margin-bottom: 2px; }
    .gi code { font-size: 7.6pt; padding: 0 2px; }
  `;

  const body = `
  <h1>DOC 10 &mdash; the board and the plan describe two different systems</h1>
  <div class="meta">${D.META.ticket} &middot; built ${D.META.built} &middot; census measured
    ${D.META.censusMeasured} &middot; session ${D.META.session}</div>
  <div class="rule"></div>

  <p class="lede">The seven-phase plan holds ${T.tasks} parent tasks. The Basecamp board holds
    ${T.todos} todos. <strong>${T.byCoverage.NONE} of the planned tasks have no ticket at all,
    and ${T.boardOnly} of the tickets have no place in the plan.</strong> Only ${T.citedTodos}
    of the ${T.todos} todos map to a planned task at all.</p>

  <div class="cards">
    <div class="card"><div class="n">${T.byCoverage.NONE}</div>
      <div class="k">planned tasks, no ticket</div></div>
    <div class="card"><div class="n">${T.boardOnly}</div>
      <div class="k">tickets, no planned task</div></div>
    <div class="card"><div class="n">${T.completed}/${T.todos}</div>
      <div class="k">todos complete</div></div>
    <div class="card"><div class="n">${T.byPhase[5].none}/8</div>
      <div class="k">Phase 5 tasks with no ticket</div></div>
  </div>

  <div class="note warn"><strong>The code is deployed; the feature is dark.</strong>
    <code>BROADCAST_ENABLED</code> is declared in <code>backend/.env.example</code> and nowhere
    else &mdash; no compose file, no deploy script, no CI. Every broadcast route answers
    <strong>404</strong> in production. Deployed and enabled are two different states, and no
    ticket covers closing the gap.</div>

  <div class="two">
    <div>
      <h2>Where the plan is uncovered</h2>
      ${phaseChart()}
      <div class="key">
        <span><span class="s" style="background:${TOKENS.SEV.ok}"></span>covered</span>
        <span><span class="s" style="background:${TOKENS.SEV.watch}"></span>partial</span>
        <span><span class="s" style="background:${TOKENS.SEV.bad}"></span>no ticket</span>
        <span style="color:var(--muted)">8 parent tasks per phase</span>
      </div>
      <h2>F. Next task</h2>
      <p style="margin:0 0 6px">The stated rule &mdash; earliest due date among open todos &mdash;
        returns <strong>${esc(clip(D.NEXT.todo.title, 64))}</strong> (due
        ${D.NEXT.todo.due_on}). That work already happened; production holds occurrences for 15
        and 20 October. So the derived answer measures how stale the board is. The next
        <em>build</em> action is <code>P7-06</code>, gated activation.</p>
      <div class="note"><strong>This report is late.</strong> &sect;17 asks for it before any
        implementation. It was not created, and ${T.completed} todos were completed before it
        existed &mdash; a retrospective ledger, not the gate it was meant to be.</div>
    </div>
    <div>
      <h2>The ${T.byCoverage.NONE} planned tasks with no ticket</h2>
      <div class="gaps">${gaps}</div>
    </div>
  </div>
  `;
  return htmlDoc({ title: 'DOC 10 — Current Build Migration Report', css, body });
}

function selfCheck() {
  const fail = (m) => { throw new Error(`l05Visual: ${m}`); };
  const html = build();
  const T = D.TOTALS;

  // 1. The headline carries both directions of the divergence. A page that reported only the
  //    missing tickets would be the one-sided reconciliation this document exists to avoid.
  if (!html.includes(`${T.byCoverage.NONE} of the planned tasks have no ticket at all`)) {
    fail('the lede does not state how many planned tasks have no ticket');
  }
  if (!html.includes(`${T.boardOnly} of the tickets have no place in the plan`)) {
    fail('the lede does not state how many tickets have no planned task');
  }

  // 2. Every phase is drawn, and its three segments sum to its task count. A phase silently
  //    dropped from the chart would leave the page looking complete.
  D.PHASES.forEach((ph) => {
    if (!html.includes(`>${ph.id}.</tspan>`)) fail(`phase ${ph.id} is missing from the chart`);
    const b = T.byPhase[ph.id];
    if (b.covered + b.partial + b.none !== T.tasks / D.PHASES.length) {
      fail(`phase ${ph.id} segments sum to ${b.covered + b.partial + b.none}, not `
        + `${T.tasks / D.PHASES.length}`);
    }
  });

  // 3. Color is derived from the count, never chosen. Asserting the mapping rather than the
  //    output is what stops a phase being drawn green while reporting missing tickets.
  if (sev(0) !== TOKENS.SEV.ok) fail('sev(0) must be the ok color');
  if (sev(1) === TOKENS.SEV.ok || sev(8) !== TOKENS.SEV.bad) {
    fail('sev must never return the ok color for a nonzero count, and must be bad at the top');
  }

  // 4. Every no-ticket task is on the page. A gap list that silently truncates is worse than no
  //    gap list, because the page still looks finished.
  const none = D.TASKS.filter((t) => t.coverage === 'NONE');
  if (none.length !== T.byCoverage.NONE) fail('NONE task count disagrees with the totals');
  none.forEach((t) => {
    if (!html.includes(`<code>${t.id}</code>`)) fail(`task ${t.id} has no ticket but is not drawn`);
  });

  // 5. The deployed-versus-dark callout survives, with the variable name and the status code.
  //    This is the single most useful sentence on the page.
  if (!/the feature is dark/i.test(html)) fail('the dark-feature callout is missing');
  if (!html.includes('BROADCAST_ENABLED')) fail('the callout must name the release switch');
  if (!/>404</.test(html)) fail('the callout must say the routes answer 404');
  if (!/Deployed and\s+enabled are two different states/.test(html)) {
    fail('the page must refuse to collapse deployed and enabled');
  }

  // 6. The lateness is on the one-pager too. Most readers will see only this page, so a
  //    disclosure that lives solely in the long document has not been made.
  if (!/retrospective ledger/i.test(html)) {
    fail('the one-pager must say the report is a retrospective ledger');
  }

  // 7. No banned phrasing, including anything shaped like a credential value.
  D.checkText(html);
  return true;
}

module.exports = { build, selfCheck, sev, phaseChart };
