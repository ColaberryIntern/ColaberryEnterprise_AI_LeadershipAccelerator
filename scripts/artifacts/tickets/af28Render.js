/**
 * AF2.8 renderers: the one-page visual and the spec document.
 *
 * Both read `af28Data.js` and nothing else, so a figure on the page cannot drift from a number
 * in the prose.
 *
 * The visual leads with the finding that reorders everything: the symptom an intern could SEE
 * was the least important of the four. A severity-ordered list next to a "who reported it"
 * column says that in one glance, which a paragraph cannot.
 */
const D = require('./af28Data');
const { TOKENS, SEV, esc, baseCss } = require('../artifactTheme');

const FOOT = `AF2.8 &middot; Agent Factory &middot; measured in production ${D.MEASURED_ON}`;
const kb = (n) => `${Math.round(n / 1024)} KB`;

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  const css = `
  body { font-size: 12.6pt; }
  h1 { font-size: 18pt; }
  h2 { font-size: 12pt; margin: 8px 0 5px; line-height: 1.25; }
  .cols { display: flex; gap: 13px; align-items: flex-start; }
  .col { flex: 1; }
  .cards { margin: 7px 0 9px; }
  .card .n { font-size: 17pt; }
  .kpi .card { text-align: center; }
  .kpi .card.good .n { color: ${SEV.ok}; }
  .rule { margin: 7px 0 9px; }
  .takeaway { padding: 8px 12px; margin-bottom: 9px; }
  .takeaway .headline { font-size: 11.5pt; }
  table { font-size: 10.2pt; margin: 5px 0 7px; }
  th, td { padding: 3px 6px; }
  .note { padding: 7px 10px; margin: 7px 0; font-size: 9.2pt; }
  figure { margin: 6px 0 8px; }
  .tiny { font-size: 7.6pt; color: ${TOKENS.MUTED}; }
  .sev { width: 14px; text-align: center; font-weight: 700; color: #fff; border-radius: 3px; }
  `;

  const symptomRows = D.SYMPTOMS.map((s) => `<tr>
      <td><span class="chip" style="background:${s.rank === 1 ? SEV.bad : s.rank === 2 ? SEV.watch : TOKENS.MUTED}">${s.rank}</span></td>
      <td><strong>${esc(s.what)}</strong></td>
      <td>${s.reported ? '<strong>reported by an intern</strong>' : esc(s.foundBy)}</td>
    </tr>`).join('');

  const dlRows = D.DOWNLOAD.map((d) => `<tr>
      <td>${esc(d.domain)}</td>
      <td style="text-align:right">${d.files}</td>
      <td style="text-align:right">${kb(d.bytes)}</td>
      <td><span class="chip" style="background:${SEV.ok}">works</span></td>
    </tr>`).join('');


  const body = `
  <h1>One absent row broke four things, and the one an intern could see was the least important</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">The reported symptom was ranked fourth by severity and first by visibility.</div>
    <div style="margin-top:4px;font-size:8.8pt">
      Two interns reported that documents would not download. The same missing row also meant
      <strong>no intern commit could ever be verified</strong>, for any of the 503 stories. Nobody
      reported that, because there is nothing to see: a grading loop that never runs looks
      identical to one with no work in it yet.
    </div>
  </div>

  <div class="cards kpi">
    <div class="card good"><div class="n">10 / 10</div><div class="k">Projects with a plan</div></div>
    <div class="card good"><div class="n">48</div><div class="k">Criteria the verifier now reads</div></div>
    <div class="card good"><div class="n">0</div><div class="k">Story rows rewritten</div></div>
    <div class="card"><div class="n">${D.SHIPPED.tests.total}</div><div class="k">Tests shipped</div></div>
  </div>

  <div class="cols">
    <div class="col">
      <h2>What the one row broke</h2>
      <table><tbody>${symptomRows}</tbody></table>
      <div class="note warn"><strong>Ranked by severity, not by who noticed.</strong>
        Rank 1 was found while fixing rank 2. Nobody could have reported it: a grading loop that
        never runs looks exactly like one with no work in it yet.</div>
    </div>
    <div class="col">
      <h2>The verifier, before and after</h2>
      <table><tbody>
        <tr><td>getPublishedPlan</td><td><code>${esc(D.VERIFIER.before.getPublishedPlan)}</code></td>
            <td><strong>${esc(D.VERIFIER.after.getPublishedPlan)}</strong></td></tr>
        <tr><td>Stories it reads</td><td>0</td><td><strong>${D.VERIFIER.after.storiesInPlan}</strong></td></tr>
        <tr><td>Specs built</td><td>0</td><td><strong>${D.VERIFIER.after.specs}</strong></td></tr>
        <tr><td>Criteria reached</td><td>0</td><td><strong>${D.VERIFIER.after.criteria}</strong></td></tr>
        <tr><td>STORY-000</td><td>absent</td><td><strong>present, 5 criteria</strong></td></tr>
      </tbody></table>
      <div class="note good"><strong>STORY-000 fixed itself.</strong> <code>planStorySpecs</code>
        appends the Command Center story when a plan lacks one, so a problem tracked separately
        dissolved as a side effect. Predicted before applying, confirmed after.</div>
    </div>
    <div class="col">
      <h2>The download, which is this ticket's acceptance</h2>
      <table><thead><tr><th>Domain</th><th style="text-align:right">Files</th>
        <th style="text-align:right">Size</th><th></th></tr></thead>
        <tbody>${dlRows}</tbody></table>
      <div class="note good"><strong>Run, not inferred.</strong> The real service the button calls,
        for two real projects. Each bundle carries <code>docs/REQUIREMENTS.md</code>, a file per
        story including all five research stories, <code>STORY-000.md</code>, and the
        <code>.colaberry/</code> seeds the verifier reads.</div>
      <div class="note warn"><strong>And a correction.</strong> AF10.2 was closed on
        "${esc(D.CORRECTION.claimed)}". It was not true, and the ticket has been reopened.</div>
    </div>
  </div>

  <div class="tiny" style="margin-top:6px"><strong>Derived from the task rows, never
    re-generated.</strong> Re-running the build wizard was refused throughout: its publish path
    re-materializes every task row, and four interns have connected repositories against these
    503 stories. The runner counts story rows before and after and fails loudly if one changed;
    ${D.PLANS.storiesBefore} stories and ${D.PLANS.criteriaBefore} with criteria, unchanged.
    ${D.SHIPPED.tests.total} tests shipped. PR ${D.SHIPPED.prs.map((p) => p.n).join(' and PR ')}.</div>
  `;

  return shell({ title: 'AF2.8 - the missing build plan', body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const symptomRows = D.SYMPTOMS.map((s) => `<tr>
      <td style="text-align:center"><span class="chip" style="background:${s.rank === 1 ? SEV.bad : s.rank === 2 ? SEV.watch : TOKENS.MUTED}">${s.rank}</span></td>
      <td><strong>${esc(s.what)}</strong><br><span class="meta">${esc(s.detail)}</span></td>
      <td>${s.reported ? '<strong>an intern</strong>' : esc(s.foundBy)}</td>
    </tr>`).join('');

  const dlRows = D.DOWNLOAD.map((d) => `<tr>
      <td>${esc(d.domain)}</td><td>${esc(d.intern)}</td>
      <td><code>${esc(d.filename)}</code></td>
      <td style="text-align:right">${d.files}</td>
      <td style="text-align:right">${kb(d.bytes)}</td></tr>`).join('');

  const flow = `
  <div class="mermaid">
graph TD
  P["agentDomainProvisioner<br/>creates the project"] --> Q["stories materialized<br/>503 rows"]
  P -.->|"never ran"| R["publish path<br/>writes build_plans"]
  R -.-> S["0 rows on all ten"]
  S --> T["verifier: NoPublishedPlan"]
  S --> U["download refuses"]
  S --> V["import guard never fires"]
  S --> W["no STORY-000"]
  Q ==>|"AF2.8 derives the plan FROM these"| X["10 published plans"]
  X --> Y["all four resolved"]
  style S fill:#fdf3f2,stroke:${SEV.bad},color:${TOKENS.INK}
  style T fill:#fdf3f2,stroke:${SEV.bad},color:${TOKENS.INK}
  style Y fill:#f3f9f3,stroke:${SEV.ok},color:${TOKENS.INK}
  </div>`;

  const body = `
  <h1>AF2.8: the build plan the ten domain projects never had</h1>
  <div class="meta">${FOOT} &middot; applied and verified</div>
  <div class="rule"></div>

  <p><strong>Asked:</strong> two interns cannot download their project documents, and the portal
  tells them to finish a build wizard. <strong>Delivered:</strong> the cause found and fixed, three
  further consequences resolved with it, and the provisioner corrected so no new project can
  repeat it.</p>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">The reported symptom was ranked fourth by severity and first by visibility.</div>
    <div style="margin-top:6px">
      The missing row also meant <strong>no intern commit could ever be verified</strong>, for any
      of the 503 stories. Nobody reported that, because there is nothing to see. A grading loop
      that never runs looks exactly like one with no work in it yet, and it would have stayed
      invisible until the first intern finished a story and nothing happened.
    </div>
  </div>

  <h2>One absent row, four consequences</h2>
  <table><thead><tr><th style="width:30px">Rank</th><th>What broke</th><th style="width:150px">Found by</th></tr></thead>
    <tbody>${symptomRows}</tbody></table>

  ${flow}

  <h2>Why the plan was derived, and never re-generated</h2>
  <p><strong>${esc(D.DERIVATION.refused)}</strong></p>
  <p>${esc(D.DERIVATION.guarantee)}</p>
  <div class="note"><strong>Proved, not promised:</strong> the runner counts story rows before and
  after the write and fails loudly if one changed. Measured: ${D.PLANS.storiesBefore} stories and
  ${D.PLANS.criteriaBefore} with criteria before, ${D.PLANS.storiesAfter} and
  ${D.PLANS.criteriaAfter} after.</div>

  <h3>The plan carries no requirements, on purpose</h3>
  <p>${esc(D.DERIVATION.requirementsEmpty)}</p>

  <div class="pagebreak"></div>
  <h2>Verification, through the real code path</h2>
  <p>Ten plan rows existing is the signal. The verifier reading criteria is the thing. Exercised
  against <code>${esc(D.VERIFIER.project)}</code>:</p>
  <table><thead><tr><th></th><th>Before</th><th>After</th></tr></thead><tbody>
    <tr><td><code>getPublishedPlan</code></td><td><code>${esc(D.VERIFIER.before.getPublishedPlan)}</code>, ${esc(D.VERIFIER.before.outcome)}</td><td><strong>${esc(D.VERIFIER.after.getPublishedPlan)}</strong></td></tr>
    <tr><td>Stories in the plan</td><td>0</td><td>${D.VERIFIER.after.storiesInPlan}, all carrying acceptance</td></tr>
    <tr><td><code>planStorySpecs</code></td><td>never reached</td><td><strong>${D.VERIFIER.after.specs} specs, ${D.VERIFIER.after.criteria} criteria</strong></td></tr>
    <tr><td>STORY-000</td><td>${esc(D.VERIFIER.story000.before)}</td><td><strong>${esc(D.VERIFIER.story000.after)}</strong></td></tr>
  </tbody></table>
  <div class="note good"><strong>STORY-000 fixed itself.</strong> <code>planStorySpecs</code> appends
  the Command Center story when a plan lacks one, so a problem tracked separately dissolved as a
  side effect of the plan existing. Predicted before applying, then confirmed.</div>

  <h2>The download, which is this ticket's own acceptance</h2>
  <p>Run against the real service the button calls, for two real projects. Not inferred from the
  plans existing, which is what I almost did.</p>
  <table><thead><tr><th>Domain</th><th>Intern</th><th>Bundle</th>
    <th style="text-align:right">Files</th><th style="text-align:right">Size</th></tr></thead>
    <tbody>${dlRows}</tbody></table>
  <p>Each bundle contains:</p>
  <ul>${D.BUNDLE_CONTENTS.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul>

  <h2>Fixed at the source, so a new domain cannot regress</h2>
  <p>Production data was corrected by hand on 20 October, but the constant that produced it was
  still in the code: <code>${esc(D.SOURCE_FIX.constant)}</code>, substituted at
  ${D.SOURCE_FIX.sites} call sites for ${D.SOURCE_FIX.storiesPerProvision} stories per
  provisioned domain. ${esc(D.SOURCE_FIX.foundBy)} found that, by looking ahead at a story she had
  not started.</p>
  <div class="note"><strong>${esc(D.SOURCE_FIX.testInverted)}</strong> A test that pins behavior
  is worth as much when the behavior turns out wrong as when it is right, provided changing it
  is deliberate rather than convenient.</div>

  <h2>A correction this work forced</h2>
  <div class="note warn">
    <p>AF10.2 was closed reporting <strong>"${esc(D.CORRECTION.claimed)}"</strong>. That was wrong.</p>
    <p><strong>What was true:</strong> ${esc(D.CORRECTION.actual)}.</p>
    <p><strong>Why:</strong> ${esc(D.CORRECTION.cause)}</p>
    <p>${esc(D.CORRECTION.consequence)}</p>
  </div>

  <h2>What shipped</h2>
  <ul>
    <li><strong>${D.SHIPPED.tests.planDerivation} tests</strong> on the plan derivation, the
      load-bearing ones pinning a JS canonical-hash port to its TypeScript original.</li>
    <li><strong>${D.SHIPPED.tests.prompts} tests</strong> on the research prompts, the
      load-bearing one a negative guarantee that no story can fall back to the human-work
      statement.</li>
    <li>The full <code>agentDomain</code> suite: <strong>${D.SHIPPED.tests.agentDomainSuite} passing</strong>.</li>
  </ul>
  <ul>${D.SHIPPED.prs.map((p) => `<li>PR ${p.n} - ${esc(p.title)}</li>`).join('')}</ul>

  <h2>What this does NOT claim</h2>
  <ul>
    <li><strong>No story has been verified end to end.</strong> The loop can now run; no intern has
      yet committed work that exercises it. The first real commit is the remaining test.</li>
    <li><strong>It grants no credit.</strong> Zero stories are marked verified or complete.</li>
    <li>A separate defect, filed as AF2.9, means the portal can serve an intern a stale copy of
      their project with nothing on screen saying so. Two interns hit it while this was being
      fixed.</li>
  </ul>
  `;

  return shell({ title: 'AF2.8 - the build plan the ten domain projects never had', body });
}

module.exports = { buildVisual, buildDocument };
