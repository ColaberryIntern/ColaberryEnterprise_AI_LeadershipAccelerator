/**
 * AF4.5's one-page visual and its spec document.
 *
 * The visual leads with the mechanical consequence of Ali's EXTRACT ruling rather than with the
 * audit result, because the ruling is what redesigned the whole push path: an intern cannot open
 * a pull request here at all, so the change has to travel as a patch something else applies. A
 * reader who takes one thing from the page should take that.
 *
 * The audit verdict is second, and the one thing the page does NOT do is present it as a green
 * row. An absence is indistinguishable from a broken detector, so the page says what the control
 * caught, which is the only reason the verdict is worth anything.
 */
const D = require('./af45Data');
const { TOKENS, SEV, esc, baseCss } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; merged ${D.MERGED_ON} in PRs `
  + `#${D.PHASE1_PR} and #${D.PHASE2_PR}, revised ${D.REVISED_ON} &middot; own repo, no fork, `
  + 'no write access, and a refusal a reviewer cannot approve past';

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const metCount = D.CRITERIA.filter((c) => c.met).length;

/*
 * Three proof verdicts, not two, so neither renderer may color by "is it REFUSED".
 *
 * REFUSED is the policy declining a path. NO APPLY is the policy allowing it and the
 * rehearsal declining it afterwards -- a different control firing, and worth its own
 * color. The previous `v === 'REFUSED' ? bad : ok` would have painted NO APPLY green,
 * which is the one reading of that row that is not true.
 */
function verdictColor(v) {
  if (v === 'REFUSED') return SEV.bad;
  if (v === 'ALLOWED') return SEV.ok;
  return SEV.watch;
}
function verdictClass(v) {
  if (v === 'REFUSED') return 'no';
  if (v === 'ALLOWED') return 'yes';
  return 'watch';
}

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  const css = `
  body { font-size: 9.1pt; }
  h1 { font-size: 15pt; }
  h2 { font-size: 9.5pt; margin: 3px 0 2px; border-bottom-width: 1px; padding-bottom: 2px; }
  .cols { display: flex; gap: 10px; align-items: stretch; }
  .col { flex: 1; }
  .cards { margin: 3px 0 4px; gap: 8px; }
  .card { padding: 6px 9px; text-align: center; }
  .card .n { font-size: 16pt; }
  .card .k { font-size: 7.1pt; }
  .card.good .n { color: ${SEV.ok}; }
  .card.bad .n { color: ${SEV.bad}; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 5px; }
  .takeaway .headline { font-size: 11pt; }
  .mermaid { font-size: 7pt; }
  .tiny { font-size: 7.4pt; color: ${TOKENS.MUTED}; }
  .panel {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 5px; padding: 6px 9px; background: #fff;
  }
  .panel.warn { border-top-color: ${SEV.bad}; }
  .panel .hd {
    font-size: 7.4pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px;
  }
  .panel .bd { font-size: 7.6pt; line-height: 1.34; }
  .pr {
    display: flex; gap: 7px; font-size: 7.5pt; line-height: 1.3; padding: 2px 0;
    border-bottom: 1px solid ${TOKENS.BORDER}; align-items: baseline;
  }
  .pr .v { flex: 0 0 52px; font-weight: 700; }
  .pr .v.no { color: ${SEV.bad}; }
  .pr .v.yes { color: ${SEV.ok}; }
  .pr .v.watch { color: ${SEV.watch}; }
  .pr .s { flex: 1.15; font-family: Consolas, monospace; font-size: 7.2pt; }
  .pr .r { flex: 1.4; color: ${TOKENS.MUTED}; }
  /*
   * Stays at 2 columns. Three was tried and made the block TALLER (77px -> 85px),
   * because narrower columns wrap each gloss onto more lines than the extra column saves.
   *
   * The eleventh refusal class added a sixth row and 16px. Line-height is the lever that
   * pays it back: these are single-line reference entries, so tightening leading costs
   * nothing a reader notices, where shrinking the font would.
   */
  .cls {
    columns: 2; column-gap: 12px; font-size: 7.4pt; line-height: 1.15; margin-top: 2px;
  }
  .cls div { break-inside: avoid; padding: 0.5px 0; }
  .cls code { font-size: 7.1pt; padding: 0 2px; }
  `;

  const kpi = `
  <div class="cards">
    <div class="card good"><div class="n">${D.AUDIT.disclosures}</div>
      <div class="k">Confirmed disclosures in ${D.AUDIT.repos} public repos</div></div>
    <div class="card bad"><div class="n">0</div>
      <div class="k">Pull requests an intern can open here</div></div>
    <div class="card"><div class="n">${D.REFUSALS.length}</div>
      <div class="k">Named refusals, none approvable</div></div>
    <div class="card"><div class="n">${metCount} / ${D.CRITERIA.length}</div>
      <div class="k">Acceptance criteria met</div></div>
  </div>`;

  const flow = `
  <div class="mermaid">
  graph LR
    A["intern builds in<br/>their OWN public repo"] --> B["submits a commit:<br/>no shared history, no PR"]
    B --> C{"refusal policy:<br/>${D.REFUSALS.length} named classes"}
    C -->|"workflow, infra,<br/>secret gate, governance"| X["REFUSED<br/>before a human sees it"]
    C -->|"clean"| D["patch scanned, applied in a<br/>throwaway worktree, pushed"]
    D --> E["PR opened by CODE,<br/>never by the intern"]
    E --> F["6 checks + a human<br/>who is not the author"]
  </div>`;

  const proof = D.PROOF.map(([v, src, why]) => `
    <div class="pr">
      <span class="v ${verdictClass(v)}">${esc(v)}</span>
      <span class="s">${esc(src)}</span>
      <span class="r">${esc(why)}</span>
    </div>`).join('');

  const classes = D.REFUSALS.map(([n, what]) => `
    <div><code>${esc(n)}</code> ${esc(what)}</div>`).join('');

  const body = `
  <h1>An intern develops in their own public repo, and cannot push, approve or reach this one.</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">Extract rather than fork means an intern cannot open a pull request here
    at all, so the write access had to move into reviewable code.</div>
    <div>A GitHub pull request requires shared commit history, the same fork network. Every intern
    repository is a standalone project with unrelated history. <strong>That is not a limitation to
    work around, it is the safer shape</strong>: the thing holding write access is version-controlled
    code that cannot be persuaded, not a person's credential.</div>
  </div>

  ${kpi}
  ${flow}

  <div class="cols">
    <div class="col panel">
      <div class="hd">The audit, and why the verdict is worth something</div>
      <div class="bd"><strong>${D.AUDIT.clean} clean, ${D.AUDIT.withFindings} with findings,
      ${D.AUDIT.unscanned} unscanned, ${D.AUDIT.disclosures} confirmed disclosures</strong>, over
      every commit on every ref, because a deleted secret survives in the blob. All
      ${D.AUDIT.findings} findings triaged by reading the code: security-test fixtures and one
      documented publishable key. Nobody has leaked a credential.</div>
      <div class="bd" style="margin-top:4px"><strong>An absence is indistinguishable from a broken
      detector</strong>, so the scanner is pointed at ${D.CONTROL.fixtures} planted secrets first
      and the audit refuses to run if it misses one.</div>
    </div>
    <div class="col panel warn">
      <div class="hd">What that control caught, that a green report would have hidden</div>
      <div class="bd"><strong>1.</strong> The config written to be stricter was strictly
      <strong>weaker</strong>. It found more in 0 of 11 repos and missed a real rule hit. The first
      run reported <strong>"9 clean" where the truth was 8</strong>.</div>
      <div class="bd"><strong>2.</strong> The OpenAI rule was never exercised: it needs the literal
      marker <code>T3BlbkFJ</code>, so the fixture was not an OpenAI key.</div>
      <div class="bd"><strong>3.</strong> A fixture edited to "look more realistic" broke detection
      and read as a broken scanner. The control is itself load-bearing.</div>
    </div>
    <div class="col panel">
      <div class="hd">Why <code>.github/</code> is refused in full, not per key</div>
      <div class="bd">A workflow runs with this repository's secrets, so a change there is
      <strong>arbitrary code execution with credentials</strong>, not a code change. A reviewer is
      good at "is this code correct" and bad at "does this one line exfiltrate every secret we
      hold", because that diff looks small and boring.</div>
      <div class="bd" style="margin-top:4px">Refusing the directory is the only version of the rule
      that <strong>cannot be worked around</strong>, and a refusal cannot be approved past.</div>
    </div>
  </div>

  <h2>Three outcomes, proven against real intern commits, not fixtures</h2>
  ${proof}

  <h2>The ${D.REFUSALS.length} refusal classes</h2>
  <div class="cls">${classes}</div>
  <div class="tiny" style="margin-top:3px"><strong>Criterion 3 is NOT met and cannot be met as
  written:</strong> no intern commit is importable, because not one of them is a change to this
  codebase. The gaps and the survey behind that are in the spec document beside this page.</div>`;

  return shell({ title: `${D.TICKET} one-page visual`, body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const css = `
  h2 { margin-top: 18px; }
  td.p { font-family: Consolas, monospace; font-size: 8.2pt; }
  ul { margin: 4px 0 0 18px; padding: 0; }
  li { margin: 5px 0; }
  ol { margin: 4px 0 0 18px; padding: 0; }
  `;

  const accessRows = D.ACCESS.map(([k, v]) => `
    <tr><td>${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('');

  const repoRows = D.REPOS.map(([a, dom, who, repo]) => `
    <tr><td>${esc(a)}</td><td>${esc(dom)}</td><td>${esc(who)}</td>
    <td class="p">${esc(repo)}</td></tr>`).join('');

  const triageRows = D.TRIAGE.map((t) => `
    <tr>
      <td class="p">${esc(t.repo)}</td>
      <td>${esc(t.finding)}</td>
      <td><strong>${esc(t.verdict)}.</strong> ${esc(t.why)}</td>
    </tr>`).join('');

  const caught = D.CONTROL.caught.map((c) => `
    <li><strong>${esc(c.defect)}</strong><div class="meta">${esc(c.detail)}</div></li>`).join('');

  const refusalRows = D.REFUSALS.map(([n, what]) => `
    <tr><td class="p">${esc(n)}</td><td>${esc(what)}</td></tr>`).join('');

  const proofRows = D.PROOF.map(([v, src, why]) => `
    <tr>
      <td><span class="chip" style="background:${verdictColor(v)}">${esc(v)}</span></td>
      <td class="p">${esc(src)}</td><td>${esc(why)}</td>
    </tr>`).join('');

  const safetyRows = D.SAFETY.map(([k, v]) => `
    <tr><td><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`).join('');

  const criteriaRows = D.CRITERIA.map((c) => `
    <tr>
      <td style="width:18px">${c.n}</td>
      <td>${esc(c.text)}<div class="meta">${esc(c.evidence)}</div></td>
      <td style="width:60px"><span class="chip"
        style="background:${c.met ? SEV.ok : SEV.watch}">${c.met ? 'MET' : 'OPEN'}</span></td>
    </tr>`).join('');

  const body = `
  <h1>${D.TICKET}: the intern repo as a dev environment, with a gated path to this one</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">Four of the five criteria are met. The fifth needs one outward-facing
    run, which is yours to authorize.</div>
    <div>An intern develops in their own public repository, holds no write access here, and gets a
    change in only through a review they cannot perform. The contract, the audit of all eleven
    repositories, the refusal policy and the importer all exist and are verified. What has not
    happened is a change traveling the path end to end, because that run opens a real pull request
    here attributed to an intern.</div>
  </div>

  <h2>Ali's extract ruling is what shaped this, and it is not a concession</h2>
  <p><strong>${esc(D.HEADLINE.ruling)}</strong></p>
  <p>${esc(D.HEADLINE.consequence)}</p>
  <p>${esc(D.HEADLINE.whyBetter)}</p>
  <p>${esc(D.HEADLINE.bonus)}</p>

  <h2>Access, read from the settings rather than from intent</h2>
  <table>
    <thead><tr><th>Fact</th><th>Value on ${D.AUDIT_ON}</th></tr></thead>
    <tbody>${accessRows}</tbody>
  </table>

  <h2>The eleven repositories, and the seven agent builds among them</h2>
  <table>
    <thead><tr><th>Agent</th><th>Domain</th><th>Intern</th><th>Repository</th></tr></thead>
    <tbody>${repoRows}</tbody>
  </table>

  <h2>The audit verdict</h2>
  <div class="note good"><strong>${D.AUDIT.clean} clean &middot;
  ${D.AUDIT.withFindings} with findings &middot; ${D.AUDIT.unscanned} unscanned &middot;
  ${D.AUDIT.disclosures} confirmed disclosures.</strong> Nobody has leaked a credential. All three
  repositories with findings belong to the same intern, and all three findings are a consequence of
  writing security tests, which is the opposite of the problem this audit looks for.</div>
  <p>${esc(D.AUDIT.method)}</p>
  <p>${esc(D.AUDIT.verdictRule)}</p>
  <table>
    <thead><tr><th>Repository</th><th>Findings</th><th>Verdict, from reading the code</th></tr></thead>
    <tbody>${triageRows}</tbody>
  </table>
  <p>Two things this result does <strong>not</strong> say. It does not say the repositories are
  clean today in any lasting sense: it is a measurement of ${D.AUDIT_ON}, and nothing currently
  stops a secret landing tomorrow. And it does not cover the other 43 connected repositories.</p>

  <h2>The control, and the three defects it caught</h2>
  <p>A verdict that is an <strong>absence</strong> is indistinguishable from a broken detector, so
  the scanner is pointed at ${D.CONTROL.fixtures} planted secrets covering ${esc(D.CONTROL.classes)}
  before it is pointed at anybody's repository. ${esc(D.CONTROL.refuses)}</p>
  <p>It earned that place three times during this build. Each of these would otherwise have shipped
  as a green report:</p>
  <ol>${caught}</ol>

  <h2>A premise I stated that turned out to be false</h2>
  <div class="note warn">
    <p><strong>Claimed:</strong> ${esc(D.CORRECTION.claimed)}</p>
    <p><strong>Measured:</strong> ${esc(D.CORRECTION.truth)}</p>
    <p>${esc(D.CORRECTION.consequence)}</p>
  </div>

  <h2>The parser defect, and the design property that surfaced it</h2>
  <p>${esc(D.PARSER.defect)}</p>
  <p>${esc(D.PARSER.fix)}</p>
  <p><strong>${esc(D.PARSER.why)}</strong></p>

  <h2>The ${D.REFUSALS.length} refusal classes</h2>
  <table>
    <thead><tr><th>Rule</th><th>What it refuses</th></tr></thead>
    <tbody>${refusalRows}</tbody>
  </table>
  <p>${esc(D.GITHUB_RULE)}</p>
  <p>Every matching rule is reported together with its offending paths, so a rejected change costs
  an intern <strong>one round trip rather than one per problem</strong>.</p>

  <h2>Both outcomes verified against real intern commits</h2>
  <table>
    <thead><tr><th></th><th>Source commit</th><th>Why</th></tr></thead>
    <tbody>${proofRows}</tbody>
  </table>
  <p>Two different controls fire in that table. <strong>REFUSED</strong> is the policy declining a
  path before anything is fetched. <strong>NO APPLY</strong> is the policy allowing the paths and
  the rehearsal declining the patch afterwards, which is the check that did not exist until
  2026-11-01. The allow case that proves the policy is not simply refusing everything lives in the
  test suite, where every refusal test is paired with an ALLOW case on a neighboring path, and the
  newest rule is mutation-tested in both directions.</p>

  <h2>The importer's safety properties</h2>
  <table>
    <thead><tr><th>Property</th><th>How</th></tr></thead>
    <tbody>${safetyRows}</tbody>
  </table>

  <h2>The five acceptance criteria</h2>
  <table>
    <thead><tr><th></th><th>Criterion and evidence</th><th></th></tr></thead>
    <tbody>${criteriaRows}</tbody>
  </table>

  <h2>Known gaps, stated rather than smoothed over</h2>
  <ul>${D.GAPS.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>

  <h2>Verification</h2>
  <p><strong>${D.VERIFICATION.tests} jest tests green</strong> across three suites:
  ${esc(D.VERIFICATION.suites)}. ${esc(D.VERIFICATION.pairing)}</p>
  <p>${esc(D.VERIFICATION.mutation)}</p>
  <p>${esc(D.VERIFICATION.secretScan)}. ${esc(D.VERIFICATION.spelling)}.
  ${esc(D.VERIFICATION.individual)}.</p>
  <p><strong>Not run and not claimed:</strong> ${esc(D.VERIFICATION.notClaimed)}</p>`;

  return shell({ title: `${D.TICKET} specification`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
