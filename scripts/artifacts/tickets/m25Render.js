/**
 * M25 renderers. The visual leads with the distribution, not with "the engine is built", because
 * the distribution is the part that changes what happens next.
 */
const { esc, baseCss, barChart, SEV } = require('../artifactTheme');
const D = require('./m25Data');

const SHARED = `
  .two { display: flex; gap: 16px; } .two > * { flex: 1; min-width: 0; }
  .footer { margin-top: 10px; font-size: 7.4pt; color: var(--muted);
            border-top: 1px solid var(--border); padding-top: 5px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .dead { color: ${SEV.bad}; font-weight: 700; }
`;

/** Score histogram. The empty buckets are kept: the emptiness IS the finding. */
function histogramChart(width) {
  const rows = D.HISTOGRAM.map(([range, n]) => ({
    label: range,
    value: n,
    color: n === 0 ? '#e2e8f0' : SEV.bad,
  }));
  return barChart({ rows, width, barH: 12, gap: 4, labelW: 70 });
}

/** How much of the ruleset's range each factor actually used. */
function factorChart(width) {
  // The "present N%" goes in the LEFT label, not after the bar: a bar at full width pushes its
  // trailing text past the viewBox and the number is clipped. Caught by looking at the render.
  const rows = D.FACTORS.filter((f) => f.max > 0).map((f) => ({
    label: `${f.key} /${f.max}  present ${f.presentPct}%`,
    value: f.meanWhenPresent,
    display: f.meanWhenPresent.toFixed(2),
    color: f.verdict === 'CONSTANT' || f.verdict === 'ALWAYS ZERO' ? SEV.bad : SEV.ok,
  }));
  return barChart({ rows, width, barH: 13, gap: 5, labelW: 215 });
}

function factorTable() {
  const rows = D.FACTORS.map((f) => `
    <tr>
      <td><code>${esc(f.key)}</code></td>
      <td class="num">${f.max}</td>
      <td class="num">${f.presentPct}%</td>
      <td class="num">${f.meanWhenPresent.toFixed(2)}</td>
      <td${/CONSTANT|ALWAYS ZERO/.test(f.verdict) ? ' class="dead"' : ''}>${esc(f.verdict)}</td>
    </tr>`).join('');
  return `<table><thead><tr>
    <th>Factor</th><th class="num">Max</th><th class="num">Present</th>
    <th class="num">Mean when present</th><th>Verdict</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function buildVisual() {
  const css = `${baseCss()}${SHARED}
    body { font-size: 8.8pt; }
    h1 { font-size: 15pt; } h2 { font-size: 9.5pt; margin: 9px 0 4px; border-bottom-width: 1.5px; }
    .takeaway { padding: 8px 11px; margin-bottom: 9px; }
    .takeaway .headline { font-size: 10pt; } .takeaway .label { font-size: 7pt; }
    .cards { gap: 7px; margin: 8px 0 9px; } .card { padding: 6px 8px; }
    .card .n { font-size: 15pt; } .card .k { font-size: 6.3pt; }
    table { font-size: 7.2pt; } th { font-size: 6.5pt; padding: 3px 5px; } td { padding: 3px 5px; }
    .note { font-size: 7.4pt; padding: 6px 9px; margin: 6px 0; }
    figcaption { font-size: 6.8pt; } code { font-size: 7pt; }`;

  const cards = [
    { n: D.RUN.population, k: 'people scored, read-only' },
    { n: `${D.DEAD_WEIGHT.points}/${D.DEAD_WEIGHT.of}`, k: 'points that cannot rank anyone' },
    { n: `${D.DEAD_WEIGHT.iqrPoints}`, k: 'points separate the middle half' },
    { n: `${D.RUN.coverageMean}%`, k: 'mean evidence coverage' },
    { n: D.MUTATION.tests, k: 'tests, every factor mutated twice' },
  ].map((c) => `<div class="card"><div class="n">${esc(c.n)}</div>
      <div class="k">${esc(c.k)}</div></div>`).join('');

  const body = `
  <h1>${esc(D.CODE)} &middot; The score runs. It does not yet rank.</h1>
  <div class="meta">Ruleset <code>${esc(D.RULESET)}</code> &middot; ${esc(D.MEASURED_ON)} &middot;
    ${D.RUN.population} people, read-only against production, nothing written</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The one line worth reading</div>
    <div class="headline">${esc(D.TAKEAWAY)}</div>
  </div>

  <div class="cards">${cards}</div>

  <div class="two">
    <div>
      <h2>Where ${D.RUN.population} people landed, out of ${D.RUN.maxPossible}</h2>
      <figure>${histogramChart(430)}
        <figcaption>min ${D.RUN.min} &middot; median ${D.RUN.median} &middot; p75 ${D.RUN.p75}
          &middot; max ${D.RUN.max}. Six of the ten buckets are empty, and the top four are
          unreachable by this population.</figcaption></figure>
      <div class="note warn">
        <strong>Half the population sits within ${D.DEAD_WEIGHT.iqrPoints} points of itself</strong>
        on a ${D.RUN.maxPossible}-point scale. A queue ordered on that is ordered on noise.
      </div>
    </div>
    <div>
      <h2>Why: what each factor actually contributed</h2>
      <figure>${factorChart(430)}
        <figcaption>Red bars are factors that cannot rank anybody: identical for everyone, or
          zero for everyone.</figcaption></figure>
      <div class="note">
        <strong>${esc(D.DEAD_WEIGHT.factors.join(', '))}</strong> hold
        ${D.DEAD_WEIGHT.points} of ${D.DEAD_WEIGHT.of} points. Every Explorer has an enrollment,
        so that factor is a constant; nobody has booked a call or replied, so those two are flat
        zero.
      </div>
    </div>
  </div>

  <div class="footer">${esc(D.CODE)} &middot; visual, one page &middot; figures copied from the
    read-only report's own output &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${D.CODE} SRS engine and distribution (visual)` };
}

function buildDocument() {
  const css = `${baseCss()}${SHARED}`;

  const guarantees = D.GUARANTEES.map(([what, how]) => `
    <tr><td><strong>${esc(what)}</strong></td><td>${esc(how)}</td></tr>`).join('');
  const notEstablished = D.NOT_ESTABLISHED.map((n) => `<li>${esc(n)}</li>`).join('');

  const body = `
  <h1>${esc(D.CODE)} &middot; ${esc(D.TITLE)}</h1>
  <div class="meta">Ruleset <code>${esc(D.RULESET)}</code> &middot; ${esc(D.MEASURED_ON)}
    &middot; Growth OS reset, Phase 3</div>
  <div class="rule"></div>

  <p><strong>The ticket asked:</strong> ${esc(D.ASKED)}<br>
     <strong>Delivered:</strong> ${esc(D.DELIVERED)}</p>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.TAKEAWAY)}</div>
  </div>

  <h2>1. What the engine guarantees</h2>
  <p>Each row is a property with a test behind it, not an intention.</p>
  <table><thead><tr><th>Guarantee</th><th>How it is held</th></tr></thead>
    <tbody>${guarantees}</tbody></table>

  <h2>2. How it was proved</h2>
  <p>${D.MUTATION.tests} tests. Every one of the ${D.MUTATION.factors} factors was mutated
    <strong>${D.MUTATION.passes} ways</strong>: ${esc(D.MUTATION.how)} The property tests use a
    seeded generator rather than <code>Math.random</code>, because a property failure nobody can
    replay is worse than no property suite at all.</p>

  <h2>3. The run</h2>
  <p>${D.RUN.population} Explorer records, scored through the real Person 360 reader rather than
    a faster bespoke query, so that what was measured is what the product would actually score,
    absences included. ${D.RUN.seconds} seconds, ${D.RUN.unreadable} unreadable.
    <strong>Nothing was written</strong>: no score persisted, no row updated, nothing sent.</p>
  <figure>${histogramChart(660)}
    <figcaption>Scores out of ${D.RUN.maxPossible}. min ${D.RUN.min}, p25 ${D.RUN.p25},
      median ${D.RUN.median}, p75 ${D.RUN.p75}, p95 ${D.RUN.p95}, max ${D.RUN.max},
      mean ${D.RUN.mean}. Nobody scored zero, and nobody came close to the top of the range.
    </figcaption></figure>
  <p>Evidence coverage averaged <strong>${D.RUN.coverageMean}%</strong> (min
    ${D.RUN.coverageMin}%, max ${D.RUN.coverageMax}%), so this is not a story about missing data:
    the evidence was mostly there and mostly said the same thing about everyone.</p>

  <h2>4. Why it does not rank</h2>
  ${factorTable()}
  <div class="note warn">
    <p style="margin:0 0 6px"><strong>${D.DEAD_WEIGHT.points} of ${D.DEAD_WEIGHT.of} points
      (${Math.round((D.DEAD_WEIGHT.points / D.DEAD_WEIGHT.of) * 100)}%) cannot separate anybody.</strong></p>
    <p style="margin:0">Every person in this population has an enrollment, so the 40-point
      commitment factor is a constant. Nobody has booked a call or replied to a human, so the
      35-point and 30-point factors are flat zero. What is left to rank on is tenure, consent and
      prior history, which are weak by design, plus intent, which is present for only
      ${D.FACTORS.find((f) => f.key === 'intent')?.presentPct}% of people.</p>
  </div>
  <p>This is a weights-and-population finding, not an engine defect. The engine did exactly what
    it is specified to do; the specification's weights were a hypothesis, and this is the first
    evidence about them.</p>

  <h2>5. The decision, which is yours</h2>
  <div class="note warn">${esc(D.DECISION)}</div>
  <p>Three directions, not mutually exclusive:</p>
  <ul>
    <li><strong>Reweight.</strong> Demote the constant, promote what varies. Cheap, and testable
      the same way: re-run this report and compare the spread.</li>
    <li><strong>Change the population.</strong> A readiness queue over people who have all
      already enrolled in the free program may be the wrong question. Leads, or Explorers who
      have done something recently, would both discriminate more.</li>
    <li><strong>Unblock recency.</strong> The single most likely discriminator for "who to call
      next" is how recently they did anything, and that input is still EXCLUDED by the M24
      contract because <code>lastActivity</code> varies by caller.</li>
  </ul>

  <h2>6. What this does NOT establish</h2>
  <ul>${notEstablished}</ul>

  <div class="footer">${esc(D.CODE)} &middot; document &middot; every figure copied from the
    read-only report's output &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${D.CODE} SRS engine and distribution` };
}

module.exports = { buildVisual, buildDocument };
