/**
 * Campus C97 - renders the one-page return-path visual and the full evidence report. Both read campusC97Data.
 */
const D = require('./campusC97Data');
const { esc, baseCss, barChart } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .k{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;margin:0 0 4px}
  .kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:8px 0 10px}
  .kpi{border:1px solid #e2e8f0;border-radius:6px;padding:7px 9px}
  .kpi b{display:block;font-size:20px;line-height:1.1}
  .kpi span{font-size:8.5px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  .kpi.bad b{color:#b3261e} .kpi.good b{color:#1b5e20}
  .grid2{display:grid;grid-template-columns:1fr 1.05fr;gap:16px}
  table{width:100%;border-collapse:collapse;font-size:10.5px;margin:6px 0}
  th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:8.5px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:7px 10px;font-size:10.5px;margin:8px 0}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:8px 10px;font-size:11px;margin:8px 0}
  code{font-size:9.5px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  p{margin:0 0 7px} ul{margin:4px 0 8px 16px;padding:0} li{margin:2px 0}
  .src{font-size:8px;color:#64748b;margin-top:3px}
`;

function returnFlow() {
  const t = D.totals();
  const s = D.SESSIONS;
  // Top to bottom, with "never came back" declared last, so no edge from "came back" is drawn across it.
  return `flowchart TB
  a["${t.explorers} ad Explorers"] --> r["${t.cameBack} came back<br/>${s.total} return visits"]
  r --> i["${s.straightIn} visits: straight into<br/>the portal, still signed in"]
  r --> l["${s.neverReachedPortal} visits: never reached the portal<br/>32 = clicked the ad again,<br/>landed on the ad page"]
  r --> w["${s.stoppedAtSignIn} visits: stopped<br/>at the sign-in page"]
  a --> n["${t.neverBack} never came back"]`;
}

function outcomeChart(width = 460) {
  const s = D.SESSIONS;
  return barChart({
    rows: [
      { label: 'Straight into the portal', value: s.straightIn, color: '#0f766e', display: String(s.straightIn) },
      { label: 'Never reached the portal', value: s.neverReachedPortal, color: '#b3261e', display: String(s.neverReachedPortal) },
      { label: 'Stopped at the sign-in page', value: s.stoppedAtSignIn, color: '#64748b', display: String(s.stoppedAtSignIn) },
    ],
    width, barH: 16, gap: 5, labelW: 170,
  });
}

function kpis() {
  const t = D.totals();
  const s = D.SESSIONS;
  const cells = [
    { v: t.explorers, l: 'ad Explorers', c: '' },
    { v: `${t.cameBack} (${D.pct(t.cameBack, t.explorers)}%)`, l: 'ever came back', c: 'bad' },
    { v: `${s.straightIn} of ${s.total}`, l: 'return visits: straight in', c: 'good' },
    { v: String(s.stoppedAtSignIn), l: 'return visits stopped at sign-in', c: 'good' },
    { v: '32', l: 'return visits: ad re-click, never got in', c: 'bad' },
    { v: 'unmeasured', l: 'sign-in link use', c: '' },
  ];
  return `<div class="kpis">${cells.map((k) => `<div class="kpi ${k.c}"><b>${esc(String(k.v))}</b>
    <span>${esc(k.l)}</span></div>`).join('')}</div>`;
}

/** One landscape page. */
function buildVisual() {
  D.assertConsistent();
  const body = `
    <h1 style="margin:0;font-size:20px">The sign-in is not what keeps ad Explorers away. Most never come back; the rest walk straight in.</h1>
    <p style="font-size:10.5px;color:#64748b;margin:2px 0 0">Campus C97 &middot; ${esc(D.WINDOW)} &middot;
      production, read-only, ${esc(D.AS_OF)}</p>
    ${kpis()}
    <div class="grid2">
      <div>
        <div class="k">What happened on the ${D.SESSIONS.total} return visits</div>
        ${outcomeChart()}
        <div class="src">Source: scripts/audits/explorer-ad-funnel run.sh returnpath (R2). Control R5: the sign-in page
          is recorded (${D.CONTROL.loginEvents} events), so 0 is a real zero.</div>
        <div class="flag"><strong>The hypothesis was wrong.</strong> A session lasts 7 days, and only
          ${D.SESSIONS.afterSessionEnds} of ${D.SESSIONS.total} return visits came after it ended. No return visit hit
          the sign-in page.</div>
        <div class="k" style="margin-top:8px">Recommended, in the product (no new sends)</div>
        <ol style="margin:2px 0 0 16px;padding:0;font-size:10px">${D.RECOMMENDATIONS.map((r) => `<li style="margin:1px 0">
          ${esc(r.title)}</li>`).join('')}</ol>
      </div>
      <div>
        <div class="k">The return path</div>
        <div class="mermaid">${returnFlow()}</div>
        <div class="src">Email: nothing reached a new ad Explorer before 24 Oct except 1 welcome. On 24 Oct one batch sent
          ${D.MESSAGES[1].people} sign-in links; ${D.BATCH.visitedWithin48h} of ${D.BATCH.recipients} earlier signups
          visited within 48 hours (R6, R7).</div>
      </div>
    </div>`;
  return htmlDoc({ title: 'Campus C97 one page', css: baseCss() + SHARED, body });
}

/** The full report. */
function buildDocument() {
  const t = D.assertConsistent();
  const s = D.SESSIONS;
  const body = `
    <h1>Campus C97 &middot; Why ad Explorers never come back: the return path</h1>
    <p class="lede"><strong>Asked:</strong> find out what stands between an ad Explorer and a second visit, starting
      from the hypothesis that passwordless sign-in locks people out once their session ends; numbers and a
      recommendation, no build. <strong>Delivered:</strong> a production measurement of ${t.explorers} ad Explorers'
      return visits, a control for every zero, and three recommendations inside Strategy A.</p>

    <div class="bad"><strong>TAKEAWAY:</strong> the sign-in wall is not the problem. ${t.neverBack} of ${t.explorers}
      ad Explorers (${D.pct(t.neverBack, t.explorers)}%) never came back at all. Of the ${s.total} visits by the
      ${t.cameBack} who did, ${s.straightIn} went straight into the portal on a live session and none stopped at the
      sign-in page. The leak among returners is elsewhere: 32 visits were people clicking the ad again, landing on the
      ad page as if they were strangers, and leaving without reaching their account.</div>

    <h2>1. Who comes back</h2>
    <table><thead><tr><th>Entry week</th><th>Ad Explorers</th><th>Came back</th><th>Within 7 days</th>
      <th>Have had 7 days</th></tr></thead><tbody>
      ${D.WEEKS.map((w) => `<tr><td>${esc(w.week)}</td><td>${w.explorers}</td>
        <td>${w.cameBack} (${D.pct(w.cameBack, w.explorers)}%)</td><td>${w.within7d}</td><td>${w.had7d}</td></tr>`).join('')}
      <tr><td><strong>Total</strong></td><td><strong>${t.explorers}</strong></td>
        <td><strong>${t.cameBack} (${D.pct(t.cameBack, t.explorers)}%)</strong></td><td></td><td></td></tr>
    </tbody></table>
    <p class="src">R1. A return is a visitor session starting 6+ hours after entering, on the lead or on any browser
      the lead used. The week of 26 Oct has not had 7 days yet.</p>

    <h2>2. What a returning Explorer met</h2>
    <figure>${outcomeChart(620)}<figcaption>R2, ${s.total} return visits. ${s.afterSessionEnds} came more than 7 days
      after entering, when the session would have ended.</figcaption></figure>
    <p>By person (R3): ${D.RETURNERS.reachedPortal} of ${D.RETURNERS.total} returners reached the portal on some return;
      ${D.RETURNERS.hadVisitNeverReachedPortal} had at least one return that never did; ${D.RETURNERS.sawSignIn} ever saw
      the sign-in page.</p>
    <p><strong>Control (R5):</strong> the tracker does record the sign-in page for other visitors
      (${D.CONTROL.loginEvents} events in ${D.CONTROL.loginSessions} sessions) and Today (${D.CONTROL.todayEvents.toLocaleString('en-US')}
      events), so "0 stopped at the sign-in page" is a measured zero, not missing data.</p>

    <h2>3. The visits that never reached the portal</h2>
    <table><thead><tr><th>Landed on</th><th>Arrived by</th><th>Device</th><th>Visits</th><th>People</th></tr></thead><tbody>
      ${D.NEVER_IN.map((r) => `<tr><td>${esc(r.landed)}</td><td>${r.viaAd ? 'an ad click' : 'other'}</td>
        <td>${esc(r.device)}</td><td>${r.sessions}</td><td>${r.people}</td></tr>`).join('')}
    </tbody></table>
    <p class="src">R4. The ad landing page pitches "Start for $0" to everyone; it does not check whether the visitor
      already has a live session in that browser.</p>

    <h2>4. How sign-in works today</h2>
    <ul>${D.SESSION_RULES.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="flag">C103 changes the cost of the landing-page leak. Before 1 Nov, a returning Explorer who filled in
      the signup form again was signed straight back in (which also let anyone sign in as anyone). Now they get
      "check your email". That is the right security trade, and it makes recommendation 1 more valuable.</div>

    <h2>5. Email that could have brought them back</h2>
    <table><thead><tr><th>Subject</th><th>People</th><th>Sent</th><th>Note</th></tr></thead><tbody>
      ${D.MESSAGES.map((m) => `<tr><td>${esc(m.subject)}</td><td>${m.people}</td>
        <td>${esc(m.first)}${m.first === m.last ? '' : ` to ${esc(m.last)}`}</td><td>${esc(m.note)}</td></tr>`).join('')}
    </tbody></table>
    <p>Every ad Explorer got exactly one message (R6). Before 24 October a new Explorer got nothing after signing up,
      apart from a single welcome on 21 October. Of the ${D.BATCH.recipients} earlier signups in the 24 Oct sign-in link batch,
      ${D.BATCH.visitedWithin48h} visited within 48 hours (R7). Outreach stays with Maya (Strategy A); this is recorded
      as data for her, not as a send to build.</p>

    <h2>6. Recommendations</h2>
    ${D.RECOMMENDATIONS.map((r) => `<h3>${r.n}. ${esc(r.title)}</h3><p><strong>Why:</strong> ${esc(r.why)}</p>
      <p><strong>What:</strong> ${esc(r.what)}</p>`).join('')}
    <p>None of the three helps the ${t.neverBack} who never return; for them the lever is the first session (C91, whose
      1 Nov read is ${'26%'} finishing a first lesson against a 25% target) and Maya's outreach.</p>

    <h2>7. What this does not establish</h2>
    <ul>${D.NOT_ESTABLISHED.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>

    <h2>8. Reproduce</h2>
    <p>On the production host, from <code>/opt/colaberry-accelerator</code>:
      <code>bash scripts/audits/explorer-ad-funnel/run.sh returnpath</code>. Read-only: one transaction, always rolled
      back. Ticket: <a href="${esc(D.TICKET)}">${esc(D.TICKET)}</a>. C91 measurement:
      <a href="${esc(D.C91_TICKET)}">${esc(D.C91_TICKET)}</a>.</p>`;
  return htmlDoc({ title: 'Campus C97 return path', css: baseCss() + SHARED, body });
}

module.exports = { buildVisual, buildDocument };
