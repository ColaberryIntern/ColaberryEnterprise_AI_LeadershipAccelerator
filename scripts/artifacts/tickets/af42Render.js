/**
 * AF4.2's one-page visual and its spec document.
 *
 * The visual leads with the identity-column finding rather than the feature, because the feature
 * is what was asked for and the finding is what decides whether it actually works: the guard the
 * whole ticket exists for would have been decorative in production while every test stayed green.
 * A reader who takes one thing from this page should take that.
 */
const D = require('./af42Data');
const { TOKENS, SEV, esc, baseCss } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; merged ${D.MERGED_ON} in PR #${D.PR} `
  + `(+ #${D.FOLLOW_UP_PR}) &middot; an intern files, a named human decides, nothing is built`;

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const metCount = D.CRITERIA.filter((c) => c.met).length;

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
  h2 { font-size: 9.5pt; margin: 5px 0 3px; }
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
  .panel .hd {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px;
  }
  .panel .bd { font-size: 7.7pt; line-height: 1.35; }
  .swap { font-family: Consolas, monospace; font-size: 7.6pt; line-height: 1.5; }
  .swap .bad { color: ${SEV.bad}; text-decoration: line-through; }
  .swap .ok { color: ${SEV.ok}; font-weight: 700; }
  .br { display: flex; gap: 6px; font-size: 7.5pt; line-height: 1.3; padding: 1.5px 0;
        border-bottom: 1px solid ${TOKENS.BORDER}; }
  .br .w { flex: 1.1; }
  .br .r { flex: 1; color: ${SEV.ok}; }
  `;

  const kpi = `
  <div class="cards kpi">
    <div class="card good"><div class="n">${metCount} / ${D.CRITERIA.length}</div>
      <div class="k">Acceptance criteria met</div></div>
    <div class="card"><div class="n">${D.BREAKS.length}</div>
      <div class="k">Ways it was attacked, each refused</div></div>
    <div class="card good"><div class="n">${D.MUTATION.doors} / ${D.MUTATION.doors}</div>
      <div class="k">Guards proven load-bearing</div></div>
    <div class="card bad"><div class="n">106</div>
      <div class="k">Prior approvals, ALL by a timer</div></div>
  </div>`;

  const flow = `
  <div class="mermaid">
  graph LR
    A["Intern files a CR<br/>requireSection dashboard"] --> B["stored with a NAMED<br/>proposer, or refused"]
    B --> C["the queue<br/>requireAdmin"]
    C --> D{"approver is a<br/>human on a roster?"}
    D -->|"no: timer, blank,<br/>unknown, self"| E["REFUSED"]
    D -->|"yes"| F["decision recorded with<br/>the email and the time"]
    F --> G["nothing is built.<br/>A human starts the work"]
  </div>`;

  const breaks = D.BREAKS.slice(0, 7).map(([w, r]) => `
    <div class="br"><span class="w">${esc(w)}</span><span class="r">${esc(r)}</span></div>`).join('');

  const body = `
  <h1>An intern files, a named human decides, and nothing is built automatically.</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">One column type decided whether the guard worked in production or only
    in the tests.</div>
    <div>The identity columns began as a UUID, copied from an existing row shape. The gate judges
    the stored identity against a denylist of strings like
    <code>system:auto_approve_timeout</code>, and <strong>a UUID passes that denylist
    unconditionally</strong>. The guard this whole ticket exists for would have been decorative in
    production while all 120 tests stayed green, because tests supply emails.</div>
  </div>

  ${kpi}
  ${flow}

  <div class="cols">
    <div class="col panel">
      <div class="hd">The one-line swap</div>
      <div class="swap">
        <div class="bad">requested_by_identity_id &nbsp;(uuid)</div>
        <div class="ok">requested_by_identity &nbsp;&nbsp;&nbsp;(email)</div>
      </div>
      <div class="bd" style="margin-top:5px">${esc(D.HEADLINE.bonus)}</div>
    </div>
    <div class="col panel">
      <div class="hd">Two gates, because a denylist cannot establish humanity</div>
      <div class="bd"><strong>Measured:</strong> <code>isNonHumanIdentity("unknown")</code> is
      FALSE, and <code>isNonHumanIdentity("auto-approval")</code> is FALSE -- one letter off the
      real production identity. So the allowlist does the real work: the approver must appear in
      <strong>admin_users OR org_members</strong>. An absent or empty roster is a refusal, never
      a pass.</div>
    </div>
    <div class="col panel">
      <div class="hd">Why a new table, not the existing one</div>
      <div class="bd">approval_requests has exactly ONE identity column and no proposer column of
      any kind, so criterion 1 is <strong>literally unstorable</strong> there. All 106 of its rows
      were written by a four-hour timer: <code>decided_by</code> has one distinct value across
      every row. No human has ever decided an approval request in this system.</div>
    </div>
  </div>

  <h2 style="margin-top:8px">Tried to break it with, and what happened</h2>
  ${breaks}
  <div class="tiny" style="margin-top:3px">Seven of ${D.BREAKS.length}; the rest, the mutation
  proof of all three guards, and the two defects this build found in existing house patterns are
  in the spec document beside this page.</div>`;

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

  const routeRows = D.ROUTES.map(([r, g, w]) => `
    <tr><td class="p">${esc(r)}</td><td class="p">${esc(g)}</td><td>${esc(w)}</td></tr>`).join('');

  const breakRows = D.BREAKS.map(([w, r]) => `
    <tr><td>${esc(w)}</td><td>${esc(r)}</td></tr>`).join('');

  const gateRows = D.GATES.map((g) => `
    <tr><td><strong>${esc(g.gate)}</strong></td><td>${esc(g.does)}</td><td>${esc(g.cannot)}</td></tr>`).join('');

  const criteriaRows = D.CRITERIA.map((c) => `
    <tr>
      <td style="width:18px">${c.n}</td>
      <td>${esc(c.text)}<div class="meta">${esc(c.evidence)}</div></td>
      <td style="width:60px"><span class="chip"
        style="background:${c.met ? SEV.ok : SEV.watch}">${c.met ? 'MET' : 'OPEN'}</span></td>
    </tr>`).join('');

  const body = `
  <h1>${D.TICKET}: change request flow, intern to approved build</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">Four of the five acceptance criteria are met. The fifth is the decision
    the ticket reserves for Ali.</div>
    <div>An intern can file a change request from the portal, it stores a named proposer, only a
    human on a roster can decide it, the decision records who and when, and no build is triggered.
    What is left is the question the ticket names: whether CRs can approve platform changes at
    all, or only produce a queue Ali triages.</div>
  </div>

  <h2>The identity columns hold an email, and that is the most important line in the diff</h2>
  <p>They began as <code>${esc(D.HEADLINE.wrong)}</code>, copied from an existing change-request
  row shape. They are now <code>${esc(D.HEADLINE.right)}</code>.</p>
  <p>${esc(D.HEADLINE.why)}</p>
  <p>${esc(D.HEADLINE.bonus)}</p>

  <h2>Two gates, because a denylist cannot establish humanity</h2>
  <table>
    <thead><tr><th>Gate</th><th>What it does</th><th>What it cannot do</th></tr></thead>
    <tbody>${gateRows}</tbody>
  </table>
  <p><strong>The actor is refused, never defaulted.</strong> ${esc(D.ACTOR)}</p>

  <h2>Why a new table rather than the existing approval machinery</h2>
  <p>${esc(D.STORAGE.cannot)}</p>
  <p>${esc(D.STORAGE.history)}</p>
  <p>${esc(D.STORAGE.reused)}</p>

  <h2>The routes</h2>
  <table>
    <thead><tr><th>Route</th><th>Guard</th><th>Who</th></tr></thead>
    <tbody>${routeRows}</tbody>
  </table>
  <p>One page, two audiences, and <strong>the API decides which one you are</strong>: the decision
  queue renders only when the admin-only read returns it, so a 403 there means "not for you" and
  is deliberately not an error. Asking the server beats guessing from a client-side role, which is
  how a page drifts out of agreement with its gate.</p>

  <h2>What it was broken with</h2>
  <table>
    <thead><tr><th>Tried to break it with</th><th>What happened</th></tr></thead>
    <tbody>${breakRows}</tbody>
  </table>

  <h2>Mutation proof: all three guards, each killing named tests</h2>
  <p>A positive control proves a test discriminates; it does not prove a guard is load-bearing.
  Each of the ${D.MUTATION.doors} guards was switched off and had to kill named tests.
  ${esc(D.MUTATION.example)}. Baseline ${esc(D.MUTATION.baseline)}.</p>
  <p>${esc(D.MUTATION.driverDefect)}</p>

  <h2>Two defects this build found in existing house patterns</h2>
  <ul>${D.FOUND_DEFECTS.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>

  <h2>The five acceptance criteria</h2>
  <table>
    <thead><tr><th></th><th>Criterion and evidence</th><th></th></tr></thead>
    <tbody>${criteriaRows}</tbody>
  </table>

  <h2>Process and schema</h2>
  <p>${esc(D.AUDIT)}</p>
  <p>${esc(D.SCHEMA_NOTE)}</p>`;

  return shell({ title: `${D.TICKET} specification`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
