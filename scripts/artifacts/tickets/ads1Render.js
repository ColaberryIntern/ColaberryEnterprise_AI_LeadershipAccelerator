/**
 * ADS-1's two artifacts: a one-page landscape visual, posted first, then the spec document.
 *
 * Both read ./ads1Data, so a figure on the visual is the same figure in the document by
 * construction rather than by my re-typing it.
 *
 * The visual's job is the one thing Ali needs from a phone between meetings: did it ship, is it
 * actually live, and what is still not true. The A/B chart is on it because that comparison is
 * the whole reason the one real defect was found, and a reader who sees only "25 failures" in
 * the log would draw the opposite conclusion.
 */

const D = require('./ads1Data');
const { TOKENS, SEV, esc, baseCss, barChart } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Marketing &middot; merged ${D.MERGED_ON} in PR #${D.PR} `
  + `&middot; deployed ${D.DEPLOY_COMMIT} &middot; session ${D.SESSION}`;

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const VISUAL_CSS = `
  body { font-size: 12px; }
  h1 { font-size: 21px; margin: 0 0 4px; }
  .sub { color: ${TOKENS.MUTED}; font-size: 11.5px; margin: 0 0 13px; }
  .grid { display: grid; grid-template-columns: 1.08fr 1fr 1.04fr; gap: 13px; align-items: start; }
  .panel { border: 1px solid ${TOKENS.BORDER}; border-radius: 5px; padding: 11px 12px; }
  .panel h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
    color: ${TOKENS.MUTED}; margin: 0 0 9px; }
  .ladder { display: flex; flex-direction: column; gap: 7px; }
  .rung { display: flex; align-items: baseline; gap: 6px; }
  .tick { color: ${SEV.ok}; font-weight: 700; width: 11px; }
  .rung b { font-size: 12px; }
  .rung span { color: ${TOKENS.MUTED}; font-size: 11px; }
  .gate { display: flex; gap: 7px; margin-bottom: 7px; line-height: 1.34; }
  .gate .tick { flex: 0 0 11px; }
  .gate em { font-style: normal; color: ${TOKENS.MUTED}; font-size: 10.4px; display: block; }
  .kv { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px;
    line-height: 1.3; }
  .kv span:last-child { color: ${TOKENS.MUTED}; text-align: right; }
  .warn { background: ${TOKENS.CHERRY_BG}; border-left: 2.5px solid ${TOKENS.CHERRY};
    border-radius: 3px; padding: 9px 11px; margin-top: 13px; }
  .warn b { color: ${TOKENS.CHERRY_DEEP}; }
  .warn ol { margin: 6px 0 0 15px; padding: 0; }
  .warn li { margin-bottom: 5px; line-height: 1.35; }
  .foot { color: ${TOKENS.MUTED}; font-size: 9.6px; margin-top: 13px;
    border-top: 1px solid ${TOKENS.BORDER}; padding-top: 4px; }
`;

function buildVisual() {
  const ladder = D.LADDER.map((r) => `
    <div class="rung"><span class="tick">&#10003;</span>
      <b>${esc(r.rung)}</b> <span>${esc(r.note)}</span></div>`).join('');

  const gates = D.GATES.map((g) => `
    <div class="gate"><span class="tick">&#10003;</span>
      <div><b>${esc(g.name)}</b><em>${esc(g.evidence)}</em></div></div>`).join('');

  // Deliberately NOT a bar of "failures fixed". The honest shape is a side-by-side of the SAME
  // 25 suites on both sides: the branch failing fewer than main is what shows the 25-failure
  // first reading was noise.
  const ab = barChart({
    rows: [
      { label: `main @ ${D.MERGE_COMMIT} (25 suites)`, value: D.AB.mainFailing,
        display: `${D.AB.mainFailing} failing`, color: TOKENS.MUTED },
      { label: 'this branch, same 25, quiet', value: D.AB.branchFailing,
        display: `${D.AB.branchFailing} failing`, color: TOKENS.CHERRY },
    ],
    max: D.AB.suites,
    width: 470,
    barH: 26,
    gap: 12,
    labelW: 190,
  });

  const prod = D.PROD.checks.map(([what]) => `
    <div class="gate"><span class="tick">&#10003;</span><div><b>${esc(what)}</b></div></div>`).join('');

  const dropped = D.DROPPED.map((d) => `
    <div class="kv"><span>${esc(d.file.replace(/^.*\/(?=[^/]+$)/, ''))}</span>
      <span>${d.lines} lines</span></div>`).join('');

  const body = `
  <h1>${esc(D.TICKET)}: the ad spend ledger is live, and the ledger is empty on purpose</h1>
  <p class="sub"><b>Asked:</b> connect ad spend into marketing reporting so we can tell whether
    the ads pay for themselves. &nbsp;<b>Delivered:</b> the instrument, merged and running in
    production, with nothing switched on.</p>

  <div class="grid">
    <div>
      <div class="panel">
        <h3>Shipping ladder &mdash; all five rungs</h3>
        <div class="ladder">${ladder}</div>
      </div>
      <div class="panel" style="margin-top:10px">
        <h3>Verified in production (${esc(D.PROD.db)})</h3>
        ${prod}
        <div class="kv" style="margin-top:5px"><span>page ${esc(D.PROD.page.route)}</span>
          <span>HTTP ${D.PROD.page.http}</span></div>
        <div class="kv"><span>lazy chunk ${esc(D.PROD.chunk.file)}</span>
          <span>${(D.PROD.chunk.bytes / 1024).toFixed(0)} KB, HTTP ${D.PROD.chunk.http}</span></div>
      </div>
    </div>

    <div>
      <div class="panel">
        <h3>The six required CI gates</h3>
        ${gates}
      </div>
      <div class="panel" style="margin-top:10px">
        <h3>Four hunks dropped &mdash; nothing imports them</h3>
        ${dropped}
        <div style="color:${TOKENS.MUTED};font-size:10.4px;margin-top:7px;line-height:1.4">
          Patch was ${esc(D.PATCH.series)}; patches 1-2 exist in no ref, branch, PR or object
          store. Every relative import across all ${D.DIFF.files} applied files resolves without
          them.</div>
      </div>
    </div>

    <div>
      <div class="panel">
        <h3>The test run that proved nothing, and the one that did</h3>
        ${ab}
        <div style="color:${TOKENS.MUTED};font-size:10.4px;margin-top:7px;line-height:1.4">
          The first full run reported 25 failing suites while two typechecks and an 8GB-heap
          ratchet saturated the machine; these suites time out at 5s per test. Re-run quietly,
          the branch fails <b>fewer</b> than main and ${D.AB.flippedToPass} suites flip the other
          way &mdash; flakiness, not causation. Exactly ${D.AB.genuine} was genuine, and on main
          it was <b>masked</b> by a ${D.AB.maskedOnMainSeconds}s timeout; quiet on the branch it
          finished in ${D.AB.realOnBranchSeconds}s and gave the real assertion.</div>
      </div>

      <div class="warn">
        <b>What this does NOT establish</b>
        <ol>
          <li>That the ads are profitable. The ledger is empty until spend is entered.</li>
          <li>That a real ad click becomes an attributed lead &mdash; that is ADS-2, ADS-5, ADS-3.</li>
          <li>That the Meta sync works live. It ships dormant; the token is ADS-4.</li>
        </ol>
      </div>
    </div>
  </div>

  <div class="foot">${FOOT}</div>`;

  return shell({ title: `${D.TICKET} - one page`, body, extraCss: VISUAL_CSS });
}

const DOC_CSS = `
  .kicker { color: ${TOKENS.MUTED}; font-size: 11px; text-transform: uppercase;
    letter-spacing: .06em; margin: 0 0 3px; }
  .ad { border-left: 3px solid ${TOKENS.CHERRY}; padding: 2px 0 2px 11px; margin: 0 0 14px; }
  .ad p { margin: 0 0 4px; }
  td.ok { color: ${SEV.ok}; font-weight: 700; white-space: nowrap; }
  code { background: ${TOKENS.BG_ALT}; padding: 1px 3px; border-radius: 2px; font-size: 11px; }
`;

function buildDocument() {
  const gateRows = D.GATES.map((g) => `
    <tr><td>${esc(g.name)}</td><td class="ok">pass</td><td>${esc(g.evidence)}</td></tr>`).join('');

  const prodRows = D.PROD.checks.map(([what, how]) => `
    <tr><td>${esc(what)}</td><td class="ok">pass</td><td>${esc(how)}</td></tr>`).join('');

  const droppedRows = D.DROPPED.map((d) => `
    <tr><td><code>${esc(d.file)}</code></td><td>${d.lines}</td></tr>`).join('');

  const limits = D.NOT_ESTABLISHED.map((l) => `<li>${esc(l)}</li>`).join('');

  const body = `
  <p class="kicker">${esc(D.TICKET)} &middot; completion document</p>
  <h1>Ad spend ledger and ad profitability report</h1>

  <div class="ad">
    <p><b>Asked:</b> connect ad spend into the marketing reporting so we can tell whether the ads
      pay for themselves.</p>
    <p><b>Delivered:</b> the ledger, the three ways to record spend, and the profitability report,
      merged in PR #${D.PR} and verified running in production &mdash; with the ledger empty and
      the Meta sync dormant, so nothing was switched on.</p>
  </div>

  <div class="takeaway"><b>Takeaway.</b> The feature did not exist anywhere. It was recovered from
    an orphaned patch, landed through all six required CI gates, deployed, and checked inside the
    production database. The one genuine defect my change caused was found only because a quiet
    A/B re-run contradicted the first test run &mdash; on main that same failure was hidden by a
    timeout. ADS-1 is complete; it does not yet tell you anything about profitability, because
    that needs spend entered and attribution working.</div>

  <h2>What shipped</h2>
  <p>${D.DIFF.files} files, +${D.DIFF.added}/-${D.DIFF.removed}. Two new additive tables
    (<code>marketing_spend_facts</code>, <code>marketing_spend_syncs</code>); three ways to record
    spend &mdash; typed by hand, Ads Manager CSV import with a dry-run preview, or a daily Meta
    Marketing API pull; and a report on Marketing &rarr; Performance giving spend, cost per
    signup, cost per payer, MRR, cash collected, return on spend, profit and payback months over
    a 30/90/180-day window.</p>

  <h2>Why this was a recovery, not an apply</h2>
  <p>The code existed only as <code>${esc(D.PATCH.file)}</code> from session
    ${esc(D.PATCH.fromSession)}, which had never been pushed, PR'd or merged. Before treating the
    sibling patches as lost I searched Downloads, every local ref and branch, open and merged
    PRs, and the local git object store by the commit sha in the patch header. None of them has
    it.</p>
  <p>Because it is patch ${esc(D.PATCH.series)}, it modifies four files the earlier patches
    created, which main therefore does not have. Those four hunks were dropped:</p>
  <table><thead><tr><th>Dropped hunk</th><th>Lines</th></tr></thead><tbody>${droppedRows}</tbody></table>
  <p>They enhance a separate, unlanded revenue-health feature. The proof that dropping them is
    safe is not an opinion: every relative import across all ${D.DIFF.files} applied files
    resolves against the tree. <code>payingMembersSql.ts</code> is not among them &mdash; this
    patch creates it, and an early exclusion of it on my part was the one real mistake of the
    run, caught by that import scan rather than by a test.</p>
  <p>One conflict, in <code>server.ts</code>: main's snackbar migration and this patch's spend
    migration add an import and a schema-ensure call at the same two spots. Both are kept, since
    they touch different tables.</p>

  <h2>Idempotency</h2>
  <p><code>marketing_spend_facts</code> carries a unique index over the whole identity of a fact
    &mdash; platform, campaign_ref, placement, period_start, period_end, source &mdash; and writes
    go through <code>ON CONFLICT ... DO UPDATE</code>, so re-importing the same CSV or repeating a
    Meta pull converges instead of double-counting. <code>placement</code> is <code>''</code>
    rather than NULL for "not broken down", because NULLs never compare equal in a unique index
    and would let duplicates through. Both facts were confirmed in the production database, not
    just in the migration source.</p>

  <h2>Verification</h2>
  <table><thead><tr><th>Required gate</th><th></th><th>Evidence</th></tr></thead>
    <tbody>${gateRows}</tbody></table>
  <p class="note">Targeted suites: ad spend ${D.TESTS.adSpend}/${D.TESTS.adSpend}, paid-status
    tripwires ${D.TESTS.tripwires}/${D.TESTS.tripwires}. Full backend suite
    ${D.TESTS.suitesPassed.toLocaleString()} of ${D.TESTS.suitesTotal.toLocaleString()} passing,
    ${D.TESTS.suitesSkipped} skipped.</p>

  <h3>The A/B that found the real defect</h3>
  <p>The first full backend run reported ${D.AB.suites} failing suites. That measurement was not
    trustworthy: two <code>tsc</code> processes and the 8GB-heap test-file ratchet were saturating
    the same machine, and these suites carry a 5-second per-test timeout. Re-running the same
    ${D.AB.suites} suites quietly, against this branch and against clean main, gave
    <b>${D.AB.mainFailing} failing on main</b> and <b>${D.AB.branchFailing} on the branch</b>
    &mdash; fewer, with ${D.AB.flippedToPass} suites failing on main while passing here. That is
    flakiness, not causation.</p>
  <p>Exactly ${D.AB.genuine} suite was a genuine difference, and it was a real defect:
    <code>payingMembersSql.ts</code> queries <code>payment_status = 'paid'</code>, and TRIPWIRE 1
    pins every such file and fails the build on a newcomer by design. On main that suite had been
    <b>masked</b>, timing out at ${D.AB.maskedOnMainSeconds}s; run quietly on the branch it
    finished in ${D.AB.realOnBranchSeconds}s and produced the real assertion. Fixed by pinning the
    file as a READ with a determination.</p>
  <p class="note">The baseline run could have been circular, so the script asserted the detached
    HEAD really was origin/main <b>and</b> that the ad spend directory was absent before believing
    any number, and restored the branch on exit.</p>

  <h3>Production</h3>
  <table><thead><tr><th>Check</th><th></th><th>How</th></tr></thead><tbody>${prodRows}</tbody></table>
  <p>Read inside the running container against <code>${esc(D.PROD.db)}</code>, so it is the same
    database the backend reads rather than whichever of the host's Postgres instances a bare
    <code>psql</code> would reach. The page route returns ${D.PROD.page.http} and the bundle moved
    from <code>${esc(D.PROD.bundleBefore)}</code> to <code>${esc(D.PROD.bundleAfter)}</code>.</p>
  <p class="note">Two traps worth recording. A 401 proves nothing about mounting on this app: the
    real API path and a deliberately fake one return byte-identical 401s, because auth runs before
    routing. And the page is a lazy chunk, so a 200 on the route can still render a white screen
    &mdash; <code>${esc(D.PROD.chunk.file)}</code> was fetched directly and confirmed to carry the
    real copy.</p>

  <h2>What this does NOT establish</h2>
  <ol>${limits}</ol>

  <h2>Links</h2>
  <p><b>PR #${D.PR}:</b> <a href="${D.PR_URL}">${D.PR_URL}</a><br>
     <b>Ticket:</b> <a href="${D.TICKET_URL}">${D.TICKET_URL}</a><br>
     <b>Marketing list:</b> <a href="${D.LIST_URL}">${D.LIST_URL}</a><br>
     <b>Session log:</b> <code>docs/sessions/SESSION_${esc(D.SESSION)}.md</code></p>

  <div class="foot" style="color:${TOKENS.MUTED};font-size:9px;margin-top:14px;
    border-top:1px solid ${TOKENS.BORDER};padding-top:5px">${FOOT}</div>`;

  return shell({ title: `${D.TICKET} - completion`, body, extraCss: DOC_CSS });
}

module.exports = { buildVisual, buildDocument };
