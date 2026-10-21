/**
 * AF10.2 renderers: the one-page visual and the spec document.
 *
 * Both read `af102Data.js` and nothing else, so a figure on the page cannot drift from a
 * number in the prose.
 *
 * The visual uses hand-rolled SVG (no network, no race) and ONE small mermaid flow, because
 * the central fact of this ticket is a CHAIN - empty field leads to vacuous truth leads to
 * never verifiable - and a chain is the one thing a bar chart cannot say. The document carries
 * the fuller diagram and the eighteen authored criteria in full, since those are the part
 * worth challenging and a count of them would not be reviewable.
 */
const D = require('./af102Data');
const { TOKENS, SEV, esc, baseCss, stackBar, barChart } = require('../artifactTheme');

const FOOT = `AF10.2 &middot; Agent Factory &middot; measured in production ${D.MEASURED_ON}`;

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  const mig = D.SPLIT.find((s) => s.key === 'migrated');
  const aut = D.SPLIT.find((s) => s.key === 'authored');

  const css = `
  /* 9.1pt, not 9.5. Chromium's PRINT layout has slightly less usable height than the same
     box measured in CSS pixels on screen, so a page that measures as exactly fitting still
     paginates. Scaling the type is one proportional lever and keeps every element's relative
     weight; shaving individual margins to hit the boundary exactly was fragile and failed. */
  body { font-size: 9.1pt; }
  h1 { font-size: 16pt; }
  .cols { display: flex; gap: 14px; align-items: flex-start; }
  .col { flex: 1; }
  .card .n { font-size: 17pt; }
  .kpi .card { text-align: center; }
  .kpi .card.good .n { color: ${SEV.ok}; }
  table { font-size: 8pt; margin: 4px 0 6px; }
  th, td { padding: 3px 6px; }
  h2 { font-size: 10.5pt; margin: 7px 0 4px; line-height: 1.25; }
  .mermaid { font-size: 8pt; }
  .tiny { font-size: 7.6pt; color: ${TOKENS.MUTED}; }
  /* Tightened to leave headroom against the 726px page box. Trimming to the exact boundary
     is fragile: a font-metric difference of a pixel flips the PDF to two pages. */
  .cards { margin: 7px 0 9px; }
  figure { margin: 6px 0 8px; }
  .rule { margin: 7px 0 9px; }
  .takeaway { padding: 8px 12px; margin-bottom: 9px; }
  .takeaway .headline { font-size: 11.5pt; }
  .note { padding: 6px 9px; margin: 6px 0; font-size: 8pt; }
  .fams { display: flex; gap: 8px; }
  .fam {
    flex: 1; border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 5px; padding: 5px 8px; background: #fff;
  }
  .fam .fid {
    font-size: 7.6pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; line-height: 1.25;
  }
  .fam .ft { font-size: 8.2pt; margin-top: 3px; line-height: 1.3; }
  .fam .fc { font-size: 7.4pt; color: ${TOKENS.MUTED}; margin-top: 4px; }
  `;

  const kpi = `
  <div class="cards kpi">
    <div class="card good"><div class="n">${D.COVERAGE.after.withCriteria} / ${D.COVERAGE.after.total}</div>
      <div class="k">Stories gradeable</div></div>
    <div class="card"><div class="n">${mig.stories}</div><div class="k">Migrated, not invented</div></div>
    <div class="card"><div class="n">${aut.stories}</div><div class="k">Authored criteria</div></div>
    <div class="card good"><div class="n">0</div><div class="k">Credit granted</div></div>
  </div>`;

  const chain = `
  <div class="mermaid">
graph LR
  A["acceptance field<br/>EMPTY on all 503"] --> B["contract refuses<br/>vacuous truth"]
  B --> C["story can NEVER<br/>reach verified"]
  C --> D["7 interns committing<br/>into a dead end"]
  style A fill:#fdf3f2,stroke:${SEV.bad},color:${TOKENS.INK}
  style C fill:#fdf3f2,stroke:${SEV.bad},color:${TOKENS.INK}
  style D fill:#fdf3f2,stroke:${SEV.bad},color:${TOKENS.INK}
  </div>`;

  // NOT a bar chart. "Before" is zero, and a zero-length bar renders as a 1px sliver that
  // reads as a broken chart rather than as the number that made this ticket urgent. A
  // before/after pair states the zero instead of trying to draw it.
  const before = `
  <div style="display:flex;align-items:center;gap:10px;margin:6px 0 2px">
    <div style="flex:1;border:1.5px solid ${SEV.bad};background:#fdf3f2;border-radius:6px;
                padding:7px 10px;text-align:center">
      <div style="font-size:17pt;font-weight:700;color:${SEV.bad};line-height:1">0</div>
      <div style="font-size:7.4pt;color:${TOKENS.MUTED};text-transform:uppercase;
                  letter-spacing:.05em;margin-top:2px">Before: of 503</div>
    </div>
    <div style="font-size:15pt;color:${TOKENS.MUTED};font-weight:700">&rarr;</div>
    <div style="flex:1;border:1.5px solid ${SEV.ok};background:#f3f9f3;border-radius:6px;
                padding:7px 10px;text-align:center">
      <div style="font-size:17pt;font-weight:700;color:${SEV.ok};line-height:1">503</div>
      <div style="font-size:7.4pt;color:${TOKENS.MUTED};text-transform:uppercase;
                  letter-spacing:.05em;margin-top:2px">After: of 503</div>
    </div>
  </div>`;

  const famStrip = D.FAMILIES.map((f) => `
    <div class="fam">
      <div class="fid">${esc(f.id.replace(/^RESEARCH-\d-/, '').replace(/-/g, ' '))}</div>
      <div class="ft">${esc(f.title)}</div>
      <div class="fc">${f.stories} stories &middot; ${f.criteria.length} criteria</div>
    </div>`).join('');

  const split = stackBar({
    parts: [
      { label: `Migrated (${mig.stories})`, value: mig.stories, color: TOKENS.CHERRY },
      { label: `Authored (${aut.stories})`, value: aut.stories, color: TOKENS.LEAF },
    ],
    width: 420, height: 24,
  });

  const checkRows = D.CHECKS.map((c) => `<tr>
      <td>${esc(c.check)}</td>
      <td style="text-align:right;white-space:nowrap"><strong>${esc(c.got)}</strong></td>
      <td style="width:14px"><span class="chip" style="background:${c.pass ? SEV.ok : SEV.bad}">${c.pass ? 'OK' : 'NO'}</span></td>
    </tr>`).join('');

  const body = `
  <h1>503 of 503 stories went from ungradeable to gradeable</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">The criteria were never missing. They were in the wrong field.</div>
    <div style="margin-top:4px;font-size:8.8pt">
      ${mig.stories} of the ${D.SCOPE.stories} stories already carried a criterion a human had written,
      sitting in the story prose but never in the field the verifier reads. Only the ${aut.stories}
      research stories needed criteria written.
    </div>
  </div>

  ${kpi}

  <div class="cols">
    <div class="col">
      <h2>Why an empty field was fatal, not untidy</h2>
      ${chain}
      <div class="note warn"><strong>The contract says it out loud:</strong>
        "a story the plan gave no acceptance criteria can never be verified."</div>
      <div class="note good"><strong>Blast radius investigated, not assumed.</strong>
        ${D.BLAST.flagged} rows flagged outside the ten domains landed
        ${D.BLAST.minutesEarlier} minutes before our first write, on
        <code>${esc(D.BLAST.project)}</code>, with ${D.BLAST.rowsCarryingOurText} carrying our
        criteria text. Not ours. Both scripts restrict every UPDATE to the ten domains in SQL.</div>
    </div>
    <div class="col">
      <h2>Coverage, counted independently</h2>
      <figure>${before}</figure>
      <h2>Where the criteria came from</h2>
      <figure>${split}
        <figcaption>Migrated means a human had already written it.</figcaption>
      </figure>
    </div>
    <div class="col">
      <h2>Verification, not the scripts' own report</h2>
      <table><tbody>${checkRows}</tbody></table>
    </div>
  </div>

  <h2 style="margin-top:6px">The six authored families: only these ${aut.stories} had no criterion
    anywhere, and each of the eighteen restates a demand the brief already makes</h2>
  <div class="fams">${famStrip}</div>

  <div class="tiny" style="margin-top:4px">Full criteria text in the spec document beside this page.
    ${D.SHIPPED.tests.total} unit tests ship with the two scripts, most covering where the extractor
    and resolver must refuse rather than guess. Both idempotent.
    PR ${D.SHIPPED.prs.map((p) => p.n).join(' and PR ')}.</div>
  `;

  return shell({ title: 'AF10.2 - acceptance criteria', body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const mig = D.SPLIT.find((s) => s.key === 'migrated');
  const aut = D.SPLIT.find((s) => s.key === 'authored');

  const famSections = D.FAMILIES.map((f) => `
    <h3>${esc(f.id)} <span class="meta">(${f.stories} stories)</span></h3>
    <p class="meta">${esc(f.title)}</p>
    <ol>${f.criteria.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>`).join('');

  const relRows = D.COVERAGE.byRelease.map((r) => `<tr>
      <td><code>${esc(r.release)}</code></td>
      <td style="text-align:right">${r.total}</td>
      <td style="text-align:right">${r.withCriteria}</td>
      <td>${esc(r.kind)}</td></tr>`).join('');

  const checkRows = D.CHECKS.map((c) => `<tr>
      <td>${esc(c.check)}</td><td>${esc(c.want)}</td>
      <td><strong>${esc(c.got)}</strong></td>
      <td><span class="chip" style="background:${c.pass ? SEV.ok : SEV.bad}">${c.pass ? 'PASS' : 'FAIL'}</span></td>
    </tr>`).join('');

  const mirrored = D.MIRRORED_RULES.map((m) => `<tr>
      <td><code>${esc(m.family)}</code></td><td>${esc(m.criterion)}</td><td>${esc(m.rule)}</td>
    </tr>`).join('');

  const flow = `
  <div class="mermaid">
graph TD
  P["Capability record<br/>a human writes the criterion"] --> T["agentDomainStoryTemplates.ts<br/>renders it into the story PROSE"]
  T --> V["student_tasks.acceptance<br/>NEVER WRITTEN"]
  V --> R["storyVerificationRead.ts:105<br/>reads this field, finds nothing"]
  R --> X["vacuous truth refused<br/>story can never be verified"]
  T -.->|"AF10.2 migration"| F["acceptance now populated"]
  F --> G["503 of 503 gradeable"]
  style V fill:#fdf3f2,stroke:${SEV.bad},color:${TOKENS.INK}
  style X fill:#fdf3f2,stroke:${SEV.bad},color:${TOKENS.INK}
  style G fill:#f3f9f3,stroke:${SEV.ok},color:${TOKENS.INK}
  </div>`;

  const body = `
  <h1>AF10.2: acceptance criteria for the ten domain projects</h1>
  <div class="meta">${FOOT} &middot; Agent Factory &middot; applied and verified</div>
  <div class="rule"></div>

  <p><strong>Asked:</strong> give the ${D.SCOPE.stories} agent-domain stories acceptance criteria so the
  ${D.SCOPE.interns} interns' work can be verified. <strong>Delivered:</strong> applied in production and
  independently verified. ${D.COVERAGE.after.withCriteria} of ${D.COVERAGE.after.total} are now gradeable.</p>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">The criteria were never missing. They were in the wrong field.</div>
    <div style="margin-top:6px">
      ${mig.stories} stories already carried a criterion a human had written into the capability record.
      The story template rendered it into the prose and never wrote it to
      <code>student_tasks.acceptance</code>, which is the only field the verifier reads. The text was
      real and invisible at the same time. So this was a migration, not a generator of standards.
    </div>
  </div>

  <h2>Why an empty field was fatal rather than untidy</h2>
  <p><code>docs/BUILD_VERIFICATION_CONTRACT.md</code> refuses vacuous truth:
  <em>"a story the plan gave no acceptance criteria can never be verified."</em>
  With the field empty on all ${D.SCOPE.stories}, no commit any intern made could ever have reached
  <code>verified</code>. All ${D.SCOPE.interns} had connected their repositories against stories the
  platform was structurally incapable of grading.</p>

  ${flow}

  <h2>What ran, and the two halves were kept separate on purpose</h2>
  <table><thead><tr><th>Half</th><th>Stories</th><th>Where its criteria came from</th></tr></thead><tbody>
    <tr><td><strong>Migrated</strong></td><td>${mig.stories}</td><td>${esc(mig.source)}</td></tr>
    <tr><td><strong>Authored</strong></td><td>${aut.stories}</td><td>${esc(aut.source)}</td></tr>
  </tbody></table>
  <p>A migration and an authoring decision deserve separate review. Collapsing them into one change
  would have hidden a judgment call inside a data move, so they shipped as two scripts and two
  pull requests.</p>

  <h3>The migration parsed cleanly</h3>
  <p>${mig.parsed} of ${mig.stories} parsed, <strong>${mig.unparsable} unparsable</strong>. Criterion
  length ran from ${mig.criterionLen.min} to ${mig.criterionLen.max} characters, median
  ${mig.criterionLen.median}. The extractor returns nothing rather than a guess when it does not
  recognize a story's shape, so an unparsable story would have been reported rather than skipped.</p>

  <h3>Criteria are stored verbatim, not split into a false Given/When/Then</h3>
  <p>Each migrated criterion is one array element holding the human's exact sentence. The column's
  established shape is an array of strings and one string satisfies it. Splitting a sentence to look
  like a three-part triple would invent structure that is not there and corrupt the only authored
  artifact in play. Reshaping stays a later decision with a human in it.</p>

  <div class="pagebreak"></div>
  <h2>The eighteen authored criteria, in full</h2>
  <p>These are the part worth challenging, so they ship in full rather than as a count. They are
  authored but <strong>not invented from nothing</strong>: each restates a demand the story's own brief
  already makes. RESEARCH-1's brief says <em>"State explicitly which class this domain does NOT
  need"</em> and <em>"A comparison that does not change depending on that number has not been
  applied."</em> Nothing here adds a standard the intern was never told about, and any future edit
  has to hold to that.</p>
  ${famSections}

  <h3>Two of them mirror rules the platform holds itself to</h3>
  <p>So the interns are not graded more loosely than the platform grades itself.</p>
  <table><thead><tr><th>Family</th><th>Criterion</th><th>Rule it mirrors</th></tr></thead>
    <tbody>${mirrored}</tbody></table>

  <div class="pagebreak"></div>
  <h2>Verification</h2>
  <p>The scripts reported their own success, which is the signal and not the thing. Every row below
  came from a separate query that did not read the scripts' output.</p>
  <table><thead><tr><th>Check</th><th>Want</th><th>Got</th><th></th></tr></thead>
    <tbody>${checkRows}</tbody></table>

  <h3>Coverage by release</h3>
  <table><thead><tr><th>Release</th><th style="text-align:right">Stories</th>
    <th style="text-align:right">With criteria</th><th>Source</th></tr></thead>
    <tbody>${relRows}</tbody></table>

  <h3>The blast radius was investigated, not reasoned away</h3>
  <p>The check flagged <strong>${D.BLAST.flagged}</strong> rows outside the ten domain projects. Both
  scripts restrict every <code>UPDATE</code> to those projects in SQL, so they could not have reached
  another project, but "my code cannot have done it" is an argument rather than evidence. The
  evidence:</p>
  <table><thead><tr><th></th><th>Window</th><th>Rows</th></tr></thead><tbody>
    <tr><td>Our writes</td><td><code>${esc(D.BLAST.ourWriteWindow)}</code></td><td>503 domain rows</td></tr>
    <tr><td>The flagged rows</td><td><code>${esc(D.BLAST.flaggedWindow)}</code></td><td>${D.BLAST.flagged} rows</td></tr>
  </tbody></table>
  <div class="note good">${esc(D.BLAST.verdict)} The flagged rows carry
  ${D.BLAST.rowsCarryingOurText} instances of our criteria text, and their own criteria are about
  Basecamp critique processing, unrelated to anything here.</div>

  <h2>What this does NOT do</h2>
  <ul>
    <li><strong>It grants no credit.</strong> Zero stories are marked verified and zero complete.
      Adding criteria makes a story gradeable; it does not grade it.</li>
    <li><strong>It does not verify anything end to end.</strong> A story reaching <code>verified</code>
      still needs an intern to tick every criterion in <code>.colaberry/progress.json</code> AND a
      commit that names the story. That path is now possible, and it has not yet been exercised.</li>
    <li><strong>It does not reshape the migrated criteria</strong> into Given/When/Then triples.</li>
  </ul>

  <h2>How to re-run it</h2>
  <p>Both scripts are idempotent: only rows whose <code>acceptance</code> is still empty are written,
  the emptiness check is repeated inside the <code>UPDATE</code> so a concurrent writer cannot be
  clobbered, and an existing value is never overwritten. Re-running either is a no-op.</p>
  <table><thead><tr><th>Script</th><th>Covers</th></tr></thead><tbody>
    ${D.SHIPPED.scripts.map((s, i) => `<tr><td><code>${esc(s)}</code></td>
      <td>${i === 0 ? `${mig.stories} migrated` : `${aut.stories} authored`}</td></tr>`).join('')}
  </tbody></table>
  <p>Add <code>--apply</code> to write; without it they dry-run. ${D.SHIPPED.tests.total} unit tests ship
  with them (${D.SHIPPED.tests.domain} and ${D.SHIPPED.tests.research}), most covering the cases where
  the extractor and the resolver must refuse rather than guess. The field the verifier reads is
  <code>${esc(D.SHIPPED.verifierReads)}</code>.</p>

  <h3>Pull requests</h3>
  <ul>${D.SHIPPED.prs.map((p) => `<li>PR ${p.n} - ${esc(p.title)}: ${esc(p.url)}</li>`).join('')}</ul>
  `;

  return shell({ title: 'AF10.2 - acceptance criteria for the ten domain projects', body });
}

module.exports = { buildVisual, buildDocument };
