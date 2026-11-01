/**
 * Campus C91 - renders the one-page dashboard and the full audit-and-decision report. Both read campusC91Data.
 */
const D = require('./campusC91Data');
const { esc, baseCss, barChart } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .k{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;margin:0 0 4px}
  .kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:8px 0 10px}
  .kpi{border:1px solid #e2e8f0;border-radius:6px;padding:7px 9px}
  .kpi b{display:block;font-size:20px;line-height:1.1}
  .kpi span{font-size:8.5px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  .kpi.bad b{color:#b3261e} .kpi.good b{color:#1b5e20}
  .grid2{display:grid;grid-template-columns:1.05fr 1fr;gap:16px}
  table{width:100%;border-collapse:collapse;font-size:10.5px;margin:6px 0}
  th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:8.5px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  .pill{display:inline-block;font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase}
  .pill.yes{background:#e8f5e9;color:#1b5e20} .pill.no{background:#f1f5f9;color:#475569}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:7px 10px;font-size:10.5px;margin:8px 0}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:8px 10px;font-size:11px;margin:8px 0}
  code{font-size:9.5px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  p{margin:0 0 7px} ul{margin:4px 0 8px 16px;padding:0} li{margin:2px 0}
  .src{font-size:8px;color:#64748b;margin-top:3px}
`;

const FIRST_SESSION = `flowchart LR
  subgraph B["Before C91"]
    direction TB
    b1["Ad → account"] --> b2["Today: 'Enroll to unlock'<br/>top click, 101 people"]
    b2 --> b3["Settings tab<br/>dead end"]
    b1 --> b4["Campus gate: 'explore'<br/>205 stop at the tower"]
    b1 --> b5["Next step:<br/>upload résumé"]
  end
  subgraph A["After C91"]
    direction TB
    a1["Ad → account"] --> a2["Gate + Today:<br/>'Start your first lesson'"]
    a2 --> a3["Quick check: AI foundations<br/>15 pts (#3500)"]
    a3 --> a4["First win recorded"]
    a4 --> a5["Enroll ask returns"]
  end
  B ~~~ A`;

function funnelChart(width = 520) {
  return barChart({
    rows: D.FUNNEL.map((f) => ({ label: f.stage, value: f.value, color: f.value <= 4 ? '#b3261e' : '#0f766e',
      display: f.value.toLocaleString('en-US') })),
    width, barH: 16, gap: 5, labelW: 170,
  });
}

function kpis() {
  const s = D.FUNNEL.find((f) => f.stage === 'Created an account').value;
  const c = D.CUTOVER;
  const cells = [
    { v: s, l: 'ad Explorers', t: '' },
    { v: `${D.pct(3, s)}%`, l: 'finished a lesson', t: 'bad' },
    { v: '0', l: 'paid', t: 'bad' },
    { v: `${D.pct(c.before.enroll_click, c.before.signed_up)}% → ${D.pct(c.after.enroll_click, c.after.signed_up)}%`,
      l: 'clicked enroll first, before → after', t: 'good' },
    { v: `${c.after.gate_lesson} of ${c.after.signed_up}`, l: 'used the first-lesson door', t: 'good' },
    { v: '25%', l: 'target: finish a first lesson', t: '' },
  ];
  return `<div class="kpis">${cells.map((k) => `<div class="kpi ${k.t}"><b>${esc(String(k.v))}</b>
    <span>${esc(k.l)}</span></div>`).join('')}</div>`;
}

/** One landscape page: the numbers, the flow before and after, the decision, the state. */
function buildVisual() {
  D.assertFunnelNarrows();
  D.assertCutoverMatchesFunnel();
  const body = `
    <h1 style="margin:0;font-size:20px">Ad Explorers stalled in their first five minutes. C91 gives them one job.</h1>
    <p style="font-size:10.5px;color:#64748b;margin:2px 0 0">Campus C91 &middot; ${esc(D.CAMPAIGN)} &middot;
      ${esc(D.WINDOW)} &middot; production, read-only, ${esc(D.AS_OF)}</p>
    ${kpis()}
    <div class="grid2">
      <div>
        <div class="k">The funnel, ad Explorers (people)</div>
        ${funnelChart()}
        <div class="src">Source: scripts/audits/explorer-ad-funnel run.sh funnel (F3, F4)</div>
        <div class="flag"><strong>Decision (${esc(D.DECISION.who)}, ${esc(D.DECISION.when)}):</strong>
          &ldquo;${esc(D.DECISION.quote)}&rdquo; Strategy A fixes the first session in the product; outreach stays with Maya.</div>
        <div class="k" style="margin-top:8px">Where they stalled</div>
        <ol style="margin:2px 0 0 16px;padding:0;font-size:10px">${D.STALLS.map((s) => `<li style="margin:1px 0">
          ${esc(s.title)}</li>`).join('')}</ol>
      </div>
      <div>
        <div class="k">The first session, before and after</div>
        <div class="mermaid">${FIRST_SESSION}</div>
        <table><thead><tr><th>Shipped</th><th>When</th></tr></thead><tbody>
          ${D.SHIPPED.map((s) => `<tr><td><strong>${esc(s.n)}</strong> ${esc(s.items[0])}</td>
            <td>${esc(s.when)}</td></tr>`).join('')}
        </tbody></table>
        <div class="src">Status: live in production. Not yet proven: the first-lesson rate after #3500 (read ~1 Nov).</div>
      </div>
    </div>`;
  return htmlDoc({ title: 'Campus C91 one page', css: baseCss() + SHARED, body });
}

function strategyBlock(s) {
  return `<h3>Strategy ${esc(s.id)}: ${esc(s.name)} <span class="pill ${s.chosen ? 'yes' : 'no'}">
    ${s.chosen ? 'chosen' : 'not chosen'}</span></h3>
    <p>${esc(s.what)}</p>
    <table><thead><tr><th style="width:50%">Pros</th><th>Cons</th></tr></thead><tbody><tr>
      <td><ul>${s.pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></td>
      <td><ul>${s.cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></td>
    </tr></tbody></table>`;
}

/** The full report. */
function buildDocument() {
  const signups = D.assertFunnelNarrows();
  const c = D.CUTOVER;
  const body = `
    <h1>Campus C91 &middot; Where ad Explorers stall, and the first-session fix</h1>
    <p class="lede"><strong>Asked:</strong> use the ad data to find where new people stall on the new campus, then
      give two strategies with pros and cons and one recommendation. <strong>Delivered:</strong> a production audit of
      ${signups} ad Explorers, two strategies, a recommendation that was chosen, and the fix shipped in two PRs.</p>

    <div class="bad"><strong>TAKEAWAY:</strong> the ads work and the first session did not. ${D.pct(352, 1129)}% of ad
      visits became leads, but of ${signups} new accounts 3 finished a lesson and 0 paid. The most-clicked thing in the
      portal was a request to pay. C91 removes that ask until someone finishes a first lesson. After one day,
      enroll-first clicks fell from ${D.pct(c.before.enroll_click, c.before.signed_up)}% to
      ${D.pct(c.after.enroll_click, c.after.signed_up)}%; whether lessons finished rises is the read due about 1 November.</div>

    <h2>1. The funnel</h2>
    <figure>${funnelChart(660)}<figcaption>${esc(D.CAMPAIGN)}. ${esc(D.WINDOW)}. People, not events.
      Source: <code>run.sh funnel</code> F3, F4, ${esc(D.AS_OF)}.</figcaption></figure>

    <h2>2. Where they stalled</h2>
    <table><thead><tr><th style="width:4%">#</th><th style="width:28%">Stall</th><th>Evidence (query id)</th></tr></thead>
      <tbody>${D.STALLS.map((s) => `<tr><td>${s.n}</td><td><strong>${esc(s.title)}</strong></td>
        <td>${esc(s.evidence)}</td></tr>`).join('')}</tbody></table>

    <h2>3. Two strategies</h2>
    ${D.STRATEGIES.map(strategyBlock).join('')}

    <h2>4. Recommendation and decision</h2>
    <p>Recommended: Strategy A first. Bringing people back to a first session that loses most of them in under five
      minutes mostly re-confirms the dead end. <strong>Decision:</strong> ${esc(D.DECISION.who)}, ${esc(D.DECISION.when)}:
      &ldquo;${esc(D.DECISION.quote)}&rdquo; Contacting the four people who stopped at checkout was dropped for the same
      reason.</p>
    <figure><div class="mermaid">${FIRST_SESSION}</div>
      <figcaption>The first session before and after C91. Numbers from run.sh funnel and behavior.</figcaption></figure>

    <h2>5. What shipped</h2>
    ${D.SHIPPED.map((s) => `<p><strong><a href="${esc(s.pr)}">${esc(s.n)}</a></strong>, ${esc(s.when)}</p>
      <ul>${s.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}
    <p>One deliberate exception: C77 says everyone starts at the Schedule. For Explorers before their first win only,
      the gate's main door goes to the first lesson; the map still opens on the Schedule and the tour still starts there.</p>

    <h2>6. The first day in production</h2>
    <table><thead><tr><th>Ad Explorers</th><th>Before C91</th><th>After C91</th></tr></thead><tbody>
      <tr><td>Signed up</td><td>${c.before.signed_up}</td><td>${c.after.signed_up}</td></tr>
      <tr><td>Clicked an enroll link</td><td>${c.before.enroll_click} (${D.pct(c.before.enroll_click, c.before.signed_up)}%)</td>
        <td>${c.after.enroll_click} (${D.pct(c.after.enroll_click, c.after.signed_up)}%)</td></tr>
      <tr><td>Came in through "Start your first lesson"</td><td>${c.before.gate_lesson}</td>
        <td>${c.after.gate_lesson} (${D.pct(c.after.gate_lesson, c.after.signed_up)}%)</td></tr>
      <tr><td>Finished a lesson (first win)</td><td>${c.before.first_win}</td><td>${c.after.first_win}</td></tr>
    </tbody></table>
    <p class="src">Source: <code>run.sh cutover</code> C1, C2; cutover 2026-10-29 23:30 UTC. The windows differ in length.</p>
    <div class="flag">${esc(D.FOUND_AFTER_DEPLOY)}</div>

    <h2>7. What this does not establish</h2>
    <ul>${D.NOT_ESTABLISHED.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>

    <h2>8. Open items (not in C91)</h2>
    <ul>${D.OPEN_ITEMS.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>

    <h2>9. Reproduce</h2>
    <p>On the production host, from <code>/opt/colaberry-accelerator</code>: <code>bash scripts/audits/explorer-ad-funnel/run.sh
      funnel</code>, then <code>behavior</code>, then <code>cutover</code>. Read-only: one transaction, always rolled back.
      Definitions and limits: <code>scripts/audits/explorer-ad-funnel/README.md</code>.
      Ticket: <a href="${esc(D.TICKET)}">${esc(D.TICKET)}</a>.</p>`;
  return htmlDoc({ title: 'Campus C91 audit and decision', css: baseCss() + SHARED, body });
}

module.exports = { buildVisual, buildDocument };
