/**
 * ADS-3's two artifacts: a one-page landscape visual, posted first, then the verification
 * document.
 *
 * Both read ./ads3Data, so a figure on the visual is the same figure in the document by
 * construction rather than by my re-typing it.
 *
 * The visual carries one idea, and it is not "done": the half of this ticket that could be proven
 * was proven on live rows, and the half that could not is labelled as such on the same page. A
 * page that said only "shipped" would be the exact failure this ticket turned out to be about.
 */

const D = require('./ads3Data');
const { TOKENS, SEV, esc, baseCss, barChart } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Marketing &middot; measured ${D.MEASURED_ON} in ${D.DB} `
  + `&middot; after deploy &middot; read-only &middot; session ${D.SESSION}`;

/** Thousands separators, because a bare 25292 beside a 7 is read as a typo before it is read. */
const fmt = (n) => Number(n).toLocaleString('en-US');

const VERDICT_COLOR = { ok: SEV.ok, watch: SEV.watch, bad: SEV.bad };
const VERDICT_MARK = { ok: '&#10003;', watch: '!', bad: '&#10007;' };
const VERDICT_WORD = { ok: 'proven', watch: 'shipped, unobserved', bad: 'broken' };

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const VISUAL_CSS = `
  body { font-size: 12px; }
  h1 { font-size: 21px; margin: 0 0 4px; }
  .sub { color: ${TOKENS.MUTED}; font-size: 11.5px; margin: 0 0 11px; }
  .banner { background: #f3f9f3; border-left: 4px solid ${SEV.ok}; border-radius: 0 4px 4px 0;
    padding: 9px 12px; margin: 0 0 13px; font-size: 12.5px; line-height: 1.4; }
  .banner b { color: ${SEV.ok}; }
  .grid { display: grid; grid-template-columns: 1.06fr 1fr 1.16fr; gap: 13px; align-items: start; }
  .panel { border: 1px solid ${TOKENS.BORDER}; border-radius: 5px; padding: 11px 12px; }
  .panel h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
    color: ${TOKENS.MUTED}; margin: 0 0 9px; }
  .panel h4 { font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
    color: ${TOKENS.MUTED}; margin: 9px 0 4px; font-weight: 700; }
  .kv { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px; line-height: 1.3; }
  .kv span:last-child { color: ${TOKENS.MUTED}; text-align: right; white-space: nowrap; }
  .big { display: flex; gap: 10px; margin-bottom: 8px; }
  .big div { flex: 1; }
  .big .n { font-size: 21px; font-weight: 700; line-height: 1; color: ${TOKENS.CHERRY}; }
  .big .k { font-size: 9.2px; color: ${TOKENS.MUTED}; line-height: 1.25; margin-top: 3px; }
  .find { display: flex; gap: 7px; margin-bottom: 8px; line-height: 1.32; }
  .find .mk { flex: 0 0 11px; font-weight: 700; }
  .find b { font-size: 11.4px; }
  .find em { font-style: normal; color: ${TOKENS.MUTED}; font-size: 10.6px; display: block;
    margin-top: 2px; }
  .limits { background: ${TOKENS.CHERRY_BG}; border-left: 2.5px solid ${TOKENS.CHERRY};
    border-radius: 3px; padding: 9px 11px; margin-top: 12px; }
  .limits b { color: ${TOKENS.CHERRY_DEEP}; }
  .limits ol { margin: 5px 0 0 15px; padding: 0; }
  .limits li { margin-bottom: 4px; line-height: 1.32; font-size: 10.8px; }
  .foot { color: ${TOKENS.MUTED}; font-size: 9.6px; margin-top: 11px;
    border-top: 1px solid ${TOKENS.BORDER}; padding-top: 4px; }
`;

/** One scale for both charts, so "before" and "after" bars are literally comparable. */
const SPLIT_MAX = 300;

function splitChart(rows, colorFor) {
  return barChart({
    rows: rows.map((r) => ({
      label: r.placement ? r.source : `${r.source}  (no placement)`,
      value: r.signups,
      display: String(r.signups),
      color: colorFor(r),
    })),
    max: SPLIT_MAX,
    width: 320,
    barH: 16,
    gap: 5,
    labelW: 118,
  });
}

function buildVisual() {
  const before = splitChart(D.SOURCE_SPLIT.before, (r) => (r.placement ? TOKENS.MUTED : SEV.bad));
  const after = splitChart(D.SOURCE_SPLIT.after, () => SEV.ok);

  const items = D.ITEMS.map((f) => `
    <div class="find"><span class="mk" style="color:${VERDICT_COLOR[f.verdict]}">${VERDICT_MARK[f.verdict]}</span>
      <div><b>${esc(f.item)}</b><em>${esc(f.short)}</em></div></div>`).join('');

  const body = `
  <h1>ADS-3: the hand-off is fixed &mdash; and its own acceptance test could not have proved it</h1>
  <p class="sub">Measured in ${esc(D.DB)} on ${esc(D.MEASURED_ON)}, <b>after</b> the deploy.
    Two pull requests, ${D.SHIPPED.checksPassing} of ${D.SHIPPED.checksPassing} checks green on each,
    live in main&rsquo;s tip <code>${esc(D.SHIPPED.deployedTip)}</code> since 12:35 CST.</p>

  <div class="banner"><b>One campaign stopped being four rows and became two.</b> The deployed code
    returns <code>fb</code> 300 and <code>ig</code> 118 where the raw grouping returned 297, 114,
    <code>fb|paid</code> 3 and <code>ig|paid</code> 4 &mdash; the piped pair matching no placement,
    so their spend rendered blank. The signups sum exactly, and <b>the split was already live</b>.</div>

  <div class="grid">
    <div class="panel">
      <h3>The spend report&rsquo;s source groups</h3>
      <h4>Before &mdash; ${D.SOURCE_SPLIT.before.length} rows, one campaign</h4>
      ${before}
      <h4>After &mdash; ${D.SOURCE_SPLIT.after.length} rows, both with a placement</h4>
      ${after}
      <div class="kv" style="margin-top:8px"><span>Shapes live in production</span>
        <span>${D.SOURCE_SPLIT.shapesInProduction.length}</span></div>
      <div class="kv"><span>Campaign</span><span><code>${esc(D.CAMPAIGN_ID)}</code></span></div>
    </div>

    <div class="panel">
      <h3>What the backfill is worth</h3>
      <div class="big">
        <div><div class="n">${D.BACKFILL_VALUE.leadsMissingContentTheirSessionHad}</div>
          <div class="k">leads missing a creative tag their own session carried</div></div>
        <div><div class="n">${D.BACKFILL_VALUE.visitorsWithTaggedClickBehindUntaggedNewest}</div>
          <div class="k">visitors whose tagged click sat behind an untagged newer session</div></div>
      </div>
      <p style="font-size:10.6px;color:${TOKENS.MUTED};line-height:1.32;margin:0 0 8px">
        Both are populations, not firings. Neither counts the fix running.</p>
      <h4>The leads table, as it really is</h4>
      <div class="kv"><span>UTM columns present</span><span>${D.LEAD_COLUMNS.present.length}</span></div>
      <div class="kv"><span>Assumed, absent</span>
        <span><code>${esc(D.LEAD_COLUMNS.absent[0])}</code></span></div>
      <div class="kv"><span>Leads carrying a creative tag</span>
        <span>${D.LEADS.withContent} of ${fmt(D.LEADS.total)}</span></div>
      <div class="kv"><span>Piped shapes: leads / sessions</span>
        <span>${D.LEADS.pipedRows} / ${D.SESSIONS.pipedRows}</span></div>
    </div>

    <div class="panel">
      <h3>The four items this ticket named</h3>
      ${items}
    </div>
  </div>

  <div class="limits"><b>What this does not establish.</b>
    <ol>
      <li>${esc(D.NOT_ESTABLISHED_SHORT[0])}</li>
      <li>${esc(D.NOT_ESTABLISHED_SHORT[1])}</li>
    </ol>
  </div>

  <p class="foot">${FOOT}</p>`;

  return shell({ title: 'ADS-3 attribution hand-off verified', body, extraCss: VISUAL_CSS });
}

const DOC_CSS = `
  .kicker { font-size: 8.5pt; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
    color: ${TOKENS.MUTED}; margin: 0 0 3px; }
  .ad { border: 1px solid ${TOKENS.BORDER}; border-radius: 5px; padding: 10px 12px; margin: 12px 0 14px;
    background: ${TOKENS.BG_ALT}; }
  .ad p { margin: 0 0 5px; }
  .ad p:last-child { margin: 0; }
  td.ok { color: ${SEV.ok}; font-weight: 700; white-space: nowrap; }
  td.bad { color: ${SEV.bad}; font-weight: 700; white-space: nowrap; }
  td.watch { color: ${SEV.watch}; font-weight: 700; white-space: nowrap; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  ol li, ul li { margin-bottom: 6px; }
`;

function buildDocument() {
  const itemRows = D.ITEMS.map((f) => `
    <tr><td class="${f.verdict}">${VERDICT_WORD[f.verdict]}</td>
      <td><b>${esc(f.item)}</b><br>${esc(f.outcome)}</td></tr>`).join('');

  const beforeRows = D.SOURCE_SPLIT.before.map((r) => `
    <tr><td><code>${esc(r.source)}</code></td><td class="num">${r.signups}</td>
      <td>${r.placement ? esc(r.placement) : '<b style="color:' + SEV.bad + '">none &mdash; spend rendered blank</b>'}</td></tr>`).join('');

  const afterRows = D.SOURCE_SPLIT.after.map((r) => `
    <tr><td><code>${esc(r.source)}</code></td><td class="num">${r.signups}</td>
      <td>${esc(r.placement)}</td></tr>`).join('');

  const supersedeRows = D.SUPERSEDES.map((s) => `
    <tr><td>${esc(s.was)}</td><td><b>${esc(s.now)}</b><br>${esc(s.why)}</td></tr>`).join('');

  const verifyRows = D.VERIFICATION.map(([what, how]) => `
    <tr><td><b>${esc(what)}</b></td><td>${esc(how)}</td></tr>`).join('');

  const codeRows = D.CODE.map(([f, what]) => `
    <tr><td><code>${esc(f)}</code></td><td>${esc(what)}</td></tr>`).join('');

  const limits = D.NOT_ESTABLISHED.map((l) => `<li>${esc(l)}</li>`).join('');

  const body = `
  <p class="kicker">${esc(D.TICKET)} &middot; verification document</p>
  <h1>Carrying the ad&rsquo;s tags onto the lead, and giving <code>utm_source</code> one shape</h1>
  <p class="meta">Measured ${esc(D.MEASURED_ON)} in <code>${esc(D.DB)}</code> after the deploy,
    read-only, session ${esc(D.SESSION)}. Pull requests ${D.SHIPPED.prOne} and ${D.SHIPPED.prTwo},
    live in main&rsquo;s tip <code>${esc(D.SHIPPED.deployedTip)}</code>.</p>
  <div class="rule"></div>

  <div class="ad">
    <p><b>Asked:</b> make UTM-to-lead attribution survive the signup hand-off, and prove it with one
      real click.</p>
    <p><b>Delivered:</b> the hand-off fixed in two pull requests, both merged and live. The read-path
      half is proven against real production rows. The write-path half is correct, typed and
      unit-tested but has never been observed firing, and the ticket&rsquo;s own acceptance test
      could not have told the difference &mdash; which is the finding worth keeping.</p>
  </div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">One campaign stopped being four rows in the spend report and became two,
      proven by calling the deployed code against production. The split was already live, so this
      repaired a current defect rather than pre-empting a future one. But the test this ticket was
      written to pass &mdash; query one real tagged lead &mdash; now passes whether or not the fix
      exists, so it was replaced with two measured populations: 388 leads and 17 visitors.</div>
  </div>

  <h2>The one half that could be proven, and was</h2>
  <p>The spend report groups signups by <code>(utm_source, utm_campaign)</code> and matches spend to
    a placement through a lookup keyed on the bare source. Two shapes of the same source therefore
    did two things at once: they split one campaign&rsquo;s signups across two rows, and the piped
    row matched no placement, so its spend rendered blank beside visible signups. The worse of the
    two was the suggestion list on the spend entry form, because that is the box the cost is typed
    into: it offered the same campaign id twice with the signups divided between them.</p>
  <p>Measured by calling the deployed <code>knownCampaigns(LANDING_SOURCES)</code> read-only against
    production, beside the raw SQL grouping it replaces. Campaign <code>${esc(D.CAMPAIGN_ID)}</code>:</p>
  <h3>Before &mdash; what the UI received</h3>
  <table><tr><th><code>utm_source</code></th><th class="num">Signups</th><th>Placement resolved</th></tr>
    ${beforeRows}</table>
  <h3>After &mdash; what the deployed code returns</h3>
  <table><tr><th><code>utm_source</code></th><th class="num">Signups</th><th>Placement resolved</th></tr>
    ${afterRows}</table>
  <div class="note good"><b>The arithmetic is the proof.</b> 297 + 3 = 300 and 114 + 4 = 118. No
    signup was invented or lost in the merge, every row now resolves a placement, and
    <code>canonicalUtmSource</code> is idempotent on all
    ${D.SOURCE_SPLIT.shapesInProduction.length} shapes present in production, so applying it twice
    cannot drift.</div>

  <h2>The correction that matters most</h2>
  <p>Two numbers in ADS-5&rsquo;s filed artifact, measured hours earlier the same day, were already
    stale when this shipped. They are listed rather than quietly replaced, because the second one
    changes what this ticket was for.</p>
  <table><tr><th style="width:38%">ADS-5 recorded</th><th>What production says now</th></tr>
    ${supersedeRows}</table>
  <div class="note warn"><b>Why it changes the reasoning.</b> ADS-5 concluded that normalizing
    <code>utm_source</code> should land <em>before</em> the frontend that writes the piped shape, to
    get ahead of a split that had not begun. In fact the piped rows were already in
    <code>leads</code> &mdash; eight of them, the first from ${esc(D.LEADS.firstPipedRow)} &mdash; so
    the blank-spend rows and the duplicated suggestions were live in production while that was being
    written. The work was repair, not prevention.</div>

  <div class="pagebreak"></div>

  <h2>A defect this verification found in the change itself</h2>
  <p>The backfill&rsquo;s field list named five columns. The <code>leads</code> table has
    ${D.LEAD_COLUMNS.present.length}: <code>${D.LEAD_COLUMNS.present.join('</code>, <code>')}</code>.
    There is no <code>leads.${esc(D.LEAD_COLUMNS.absent[0])}</code> &mdash; that column belongs to
    <code>visitor_sessions</code>, and the field list had been copied from the session&rsquo;s shape
    onto the lead&rsquo;s.</p>
  <p>Nothing was failing, and that is the part worth noticing. Sequelize&rsquo;s <code>set()</code>
    returns early for a key that is not a model attribute, and <code>save()</code> intersects its
    field list with what actually changed, so the value never reached the SQL. The write evaporated.
    The only visible cost was that the success log, built from the keys of the update object, could
    name a column it had not written &mdash; a log that would have misled whoever investigated next.</p>
  <div class="note"><b>It also corrects the size of the gain.</b> The code this replaced copied
    <code>${esc(D.LEAD_COLUMNS.absent[0])}</code> as well, so that field had always been landing
    nowhere. The honest description of the improvement is <b>two columns to four</b>, not three to
    five. Found only because a production query named the column and came back
    <code>column &quot;${esc(D.LEAD_COLUMNS.absent[0])}&quot; does not exist</code>; the code path
    itself had never complained, in either version.</div>

  <h2>What the write-path fix is worth</h2>
  <p>The backfill fires only when the lead is missing a tag that its session has. Rather than wait
    for that to happen and call the result proof, the population it applies to was measured:</p>
  <table>
    <tr><th>Leads created in the last ${D.BACKFILL_VALUE.windowDays} days missing a creative tag their own session carried</th>
      <th class="num">${D.BACKFILL_VALUE.leadsMissingContentTheirSessionHad}</th></tr>
    <tr><td>Visitors whose newest session is untagged while an older session of theirs carries a campaign</td>
      <td class="num">${D.BACKFILL_VALUE.visitorsWithTaggedClickBehindUntaggedNewest}</td></tr>
    <tr><td>&hellip;out of visitors with an untagged newest session and more than one session</td>
      <td class="num">${D.BACKFILL_VALUE.visitorsWithUntaggedNewestAndMultipleSessions}</td></tr>
  </table>
  <p>The second row is the case the old code lost outright: it read the single newest session, and
    sessions are reused for thirty minutes while the tracker&rsquo;s own flush sends no UTM fields,
    so the newest session is routinely an untagged one sitting in front of the real ad click. It now
    takes the newest session that carries a campaign instead &mdash; bounded to
    ${D.BACKFILL_VALUE.lookbackSessions} sessions and a ${D.BACKFILL_VALUE.windowDays}-day window,
    because reaching back without a bound would quietly convert last-touch attribution into
    first-touch. That bound is a fix for a bug the fix itself introduced.</p>

  <h2>Why this ticket&rsquo;s acceptance test cannot prove this ticket</h2>
  <p>The &ldquo;done when&rdquo; was: query one real tagged click&rsquo;s lead row and see the
    campaign id. That test now passes <strong>without any of this code running</strong>. The signup
    sends its own tags, so the lead arrives already tagged and the backfill correctly returns an
    empty update. A green result would have been measuring the frontend&rsquo;s payload.</p>
  <p>The data proves the payload path independently of the commit graph: <code>leads</code> carries
    ${D.LEADS.pipedRows} piped <code>utm_source</code> values while <code>visitor_sessions</code>
    carries ${D.SESSIONS.pipedRows}. A value that is on the lead and on no session cannot have come
    from the session backfill, so it arrived in the payload. The same deploy is why
    ${D.LEADS.withContent} leads suddenly carry a creative tag.</p>
  <div class="note warn"><b>The general rule.</b> A production acceptance test is evidence only if
    it would FAIL with the change absent. Before accepting a green check, ask what else could
    produce that same row &mdash; and if anything could, the check is measuring the system rather
    than the change. The decomposition used here was: prove the read path by calling it against real
    rows beside the query it replaces, and state the write path as the population it applies to.</div>

  <h2>Verification</h2>
  <table><tr><th style="width:30%">What</th><th>How it was established</th></tr>${verifyRows}</table>
  <div class="note"><b>Absence of failure was not treated as evidence of execution.</b> The logs
    showed zero <code>utm_backfill_failed</code> lines, and also zero identify requests. Nothing had
    run, so nothing had passed.</div>

  <h2>Where the code landed</h2>
  <table><tr><th style="width:42%">File</th><th>Responsibility</th></tr>${codeRows}</table>

  <h2>What this does not establish</h2>
  <ol>${limits}</ol>

  <p class="meta" style="margin-top:14px">${FOOT}<br>
    ${esc(D.TICKET)}: ${esc(D.TICKET_URL)}<br>
    PR ${D.SHIPPED.prOne}: ${esc(D.SHIPPED.prOneUrl)}<br>
    PR ${D.SHIPPED.prTwo}: ${esc(D.SHIPPED.prTwoUrl)}</p>`;

  return shell({ title: 'ADS-3 attribution hand-off verification', body, extraCss: DOC_CSS });
}

module.exports = { buildVisual, buildDocument };
