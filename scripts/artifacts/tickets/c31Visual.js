/**
 * C3.1's one-page visual. Landscape Letter, and it must fit ONE page or the renderer refuses.
 *
 * The job of this page is to answer, before anyone opens the document: why has the Anthropic
 * route not moved since June, and what is the next action. Everything is read from c31Data.
 */
const D = require('./c31Data');
const { esc, baseCss, barChart, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const CSS = `${baseCss()}
  body { font-size: 8.5pt; }
  h1 { font-size: 16.5pt; }
  h2 { font-size: 9pt; margin: 4px 0 3px; border: 0; padding: 0;
       text-transform: uppercase; letter-spacing: .07em; color: var(--ink); }
  .wrap { display: flex; gap: 15px; }
  .col { flex: 1; min-width: 0; }
  .takeaway { padding: 6px 11px; margin-bottom: 5px; }
  .takeaway .headline { font-size: 11.5pt; }
  .takeaway .label { font-size: 7pt; }
  table { font-size: 7.4pt; margin: 3px 0 7px; }
  th { padding: 3px 5px; font-size: 6.6pt; }
  td { padding: 3px 5px; }
  .tl { border-left: 2px solid var(--border); margin: 2px 0 0 5px; padding-left: 11px; }
  .ev { position: relative; padding-bottom: 4px; font-size: 7.3pt; }
  .ev::before { content: ''; position: absolute; left: -16px; top: 3px; width: 8px; height: 8px;
                border-radius: 50%; background: var(--muted); }
  .ev.bad::before { background: #b3261e; }
  .ev.good::before { background: #2f7d32; }
  .ev .d { font-weight: 700; }
  .ev .t { color: var(--muted); }
  .gap { background: #fdf3f2; border: 1px solid #f3c9c6; border-radius: 5px;
         padding: 7px 10px; margin: 5px 0 8px; font-size: 7.8pt; }
  .gap b { color: #b3261e; }
  .step { font-size: 7.6pt; margin-bottom: 5px; padding-left: 19px; position: relative; }
  .step .id { position: absolute; left: 0; top: 1px; width: 14px; height: 14px; border-radius: 3px;
              background: var(--cherry); color: #fff; font-weight: 700; font-size: 7.2pt;
              text-align: center; line-height: 14px; }
  .step.hold .id { background: var(--muted); }
  .foot { margin-top: 7px; font-size: 6.8pt; color: var(--muted);
          border-top: 1px solid var(--border); padding-top: 5px; }
  .mermaid { text-align: center; margin: 2px 0 0; }
  .mermaid svg { max-height: 92px; width: 100%; }
  .pill { display: inline-block; padding: 0 5px; border-radius: 8px; font-size: 6.4pt;
          font-weight: 700; color: #fff; }
`;

/** The ladder, with the rung we are stuck below marked. */
function ladder() {
  return `<table>
  <tr><th>Tier</th><th>Certified people</th><th>Production customers</th><th>Public stories</th></tr>
  ${D.TIERS.filter((t) => t.name !== 'Global Premier').map((t) => `<tr${t.us ? ' style="background:#FFF0F1"' : ''}>
    <td><strong>${esc(t.name)}</strong>${t.us
      ? ' <span class="pill" style="background:#b3261e">WE ARE HERE AT BEST</span>' : ''}</td>
    <td>${t.certified ? esc(t.certified.replace(' active certified individuals', '')) : '&mdash;'}</td>
    <td>${t.customers ? esc(t.customers.replace(/ (joint customers|deployed joint customers).*/, '')) : '&mdash;'}</td>
    <td>${t.stories ? esc(t.stories.replace(/ public (customer )?stor(y|ies)/, '')) : '&mdash;'}</td>
  </tr>`).join('')}
  </table>`;
}

function timeline() {
  const ev = [
    { d: '18 Mar 2026', t: 'Anthropic tells Ram: ten people finish the Academy path and Colaberry '
      + 'is formally admitted.', c: '' },
    { d: '24 Jun 2026', t: 'Eleven finish. Completion form submitted. Automated receipt.', c: 'good' },
    { d: '13-21 Aug 2026', t: `Follow-up sequence sends ${D.OURS.sequence.sent} of `
      + `${D.OURS.sequence.total} notes.`, c: '' },
    { d: '21 Aug 2026', t: '"Fin", an AI agent, replies that the courses were never required, '
      + 'the opposite of March. Ali answers the same day quoting March verbatim and asking how to '
      + 'register. Sequence correctly stopped.', c: 'bad' },
    { d: `${D.OURS.silenceDays} days`, t: 'No answer. Sequence halted, and --skip-anthropic in '
      + 'both cron lines means nothing would send anyway.', c: 'bad' },
  ];
  return `<div class="tl">${ev.map((e) => `<div class="ev ${e.c}">
    <span class="d">${esc(e.d)}</span> <span class="t">${esc(e.t)}</span></div>`).join('')}</div>`;
}


/** Exam prices, with the one that buys nothing toward a tier marked in red. */
function examChart() {
  return barChart({
    rows: D.CERTS.map((c) => ({
      label: c.name.replace('Claude Certified ', '') + (c.counts ? '' : '  (counts for nothing)'),
      value: c.price,
      display: '$' + c.price,
      color: c.counts ? TOKENS.LEAF : TOKENS.CHERRY,
    })),
    width: 520, barH: 11, gap: 4, labelW: 250,
  });
}

/**
 * The two routes. This is a question of ORDER and of which door actually opens, which a table
 * states and a diagram shows. The March route is drawn as the dead end it turned out to be.
 */
function routes() {
  const g = [
    'flowchart LR',
    '  A["Colaberry today<br/>11 Academy completions"]',
    '  B["The March email route<br/>10 finish the courses, submit the form"]',
    '  C["Formally admitted"]',
    '  D["The published route<br/>3 gates: 10+ staff, supported region, services"]',
    '  E["Registered"]',
    '  F["10 PAID certifications<br/>about $' + D.SELECT_BENCH_COST.toLocaleString('en-US') + ' at full price"]',
    '  G["Select<br/>partnership begins"]',
    '  A --> B',
    '  B -.->|"done 24 Jun, no admission in ' + D.OURS.sinceSubmission + ' days"| C',
    '  A ==>|"never attempted"| D',
    '  D ==> E',
    '  E ==> F',
    '  F ==> G',
    '  style B fill:#FFF0F1,stroke:#b3261e,color:#2d3748',
    '  style C fill:#ffffff,stroke:#b3261e,stroke-dasharray:4 3,color:#b3261e',
    '  style D fill:#f3f9f3,stroke:#2f7d32,color:#2d3748',
    '  style E fill:#f3f9f3,stroke:#2f7d32,color:#2d3748',
    '  style F fill:#f3f9f3,stroke:#2f7d32,color:#2d3748',
    '  style G fill:#f3f9f3,stroke:#2f7d32,color:#2d3748',
  ].join(String.fromCharCode(10));
  return '<div class="mermaid">' + g + '</div>';
}

function build() {
  const counting = D.CERTS.filter((c) => c.counts).length;
  const body = `
  <h1>The Anthropic route, re-verified</h1>
  <div class="meta">C3.1 &middot; every fact re-read from primary sources on ${esc(D.ACCESS)}
    &middot; baseline ${esc(D.BASELINE)} &middot; one page</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  <div class="wrap">
    <div class="col">
      <h2>How we got here</h2>
      ${timeline()}

      <h2>The gate we were measured against</h2>
      ${ladder()}
      <div class="gap"><b>The chicken and egg.</b> These exams are sold only to people already
        inside the network, so the bench cannot be built before admission. ${counting} of 4 count,
        putting Select at about <b>$${D.SELECT_BENCH_COST.toLocaleString('en-US')}</b> full
        price.</div>
      <h2>What the four exams cost, and which ones count</h2>
      ${examChart()}
    </div>

    <div class="col">
      <h2>What changed since ${esc(D.BASELINE)}</h2>
      <table>
        <tr><th>Fact</th><th>Status</th></tr>
        ${D.CHANGES.map((c) => `<tr>
          <td style="width:40%"><strong>${esc(c.what)}</strong></td>
          <td>${c.sev === 'same'
            ? '<span class="pill" style="background:#2f7d32">UNCHANGED</span> '
            : '<span class="pill" style="background:#b26a00">CORRECT IT</span> '}
          ${esc(c.short)}</td></tr>`).join('')}
      </table>

      <h2>What to do next</h2>
      ${D.PLAN.map((p) => `<div class="step${p.owner === 'Claude' && p.n === 4 ? ' hold' : ''}">
        <span class="id">${p.n}</span><strong>${esc(p.title)}</strong>
        <span style="color:var(--muted)"> &middot; ${esc(p.owner)}, ${esc(p.when)}</span>
      </div>`).join('')}

      <div class="gap" style="background:#f7fafc;border-color:#e2e8f0">
        <b style="color:var(--ink)">Your decision.</b> ${esc(D.FIT.decision)}</div>

    </div>
  </div>

  <h2 style="margin-top:8px">The route that was never attempted</h2>
  ${routes()}

  <div class="foot">
    Every claim re-read on ${esc(D.ACCESS)} from Anthropic-owned pages unless noted; the
    document carries a URL, the page's own date and a confidence for each.
    ${D.UNVERIFIED.length} items came back NOT VERIFIED and are listed, not filled in.
    Nothing was sent to Anthropic.
  </div>`;

  return htmlDoc({ title: 'C3.1 Anthropic route, one page', css: CSS, body });
}

module.exports = { build };
