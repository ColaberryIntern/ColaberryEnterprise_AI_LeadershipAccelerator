/**
 * AF2.2's two PDFs: the one-page blocker map, and the document behind it.
 */
const D = require('./af22Data');
const { esc, baseCss, barChart } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .askdel .lbl {
    display: inline-block; min-width: 66px; font-size: 7.4pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: .07em; color: var(--muted); vertical-align: top;
    padding-top: 2px;
  }
  .askdel .val { display: inline-block; width: calc(100% - 74px); vertical-align: top; }
  .askdel .row { margin-bottom: 4px; }
  .stamp {
    border: 2px solid ${D.SEV.bad}; color: ${D.SEV.bad}; background: #fdf3f2;
    border-radius: 5px; padding: 7px 11px; font-weight: 700; margin: 0 0 11px;
  }
  .gate { border: 1px solid var(--border); border-radius: 6px; padding: 8px 11px; margin: 0 0 7px; }
  .gate.bad { border-color: ${D.SEV.bad}; background: #fdf3f2; }
  .gate.ok { border-color: ${D.SEV.ok}; background: #f3f9f3; }
  .gate .n {
    display: inline-block; width: 17px; height: 17px; border-radius: 3px; color: #fff;
    text-align: center; line-height: 17px; font-size: 8pt; font-weight: 700; margin-right: 6px;
  }
`;

function gateChain() {
  return `<figure><div class="mermaid">graph LR
  A["Intern opens<br/>their agent"] --> G1{"1 section gate<br/>path mapped?"}
  G1 -- "NO - fires today" --> X1["403 no access<br/>to this section"]
  G1 -. "if fixed" .-> G2{"2 requireAdmin"}
  G2 -- "passes" --> G3{"3 manager gate<br/>org_members row?"}
  G3 -- "NO - 0 rows" --> X2["403 no linked<br/>org member"]
  G3 -. "if they had one" .-> G4{"agent in their<br/>reporting chain?"}
  G4 -- "only 27 of 257<br/>have any chain" --> X3["403 not in<br/>your chain"]
  style X1 fill:#fdf3f2,stroke:#b3261e,color:#2d3748
  style X2 fill:#fdf3f2,stroke:#b3261e,color:#2d3748
  style X3 fill:#fdf3f2,stroke:#b3261e,color:#2d3748
  style G2 fill:#f3f9f3,stroke:#2f7d32,color:#2d3748
  </div><figcaption>Three refusals, not one. Fixing the first only moves the error message.
  </figcaption></figure>`;
}

function domainChart(width) {
  const rows = [...D.AGENTS_PER_DOMAIN].sort((a, b) => a.agents - b.agents).map((d) => ({
    label: `${d.domain}${d.builder ? '' : ' (no intern)'}`,
    value: d.agents,
    color: d.agents === 0 ? D.SEV.bad : D.SEV.watch,
  }));
  return barChart({ rows, width, barH: 15, gap: 5, labelW: Math.round(width * 0.46) });
}

function buildVisual() {
  const css = `${baseCss()}${SHARED}
    body { font-size: 9pt; } h1 { font-size: 15.5pt; } h2 { font-size: 9.5pt; margin: 9px 0 4px; }
    .wrap { display: flex; gap: 14px; } .col { flex: 1; }
    .stamp { font-size: 9pt; padding: 6px 10px; margin-bottom: 8px; }
    .gate { font-size: 7.6pt; padding: 6px 9px; margin-bottom: 5px; }
    .takeaway { padding: 8px 11px; margin-bottom: 8px; }
    .takeaway .headline { font-size: 10.5pt; } .takeaway .label { font-size: 7pt; }
    .note { font-size: 7.4pt; padding: 7px 9px; margin: 5px 0; }
    .mermaid svg { max-height: 118px; } figcaption { font-size: 7pt; }
    .footer { margin-top: 7px; font-size: 6.8pt; color: var(--muted);
              border-top: 1px solid var(--border); padding-top: 4px; }`;

  const body = `
  <h1>AF2.2 &middot; The agent console &mdash; why no intern can open one</h1>
  <div class="meta">Measured against production ${esc(D.MEASURED_ON)} with the interns' own
    tokens &middot; one page</div>
  <div class="rule"></div>
  <div class="stamp">BLOCKED - ALI DECISION REQUIRED. No code changed.</div>

  <div class="takeaway"><div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div></div>

  <div class="wrap">
    <div class="col">
      <h2>The three gates, in the order they fire</h2>
      ${D.GATES.map((g) => `<div class="gate ${g.verdict === D.V.BLOCKED ? 'bad' : 'ok'}">
        <span class="n" style="background:${g.verdict.color}">${g.n}</span>
        <strong>${esc(g.name)}</strong> &mdash; ${esc(g.verdict.label)}<br>
        <span style="color:var(--muted)">${esc(g.measured)}</span></div>`).join('')}
      <div class="note warn">
        <strong>Fixing gate 1 alone is not progress.</strong> The error would improve from "no
        access to this section" to "no linked org member record" and the intern would still be
        refused.
      </div>
    </div>
    <div class="col">
      <h2>AF3.1 has not run: agents per domain</h2>
      ${domainChart(420)}
      <div class="note" style="font-size:7.2pt">${esc(D.AGENT_CAVEAT)}</div>
    </div>
  </div>

  <div class="note" style="font-size:7.6pt">
    <strong>What I deliberately did not do.</strong> I did not map the path, because improving
    the error message from "no access to this section" to "no linked org member record" is not
    progress. I did not add a test bypass - the ticket says stop and mark BLOCKED, and it is
    right: a bypass here is how seven interns gain the ability to make 255 observe-level agents
    act on production. And I did not build a second console, because the one that exists is
    already generic.
  </div>

  <div class="footer">
    Reserved to Ali: ${esc(D.RESERVED.question)} My recommendation is read-only until AF7.1.
    The gate-by-gate diagram is in the document; it was illegible at this size and a diagram
    nobody can read is worse than none.
  </div>`;

  return htmlDoc({ title: 'AF2.2 agent console blockers', css, body });
}

function buildDocument() {
  const css = `${baseCss()}${SHARED}
    ol.tk { margin: 6px 0 0 18px; } ol.tk li { margin-bottom: 8px; }`;

  const body = `
  <h1>AF2.2 &middot; The agent console: talk to your own agent</h1>
  <div class="meta">Agent Factory &middot; P0 &middot; rollout blocker &middot; measured
    ${esc(D.MEASURED_ON)} &middot; prepared for Ali Muwwakkil</div>
  <div class="rule"></div>
  <div class="stamp">BLOCKED - ALI DECISION REQUIRED. No code was changed by this ticket.</div>

  <div class="askdel">
    <div class="row"><span class="lbl">Asked</span><span class="val">${esc(D.ASKED)}</span></div>
    <div class="row"><span class="lbl">Delivered</span><span class="val">${esc(D.DELIVERED)}</span></div>
  </div>

  <div class="takeaway"><div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div></div>

  <ol class="tk">
    <li><strong>The console already exists and is already per-agent.</strong>
      <code>AgentDetailPage.tsx</code> fetches by route parameter and says so in its own comment,
      "Generic by construction". It renders Work and Decisions, Performance Settings and the
      explain-this-decision surface the call described. This is the third ticket in this
      initiative whose premise was that something needed building and it was already there.</li>
    <li><strong>Three gates refuse the intern, and only the first is code.</strong> Measured in
      the order they fire, below.</li>
    <li><strong>AF3.1 has not run, so for four domains there is no agent to open.</strong>
      internship, learner_success, product_experience and sales match nothing at all.</li>
  </ol>

  <h2>The three gates</h2>
  ${D.GATES.map((g) => `<div class="gate ${g.verdict === D.V.BLOCKED ? 'bad' : 'ok'}">
    <div><span class="n" style="background:${g.verdict.color}">${g.n}</span>
      <strong>${esc(g.name)}</strong></div>
    <div>${g.detail}</div>
    <div style="margin-top:3px"><strong>Measured:</strong> ${esc(g.measured)}</div>
    <div><strong>Fix:</strong> ${esc(g.fix)}</div></div>`).join('')}
  ${gateChain()}

  <div class="pagebreak"></div>
  <h2>Agents per domain, and why the number lies</h2>
  <figure>${domainChart(660)}<figcaption>Agents whose NAME contains the domain key.</figcaption>
  </figure>
  <div class="note warn">${esc(D.AGENT_CAVEAT)}</div>

  <h2>The decision this ticket reserves to you</h2>
  <p><strong>${esc(D.RESERVED.question)}</strong></p>
  <p>${esc(D.RESERVED.why)}</p>
  <div class="note good"><strong>My recommendation.</strong> ${esc(D.RESERVED.recommendation)}</div>

  <h2>What I deliberately did not do</h2>
  <ul>${D.WHAT_I_DID_NOT_DO.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>

  <h2>What this does not establish</h2>
  <ul>
    <li><strong>I did not test the console itself.</strong> Every probe stopped at a gate, so
      nothing here says whether the page renders correctly for an intern once they can reach it.</li>
    <li><strong>The agents-per-domain counts are a proxy</strong>, not a mapping. No column says
      an agent belongs to a domain; establishing that is AF3.1.</li>
  </ul>

  <div class="meta" style="margin-top:14px;border-top:1px solid var(--border);padding-top:6px">
    Artifact for AF2.2, filed in 02 - Intern Management Portal and Access. Built from the same
    data module as the one-page blocker map.
  </div>`;

  return htmlDoc({ title: 'AF2.2 agent console', css, body });
}

module.exports = { buildVisual, buildDocument };
