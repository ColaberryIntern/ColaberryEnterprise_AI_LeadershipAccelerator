/**
 * C6.5's two deliverables: the one-page verdict table, and the full audit.
 *
 * The one-pager leads with the reuse verdict per function, because that is the decision
 * C6.6 is waiting on. The document carries the evidence behind each verdict.
 */
const D = require('./c65Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .v { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7pt;
       font-weight:700; color:#fff; white-space:nowrap; }
  .fn { font-family:Consolas,monospace; font-weight:700; }
  .bill { display:inline-block; font-size:6.8pt; font-weight:700; padding:0 5px;
          border-radius:8px; border:1px solid currentColor; color:#b3261e; }
  .free { color:#2f7d32; }
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:11px 14px;
           margin:0 0 14px; border-radius:0 5px 5px 0; }
  .dec { border:2px solid var(--cherry); border-radius:6px; padding:9px 12px; margin:10px 0 0; }
  .dec .lab { font-size:7.6pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
              color:var(--cherry-deep); margin-bottom:3px; }
  .card2 { border:1px solid var(--border); border-left:4px solid var(--muted);
           border-radius:5px; padding:8px 11px; margin:0 0 7px; }
`;

const vchip = (v) => `<span class="v" style="background:${v.color}">${esc(v.k)}</span>`;
const bchip = (b) => `<span class="bill ${b ? '' : 'free'}">${b ? 'BILLABLE' : 'FREE'}</span>`;

/**
 * The one-pager's "why" cell: whole sentences up to a useful length, never a fragment.
 *
 * Taking only the first sentence left three cells reading "CONTRACT DEFECT." and
 * "MISNAMED." - a label where the reader needed the finding. Several notes open with
 * exactly that kind of short capitalized lead, so the cut keeps going until it has said
 * something. The trailing-period strip is because splitting on '. ' leaves the final
 * sentence's own period in place, which produced ".." on the first build.
 */
function shortNote(note, min = 52) {
  let out = '';
  for (const p of note.split('. ')) {
    out += (out ? '. ' : '') + p;
    if (out.length >= min) break;
  }
  return `${out.replace(/\.+$/, '')}.`;
}

function verdictTable(compact) {
  return `<table>
    <tr><th style="width:${compact ? '26%' : '21%'}">Function</th>
      <th style="width:9%">Cost</th>
      <th style="width:${compact ? '23%' : '17%'}">Verdict</th>
      <th>${compact ? 'Why' : 'Failure behavior'}</th></tr>
    ${D.FUNCTIONS.map((f) => `<tr>
      <td><span class="fn">${esc(f.name)}</span></td>
      <td>${bchip(f.billable)}</td>
      <td>${vchip(f.verdict)}</td>
      <td>${esc(compact ? shortNote(f.note) : f.failure)}</td>
    </tr>`).join('')}
  </table>`;
}

/*
 * The one-pager shows a subset of both tables. The limit is one page and the limit is the
 * deliverable, so the cut is made here, deliberately, rather than by raising it: the
 * document carries every row.
 */
const ONE_PAGE_EXHAUSTION = ['Per-run ceiling', 'Daily ceiling', 'On refusal'];
const ONE_PAGE_PROD = ['APOLLO_ENABLED', 'Spend today',
  'Apollo-sourced leads'];

function exhaustionTable(only) {
  const rows = only ? D.EXHAUSTION.filter((r) => only.includes(r[0])) : D.EXHAUSTION;
  return `<table>
    <tr><th style="width:24%">Mechanism</th><th>Behavior, read from the code</th></tr>
    ${rows.map((r) => `<tr><td><b>${esc(r[0])}</b></td>
      <td>${esc(r[1])}</td></tr>`).join('')}
  </table>`;
}

function prodTable(only) {
  const rows = only ? D.PROD.rows.filter((r) => only.includes(r[0])) : D.PROD.rows;
  return `<table>
    <tr><th style="width:27%">Fact</th><th style="width:24%">Value</th><th>How it was obtained</th></tr>
    ${rows.map((r) => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td>
      <td>${esc(r[2])}</td></tr>`).join('')}
  </table>`;
}

/* ------------------------------------------------------------------ *
 * One page
 * ------------------------------------------------------------------ */

function buildVisual() {
  const css = `${baseCss()}
    ${SHARED}
    body { font-size:8.6pt; }
    h1 { font-size:15pt; }
    h2 { font-size:9.8pt; margin:8px 0 4px; }
    .takeaway { padding:8px 11px; margin:0 0 8px; }
    .takeaway .headline { font-size:9.8pt; }
    table { font-size:7.5pt; margin:2px 0 6px; }
    td, th { padding:3px 5px; }
    .cols { display:flex; gap:12px; align-items:flex-start; }
    .col { flex:1; }
    .note { padding:6px 9px; margin:5px 0; font-size:7.8pt; }
    .dec { padding:7px 10px; }`;

  const body = `<div>
    <h1>C6.5 &middot; Apollo Enrichment Workflow Audit</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; six functions audited &middot;
      ceilings ${esc(D.CEIL.perRun)}/run and ${esc(D.CEIL.perDay)}/day &middot;
      read from source, not assumed</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>

    <h2>Reuse verdict per function</h2>
    ${verdictTable(true)}

    <div class="cols">
      <div class="col">
        <h2>What happens when the quota runs out mid-run</h2>
        ${exhaustionTable(ONE_PAGE_EXHAUSTION)}
      </div>
      <div class="col">
        <h2>Production, measured today</h2>
        ${prodTable(ONE_PAGE_PROD)}
        <div class="note warn"><b>The brake covers the service, not the repository.</b>
          One script reaches Apollo with its own fetch, no kill switch and no claim, so its
          spend never reaches the daily counter. The account client is not a hole: it is
          allowlisted to two free endpoints and refuses anything billable.</div>
      </div>
    </div>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C6.5 - Apollo Enrichment Workflow Audit', css, body });
}

/* ------------------------------------------------------------------ *
 * The document
 * ------------------------------------------------------------------ */

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }`;

  const body = `<div class="wrap">
    <h1>C6.5 &middot; Apollo Enrichment Workflow Audit</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; Ticket C6.5 &middot; blocks C6.6 and C6.4</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Establish exactly what the existing Apollo
      integration can do before anyone builds on it: every exported function documented with
      inputs, outputs, failure modes and quota consumption, quota-exhaustion behavior
      established by reading code rather than assumed, and a clear reuse verdict per
      function. Build nothing.
      <br><br>
      <b>What was delivered.</b> A verdict per function with the evidence behind it, the
      exhaustion path traced through the guard to each call site, the live production
      configuration and spend counter, and two defects that change how the next two tickets
      should run. Nothing was built and no Apollo credit was spent producing this.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>Reuse verdict per function</h2>
    ${verdictTable(false)}

    <h2>Each function in full</h2>
    ${D.FUNCTIONS.map((f) => `<div class="card2">
      <div><span class="fn">${esc(f.name)}</span> ${bchip(f.billable)} ${vchip(f.verdict)}</div>
      <div style="margin-top:4px"><b>In and out.</b> ${esc(f.io)}</div>
      <div><b>Failure.</b> ${esc(f.failure)}</div>
      <div><b>Quota.</b> ${esc(f.quota)}</div>
      <div><b>Note.</b> ${esc(f.note)}</div>
    </div>`).join('')}

    <div class="pagebreak"></div>
    <h2>What happens when the quota runs out mid-run</h2>
    <p>This is the question the ticket says must be answered from the code rather than
    assumed, so each row below was traced from <code>claimApolloCall</code> in
    <code>apolloCreditGuard.ts</code> out to the call sites in <code>apolloService.ts</code>.</p>
    ${exhaustionTable()}
    <div class="note warn"><b>The consequence worth carrying into C6.4.</b> A refused call
    and a genuine miss return the same thing. If a mapping run crosses a ceiling halfway,
    the remaining accounts come back empty and look like accounts with no reachable contact.
    The only defense is to read the counter before and after the run and report both.</div>

    <h2>Production configuration and spend, ${esc(D.PROD.asOf)}</h2>
    ${prodTable()}
    <p>The API key was checked for presence and length only. Its value was never read,
    printed or logged, here or anywhere in the process that produced this document.</p>

    <h2>Test coverage</h2>
    <p>The credit guard and the kill switch are both well covered, and the account-scoped
    import service has its own suite including an idempotency case. The gap is in this
    module: <code>importApolloResults</code> and <code>calculateColdLeadScore</code> appear
    in five production call sites and in no test file. The first writes to the database and
    spends credits; the second is pure and would be trivial to cover. A build assertion in
    this artifact fails if either becomes tested, so the claim cannot go stale.</p>

    <h2>What C6.4 and C6.6 should do with this</h2>
    <ol>${D.FOR_NEXT.map((f) => `<li style="margin-bottom:6px">${esc(f)}</li>`).join('')}</ol>

    <h2>Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C6.5 - Apollo Enrichment Workflow Audit', css, body });
}

module.exports = { buildVisual, buildDocument };
