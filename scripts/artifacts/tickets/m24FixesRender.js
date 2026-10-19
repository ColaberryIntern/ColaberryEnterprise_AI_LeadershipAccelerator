/**
 * M24.1 / M24.2 / M24.3 renderers, parameterized by ticket code.
 *
 * Three tickets, three artifact pairs, one data module. Each pair leads with ITS OWN fix; the
 * shared context (the rule, the contract tally, what is still excluded) is the same in all three
 * because it is read from one place.
 */
const { esc, baseCss, stackBar, SEV } = require('../artifactTheme');
const D = require('./m24FixesData');

const SHARED = `
  .two { display: flex; gap: 16px; } .two > * { flex: 1; min-width: 0; }
  .ba { display: flex; gap: 12px; margin: 8px 0 10px; }
  .ba > div { flex: 1; border: 1px solid var(--border); border-radius: 6px; padding: 9px 11px; }
  .ba .h { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
           margin-bottom: 4px; }
  .was { background: #fdf3f2; border-left: 4px solid ${SEV.bad}; }
  .now { background: #f3f9f3; border-left: 4px solid ${SEV.ok}; }
  .footer { margin-top: 10px; font-size: 7.4pt; color: var(--muted);
            border-top: 1px solid var(--border); padding-top: 5px; }
`;

const RULE_DIAGRAM = (dir) => `<div class="mermaid">
graph ${dir}
  A["the query was never issued<br/>or there was no key"] --> B{"what is reported?"}
  B -->|"0"| C["reads as measured inactivity<br/>and the score ranks on it"]
  B -->|"null"| D["reads as no evidence<br/>which is the truth"]
</div>`;

function contractBar(width) {
  return stackBar({
    parts: [
      { label: `Safe (${D.CONTRACT.safeAfter})`, value: D.CONTRACT.safeAfter, color: SEV.ok },
      { label: `Still excluded (${D.CONTRACT.excludedAfter})`, value: D.CONTRACT.excludedAfter, color: SEV.bad },
    ],
    width,
    height: 20,
  });
}

function excludedTable() {
  const rows = D.STILL_EXCLUDED.map((s) => `
    <tr><td><strong>${esc(s.what)}</strong><br><code>${esc(s.fields)}</code></td>
    <td>${esc(s.why)}</td></tr>`).join('');
  return `<table><thead><tr><th>Still excluded</th><th>Why</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function buildVisual(code) {
  const f = D.byCode(code);
  const css = `${baseCss()}${SHARED}
    body { font-size: 9pt; }
    h1 { font-size: 15pt; } h2 { font-size: 9.5pt; margin: 9px 0 4px; border-bottom-width: 1.5px; }
    .cards { gap: 7px; margin: 8px 0 9px; } .card { padding: 6px 8px; }
    .card .n { font-size: 15.5pt; } .card .k { font-size: 6.4pt; }
    table { font-size: 7.4pt; } th { font-size: 6.6pt; padding: 3px 5px; } td { padding: 3px 5px; }
    .note { font-size: 7.6pt; padding: 6px 9px; margin: 6px 0; }
    .ba { font-size: 7.8pt; } .mermaid svg { max-height: 150px; }
    figcaption { font-size: 6.8pt; } code { font-size: 7pt; }`;

  const cards = [
    { n: D.CONTRACT.safeAfter, k: `of ${D.CONTRACT.inputs} inputs now safe` },
    { n: `+${D.CONTRACT.safeAfter - D.CONTRACT.safeBefore}`, k: 'moved excluded to safe' },
    { n: '16', k: 'tests, both directions' },
    { n: '4', k: 'mutants, each killed one test' },
    { n: D.CONTRACT.excludedAfter, k: 'inputs still excluded' },
  ].map((c) => `<div class="card"><div class="n">${esc(c.n)}</div>
      <div class="k">${esc(c.k)}</div></div>`).join('');

  const body = `
  <h1>${esc(f.code)} &middot; ${esc(f.title)}</h1>
  <div class="meta">${esc(f.file)} &middot; ${esc(D.MEASURED_ON)} &middot;
    one of three fixes serving one rule</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The rule this serves</div>
    <div class="headline">${esc(D.RULE)}</div>
  </div>

  <div class="ba">
    <div class="was"><div class="h">Was</div>${esc(f.was)}</div>
    <div class="now"><div class="h">Now</div>${esc(f.now)}</div>
  </div>

  <div class="cards">${cards}</div>

  <div class="two">
    <div>
      <h2>Why a zero is not a blank</h2>
      <figure>${RULE_DIAGRAM('TD')}
        <figcaption>${esc(D.WHY)}</figcaption></figure>
    </div>
    <div>
      <h2>Proved, not asserted</h2>
      <div class="note good">
        <strong>Mutant:</strong> ${esc(f.mutant)}.<br>
        <strong>Killed:</strong> "${esc(f.killed)}".<br>
        The restore was proved byte-identical with <code>cmp</code>. Every case pins the REAL
        ZERO as well as the absent one, so a change that nulled everything out would fail too.
      </div>
      <h2>Where the contract stands now</h2>
      ${contractBar(420)}
      <div class="note" style="margin-top:7px">${esc(f.extra)}</div>
    </div>
  </div>

  <div class="footer">${esc(f.code)} &middot; visual, one page &middot; built from the same data
    module as the document &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${f.code} ${f.title} (visual)` };
}

function buildDocument(code) {
  const f = D.byCode(code);
  const css = `${baseCss()}${SHARED}`;

  const verification = D.VERIFICATION.map(([what, result]) => `
    <tr><td><code>${esc(what)}</code></td><td>${esc(result)}</td></tr>`).join('');

  const siblings = D.FIXES.filter((x) => x.code !== f.code).map((x) => `
    <li><strong>${esc(x.code)}</strong> - ${esc(x.title)}</li>`).join('');

  const body = `
  <h1>${esc(f.code)} &middot; ${esc(f.title)}</h1>
  <div class="meta">${esc(f.file)} &middot; ${esc(D.MEASURED_ON)} &middot; Growth OS reset,
    Phase 3</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(f.now)}</div>
  </div>

  <h2>1. The rule, and why it is not pedantry</h2>
  <p><strong>${esc(D.RULE)}</strong> ${esc(D.WHY)}</p>
  <figure>${RULE_DIAGRAM('LR')}
    <figcaption>The same empty state, reported two ways. Only one of them is true.</figcaption>
  </figure>

  <h2>2. What was wrong</h2>
  <p>${esc(f.was)}</p>
  <div class="note warn">${esc(f.extra)}</div>

  <h2>3. What it does now</h2>
  <p>${esc(f.now)}</p>

  <h2>4. How it was proved</h2>
  <p>Passing tests prove nothing on their own: a check that cannot fail passes too. The fix was
    reverted on a copy of the file and the suite had to notice.</p>
  <ul>
    <li><strong>Mutant:</strong> ${esc(f.mutant)}</li>
    <li><strong>Test that failed:</strong> "${esc(f.killed)}"</li>
    <li><strong>Restore:</strong> proved byte-identical with <code>cmp</code>, md5 back to its
      baseline</li>
  </ul>
  <div class="note good">
    <strong>Every case pins the real zero as well as the absent one.</strong> That pairing is the
    point: a change that turned every zero into null would satisfy a one-sided test while
    destroying the measurement.
  </div>
  <h3>The full check list</h3>
  <table><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>${verification}</tbody></table>

  <h2>5. What this is part of</h2>
  <p>Three fixes serve the one rule. The other two:</p>
  <ul>${siblings}</ul>
  <p>Together they moved the M24 contract's input table from
    <strong>${D.CONTRACT.safeBefore} of ${D.CONTRACT.inputs}</strong> safe to
    <strong>${D.CONTRACT.safeAfter} of ${D.CONTRACT.inputs}</strong>.</p>
  <figure>${contractBar(660)}
    <figcaption>The contract was amended, not rewritten: the original finding is kept, struck and
      dated, because it is why these fixes exist.</figcaption></figure>

  <h2>6. What is still NOT safe</h2>
  ${excludedTable()}
  <div class="note warn">${esc(D.M22)}</div>

  <h2>7. Rollback</h2>
  <p>Code only. No data touched and nothing sent. <code>git revert</code> restores the previous
    shapes; the nullable types are the only outward contract change, and the frontend moves back
    with the same revert.</p>

  <div class="footer">${esc(f.code)} &middot; document &middot; figures from one data module
    &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${f.code} ${f.title}` };
}

module.exports = { buildVisual, buildDocument };
