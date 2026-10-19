/**
 * The L7.1 document. Portrait, multi page, same data module as both one-page visuals.
 *
 * Opens with ASKED AND DELIVERED above the takeaway, because a takeaway block lists findings and
 * does not say whether the thing that was asked for got done.
 */
const D = require('./l71Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const CSS = `${baseCss()}
  .takeaway { background: var(--cherry-bg); border-left: 3px solid var(--cherry);
              padding: 9px 13px; margin: 0 0 13px; }
  .note { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 5px;
          padding: 8px 11px; margin: 9px 0; }
  .gap { background: #fdf3f2; border: 1px solid #f3c9c6; border-radius: 5px;
         padding: 9px 12px; margin: 9px 0; }
  .no  { color: #b3261e; font-weight: 700; }
  .yes { color: #2f7d32; font-weight: 700; }
  .foot { margin-top: 15px; font-size: 8pt; color: var(--muted);
          border-top: 1px solid var(--border); padding-top: 7px; }
`;

function build() {
  const v = D.VERIFICATION;

  const cases = D.CASES.map((c) => `<tr>
    <td style="width:4%">${c.n}</td>
    <td style="width:24%"><strong>${esc(c.name)}</strong><br>
      <span style="color:#718096;font-size:8.5pt">${esc(c.fixture)} &middot; ${esc(c.layer)}</span></td>
    <td>${esc(c.proves)}</td>
  </tr>`).join('');

  const controls = D.CONTROLS.map((c) => `<tr>
    <td style="width:30%"><code>${esc(c.id)}</code></td>
    <td style="width:20%" class="${c.observed ? 'yes' : 'no'}">${c.observed ? 'observed failing' : 'deferred'}</td>
    <td>${esc(c.note)}</td>
  </tr>`).join('');

  const clips = D.CLIPS.map((c) => `<tr>
    <td style="width:36%"><code>${esc(c.where)}</code></td>
    <td style="width:16%">${esc(c.cap)}</td>
    <td>${esc(c.effect)}</td>
    <td style="width:14%" class="${c.labeled ? 'yes' : 'no'}">${c.labeled ? 'labeled' : 'SILENT'}</td>
  </tr>`).join('');

  const tests = v.newTests.map((t) => `<tr><td>${esc(t.suite)}</td>
    <td style="text-align:right">${t.n}</td></tr>`).join('');

  const body = `
<h1>${esc(D.META.title)}</h1>
<p style="color:#718096">Ticket ${esc(D.META.ticket)} &middot; finding carried on ${esc(D.META.alsoOn)}
 &middot; ${esc(D.META.date)} &middot; session ${esc(D.META.session)} &middot; ${esc(D.META.status)}</p>

<div class="takeaway">
  <p><strong>Asked and delivered.</strong> The ticket asked for the reference corpus to be run
  across the lifecycle stages. Delivered: all ${D.HEADLINE.casesTotal} required corpus cases,
  ${D.HEADLINE.controlsObserved} of ${D.HEADLINE.controlsTotal} positive controls observed
  failing with the ${D.HEADLINE.controlsTotal - D.HEADLINE.controlsObserved} remaining one
  deferred with its blocker named, and one inherited fixture gap closed.
  ${v.productionModulesTouched} production modules were touched.</p>
</div>

<h2>Takeaway</h2>
<ol>
  <li><strong>The corpus had no rework edge, so two shipped rules were unreachable.</strong>
  <code>is_rework: true</code> appeared ${v.rework.before.edges} times across
  ${v.rework.before.transitions} transitions. <code>cyclingReworkEdges</code> and
  <code>REWORK_BOUND</code> had no reference fixture that could reach them, and the design suite
  had to build a synthetic project to exercise one of its own patterns. Fixture B now carries a
  cycling edge with a declared bound.</li>

  <li><strong>Two of the eight cases belong to the gate, not generation.</strong> Separation of
  duty and the stale-revision check are properties of <code>lifecyclePrerequisites</code>, which
  is pure and database-free by design. Driving them through generation would have tested the
  wrong layer and proved less.</li>

  <li><strong>Case 7 found a real defect</strong> rather than confirming a known limit. It is
  recorded on L9.6 and owned by the overflow packet, which also owns the flag and the production
  measurement.</li>

  <li><strong>Two assumptions I made were wrong, and both tests are better for it.</strong>
  Detail below, because how a test came to be right matters as much as that it passes.</li>
</ol>

<h2>The eight required cases</h2>
<table>
  <tr><th></th><th>Case</th><th>What it proves</th></tr>
  ${cases}
</table>

<h2>The positive controls</h2>
<p>Each must be <em>observed failing</em> against a clean baseline before the check it exercises
is trusted. A suite that cannot fail is not a suite.</p>
<table>
  <tr><th>Check</th><th>State</th><th>Note</th></tr>
  ${controls}
</table>

<h2>The finding: source overflow is silent, and the check cannot see it</h2>
<div class="gap">
  <p><strong><code>coversRequirementBlocks</code> verifies that we ASKED for the blocks, not that
  we SUPPLIED them.</strong> The requirement block ids are listed in the instruction line at the
  top of the prompt, which sits outside every <code>delimited()</code> call and is never clipped.
  The block TEXT sits inside the delimited sections, which clip. So the check returns true for a
  prompt the model cannot answer from.</p>
</div>
<table>
  <tr><th>Where it clips</th><th>Cap</th><th>Effect</th><th>Says so?</th></tr>
  ${clips}
</table>
<p>Only the third is labeled, and it is the one that almost never fires: the first two shrink the
body long before it could reach 800,000 characters. Send 201 requirement blocks and the 201st is
dropped entirely, its id still listed at the top, with nothing anywhere saying a block was
removed.</p>
<p><strong>Pinned, not merely written down.</strong> Tests named RECORDED GAP assert this
behavior including the absence of a label, so <strong>they fail when the fix lands</strong>. The
SAFE-002 delimiters and the source-before-context ordering are asserted alongside, because
<code>delimited()</code> is the injection defense and any fix that chunks or refuses must not
weaken it in the same change.</p>

<h2>Two assumptions that were wrong</h2>
<div class="note">
  <p><strong>Case 6 expected a partial measure.</strong> Composition refuses instead, so there
  were no measures to inspect. Refusing is the better behavior, and the shipped message says why:
  <em>"Omitting a task is not the same as assessing it and finding nothing: the first inflates
  every share, the second lowers coverage."</em> The case asserts that distinction now, at three
  levels: the gate refuses, the arithmetic returns a null share rather than a fabricated zero, and
  the renderer prints "not assessed" with its denominator and no percent sign at all.</p>
  <p><strong>Case 7 expected the truncation label to fire.</strong> It does not, which is how the
  silent drop above was found.</p>
</div>

<h2>Verification</h2>
<table>
  <tr><th>New tests</th><th style="text-align:right">Count</th></tr>
  ${tests}
  <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${D.HEADLINE.newTestsTotal}</strong></td></tr>
</table>
<p>The controls suite went from ${v.controlsSuite.before} tests to ${v.controlsSuite.after}.
Regression across the lifecycle and factory trees:
<strong>${v.regression.passed.toLocaleString('en-US')} passed, ${v.regression.failed} failed</strong>,
${v.regression.skipped} skipped, ${v.regression.suites} of ${v.regression.suitesTotal} suites.</p>
<p><strong>${v.knownLocalFailures.n} suites fail locally and none is mine:</strong>
${esc(v.knownLocalFailures.what)} &mdash; ${esc(v.knownLocalFailures.why)}. Zero failing tests.
Backend typecheck is unaffected by construction: every changed file sits under a test directory,
which the backend tsconfig excludes.</p>

<h2>What this does not claim</h2>
<ul>
  <li><strong>Phase 7 is not finished.</strong> This is packet T1.2 of four in T1 alone; attack,
  replay, legacy and pilot have not started.</li>
  <li><strong>The overflow is not fixed</strong>, only measured and pinned.</li>
  <li><strong>The sixth positive control is not observed</strong>, and the reason is recorded
  rather than the control quietly dropped.</li>
  <li><strong>Residual:</strong> the new case file is ${v.fileLines} lines against the
  ${v.fileCeiling} ceiling, so the next change to it splits first.</li>
</ul>

<div class="foot">
  ${esc(D.META.title)} &middot; ${esc(D.META.date)} &middot; session ${esc(D.META.session)}<br>
  Pull request: ${esc(D.META.pr)}
</div>`;
  return htmlDoc({ title: D.META.title, css: CSS, body });
}

module.exports = { build };
