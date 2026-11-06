/**
 * ADS-2's two artifacts: a one-page landscape visual, posted first, then the verification
 * document.
 *
 * Both read ./ads2Data, so a figure on the visual is the same figure in the document by
 * construction rather than by my re-typing it.
 *
 * The visual carries one idea, and it is deliberately not "shipped". The change landed and is
 * live, but the measurement taken to prove it also showed the ticket was wrong about its own
 * importance: attribution already worked. A page that led with the green check and left that in a
 * footnote would be a worse artifact than no artifact.
 */

const D = require('./ads2Data');
const { TOKENS, SEV, esc, baseCss, barChart } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Marketing &middot; measured ${D.MEASURED_ON} in ${D.DB} `
  + `&middot; live page checked on both hostnames &middot; session ${D.SESSION}`;

/** Thousands separators, because a bare 25354 beside a 909 is read as a typo before it is read. */
const fmt = (n) => Number(n).toLocaleString('en-US');

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const VISUAL_CSS = `
  body { font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: ${TOKENS.MUTED}; font-size: 11.5px; margin: 0 0 11px; }
  .banner { background: ${TOKENS.CHERRY_BG}; border-left: 4px solid ${TOKENS.CHERRY};
    border-radius: 0 4px 4px 0; padding: 9px 12px; margin: 0 0 13px; font-size: 12.5px;
    line-height: 1.4; }
  .banner b { color: ${TOKENS.CHERRY_DEEP}; }
  .grid { display: grid; grid-template-columns: 1.04fr 1.1fr 1.08fr; gap: 13px; align-items: start; }
  .panel { border: 1px solid ${TOKENS.BORDER}; border-radius: 5px; padding: 11px 12px; }
  .panel h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
    color: ${TOKENS.MUTED}; margin: 0 0 9px; }
  .panel h4 { font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
    color: ${TOKENS.MUTED}; margin: 10px 0 4px; font-weight: 700; }
  .kv { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px;
    line-height: 1.3; }
  .kv span:last-child { color: ${TOKENS.MUTED}; text-align: right; white-space: nowrap; }
  .href { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 10px;
    word-break: break-all; line-height: 1.3; }
  .was { color: ${SEV.bad}; text-decoration: line-through; }
  .now { color: ${SEV.ok}; font-weight: 700; }
  .big { display: flex; gap: 10px; margin-bottom: 8px; }
  .big div { flex: 1; }
  .big .n { font-size: 22px; font-weight: 700; line-height: 1; color: ${TOKENS.CHERRY}; }
  .big .k { font-size: 9.2px; color: ${TOKENS.MUTED}; line-height: 1.25; margin-top: 3px; }
  .corr { display: flex; gap: 7px; margin-bottom: 9px; line-height: 1.32; }
  .corr .mk { flex: 0 0 11px; font-weight: 700; color: ${SEV.watch}; }
  .corr b { font-size: 11.2px; }
  .corr em { font-style: normal; color: ${TOKENS.MUTED}; font-size: 10.4px; display: block;
    margin-top: 2px; }
  .hostrow { display: flex; justify-content: space-between; gap: 6px; font-size: 10.4px;
    margin-bottom: 4px; }
  .hostrow b { font-weight: 700; }
  .tick { color: ${SEV.ok}; font-weight: 700; }
  .strip { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; margin-top: 13px; }
  .strip .panel h3 { margin-bottom: 6px; }
  .strip p { margin: 0; font-size: 10.8px; line-height: 1.36; }
  .limits { background: ${TOKENS.BG_ALT}; border-left: 2.5px solid ${TOKENS.MUTED};
    border-radius: 3px; padding: 9px 11px; margin-top: 12px; }
  .limits b { color: ${TOKENS.INK}; }
  .limits ol { margin: 5px 0 0 15px; padding: 0; }
  .limits li { margin-bottom: 4px; line-height: 1.32; font-size: 10.8px; }
  .foot { color: ${TOKENS.MUTED}; font-size: 9.6px; margin-top: 11px;
    border-top: 1px solid ${TOKENS.BORDER}; padding-top: 4px; }
`;

function buildVisual() {
  const hosts = D.BROWSER.map((h) => `
    <div class="hostrow"><b>${esc(h.host)}</b>
      <span><span class="tick">&#10003;</span> ${h.status} &middot; ${h.anchors} anchors &middot;
        fp ${esc(h.fingerprintSurvived)}</span></div>`).join('');

  const corrections = D.CORRECTIONS.map((c) => `
    <div class="corr"><span class="mk">!</span>
      <div><b>${esc(c.now)}</b><em>${esc(c.was)}</em></div></div>`).join('');

  // One scale across both bars: how many tagged sessions reached a lead, and how many did not.
  const funnel = barChart({
    rows: [
      { label: 'Tagged, joined to a lead', value: D.POPULATION.taggedSessionsWithLead,
        display: fmt(D.POPULATION.taggedSessionsWithLead), color: SEV.ok },
      { label: 'Tagged, no signup', value: D.POPULATION.taggedSessionsWithoutLead,
        display: fmt(D.POPULATION.taggedSessionsWithoutLead), color: TOKENS.MUTED },
    ],
    max: D.POPULATION.taggedSessionsWithoutLead,
    width: 320, barH: 17, gap: 6, labelW: 132,
  });

  const body = `
  <h1>ADS-2: the CTAs are same-origin &mdash; and were never the gate this ticket claimed</h1>
  <p class="sub">Measured in ${esc(D.DB)} on ${esc(D.MEASURED_ON)} and checked in a real browser
    against both hostnames. Operator content in JSONB, so no deploy was involved.</p>

  <div class="banner"><b>The change shipped, and the same measurement showed it was not a
    blocker.</b> ${D.REAL_PROOF.agree} of ${D.REAL_PROOF.sampled} recent tagged sessions were
    already joined to a correctly attributed lead <em>before</em> this edit, because the ads land on
    <code>www.refactored.ai</code> and the old absolute CTA pointed at that same host. What this
    bought is the removal of a latent dependency, not a repair.</div>

  <div class="grid">
    <div class="panel">
      <h3>The edit</h3>
      <p class="href"><span class="was">${esc(D.CHANGE.from)}</span><br>
        <span class="now">${esc(D.CHANGE.to)}</span></p>
      <div class="kv" style="margin-top:8px"><span>Stored hrefs changed</span>
        <span>${D.CHANGE.storedHrefs}</span></div>
      <div class="kv"><span>Anchors they render as</span><span>${D.CHANGE.renderedAnchors}</span></div>
      <div class="kv"><span>Button label</span><span>unchanged</span></div>
      <h4>Scope</h4>
      <div class="kv"><span>Hosted pages with the old href</span>
        <span>${D.SCOPE.hostedPagesContainingAbsoluteHref}</span></div>
      <div class="kv"><span>Occurrences, before / after</span>
        <span>${D.SCOPE.occurrences} / ${D.SCOPE.remainingAfterChange}</span></div>
      <div class="kv"><span><code>${esc(D.SIBLING.slug)}</code></span>
        <span>already <code>${esc(D.SIBLING.href)}</code></span></div>
    </div>

    <div class="panel">
      <h3>Proven, two ways</h3>
      <h4>In a browser &mdash; the hop the edit changed</h4>
      ${hosts}
      <p style="font-size:10.4px;color:${TOKENS.MUTED};line-height:1.32;margin:6px 0 0">
        Origin preserved, landed <code>/portal/signup</code>, and the same
        <code>cb_visitor_fp</code> readable on arrival. This would fail with the change absent.</p>
      <h4>In the data &mdash; the hop it did not</h4>
      <div class="big">
        <div><div class="n">${D.REAL_PROOF.agree}/${D.REAL_PROOF.sampled}</div>
          <div class="k">recent tagged sessions whose lead carries the same campaign</div></div>
        <div><div class="n">${fmt(D.POPULATION.leadsWithCampaign)}</div>
          <div class="k">of ${fmt(D.POPULATION.leadsTotal)} leads carry a campaign</div></div>
      </div>
      ${funnel}
    </div>

    <div class="panel">
      <h3>What this ticket got wrong</h3>
      ${corrections}
      <h4>Guarded before writing</h4>
      <p style="font-size:10.4px;line-height:1.32;margin:0">
        The <code>/lp/</code> route <b>fails closed</b>: unparseable content serves a 404, not a
        degraded page. And Sequelize ignores a mutated JSONB object, so <code>save()</code> would
        have been a silent success. Both were handled before the write.</p>
    </div>
  </div>

  <div class="strip">
    <div class="panel">
      <h3>What the change actually bought</h3>
      <p>Attribution already worked from <code>www.refactored.ai</code>, since the old CTA pointed
        at that same host. It broke only from <code>enterprise.colaberry.ai</code>. The relative
        href removes the dependency: it now survives whichever hostname an ad uses.</p>
    </div>
    <div class="panel">
      <h3>What it says about ADS-5</h3>
      <p>Attributed leads are only possible if the click stayed same-origin, so those visitors were
        on <code>www.refactored.ai</code> &mdash; which is where the ads point. Inferred, not read
        from Ads Manager; ADS-5 should confirm it.</p>
    </div>
  </div>

  <div class="limits"><b>What this does not establish.</b>
    <ol>
      <li>${esc(D.NOT_ESTABLISHED_SHORT[0])}</li>
      <li>${esc(D.NOT_ESTABLISHED_SHORT[2])}</li>
    </ol>
  </div>

  <p class="foot">${FOOT}</p>`;

  return shell({ title: 'ADS-2 landing CTAs same-origin', body, extraCss: VISUAL_CSS });
}

const DOC_CSS = `
  .kicker { font-size: 8.5pt; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
    color: ${TOKENS.MUTED}; margin: 0 0 3px; }
  .ad { border: 1px solid ${TOKENS.BORDER}; border-radius: 5px; padding: 10px 12px;
    margin: 12px 0 14px; background: ${TOKENS.BG_ALT}; }
  .ad p { margin: 0 0 5px; }
  .ad p:last-child { margin: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .was { color: ${SEV.bad}; }
  ol li, ul li { margin-bottom: 6px; }
`;

function buildDocument() {
  const corrRows = D.CORRECTIONS.map((c) => `
    <tr><td class="was">${esc(c.was)}</td><td><b>${esc(c.now)}</b><br>${esc(c.why)}</td></tr>`).join('');

  const hostRows = D.BROWSER.map((h) => `
    <tr><td><code>${esc(h.host)}</code></td><td class="num">${h.status}</td>
      <td class="num">${h.anchors}</td><td>${h.originPreserved ? 'preserved' : 'LOST'}</td>
      <td><code>${esc(h.landedPath)}</code></td><td class="num">${esc(h.fingerprintSurvived)}</td></tr>`).join('');

  const trapRows = D.TRAPS.map((t) => `
    <tr><td><b>${esc(t.trap)}</b><br>${esc(t.detail)}</td><td>${esc(t.guard)}</td></tr>`).join('');

  const verifyRows = D.VERIFICATION.map(([what, how]) => `
    <tr><td><b>${esc(what)}</b></td><td>${esc(how)}</td></tr>`).join('');

  const codeRows = D.CODE.map(([f, what]) => `
    <tr><td><code>${esc(f)}</code></td><td>${esc(what)}</td></tr>`).join('');

  const limits = D.NOT_ESTABLISHED.map((l) => `<li>${esc(l)}</li>`).join('');

  const body = `
  <p class="kicker">${esc(D.TICKET)} &middot; verification document</p>
  <h1>Making the landing-page CTAs same-origin, and what measuring it revealed</h1>
  <p class="meta">Measured ${esc(D.MEASURED_ON)} in <code>${esc(D.DB)}</code>, read-only, plus a
    headless browser run against both live hostnames. Session ${esc(D.SESSION)}. This was an edit
    to operator content in JSONB, so there is no pull request and no deploy.</p>
  <div class="rule"></div>

  <div class="ad">
    <p><b>Asked:</b> repoint the landing page's CTAs from an absolute link at
      <code>www.refactored.ai</code> to the relative <code>/portal/signup</code>, so an ad click
      becomes an attributable lead. Then prove it with one real tagged click.</p>
    <p><b>Delivered:</b> the hrefs changed and verified live on both hostnames. The acceptance test
      was satisfied, but from real production rows rather than a manufactured signup &mdash; and
      doing it that way is what exposed the ticket's central claim as wrong.</p>
  </div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">The CTAs are same-origin and the fingerprint now survives the click on
      either hostname. But ${D.REAL_PROOF.agree} of ${D.REAL_PROOF.sampled} recent tagged sessions
      were <em>already</em> joined to a correctly attributed lead before the edit, so this was never
      "the gate on every other ad-reporting ticket". It removed a latent dependency on which
      hostname an ad happens to use.</div>
  </div>

  <h2>The change</h2>
  <p>Two stored CTA hrefs on <code>${esc(D.PAGE.slug)}</code>
    (<code>${esc(D.CHANGE.storedAt[0])}</code> and <code>${esc(D.CHANGE.storedAt[1])}</code>) went
    from <code>${esc(D.CHANGE.from)}</code> to <code>${esc(D.CHANGE.to)}</code>. The path and the
    button label &mdash; <q>${esc(D.CHANGE.label)}</q> &mdash; are untouched. Only the origin was
    dropped.</p>
  <p>Scope was checked rather than assumed: exactly
    ${D.SCOPE.hostedPagesContainingAbsoluteHref} hosted page in the database contained that
    absolute URL, with ${D.SCOPE.occurrences} occurrences.
    ${D.SCOPE.remainingAfterChange} remain.</p>

  <h2>Three claims in this ticket that production contradicted</h2>
  <table><tr><th style="width:34%">The ticket said</th><th>What is actually true</th></tr>
    ${corrRows}</table>
  <div class="note warn"><b>Why the third one matters.</b> This ticket was ordered first and
    described as blocking the rest of the ladder. It was not blocking anything. Anyone planning
    around it would have sequenced the remaining work on a false dependency, and the genuinely
    binding constraint &mdash; that the spend ledger is empty &mdash; sat further down the list.</div>

  <h2>Why the acceptance test was not run as written</h2>
  <p>The stated test was to complete a signup with a tagged click and read the campaign off the
    resulting lead. Against production that mints an account, fires a real welcome email through
    <code>sendPortalWelcome</code>, and writes across leads, enrollments, consent and the explorer
    profile bridge. Undoing it means deleting through a foreign-key graph in a live database, which
    is a larger and less reversible risk than the test is worth.</p>
  <p>So it was decomposed by code path: prove in a browser the one property this change altered,
    and prove the remaining hop from rows real users had already created.</p>

  <h2>Stage one: the property this change actually altered</h2>
  <p>What ADS-2 changed is one thing &mdash; whether the CTA keeps the visitor on the same origin,
    so the fingerprint <code>track.js</code> wrote into <code>localStorage</code> is still readable
    at <code>/portal/signup</code>. Driven in headless Chromium against both hostnames:</p>
  <table>
    <tr><th>Host</th><th class="num">HTTP</th><th class="num">Anchors</th><th>Origin</th>
      <th>Landed</th><th class="num">Fingerprint</th></tr>
    ${hostRows}</table>
  <div class="note good"><b>This test can fail.</b> With the old absolute href the click lands on
    another origin and <code>cb_visitor_fp</code> reads back null. That is precisely the property
    ADS-3's acceptance test lacked, and the reason this one is worth running at all.</div>
  <p>A <code>visitor_sessions</code> row was created carrying
    <code>utm_source=${esc(D.PROBE.utmSource)}</code>,
    <code>utm_campaign=${esc(D.PROBE.campaign)}</code> and
    <code>utm_content=${esc(D.PROBE.utmContent)}</code>, and it joins to the visitor holding exactly
    the fingerprint that survived the hop. No lead was created.</p>

  <div class="pagebreak"></div>

  <h2>Stage two: the write hop, from real users</h2>
  <p>Of the ${D.REAL_PROOF.sampled} most recent <code>visitor_sessions</code> rows that both carry a
    campaign and are joined to a lead, <b>${D.REAL_PROOF.agree} of ${D.REAL_PROOF.sampled} agree</b>
    between the session's campaign and the lead's. Every one entered on
    <code>${esc(D.REAL_PROOF.allEnteredOn)}</code>, every one is
    <code>source = ${esc(D.REAL_PROOF.allSource)}</code>, and all carry real campaign
    <code>${esc(D.REAL_PROOF.campaign)}</code>.</p>
  <table>
    <tr><td>Tagged sessions joined to a lead</td>
      <td class="num">${fmt(D.POPULATION.taggedSessionsWithLead)}</td></tr>
    <tr><td>Tagged sessions with no lead</td>
      <td class="num">${fmt(D.POPULATION.taggedSessionsWithoutLead)}</td></tr>
    <tr><td>Leads carrying a <code>utm_campaign</code></td>
      <td class="num">${fmt(D.POPULATION.leadsWithCampaign)} of ${fmt(D.POPULATION.leadsTotal)}</td></tr>
  </table>
  <div class="note"><b>Do not read the second row as loss.</b> Those are overwhelmingly people who
    visited and did not sign up. Ordinary funnel behavior, not broken attribution.</div>

  <h2>What that implies about the ads, and about ADS-5</h2>
  <p>${esc(D.HOSTNAME_INFERENCE)}</p>
  <div class="note warn"><b>It is an inference, and it should be confirmed.</b> The reasoning is
    tight &mdash; attributed leads are only possible if the click stayed same-origin, and the old
    href went to <code>www.refactored.ai</code> &mdash; but no ad was read directly. ADS-5 should
    check it against Ads Manager before anyone depends on it.</div>

  <h2>Two ways this edit could have failed silently</h2>
  <table><tr><th style="width:46%">The trap</th><th>What was done about it</th></tr>
    ${trapRows}</table>
  <div class="note"><b>Both are the same class of bug.</b> Neither throws. One takes the page down
    while the write looks fine; the other leaves the page untouched while the write reports success.
    The <code>utm_medium</code> defect found during ADS-3 was the second of these, which is why it
    was looked for here before writing rather than after.</div>

  <h2>Verification</h2>
  <table><tr><th style="width:26%">What</th><th>How it was established</th></tr>${verifyRows}</table>

  <h2>Where the change landed</h2>
  <table><tr><th style="width:40%">Where</th><th>Responsibility</th></tr>${codeRows}</table>
  <p><b>Rollback</b>, if ever needed: set both hrefs back to <code>${esc(D.CHANGE.from)}</code>. No
    deploy is involved. The route reads content live, behind a 60 second browser cache and a 300
    second shared cache.</p>

  <h2>One incidental finding, logged not actioned</h2>
  <p>${esc(D.FINGERPRINT_NOTE)}</p>

  <h2>What this does not establish</h2>
  <ol>${limits}</ol>

  <p class="meta" style="margin-top:14px">${FOOT}<br>
    ${esc(D.TICKET)}: ${esc(D.TICKET_URL)}</p>`;

  return shell({ title: 'ADS-2 landing CTA verification', body, extraCss: DOC_CSS });
}

module.exports = { buildVisual, buildDocument };
