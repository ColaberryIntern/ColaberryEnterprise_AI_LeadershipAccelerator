/**
 * M23 renderers. Presentation only: every figure comes from m23Data so the number on the picture
 * cannot drift from the number in the document.
 *
 * The visual carries ONE finding, which is the one that decides whether this was worth doing: the
 * repo's three typecheck gates all read a program that excluded the test files, so 2,040 files
 * were enforced by nothing. The document carries the rest.
 */
const { esc, baseCss, barChart, stackBar, SEV } = require('../artifactTheme');
const D = require('./m23Data');

const SHARED = `
  .meta b { color: var(--ink); }
  .two { display: flex; gap: 16px; } .two > * { flex: 1; min-width: 0; }
  .yesno { font-weight: 700; }
  .footer { margin-top: 10px; font-size: 7.4pt; color: var(--muted);
            border-top: 1px solid var(--border); padding-top: 5px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
`;

/** Rows for the ranked histogram. The long tail is one honest bar, not twelve invisible ones. */
function codeRows(limit) {
  const shown = D.CODES.slice(0, limit);
  const tailN = D.SCALE.errors - shown.reduce((a, c) => a + c.n, 0);
  return shown.map((c) => ({ label: `${c.code}  ${c.what}`, value: c.n }))
    .concat([{
      label: `${D.CODES.length - shown.length + D.OTHER_CODES.codes} other codes`,
      value: tailN,
      color: SEV.none,
    }]);
}

function gatesTable() {
  const rows = D.GATES.map((g) => `
    <tr>
      <td><strong>${esc(g.gate)}</strong></td>
      <td><code>${esc(g.reads)}</code></td>
      <td>${esc(g.covers)}</td>
      <td class="yesno" style="color:${g.sawTests ? SEV.ok : SEV.bad}">
        ${g.sawTests ? 'YES' : 'no'}</td>
    </tr>`).join('');
  return `<table><thead><tr>
    <th>Gate</th><th>Reads</th><th>Program it actually covers</th><th>Test files?</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function ratchetTable() {
  const rows = D.RATCHET.map((r) => `
    <tr>
      <td>${esc(r.change)}</td>
      <td><span class="chip" style="background:${r.result === 'PASS' ? SEV.ok : SEV.bad}">
        ${esc(r.result)}</span></td>
      <td>${esc(r.why)}</td>
    </tr>`).join('');
  return `<table><thead><tr><th>Change</th><th>Gate</th><th>Why</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function mutantsTable() {
  const rows = D.MUTANTS.map((m) => `
    <tr>
      <td><strong>${esc(m.id)}</strong></td>
      <td>${esc(m.mutation)}</td>
      <td>${esc(m.killed)}</td>
    </tr>`).join('');
  return `<table><thead><tr>
    <th>Mutant</th><th>What was broken on purpose</th><th>Test that failed</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * The crash trap, as a flow, because the finding is about ORDER of checks, not quantity.
 *
 * The direction is a parameter rather than a constant: left-to-right fits the landscape visual,
 * but the same graph squeezed into a portrait column renders too small to read. A diagram nobody
 * can read is decoration, and decoration is what this pipeline is supposed to avoid.
 */
const crashDiagram = (dir) => `<div class="mermaid">
graph ${dir}
  A["tsc over 2,040 test files"] --> B{"how did it exit?"}
  B -->|"0 or 2"| C["a real verdict: count the diagnostics"]
  B -->|"134, or killed by a signal"| D["heap died after 490s, printed 0 errors"]
  D --> E["a runner that only counts errors reports a CLEAN PASS"]
  E --> F["refused here: the exit status is checked FIRST"]
</div>`;

function buildVisual() {
  const css = `${baseCss()}${SHARED}
    body { font-size: 8.8pt; }
    h1 { font-size: 15pt; } h2 { font-size: 9.5pt; margin: 9px 0 4px; border-bottom-width: 1.5px; }
    .takeaway { padding: 8px 11px; margin-bottom: 9px; }
    .takeaway .headline { font-size: 10.5pt; } .takeaway .label { font-size: 7pt; }
    .cards { gap: 7px; margin: 8px 0 9px; } .card { padding: 6px 8px; }
    .card .n { font-size: 15.5pt; } .card .k { font-size: 6.4pt; }
    table { font-size: 7.4pt; margin: 5px 0 7px; }
    th { font-size: 6.6pt; padding: 3px 5px; } td { padding: 3px 5px; }
    .chip { font-size: 6.4pt; padding: 1px 5px; }
    .note { font-size: 7.4pt; padding: 6px 9px; margin: 6px 0; }
    .mermaid svg { max-height: 92px; } figcaption { font-size: 6.8pt; }
    code { font-size: 7pt; }`;

  const cards = [
    { n: D.SCALE.testFiles.toLocaleString('en-US'), k: 'test files, checked by nothing' },
    { n: D.SCALE.errors, k: 'type errors found' },
    { n: D.SCALE.filesWithErrors, k: 'files carrying them' },
    { n: D.SCALE.srcErrors, k: 'errors in production code' },
    { n: `${Math.round(D.COST.seconds / 60)} min`, k: `cost, at ${D.COST.heapMb / 1024}GB heap` },
  ].map((c) => `<div class="card"><div class="n">${esc(c.n)}</div>
      <div class="k">${esc(c.k)}</div></div>`).join('');

  const body = `
  <h1>${esc(D.CODE)} &middot; ${esc(D.TITLE)}</h1>
  <div class="meta">Measured ${esc(D.MEASURED_ON)} on the real tree &middot;
    every figure recomputed from the raw <code>tsc</code> output, none carried over from notes</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The one line worth reading</div>
    <div class="headline">The files that do the checking were never checked. Three typecheck gates
      all read a program that excluded them, so ${D.SCALE.testFiles.toLocaleString('en-US')} test
      files were enforced by nothing. ${D.SCALE.errors} errors were sitting in
      ${D.SCALE.filesWithErrors} of them, and <strong>none in production code</strong>.</div>
  </div>

  <div class="cards">${cards}</div>

  <div class="two">
    <div>
      <h2>Where the ${D.SCALE.errors} errors are, by kind</h2>
      <figure>
        ${barChart({ rows: codeRows(7), width: 470, barH: 13, gap: 5, labelW: 250 })}
        <figcaption>${D.SCALE.distinctCodes} distinct codes. The listed bars plus the tail
          sum to ${D.SCALE.errors}, which is the control.</figcaption>
      </figure>
      <div class="note warn">
        <strong>None of this is production code.</strong> ${D.SCALE.srcErrors} of the
        ${D.SCALE.errors} are in <code>src</code>. The debt is entirely in the files that assert
        other files are correct.
      </div>
    </div>
    <div>
      <h2>Why it was invisible</h2>
      ${gatesTable()}
      <div class="note good">
        <strong>Shrink-only.</strong> Per file the count must EQUAL the frozen number: a new error
        fails, and so does a FIX, naming the lower number to paste in. A file absent from the table
        must have zero, so a new test file is covered the moment it is written.
      </div>
    </div>
  </div>

  <h2>The trap this gate had to be built around</h2>
  <figure>
    ${crashDiagram('LR')}
    <figcaption>At the default heap the run does not merely take longer, it dies after
      ${D.COST.crashSeconds}s and prints ${D.COST.crashErrorsReported} errors. That is a crash
      wearing a green badge, and it is the reason the checker asserts tsc COMPLETED before it
      believes any count.</figcaption>
  </figure>

  <div class="footer">${esc(D.CODE)} ${esc(D.TITLE)} &middot; visual, one page &middot;
    built from the same data module as the document &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${D.CODE} ${D.TITLE} (visual)` };
}

function buildDocument() {
  const css = `${baseCss()}${SHARED}`;

  const parts = [
    { label: `Clean test files (${(D.SCALE.testFiles - D.SCALE.filesWithErrors)
      .toLocaleString('en-US')})`,
    value: D.SCALE.testFiles - D.SCALE.filesWithErrors,
    color: SEV.ok },
    { label: `Carrying a type error (${D.SCALE.filesWithErrors})`,
      value: D.SCALE.filesWithErrors,
      color: SEV.bad },
  ];

  const notEstablished = D.NOT_ESTABLISHED.map((n) => `<li>${esc(n)}</li>`).join('');

  const body = `
  <h1>${esc(D.CODE)} &middot; ${esc(D.TITLE)}</h1>
  <div class="meta">Measured ${esc(D.MEASURED_ON)} &middot; Growth OS reset, entry-gate series
    &middot; ${esc(D.PR_LABEL)}</div>
  <div class="rule"></div>

  <p><strong>The ticket asked:</strong> ${esc(D.ASKED)}<br>
     <strong>Delivered:</strong> ${esc(D.DELIVERED)}</p>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.TAKEAWAY)}</div>
  </div>

  <h2>1. The gap, and why it mattered here specifically</h2>
  <p><code>backend/tsconfig.json</code> excludes <code>**/*.test.ts</code> and
    <code>**/__tests__/**</code>, and ts-jest runs with <code>isolatedModules</code>, which
    transpiles each file without checking its types. Those two facts together mean a type error in
    a backend test file passed every gate in this repo.</p>
  <p>In most codebases that is untidy. Here it is worse, because the guards protecting Person 360,
    the Sales Readiness Score and the Explorer writer set ARE test files. The thing doing the
    checking was itself unchecked, which is the same failure shape this whole workstream keeps
    finding: the instrument reads clean because it is not reading.</p>
  ${gatesTable()}

  <h2>2. What was actually there</h2>
  <p>Measured against the real tree, not sampled:
    <strong>${D.SCALE.errors} type errors across ${D.SCALE.filesWithErrors} files</strong>, out of
    ${D.SCALE.testFiles.toLocaleString('en-US')} test files
    (${D.SCALE.srcFilesTotal.toLocaleString('en-US')} <code>.ts</code> files in
    <code>src</code> altogether). Every one is a test file.
    <strong>${D.SCALE.srcErrors} are in production code</strong>, which is the single most
    reassuring number in this document.</p>
  <figure>
    ${stackBar({ parts, width: 660, height: 26 })}
    <figcaption>${D.SCALE.filesWithErrors} of ${D.SCALE.testFiles.toLocaleString('en-US')} test
      files carry at least one error. The proportion is small; the absolute number is not.
    </figcaption>
  </figure>
  <figure>
    ${barChart({ rows: codeRows(12), width: 660, barH: 17, gap: 6, labelW: 300 })}
    <figcaption>All ${D.SCALE.errors} errors by TypeScript code,
      ${D.SCALE.distinctCodes} distinct. Recomputed from the diagnostic lines and checked against
      both totals rather than transcribed.</figcaption>
  </figure>

  <h2>3. Why a baseline rather than a clean gate</h2>
  <p>A job that simply failed on ${D.SCALE.errors} pre-existing errors could not be merged, so it
    would have been switched off instead, and the repo would be exactly where it started with one
    more disabled check. The frozen table in
    <code>backend/src/services/content/testTypecheckBaseline.ts</code> makes the existing debt a
    tracked, named number per file and gates the only thing still preventable: a new one.</p>
  ${ratchetTable()}
  <p>Note the third and fourth rows. Fixing an error FAILS the build, telling you the lower number
    to paste in, and a file reaching zero must have its entry deleted. That is what makes the
    baseline shrink-only rather than a place where debt quietly accumulates.</p>

  <h2>4. The trap the checker had to be built around</h2>
  <p>At the default heap, <code>tsc</code> over this program dies after about
    ${D.COST.crashSeconds} seconds with a JavaScript heap FATAL ERROR. It prints
    ${D.COST.crashErrorsReported} diagnostics and exits ${D.COST.crashExit}. A runner that counts
    diagnostics reads that as zero errors and reports a clean pass.</p>
  <figure>${crashDiagram('TD')}
    <figcaption>The exit status is checked before any count is believed. Exit 0 and exit 2 are the
      only accepted verdicts.</figcaption>
  </figure>
  <p>The measured cost of a run that actually completes:
    <strong>${D.COST.seconds} seconds</strong> with
    <code>--max-old-space-size=${D.COST.heapMb}</code>. It runs as its own parallel CI job, so it
    does not slow the other checks; it does become the slowest thing in CI.</p>

  <h2>5. The defect this task found in itself</h2>
  <div class="note warn">
    <p style="margin:0 0 6px"><strong>${esc(D.SELF_DEFECT.what)}</strong></p>
    <p style="margin:0 0 6px">${esc(D.SELF_DEFECT.why)}</p>
    <p style="margin:0 0 6px"><strong>Fix:</strong> ${esc(D.SELF_DEFECT.fix)}</p>
    <p style="margin:0">${esc(D.SELF_DEFECT.direction)}</p>
  </div>

  <h2>6. How the checker was verified</h2>
  <p>Twenty-two tests pass, which on its own proves nothing: a check that cannot fail passes too.
    So each of the four rules was broken on purpose and the suite had to notice. Every mutant was
    applied to a COPY-protected file and the restore proved byte-identical with <code>cmp</code>.</p>
  ${mutantsTable()}
  <div class="note good">
    <strong>M1b is the one worth reading.</strong> It reproduces the real defect described in
    section 5, so that test is known to catch it rather than assumed to. Each mutant killed exactly
    one named test, which also shows the four rules are independent rather than all keying off the
    same assertion.</div>
  <p>The gate run itself then completed in ${D.COST.seconds}s at exit 2 and reported
    <strong>baseline matched exactly, in both directions</strong>. Because it flags any unlisted
    file carrying an error, that clean result is also the proof that the new test file is itself
    type-clean.</p>

  <h2>7. What this does NOT establish</h2>
  <ul>${notEstablished}</ul>

  <h2>8. Reversing it</h2>
  <p>Entirely code and config, no data touched and nothing sent. <code>git revert</code> removes
    the job, the config, the baseline and the checker together. Removing only the CI job leaves the
    checker runnable by hand, which is the sensible half-step if the ${D.COST.seconds}s cost turns
    out not to be worth it.</p>

  <div class="footer">${esc(D.CODE)} ${esc(D.TITLE)} &middot; document &middot;
    figures from one data module &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${D.CODE} ${D.TITLE}` };
}

module.exports = { buildVisual, buildDocument };
