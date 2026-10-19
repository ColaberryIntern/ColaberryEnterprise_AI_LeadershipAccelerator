/**
 * M27 renderers. The visual carries the one rule (recomputation cannot buy freshness) and the
 * four states; the document adds the proof and the correction.
 */
const { esc, baseCss, SEV } = require('../artifactTheme');
const D = require('./m27Data');

const SHARED = `
  .two { display: flex; gap: 16px; } .two > * { flex: 1; min-width: 0; }
  .footer { margin-top: 10px; font-size: 7.4pt; color: var(--muted);
            border-top: 1px solid var(--border); padding-top: 5px; }
  td.s { font-weight: 700; white-space: nowrap; }
`;

const TONE = { fresh: SEV.ok, aging: SEV.watch, stale: SEV.bad, unknown: SEV.none };

/** The rule as a flow: the finding is about which of two dates wins. */
const BIND_DIAGRAM = (dir) => `<div class="mermaid">
graph ${dir}
  A["a score, with two dates:<br/>when computed, and its oldest evidence"] --> B{"which is older?"}
  B -->|"the computation"| C["as-of = computed at"]
  B -->|"the evidence"| D["as-of = the evidence date<br/>recomputing cannot make it newer"]
</div>`;

function statesTable() {
  const rows = D.STATES.map((s) => `
    <tr>
      <td class="s" style="color:${TONE[s.state]}">${esc(s.state.toUpperCase())}</td>
      <td>${esc(s.when)}</td><td>${esc(s.shown)}</td><td>${esc(s.rank)}</td>
    </tr>`).join('');
  return `<table><thead><tr>
    <th>State</th><th>When</th><th>What a reader is shown</th><th>What to do</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function mutantsTable() {
  const rows = D.MUTANTS.map((m) => `
    <tr><td>${esc(m.mutation)}</td><td>"${esc(m.killed)}"</td></tr>`).join('');
  return `<table><thead><tr><th>Broken on purpose</th><th>Test that failed</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function buildVisual() {
  const css = `${baseCss()}${SHARED}
    body { font-size: 9pt; }
    h1 { font-size: 15pt; } h2 { font-size: 9.5pt; margin: 9px 0 4px; border-bottom-width: 1.5px; }
    .takeaway { padding: 8px 11px; margin-bottom: 9px; }
    .takeaway .headline { font-size: 10.5pt; } .takeaway .label { font-size: 7pt; }
    .cards { gap: 7px; margin: 8px 0 9px; } .card { padding: 6px 8px; }
    .card .n { font-size: 15pt; } .card .k { font-size: 6.4pt; }
    table { font-size: 7.4pt; } th { font-size: 6.6pt; padding: 3px 5px; } td { padding: 3px 5px; }
    .note { font-size: 7.5pt; padding: 6px 9px; margin: 6px 0; }
    .mermaid svg { max-height: 165px; } figcaption { font-size: 6.8pt; }`;

  const cards = [
    { n: D.STATES.length, k: 'states, including "unknown"' },
    { n: `${D.THRESHOLDS.fresh}h`, k: 'fresh, provisional' },
    { n: `${D.THRESHOLDS.aging}h`, k: 'then stale, provisional' },
    { n: D.MUTANTS.length, k: 'mutants, each killed a named test' },
    { n: 17, k: 'tests in this file' },
  ].map((c) => `<div class="card"><div class="n">${esc(c.n)}</div>
      <div class="k">${esc(c.k)}</div></div>`).join('');

  const body = `
  <h1>${esc(D.CODE)} &middot; Recomputation cannot buy freshness</h1>
  <div class="meta">${esc(D.MEASURED_ON)} &middot; pure function, no clock read inside it
    &middot; nothing surfaced yet</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The one line worth reading</div>
    <div class="headline">${esc(D.TAKEAWAY)}</div>
  </div>

  <div class="cards">${cards}</div>

  <div class="two">
    <div>
      <h2>Which date wins</h2>
      <figure>${BIND_DIAGRAM('TD')}
        <figcaption>The older of the two bounds the score. A surface reads the score alone,
          because the evidence date travels on it.</figcaption></figure>
    </div>
    <div>
      <h2>A stale score is labeled, not hidden</h2>
      ${statesTable()}
      <div class="note warn">
        <strong>Hiding it is the failure mode this avoids.</strong> No number and no reason reads
        as "nothing to see" rather than "this is old". Clock skew is surfaced too, not silently
        clamped away.
      </div>
    </div>
  </div>

  <div class="footer">${esc(D.CODE)} &middot; visual, one page &middot; built from the same data
    module as the document &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${D.CODE} score freshness (visual)` };
}

function buildDocument() {
  const css = `${baseCss()}${SHARED}`;

  const verification = D.VERIFICATION.map(([w, r]) => `
    <tr><td><code>${esc(w)}</code></td><td>${esc(r)}</td></tr>`).join('');
  const binding = D.BINDING.map(([what, when]) => `
    <tr><td><strong>${esc(what)}</strong></td><td>${esc(when)}</td></tr>`).join('');
  const notEstablished = D.NOT_ESTABLISHED.map((n) => `<li>${esc(n)}</li>`).join('');

  const body = `
  <h1>${esc(D.CODE)} &middot; ${esc(D.TITLE)}</h1>
  <div class="meta">${esc(D.MEASURED_ON)} &middot; Growth OS reset, Phase 3</div>
  <div class="rule"></div>

  <p><strong>The ticket asked:</strong> ${esc(D.ASKED)}<br>
     <strong>Delivered:</strong> ${esc(D.DELIVERED)}</p>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.TAKEAWAY)}</div>
  </div>

  <h2>1. Which date bounds the score</h2>
  <table><thead><tr><th>Bound by</th><th>When</th></tr></thead><tbody>${binding}</tbody></table>
  <figure>${BIND_DIAGRAM('LR')}
    <figcaption>The result carries <code>oldestEvidenceAt</code> beside <code>computedAt</code>,
      so a surface can assess a score from the score alone rather than reassembling inputs it no
      longer has.</figcaption></figure>
  <p>Today the only input that dates itself is the Explorer snapshot's <code>asOfDate</code>.
    Null means nothing dated the evidence, not that the evidence is new.</p>

  <h2>2. The four states</h2>
  ${statesTable()}
  <p>Three of these are common; <strong>unknown</strong> is the one most designs leave out. A
    score whose date will not parse must not be presented as fresh, and must not be hidden either,
    so it gets its own state and its own sentence.</p>

  <h2>3. How it was proved</h2>
  ${mutantsTable()}
  <p>Each mutant was applied to a copy and the restore proved byte-identical with <code>cmp</code>.
    The function is pure: <code>now</code> is a parameter, and a test shows both halves, that
    identical inputs give identical output and that changing <code>now</code> does change it.</p>
  <table><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>${verification}</tbody></table>

  <h2>4. A correction to the M24 contract, made here</h2>
  <div class="note warn">
    <p style="margin:0 0 6px"><strong>What it claimed:</strong> ${esc(D.CORRECTION.claimed)}</p>
    <p style="margin:0 0 6px"><strong>Why that was wrong:</strong> ${esc(D.CORRECTION.wrong)}</p>
    <p style="margin:0 0 6px">${esc(D.CORRECTION.why)}</p>
    <p style="margin:0"><strong>What still stands:</strong> ${esc(D.CORRECTION.stands)}</p>
  </div>
  <p>The correction is struck and dated in the contract rather than quietly rewritten. <strong>The
    artifact PDFs already attached to M24 and to M24.1 through M24.3 carry the original
    overstatement</strong>, because the Basecamp token was unavailable when it was found; the
    repository documents are correct.</p>

  <h2>5. What this does NOT establish</h2>
  <ul>${notEstablished}</ul>

  <div class="footer">${esc(D.CODE)} &middot; document &middot; figures from one data module
    &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${D.CODE} score freshness` };
}

module.exports = { buildVisual, buildDocument };
