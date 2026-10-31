/**
 * AF2.9's one-page visual and its spec document.
 *
 * Two things lead. The ticket's premise was wrong -- the pull never failed, the reconciler was
 * add-only -- and one acceptance criterion is NOT met. Both have to be visible on the one page a
 * reader actually opens, because an artifact that buries an unmet criterion on page three is how
 * a ticket gets closed on a partial.
 */
const D = require('./af29Data');
const { TOKENS, SEV, esc, baseCss } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; merged ${D.MERGED_ON} in PR #${D.PR} `
  + '&middot; 2 of 3 acceptance criteria met';

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const met = D.CRITERIA.filter((c) => c.met).length;

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  const css = `
  body { font-size: 9.1pt; }
  h1 { font-size: 15pt; }
  .cols { display: flex; gap: 12px; align-items: flex-start; }
  .col { flex: 1; }
  .card .n { font-size: 16pt; }
  .kpi .card { text-align: center; }
  .kpi .card.good .n { color: ${SEV.ok}; }
  .kpi .card.bad .n { color: ${SEV.bad}; }
  h2 { font-size: 9.5pt; margin: 6px 0 3px; }
  .mermaid { font-size: 7.8pt; }
  .tiny { font-size: 7.5pt; color: ${TOKENS.MUTED}; }
  .cards { margin: 6px 0 8px; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 8px; }
  .takeaway .headline { font-size: 11pt; }
  .panel {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 5px; padding: 6px 9px; background: #fff;
  }
  .panel.open { border-top-color: ${SEV.bad}; }
  .panel .hd {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px;
  }
  .panel .bd { font-size: 7.7pt; line-height: 1.35; }
  .pr { display: flex; gap: 6px; font-size: 7.5pt; padding: 2px 0;
        border-bottom: 1px solid ${TOKENS.BORDER}; }
  .pr .f { flex: none; width: 62px; font-family: Consolas, monospace; font-size: 7.1pt;
           color: ${TOKENS.CHERRY_DEEP}; }
  .pr .w { flex: none; width: 58px; color: ${TOKENS.MUTED}; }
  .pr .c { flex: 1; }
  `;

  const kpi = `
  <div class="cards kpi">
    <div class="card"><div class="n">${met} of ${D.CRITERIA.length}</div>
      <div class="k">Acceptance criteria met</div></div>
    <div class="card bad"><div class="n">3</div>
      <div class="k">Earlier incidents, same shape</div></div>
    <div class="card bad"><div class="n">3</div>
      <div class="k">Silent routes to a stale screen</div></div>
    <div class="card good"><div class="n">0</div>
      <div class="k">Fields the new control names</div></div>
  </div>`;

  const flow = `
  <div class="mermaid">
  graph LR
    A["Server authors<br/>a new prompt"] --> B{"does this device<br/>already have the story?"}
    B -->|"no"| C["adoptServerTasks<br/>adds it, correctly"]
    B -->|"yes"| D["ADD-ONLY:<br/>the card is never touched"]
    D --> E["unless someone remembered<br/>to copy that ONE field by hand"]
    E --> F["stale text on screen,<br/>clean database"]
  </div>`;

  const prior = D.PRIOR.map(([f, w, c]) => `
    <div class="pr"><span class="f">${esc(f)}</span><span class="w">${esc(w)}</span>
      <span class="c">${esc(c)}</span></div>`).join('');

  const body = `
  <h1>The pull never failed. The reconciler was add-only, and the card was never touched.</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">The ticket's premise was wrong, and that is the finding.</div>
    <div>AF2.9 asks why the pull fails for domain projects. It does not fail.
    <code>adoptServerTasks</code> was <strong>add-only by design</strong>: it hands a device the
    stories it lacks and never touches one it already has, so server-authored text reached an
    existing card only if somebody remembered to copy that one field by hand. That is why a hard
    refresh could not help Mihret and an incognito window could.</div>
  </div>

  ${kpi}
  ${flow}

  <div class="cols">
    <div class="col panel">
      <div class="hd">The same shape had already cost three incidents</div>
      ${prior}
      <div class="bd" style="margin-top:4px"><code>prompt</code>, <code>what</code> and
      <code>acceptance</code> were the fourth, fifth and sixth.</div>
    </div>
    <div class="col panel">
      <div class="hd">So the fix inverts the default</div>
      <div class="bd">${esc(D.FIX.what)}</div>
      <div class="bd" style="margin-top:4px"><strong>${esc(D.FIX.control)}</strong></div>
    </div>
    <div class="col panel open">
      <div class="hd" style="color:${SEV.bad}">Criterion 3 is NOT met</div>
      <div class="bd">"Proved against a real domain project with the pull forced to fail, NOT a
      fixture." The harness is written and committed, and it <strong>refuses to substitute a
      fixture</strong> -- a fixture is the one thing this criterion excludes. It needs a
      production participant token for a student who owns a real domain project, and it has not
      been run.</div>
    </div>
  </div>
  <div class="tiny" style="margin-top:4px">${esc(D.TEST_LESSON)}</div>`;

  return shell({ title: `${D.TICKET} one-page visual`, body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const css = `
  h2 { margin-top: 18px; }
  table { width: 100%; }
  td.p { font-family: Consolas, monospace; font-size: 8.2pt; }
  ul { margin: 4px 0 0 18px; padding: 0; }
  li { margin: 4px 0; }
  `;

  const priorRows = D.PRIOR.map(([f, w, c]) => `
    <tr><td class="p">${esc(f)}</td><td>${esc(w)}</td><td>${esc(c)}</td></tr>`).join('');

  const criteriaRows = D.CRITERIA.map((c) => `
    <tr><td style="width:18px">${c.n}</td>
    <td>${esc(c.text)}<div class="meta">${esc(c.evidence)}</div></td>
    <td style="width:76px"><span class="chip"
      style="background:${c.met ? SEV.ok : SEV.bad}">${c.met ? 'MET' : 'NOT MET'}</span></td></tr>`).join('');

  const body = `
  <h1>${D.TICKET}: a failed refresh silently served an intern a stale copy</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">Two of the three acceptance criteria are met. The third is NOT, and it
    is the one that asks for proof against production.</div>
    <div>The intern can now see that they are reading a saved copy, and recover from the page
    rather than by knowing a browser trick. What has not happened is the production run that
    criterion 3 demands, and no unit test can stand in for it.</div>
  </div>

  <h2>What it cost before anyone found it</h2>
  <ul>${D.COST.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>

  <h2>The ticket's premise is wrong, and that is the finding</h2>
  <p>${esc(D.PREMISE.asked)}</p>
  <p><strong>${esc(D.PREMISE.truth)}</strong></p>
  <p>${esc(D.PREMISE.explains)}</p>

  <h2>The same shape had already cost three incidents</h2>
  <table>
    <thead><tr><th>Field</th><th>When</th><th>What it cost</th></tr></thead>
    <tbody>${priorRows}</tbody>
  </table>
  <p><code>prompt</code>, <code>what</code> and <code>acceptance</code> were the fourth, fifth and
  sixth.</p>
  <p>${esc(D.TEST_LESSON)}</p>

  <h2>So the fix inverts the default</h2>
  <p>${esc(D.FIX.what)}</p>
  <table>
    <thead><tr><th>What it will not do</th><th>Why</th></tr></thead>
    <tbody>${D.FIX.refusals.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody>
  </table>
  <p><strong>${esc(D.FIX.control)}</strong></p>

  <h2>Two more silent routes to the same screen</h2>
  <p>${esc(D.SECOND_PATH)}</p>
  <p>${esc(D.THIRD_PATH)}</p>

  <h2>Saying so, and recovering from it</h2>
  <p>${esc(D.BANNER.what)}</p>
  <table>
    <thead><tr><th>Deliberate refusal</th><th>Why</th></tr></thead>
    <tbody>${D.BANNER.refusals.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody>
  </table>
  <p>${esc(D.RECOVERY)}</p>

  <h2>The three acceptance criteria</h2>
  <table>
    <thead><tr><th></th><th>Criterion and evidence</th><th></th></tr></thead>
    <tbody>${criteriaRows}</tbody>
  </table>

  <h2>What criterion 3 still needs</h2>
  <p>${esc(D.HARNESS.why)}</p>
  <p><strong>${esc(D.HARNESS.control)}</strong></p>
  <p>It needs ${esc(D.HARNESS.needs)} <strong>This ticket should not be closed as fully proved
  until that run exists.</strong></p>`;

  return shell({ title: `${D.TICKET} specification`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
