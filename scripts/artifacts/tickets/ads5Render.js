/**
 * ADS-5's two artifacts: a one-page landscape visual, posted first, then the verification
 * document.
 *
 * Both read ./ads5Data, so a figure on the visual is the same figure in the document by
 * construction rather than by my re-typing it.
 *
 * The visual's job is to carry one reversal: the ticket asked Ali to go and tag the ads, and the
 * ads are already tagged. Everything on the page either supports that or names the two things
 * that genuinely are broken, because a page that only said "all clear" would be read as
 * nothing having been checked.
 */

const D = require('./ads5Data');
const { TOKENS, SEV, esc, baseCss, barChart, stackBar } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Marketing &middot; measured ${D.MEASURED_ON} in ${D.DB} `
  + `&middot; rolling ${D.WINDOW_DAYS}-day window &middot; read-only &middot; session ${D.SESSION}`;

const VERDICT_COLOR = { ok: SEV.ok, watch: SEV.watch, bad: SEV.bad };
const VERDICT_MARK = { ok: '&#10003;', watch: '!', bad: '&#10007;' };

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const VISUAL_CSS = `
  body { font-size: 12px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: ${TOKENS.MUTED}; font-size: 11.5px; margin: 0 0 11px; }
  .banner { background: #f3f9f3; border-left: 4px solid ${SEV.ok}; border-radius: 0 4px 4px 0;
    padding: 9px 12px; margin: 0 0 13px; font-size: 12.5px; line-height: 1.4; }
  .banner b { color: ${SEV.ok}; }
  .grid { display: grid; grid-template-columns: 1.02fr 1fr 1.12fr; gap: 13px; align-items: start; }
  .panel { border: 1px solid ${TOKENS.BORDER}; border-radius: 5px; padding: 11px 12px; }
  .panel h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
    color: ${TOKENS.MUTED}; margin: 0 0 9px; }
  .tbl { width: 100%; border-collapse: collapse; font-size: 10.6px; }
  .tbl th { font-size: 9.2px; padding: 3px 5px 3px 0; text-transform: uppercase;
    letter-spacing: .04em; color: ${TOKENS.MUTED}; background: none; border-bottom: 1px solid ${TOKENS.BORDER}; }
  .tbl td { padding: 3.5px 5px 3.5px 0; border-bottom: 1px solid #f0f2f5; vertical-align: top; }
  .tbl tr:nth-child(even) td { background: none; }
  .tbl code { font-size: 10px; background: ${TOKENS.BG_ALT}; padding: 0 3px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .kv { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px; line-height: 1.3; }
  .kv span:last-child { color: ${TOKENS.MUTED}; text-align: right; }
  .find { display: flex; gap: 7px; margin-bottom: 9px; line-height: 1.34; }
  .find .mk { flex: 0 0 12px; font-weight: 700; }
  .find b { font-size: 11.8px; }
  .find em { font-style: normal; color: ${TOKENS.MUTED}; font-size: 10.9px; display: block;
    margin-top: 2px; }
  .limits { background: ${TOKENS.CHERRY_BG}; border-left: 2.5px solid ${TOKENS.CHERRY};
    border-radius: 3px; padding: 9px 11px; margin-top: 12px; }
  .limits b { color: ${TOKENS.CHERRY_DEEP}; }
  .limits ol { margin: 5px 0 0 15px; padding: 0; }
  .limits li { margin-bottom: 4px; line-height: 1.34; font-size: 11px; }
  .foot { color: ${TOKENS.MUTED}; font-size: 9.6px; margin-top: 12px;
    border-top: 1px solid ${TOKENS.BORDER}; padding-top: 4px; }
`;

function buildVisual() {
  // The parts must visibly sum to 1480, because "98.9%" and "16 clicks lost a tag" are the same
  // fact and the reader should not have to take the percentage on faith.
  const coverage = stackBar({
    parts: [
      { label: `${D.SESSIONS.withCampaign} fully tagged`, value: D.SESSIONS.withCampaign, color: SEV.ok },
      { label: `${D.SESSIONS.untagged} no tags`, value: D.SESSIONS.untagged, color: TOKENS.MUTED },
    ],
    width: 300,
    height: 24,
  });

  // Only the distinct count and the most-seen value. An earlier draft also printed "+N more",
  // which sat next to the distinct count and read as a second, larger total.
  const observed = D.OBSERVED.map((o) => {
    const [topValue, topCount] = o.values[0];
    return `<tr><td><code>${esc(o.param)}</code></td>
      <td class="num">${o.distinct}</td>
      <td><code>${esc(topValue)}</code> <span style="color:${TOKENS.MUTED}">&times;${topCount}</span></td></tr>`;
  }).join('');

  // Deliberately NOT a single "99.8% attributed" figure. The honest shape is the three-way split,
  // because "39 signups carry no campaign" reads as loss until you can see they had no ad click.
  const join = barChart({
    rows: [
      { label: 'ad click on record, tag carried', value: D.JOIN.adAndTagged,
        display: String(D.JOIN.adAndTagged), color: SEV.ok },
      { label: 'ad click on record, tag LOST', value: D.JOIN.adButUntagged,
        display: String(D.JOIN.adButUntagged), color: SEV.bad },
      { label: 'no ad click, correctly untagged', value: D.JOIN.notFromAd,
        display: String(D.JOIN.notFromAd), color: TOKENS.MUTED },
    ],
    width: 330,
    barH: 17,
    gap: 6,
    labelW: 168,
  });

  const findings = D.FINDINGS.filter((f) => f.verdict !== 'ok').map((f) => `
    <div class="find"><span class="mk" style="color:${VERDICT_COLOR[f.verdict]}">${VERDICT_MARK[f.verdict]}</span>
      <div><b>${esc(f.claim)}</b><em>${esc(f.evidence)}</em></div></div>`).join('');

  const body = `
  <h1>ADS-5: the ads are already tagged</h1>
  <p class="sub">Read from ${esc(D.DB)} on ${esc(D.MEASURED_ON)} &mdash; ${D.SESSIONS.total} ad clicks
    and ${D.LEADS.total} landing signups over ${D.WINDOW_DAYS} days. No Ads Manager access used.</p>

  <div class="banner"><b>Nothing to do in Ads Manager.</b> Every ad that delivered a click carries
    all five UTM parameters, Meta's dynamic substitution is working, and
    ${D.JOIN.adAndTagged} of ${D.JOIN.fromAd} signups with a provable ad click already reach the
    report with their campaign id. The ticket's premise &mdash; untagged ads reporting as
    &ldquo;Spend, no signups&rdquo; &mdash; is not happening.</div>

  <div class="grid">
    <div class="panel">
      <h3>Tag coverage &mdash; ${D.SESSIONS.total} ad clicks</h3>
      ${coverage}
      <table class="tbl" style="margin-top:9px">
        <tr><th>Parameter</th><th class="num">Values</th><th>Most seen</th></tr>
        ${observed}
      </table>
      <div class="kv"><span>Unexpanded <code>{{macro}}</code></span><span>${D.UNEXPANDED_MACROS} clicks</span></div>
      <div class="kv"><span>Distinct campaign/content pairs</span><span>${D.CAMPAIGN_CONTENT_PAIRS}</span></div>
      <div class="kv"><span>Tagging live since</span><span>${esc(D.SESSIONS.firstTaggedClick)}</span></div>
    </div>

    <div class="panel">
      <h3>The report's join &mdash; ${D.JOIN.landingSignups} signups</h3>
      ${join}
      <div class="kv" style="margin-top:9px"><span>Attributed, of provable ad signups</span>
        <span>${D.JOIN.adAndTagged} / ${D.JOIN.fromAd}</span></div>
      <div class="kv"><span>Attributed with NO ad click (false)</span>
        <span>${D.JOIN.taggedWithoutAdSession}</span></div>
      <div class="kv"><span>One campaign id in all traffic</span>
        <span><code>${esc(D.CAMPAIGN_ID)}</code></span></div>
    </div>

    <div class="panel">
      <h3>What is not working</h3>
      ${findings}
    </div>
  </div>

  <div class="limits"><b>What this does not establish.</b>
    <ol>
      <li>${esc(D.NOT_ESTABLISHED[0])}</li>
      <li>${esc(D.NOT_ESTABLISHED[2])}</li>
    </ol>
  </div>

  <p class="foot">${FOOT}</p>`;

  return shell({ title: 'ADS-5 ad tagging verified', body, extraCss: VISUAL_CSS });
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
  const findingRows = D.FINDINGS.map((f) => `
    <tr><td class="${f.verdict}">${f.verdict === 'ok' ? 'holds' : f.verdict === 'watch' ? 'pending' : 'broken'}</td>
      <td><b>${esc(f.claim)}</b><br>${esc(f.evidence)}</td></tr>`).join('');

  const observedRows = D.OBSERVED.map((o) => `
    <tr><td><code>${esc(o.param)}</code></td><td class="num">${o.distinct}</td>
      <td>${o.values.map(([v, n]) => `<code>${esc(v)}</code> &times;${n}`).join('<br>')}</td></tr>`).join('');

  const methodRows = D.METHOD.map(([f, what]) => `
    <tr><td><code>${esc(f)}</code></td><td>${esc(what)}</td></tr>`).join('');

  const limits = D.NOT_ESTABLISHED.map((l) => `<li>${esc(l)}</li>`).join('');

  const shapeRows = D.LEADS.sourceShapes.map(([v, n]) => `
    <tr><td><code>${esc(v)}</code></td><td class="num">${n}</td></tr>`).join('');

  const body = `
  <p class="kicker">${esc(D.TICKET)} &middot; verification document</p>
  <h1>The ads are already tagged &mdash; and two things that are not</h1>
  <p class="meta">Measured ${esc(D.MEASURED_ON)} in <code>${esc(D.DB)}</code>, rolling
    ${D.WINDOW_DAYS}-day window, read-only, session ${esc(D.SESSION)}.</p>
  <div class="rule"></div>

  <div class="ad">
    <p><b>Asked:</b> tag every live ad URL with <code>utm_campaign</code>, in Ads Manager, because
      an untagged ad produces spend that matches no signups and reports as &ldquo;Spend, no
      signups&rdquo;.</p>
    <p><b>Delivered:</b> the measurement instead of the task. The ads are already tagged, correctly
      and dynamically, and the report's join already works &mdash; so there is nothing to do in Ads
      Manager. What the measurement did find is a different gap, one level down.</p>
  </div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">ADS-5 is already satisfied. ${D.SESSIONS.withCampaign} of
      ${D.SESSIONS.total} ad clicks carry all five UTM parameters, and ${D.JOIN.adAndTagged} of
      ${D.JOIN.fromAd} signups with a provable ad click already carry the campaign id. The real gap
      is one level down: the creative is recorded on the visit and lost on the lead, so spend can be
      judged per campaign but never per ad &mdash; and there are three ads running.</div>
  </div>

  <h2>Why this was measurable without Ads Manager</h2>
  <p>The ticket said the tagging &ldquo;can only be read in Ads Manager&rdquo;. That is true of the
    ad's <em>configuration</em> and false of its <em>effect</em>: every click lands on a page this
    platform already tracks, so the URL the ad actually sends people to is recorded in
    <code>visitor_sessions</code>. Reading the arrival data answers the same question and answers
    it for real traffic rather than for what the settings screen claims.</p>
  <p>Ad clicks are identified by <code>fbclid</code>, which Meta appends itself. That matters: it
    finds ad traffic <em>independently of our own tagging</em>, so it still finds the ads in exactly
    the case this ticket was written for &mdash; the one where every UTM tag is missing. Keying off
    <code>utm_source</code> instead would have hidden that case by construction.</p>

  <h2>Findings</h2>
  <table><tr><th style="width:62px">Verdict</th><th>Claim and the measurement behind it</th></tr>
    ${findingRows}</table>

  <h2>The tags actually arriving</h2>
  <table><tr><th>Parameter</th><th class="num">Distinct</th><th>Values observed</th></tr>
    ${observedRows}</table>
  <div class="note good"><b>This is the proof that substitution is live rather than a literal.</b>
    A hardcoded URL produces exactly one value per parameter forever. Three distinct
    <code>utm_content</code> ids, a <code>utm_term</code> that differs from the campaign id, and
    ${D.UNEXPANDED_MACROS} clicks carrying an unexpanded <code>{{macro}}</code> together rule that
    out. The hierarchy &mdash; one campaign, one adset, three creatives &mdash; is what Meta's
    <code>{{campaign.id}}</code> / <code>{{adset.id}}</code> / <code>{{ad.id}}</code> produce.</div>

  <h2>The join the report performs</h2>
  <p>The report matches spend to people on <code>leads.utm_campaign</code> and nothing else, so the
    session's tag is not enough on its own. Measured separately, by left-joining landing signups to
    sessions carrying <code>fbclid</code>:</p>
  <table>
    <tr><th>Landing signups in the window</th><th class="num">${D.JOIN.landingSignups}</th></tr>
    <tr><td>have an ad click on record</td><td class="num">${D.JOIN.fromAd}</td></tr>
    <tr><td>&hellip;and the lead carries the campaign id</td><td class="num">${D.JOIN.adAndTagged}</td></tr>
    <tr><td>&hellip;and the tag was lost</td><td class="num">${D.JOIN.adButUntagged}</td></tr>
    <tr><td>no ad click on record, correctly untagged</td><td class="num">${D.JOIN.notFromAd}</td></tr>
    <tr><td>attributed to a campaign with no ad click (false attribution)</td><td class="num">${D.JOIN.taggedWithoutAdSession}</td></tr>
  </table>
  <p>The split matters more than the headline rate. ${D.LEADS.total - D.LEADS.withCampaign} signups
    carry no campaign, which reads as loss until you can see that ${D.JOIN.notFromAd} of them had no
    ad click at all. Exactly ${D.JOIN.adButUntagged} tag was genuinely lost.</p>

  <div class="pagebreak"></div>

  <h2>Gap 1: the creative is recorded on the visit and lost on the lead</h2>
  <p>${D.SESSIONS.withContent} ad clicks arrive carrying <code>utm_content</code> and
    <code>utm_term</code>. ${D.LEADS.withContent} of ${D.LEADS.total} leads carry either. The data
    to tell the three running creatives apart is captured and then dropped before it reaches the
    row the report reads.</p>
  <p>Two causes, both confirmed in the code and the data:</p>
  <ol>
    <li>The identify backfill in <code>trackingController.ts:604-610</code> copies exactly three
      columns from the session onto the lead &mdash; <code>utm_source</code>,
      <code>utm_campaign</code>, <code>utm_medium</code>. <code>utm_content</code> and
      <code>utm_term</code> are not in the list, so they are never backfilled.</li>
    <li>C104 would make the signup send them itself, and it is merged but <strong>not in the
      deployed build</strong>. The data says so independently of the commit graph: the newest
      landing signup, at ${esc(D.LEADS.newestSignup)}, still carries no
      <code>utm_content</code>.</li>
  </ol>
  <div class="note"><b>Consequence.</b> Cost per signup and return on spend will populate per
    campaign as soon as spend is entered. Cost per <em>creative</em> cannot, at any point, until one
    of those two is fixed &mdash; and with one campaign and three ads running, per-creative is the
    only level at which the numbers would change a decision.</div>

  <h2>Gap 2: a split that has not started yet, and will</h2>
  <p>The report groups by <code>(utm_source, utm_campaign)</code>. C104 writes the
    <code>source|medium</code> convention, so a lead created after it deploys carries
    <code>fb|paid</code>; the ${D.LEADS.withCampaign} tagged leads already on record carry bare
    <code>fb</code> or <code>ig</code>. Two shapes in one column split one campaign into two rows,
    each with part of the signups and neither with the right cost.</p>
  <table><tr><th><code>utm_source</code> on landing leads today</th><th class="num">Leads</th></tr>
    ${shapeRows}</table>
  <p>${D.LEADS.pipedShapes} leads carry a piped shape today, so the split has not begun. It begins
    the day that frontend reaches production, which makes the ordering the actionable part: normalize
    <code>utm_source</code> at the read boundary <em>before</em> C104 ships, not after the first
    report has been read.</p>

  <h2>What this means for the rest of the ladder</h2>
  <ul>
    <li><b>ADS-5 is done</b> &mdash; by measurement, with no Ads Manager work.</li>
    <li><b>ADS-3's three named fragilities are not materially firing.</b>
      ${D.JOIN.adButUntagged} of ${D.JOIN.fromAd} over 30 days. They are real in the code and are
      costing 0.2%. The ordering problem above is the part of ADS-3 that is worth doing first, and it
      was not in the ticket when it was written.</li>
    <li><b>ADS-2 is not causing loss.</b> Its CTA leaves for an absolute
      <code>www.refactored.ai</code> URL, and that hostname was shown to be the same deployment, so
      the click stays in the same app &mdash; which is why ${D.JOIN.adAndTagged} signups are
      attributed despite it. Still worth fixing, because it survives only as long as the two
      hostnames stay one deployment; not worth being top of the list.</li>
    <li><b>The binding constraint is spend, not attribution.</b> ADS-4 (the Meta token) and ADS-6
      (the daily sync) are what stand between a working join and a number that says whether the ads
      pay for themselves.</li>
  </ul>

  <h2>What this does not establish</h2>
  <ol>${limits}</ol>

  <h2>How to re-run it</h2>
  <p>Three read-only scripts, each run inside the running backend container so they read the same
    database the backend reads, resolving tables with <code>to_regclass</code> and printing the
    schema they resolved. They write nothing, and print no email, IP or query string.</p>
  <table><tr><th>Script</th><th>What it answers</th></tr>${methodRows}</table>

  <p class="meta" style="margin-top:14px">${FOOT}</p>`;

  return shell({ title: 'ADS-5 ad tagging verification', body, extraCss: DOC_CSS });
}

module.exports = { buildVisual, buildDocument };
