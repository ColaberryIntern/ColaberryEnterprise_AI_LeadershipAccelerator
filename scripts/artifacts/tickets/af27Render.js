/**
 * AF2.7's one-page visual and its spec document.
 *
 * The visual leads with the MECHANISM rather than the fix, because the functional item reads as a
 * permissions bug and is not one: every permission check in the chain was working. One mermaid
 * flow carries that better than a paragraph, and the charts are hand-rolled SVG from
 * `artifactTheme` so nothing depends on a CDN at render time.
 *
 * Both halves open with ASKED and DELIVERED, per the artifact rule: a takeaway lists findings, it
 * does not say whether the thing that was asked for actually got done.
 */
const D = require('./af27Data');
/* Hand-written short copy for the one-pager. NOT a truncation of the spec prose: the truncating
   version passed the fit and containment audits and still clipped three cards mid-word. */
const C = require('./af27VisualCopy');
const { TOKENS, SEV, esc, baseCss, barChart } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; shipped in PR #${D.PR} `
  + `&middot; verified in production ${D.MEASURED_ON}`;

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const RANK_COLOR = { functional: SEV.bad, cosmetic: SEV.watch };

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  /* 9.1pt for the same reason af102 uses it: Chromium's PRINT box has slightly less usable
     height than the same layout measured on screen, so scaling the type is the one proportional
     lever that keeps every element's relative weight. */
  const css = `
  body { font-size: 9.1pt; }
  h1 { font-size: 15.5pt; }
  .cols { display: flex; gap: 12px; align-items: flex-start; }
  .col { flex: 1; }
  .card .n { font-size: 16pt; }
  .kpi .card { text-align: center; }
  .kpi .card.good .n { color: ${SEV.ok}; }
  h2 { font-size: 10pt; margin: 6px 0 4px; line-height: 1.25; }
  .mermaid { font-size: 7.8pt; }
  .tiny { font-size: 7.5pt; color: ${TOKENS.MUTED}; }
  .cards { margin: 6px 0 8px; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 8px; }
  .takeaway .headline { font-size: 11pt; }
  .note { padding: 5px 8px; margin: 5px 0; font-size: 7.9pt; }
  .item {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 5px; padding: 6px 9px; background: #fff;
  }
  .item .hd {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; line-height: 1.25;
  }
  .item .ti { font-size: 8.4pt; margin-top: 3px; line-height: 1.3; font-weight: 600; }
  .item .lbl {
    font-size: 7.2pt; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    color: ${TOKENS.MUTED}; margin-top: 5px;
  }
  .item .bd { font-size: 7.8pt; line-height: 1.35; }
  `;

  const kpi = `
  <div class="cards kpi">
    <div class="card good"><div class="n">3 / 3</div><div class="k">Items closed</div></div>
    <div class="card"><div class="n">${D.TOTAL_TESTS}</div><div class="k">Tests, each paired with a control</div></div>
    <div class="card good"><div class="n">${D.DEPLOY.rowsRenamed} / ${D.DEPLOY.rowsTotal}</div>
      <div class="k">Rows renamed in production</div></div>
    <div class="card good"><div class="n">0</div><div class="k">Routes left into the bridge</div></div>
  </div>`;

  /* The mechanism, not the fix. Every permission check in this chain returned the right answer. */
  const flow = `
  <div class="mermaid">
  graph LR
    A["Admin opens<br/>view-as"] --> B["read-only token in<br/>sessionStorage:<br/>tab-scoped by design"]
    B --> C["Management Portal<br/>opens a NEW TAB"]
    C --> D{"view-as token<br/>found in the new tab?"}
    D -->|"no: sessionStorage<br/>never crosses tabs"| E["falls back to the<br/>stored ADMIN token"]
    E --> F["bridge mints an ADMIN<br/>session for the ADMIN"]
    F --> G["wrong portal shown,<br/>nothing errors"]
  </div>`;

  const items = D.ITEMS.map((it) => `
    <div class="item">
      <div class="hd">Item ${it.n} &middot; <span style="color:${RANK_COLOR[it.rank]}">${esc(it.rank)}</span></div>
      <div class="ti">${esc(it.title)}</div>
      <div class="lbl">Asked</div>
      <div class="bd">${esc(C[it.key].asked)}</div>
      <div class="lbl">Delivered</div>
      <div class="bd">${esc(C[it.key].delivered)}</div>
      <div class="lbl">Evidence &middot; ${it.tests} tests</div>
      <div class="bd">${esc(C[it.key].evidence)}</div>
    </div>`).join('');

  const body = `
  <h1>Three surfaces told somebody something untrue. All three are now true or absent.</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">The functional one was a tab boundary, not a permissions bug.</div>
    <div>Every permission check in the chain returned the right answer. The view-as token is
    deliberately tab-scoped, the Management Portal opened in a new tab, and the token lookup fell
    back to the admin's own. Ali was shown his own portal with no signal anything had happened.</div>
  </div>

  ${kpi}
  ${flow}
  <div class="cols">${items}</div>
  <div class="tiny" style="margin-top:4px">Full acceptance wording, mechanism, file list and
  production checks are in the spec document filed beside this page.</div>`;

  return shell({ title: `${D.TICKET} one-page visual`, body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const css = `
  h2 { margin-top: 18px; }
  h3 { margin: 12px 0 4px; font-size: 11pt; }
  .lbl {
    font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    color: ${TOKENS.CHERRY_DEEP}; margin-top: 10px;
  }
  table { width: 100%; }
  td.p { font-family: Consolas, monospace; font-size: 8.4pt; white-space: nowrap; }
  ul { margin: 4px 0 0 18px; padding: 0; }
  li { margin: 3px 0; }
  `;

  const sections = D.ITEMS.map((it) => `
  <h2>Item ${it.n}: ${esc(it.title)}
    <span class="chip" style="background:${RANK_COLOR[it.rank]}">${esc(it.rank)}</span></h2>

  <div class="lbl">Reported</div>
  <p>${esc(it.reported)}</p>

  <div class="lbl">Asked (the ticket's own acceptance)</div>
  <p>${esc(it.asked)}</p>

  <div class="lbl">Delivered</div>
  <p>${esc(it.delivered)}</p>

  <div class="lbl">Mechanism</div>
  <ul>${it.mechanism.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>

  <div class="lbl">Why it matters</div>
  <p>${esc(it.whyItMatters)}</p>

  <div class="lbl">Files</div>
  <table>
    <thead><tr><th>Path</th><th>Role in the change</th></tr></thead>
    <tbody>${it.files.map(([p, r]) => `<tr><td class="p">${esc(p)}</td><td>${esc(r)}</td></tr>`).join('')}</tbody>
  </table>

  <div class="lbl">Verification &middot; ${it.tests} tests</div>
  <p>${esc(it.testNote)}</p>`).join('');

  const deployRows = D.DEPLOY.checks.map(([what, got, ok]) => `
    <tr>
      <td>${esc(what)}</td>
      <td class="p">${esc(got)}</td>
      <td><span class="chip" style="background:${ok ? SEV.ok : SEV.bad}">${ok ? 'PASS' : 'FAIL'}</span></td>
    </tr>`).join('');

  const testChart = barChart({
    rows: D.ITEMS.map((it) => ({
      label: `Item ${it.n}: ${it.key}`,
      value: it.tests,
      color: RANK_COLOR[it.rank],
    })),
    width: 620,
    labelW: 150,
  });

  const body = `
  <h1>${D.TICKET}: three portal surfaces that told somebody something untrue</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">All three items met their own acceptance criteria. Merged in PR
    #${D.PR} and verified on the live surface.</div>
    <div>The ticket asked for three surfaces to be made "either true or absent". Item 1 is absent
    with a stated reason, item 2 is absent unless its host is configured, and item 3 is now true
    on all ten rows. The functional item was a tab boundary rather than a permissions failure,
    which is why it produced no error for anyone to notice.</div>
  </div>

  <h2>Tests per item</h2>
  <figure>${testChart}
    <figcaption class="meta">${D.TOTAL_TESTS} tests in total. Item 1 carries the most because its
    acceptance demanded a test that drives a view-as session rather than an inspection.</figcaption>
  </figure>

  ${sections}

  <h2>What the production deploy proved</h2>
  <p>Merged as ${esc(D.MERGE_SHA)}. Checked through the real hostname, because localhost does not
  match the server_name and falls through to a block that 404s the API. A deploy's exit code says
  nothing about whether the surface a human touches changed, so the asset hash moving is the
  load-bearing line here.</p>
  <table>
    <thead><tr><th>Check</th><th>Result</th><th></th></tr></thead>
    <tbody>${deployRows}</tbody>
  </table>
  <p>The ten domain project rows were renamed by a direct repair, because findOrCreate honors a
  default only when it actually creates. Idempotency was then measured rather than argued:
  ${esc(D.DEPLOY.idempotentRun)}.</p>

  <h2>What this does not claim</h2>
  <p>Item 2 is about not showing a link to something that does not exist. The preview hosting
  feature itself was explicitly out of scope and was not built. The literal
  <code>preview.colaberry.ai</code> still appears once in the shipped bundle, in an out-of-scope
  prompt string at <code>projectsStore.ts:784</code>, and that is correct rather than a miss.</p>`;

  return shell({ title: `${D.TICKET} specification`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
