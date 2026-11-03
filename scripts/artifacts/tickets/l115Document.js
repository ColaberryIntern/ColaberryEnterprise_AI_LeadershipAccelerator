/**
 * The L11.5 register, and the Markdown that goes into the repo.
 *
 * TWO RENDERINGS, ONE SELF-CHECK, ONE DATA MODULE. The PDF is for the Basecamp folder the
 * ticket names; the Markdown is for acceptance criterion 3, "readable by a future Claude Code
 * session with no chat history", which a PDF in a Basecamp folder is not. Generating both from
 * `l115Data` is the only arrangement in which they cannot drift apart.
 *
 * THE SELF-CHECK IS WIRED TO THE ACCEPTANCE CRITERIA, not to arithmetic. Two of its assertions
 * are the criteria themselves made mechanical:
 *
 *   - criterion 1 ("every capability claim states whether it is proven by test or in
 *     production") is enforced by refusing any practice whose `proof` is not one of those two
 *     words. A claim with no provenance cannot render.
 *   - criterion 2 ("things that are NOT built are named explicitly rather than omitted") is
 *     enforced by refusing to render at all if the not-covered list is empty. A testing
 *     document that has nothing to admit is the exact failure this criterion anticipates.
 */
const D = require('./l115Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const PROOF = ['test', 'production'];

function selfCheck() {
  const suites = D.MEASURED.reduce((a, m) => a + m.suites, 0);
  const tests = D.MEASURED.reduce((a, m) => a + m.tests, 0);
  if (suites !== D.TOTALS.suites || tests !== D.TOTALS.tests) {
    throw new Error(
      `measured rows sum to ${suites} suites / ${tests} tests, totals claim `
      + `${D.TOTALS.suites} / ${D.TOTALS.tests}`,
    );
  }

  D.MEASURED.forEach((m) => {
    if (!m.cmd || !m.cmd.trim()) {
      throw new Error(`"${m.what}" states a count with no command to re-derive it`);
    }
  });

  const verdicts = ['over', 'under', 'absent', 'invented'];
  D.TIERS.forEach((t) => {
    if (!verdicts.includes(t.verdict)) {
      throw new Error(`tier "${t.tier}" has unknown verdict "${t.verdict}"`);
    }
    if (!t.gap || !t.gap.trim()) throw new Error(`tier "${t.tier}" does not state its gap`);
  });

  // CRITERION 1, made mechanical.
  const unprovenanced = D.PRACTICES.filter((p) => !PROOF.includes(p.proof));
  if (unprovenanced.length) {
    throw new Error(
      'claims that do not say whether they are proven by test or in production: '
      + unprovenanced.map((p) => `"${p.p}"`).join(', '),
    );
  }

  // CRITERION 2, made mechanical. An empty list here is the failure, not a clean bill of health.
  if (!D.NOT_COVERED.length) {
    throw new Error('the not-covered list is empty, which criterion 2 exists to forbid');
  }

  D.HISTORY.forEach((h) => {
    if (!h.cost || !h.cost.trim()) throw new Error(`${h.id} records no cost`);
    if (!h.caught || !h.caught.trim()) throw new Error(`${h.id} does not say how it was caught`);
  });
}

const CSS = `${baseCss()}
  body { font-size: 9.2pt; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 8pt; }
  th { background: var(--bg-alt); text-align: left; padding: 4px 6px; font-size: 7.2pt;
       text-transform: uppercase; letter-spacing: .05em; color: var(--muted);
       border-bottom: 1.5px solid var(--border); }
  td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid var(--border); }
  code { font-size: 7.6pt; }
  .pill { display: inline-block; padding: 1px 5px; border-radius: 7px; font-size: 6.8pt;
          font-weight: 700; }
  .lead { background: var(--cherry-bg); border-left: 3px solid var(--cherry);
          padding: 8px 12px; margin: 0 0 14px; }
  .gap { border-left: 3px solid #b26a00; padding: 2px 0 2px 9px; margin: 0 0 9px; }
  .gap.bad { border-left-color: #b3261e; }
  .gap b { display: block; }
  .foot { margin-top: 16px; padding-top: 6px; border-top: 1px solid var(--border);
          color: var(--muted); font-size: 7.2pt; }
`;

const proofPill = (p) => (p === 'test'
  ? '<span class="pill" style="background:#eaf5ea;color:#2f7d32">proven by test</span>'
  : '<span class="pill" style="background:#eef2ff;color:#1d4ed8">seen in production</span>');

function build() {
  selfCheck();
  const T = D.TOTALS;

  const body = `
<h1>Colaberry Live — testing strategy and evidence matrix</h1>
<p style="color:var(--muted);margin:0 0 12px">
  Ticket ${esc(D.META.ticket)} (todo ${esc(D.META.todo)}) &middot; due ${esc(D.META.due)}
  &middot; written ${esc(D.META.date)} &middot; ${esc(D.META.commit)} &middot; session
  ${esc(D.META.session)}
</p>

<div class="lead">
  <b>${T.tests.toLocaleString()} tests across ${T.suites} suites, and four complete units have
  still shipped with nothing calling them.</b> ${T.pctUnit.toFixed(1)}% of the suite is unit
  tests, one file is integration, and nothing end-to-end touches a broadcast. A unit test mocks
  its caller, so the absence of a caller is the one defect it cannot see — which is precisely
  the defect this subsystem has shipped four times.
</div>

<h2>1. How these numbers were produced</h2>
<p>
  Measured on ${esc(D.META.date)}, not estimated. Each row carries the command, so a future
  session can re-derive rather than trust a figure in a document.
</p>
<table>
  <thead><tr><th style="width:30%">Scope</th><th class="num">Suites</th><th class="num">Tests</th>
    <th style="width:46%">Command</th></tr></thead>
  <tbody>${D.MEASURED.map((m) => `<tr>
    <td><b>${esc(m.what)}</b><br><span style="color:var(--muted)">${esc(m.note)}</span></td>
    <td>${m.suites}</td><td>${m.tests}</td><td><code>${esc(m.cmd)}</code></td></tr>`).join('')}
    <tr><td><b>Total</b></td><td><b>${T.suites}</b></td><td><b>${T.tests}</b></td><td></td></tr>
  </tbody>
</table>

<h2>2. The tiers, against CLAUDE.md's target distribution</h2>
${D.TIERS.map((t) => `<div class="gap ${t.verdict === 'absent' ? 'bad' : ''}">
  <b>${esc(t.tier)} — target ${esc(t.target)}, actual ${esc(t.have)} (${t.n} tests)</b>
  ${esc(t.what)}<br><i>${esc(t.gap)}</i></div>`).join('')}

<h2>3. The four defects a fully green suite did not catch</h2>
<p>
  This table is the evidence for everything above. Without it the strategy is an opinion about
  pyramids; with it, the missing tiers have a measured cost.
</p>
<table>
  <thead><tr><th style="width:8%">Ticket</th><th style="width:26%">What shipped</th>
    <th style="width:34%">What it cost</th><th style="width:32%">How it was found</th></tr></thead>
  <tbody>${D.HISTORY.map((h) => `<tr>
    <td><b>${esc(h.id)}</b></td>
    <td>${esc(h.what)}<br><span style="color:var(--muted)">${esc(h.tests)}</span></td>
    <td>${esc(h.cost)}</td><td>${esc(h.caught)}</td></tr>`).join('')}
  </tbody>
</table>

<h2>4. Practices worth keeping</h2>
<table>
  <thead><tr><th style="width:26%">Practice</th><th style="width:14%">Provenance</th>
    <th style="width:60%">Why, and where</th></tr></thead>
  <tbody>${D.PRACTICES.map((p) => `<tr>
    <td><b>${esc(p.p)}</b></td><td>${proofPill(p.proof)}</td>
    <td>${esc(p.why)}<br><span style="color:var(--muted)">${esc(p.where)}</span></td>
  </tr>`).join('')}</tbody>
</table>

<h2>5. The merge gates</h2>
<table>
  <thead><tr><th style="width:32%">Gate</th><th style="width:14%">Kind</th>
    <th style="width:54%">Note</th></tr></thead>
  <tbody>${D.GATES.map((g) => `<tr><td>${esc(g.g)}</td><td>${esc(g.k)}</td>
    <td>${esc(g.n || '')}</td></tr>`).join('')}</tbody>
</table>

<h2>6. What is NOT covered</h2>
<p>
  Named explicitly, per acceptance criterion 2. The document refuses to render if this section
  is empty.
</p>
${D.NOT_COVERED.map((n) => `<div class="gap bad"><b>${esc(n.h)}</b>${esc(n.d)}</div>`).join('')}

<h2>7. What this does not do</h2>
<p>
  It sets no review state and closes nothing. It also does not add a test: it is the strategy and
  the evidence matrix the ticket asks for, and the gaps in section 6 are the backlog it implies
  rather than work done here. The highest-value items in that backlog, in order, are the paywall
  exercise already ticketed as L10.7, one end-to-end flow that opens a player, and widening the
  integration tier beyond a single DB-gated file.
</p>

<div class="foot">
  ${esc(D.META.title)} &middot; ticket ${esc(D.META.ticket)} &middot; ${esc(D.META.date)}
  &middot; counts are a snapshot; re-run the commands in section 1 before citing them &middot;
  the same data module renders docs/COLABERRY_LIVE_TESTING_STRATEGY.md into the repo for
  criterion 3
</div>`;

  return htmlDoc({ title: 'L11.5 testing strategy and evidence matrix', css: CSS, body });
}

/**
 * The in-repo Markdown. Criterion 3's artifact.
 *
 * Deliberately plainer than the PDF: a future session reads this to find out what is tested and
 * what is not, so it leads with the gaps and the commands rather than with the argument.
 */
function markdown() {
  selfCheck();
  const T = D.TOTALS;
  const L = [];

  /**
   * Escape a value going into a Markdown table cell.
   *
   * The jest commands contain alternation — `src/(controllers|routes|db|schemas)/...` — and an
   * unescaped pipe inside a cell silently splits it into extra columns, which renders the whole
   * table as garbage. Caught by reading the generated file rather than by any assertion, which
   * is the argument for reading generated output at least once.
   */
  const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');

  L.push('# Colaberry Live — testing strategy and evidence matrix');
  L.push('');
  L.push(`> Generated from \`scripts/artifacts/tickets/l115Data.js\`. **Do not hand-edit** — `
    + `change the data module and re-run \`node scripts/artifacts/buildL115Artifacts.js\`.`);
  L.push(`> Ticket ${D.META.ticket} · measured ${D.META.date} · ${D.META.commit}`);
  L.push('');
  L.push(`${T.tests.toLocaleString()} tests across ${T.suites} suites cover Colaberry Live. `
    + `${T.pctUnit.toFixed(1)}% of them are unit tests, **one** file is integration, and **no `
    + `end-to-end test touches a broadcast**. This subsystem has shipped `
    + `${D.HISTORY.length} complete, well-tested units that nothing called — which is what a `
    + `unit-only pyramid buys: a unit test mocks its caller, so a missing caller is invisible `
    + `to it.`);
  L.push('');
  L.push('## Read this first if you are about to add a feature here');
  L.push('');
  L.push('Write the **wiring test** as well as the unit tests. It reads the source and asserts');
  L.push('the caller exists, and it is the only layer at which "nothing calls this" is visible.');
  L.push('See `backend/src/services/broadcast/__tests__/broadcastHealthLoop.wiring.test.ts` —');
  L.push('note that it tests its own comment stripper, because the first version passed while');
  L.push('the call was commented out.');
  L.push('');
  L.push('## The counts, and how to re-derive them');
  L.push('');
  L.push('| Scope | Suites | Tests | Command |');
  L.push('|---|---|---|---|');
  D.MEASURED.forEach((m) => {
    L.push(`| ${cell(m.what)} (${cell(m.note)}) | ${m.suites} | ${m.tests} `
      + `| \`${cell(m.cmd)}\` |`);
  });
  L.push(`| **Total** | **${T.suites}** | **${T.tests}** | |`);
  L.push('');
  L.push('## The tiers');
  L.push('');
  L.push('| Tier | Target | Actual | Tests | Verdict |');
  L.push('|---|---|---|---|---|');
  D.TIERS.forEach((t) => {
    L.push(`| ${cell(t.tier)} | ${cell(t.target)} | ${cell(t.have)} | ${t.n} `
      + `| ${cell(t.verdict)} |`);
  });
  L.push('');
  D.TIERS.forEach((t) => {
    L.push(`### ${t.tier}`);
    L.push('');
    L.push(t.what);
    L.push('');
    L.push(`**Gap.** ${t.gap}`);
    L.push('');
  });
  L.push('## The four defects a green suite did not catch');
  L.push('');
  D.HISTORY.forEach((h) => {
    L.push(`### ${h.id} — ${h.what}`);
    L.push('');
    L.push(`- **Suite at the time:** ${h.tests}`);
    L.push(`- **Cost:** ${h.cost}`);
    L.push(`- **Found by:** ${h.caught}`);
    L.push('');
  });
  L.push('## Practices worth keeping');
  L.push('');
  D.PRACTICES.forEach((p) => {
    L.push(`- **${p.p}** — *${p.proof === 'test' ? 'proven by test' : 'seen in production'}* `
      + `(${p.where}). ${p.why}`);
  });
  L.push('');
  L.push('## Merge gates');
  L.push('');
  D.GATES.forEach((g) => {
    L.push(`- \`${g.g}\` (${g.k})${g.n ? ` — ${g.n}` : ''}`);
  });
  L.push('');
  L.push('## What is NOT covered');
  L.push('');
  L.push('Named explicitly rather than omitted. The generator refuses to run if this is empty.');
  L.push('');
  D.NOT_COVERED.forEach((n) => {
    L.push(`### ${n.h}`);
    L.push('');
    L.push(n.d);
    L.push('');
  });
  L.push('## The backlog this implies');
  L.push('');
  L.push('In order: the paywall exercise already ticketed as **L10.7**, one end-to-end flow that');
  L.push('opens a player, and widening the integration tier beyond a single DB-gated file.');
  L.push('');

  return L.join('\n');
}

module.exports = { build, markdown, selfCheck };
