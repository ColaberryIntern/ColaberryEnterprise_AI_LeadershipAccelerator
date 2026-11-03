/**
 * Campus C98 - renders the one-page feed visual and the full evidence report. Both read campusC98Data.
 */
const D = require('./campusC98Data');
const { esc, baseCss, barChart } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .k{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;margin:0 0 4px}
  .kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:8px 0 10px}
  .kpi{border:1px solid #e2e8f0;border-radius:6px;padding:7px 9px}
  .kpi b{display:block;font-size:20px;line-height:1.1}
  .kpi span{font-size:8.5px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  .kpi.bad b{color:#b3261e} .kpi.good b{color:#1b5e20}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  table{width:100%;border-collapse:collapse;font-size:10.5px;margin:6px 0}
  th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:8.5px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  td.n,th.n{text-align:right}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:7px 10px;font-size:10.5px;margin:8px 0}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:8px 10px;font-size:11px;margin:8px 0}
  code{font-size:9.5px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  p{margin:0 0 7px} ul{margin:4px 0 8px 16px;padding:0} li{margin:2px 0}
  .src{font-size:8px;color:#64748b;margin-top:3px}
`;

const n = (x) => Number(x).toLocaleString('en-US');

function typeChart(width = 460) {
  const top = D.TYPES.filter((r) => r.generated >= 400);
  return barChart({
    rows: top.map((r) => ({
      label: `${r.type.replace(/_/g, ' ')} (${r.kind})`, value: r.generated,
      color: r.opened ? '#0f766e' : (r.kind === 'ambient' ? '#94a3b8' : '#1e40af'),
      display: `${n(r.generated)} · ${r.opened} opened`,
    })),
    max: Math.round(top[0].generated * 1.45), width, barH: 14, gap: 4, labelW: 175,
  });
}

function attentionChart(width = 460) {
  return barChart({
    rows: [
      { label: 'On Today in their first hour', value: D.SCROLL.onToday, color: '#1e40af', display: String(D.SCROLL.onToday) },
      { label: 'Scrolled the page at all', value: D.SCROLL.scrolled, color: '#b3261e', display: String(D.SCROLL.scrolled) },
      { label: 'Opened any card (anywhere)', value: D.ANY_CARD.people, color: '#0f766e', display: String(D.ANY_CARD.people) },
      { label: 'Opened a card from the feed', value: D.ANY_CARD.viaFeed, color: '#64748b', display: String(D.ANY_CARD.viaFeed) },
    ],
    width, barH: 16, gap: 5, labelW: 175,
  });
}

function kpis() {
  const t = D.assertConsistent();
  const cells = [
    { v: n(D.TOTALS.people), l: 'ad Explorers with a feed', c: '' },
    { v: n(D.TOTALS.generatedFirstSession), l: 'items generated, first hour', c: '' },
    { v: `~${t.perPerson}`, l: 'items per person', c: 'bad' },
    { v: String(D.TOTALS.openedFirstSession), l: 'opened from the feed', c: 'bad' },
    { v: `${D.SCROLL.scrolled} of ${D.SCROLL.onToday}`, l: 'scrolled Today at all', c: 'bad' },
    { v: `${D.CONTROL.pct}%`, l: 'open rate, other learners (control)', c: 'good' },
  ];
  return `<div class="kpis">${cells.map((k) => `<div class="kpi ${k.c}"><b>${esc(String(k.v))}</b>
    <span>${esc(k.l)}</span></div>`).join('')}</div>`;
}

/** One landscape page. */
function buildVisual() {
  D.assertConsistent();
  const body = `
    <h1 style="margin:0;font-size:20px">New Explorers do not use the Today feed: 3 opens in 14,049 items, and most never scroll to it.</h1>
    <p style="font-size:10.5px;color:#64748b;margin:2px 0 0">Campus C98 &middot; ${esc(D.WINDOW)} &middot;
      production, read-only, ${esc(D.AS_OF)}</p>
    ${kpis()}
    <div class="grid2">
      <div>
        <div class="k">What the feed is made of, first hour (F3)</div>
        ${typeChart()}
        <div class="src">"Generated" = rows the server wrote for that person, not items seen. Only an open from the feed
          is logged. The logging works: other learners open ${D.CONTROL.pct}% of theirs (F9).</div>
      </div>
      <div>
        <div class="k">Where attention actually goes (F7, F8)</div>
        ${attentionChart()}
        <div class="flag"><strong>It is placement as much as content.</strong> Only ${D.SCROLL.scrolled} of
          ${D.SCROLL.onToday} scrolled Today at all. ${D.ANY_CARD.people - D.ANY_CARD.viaFeed} of ${D.ANY_CARD.people}
          people who opened a card did it outside the feed, mostly via the first-lesson button.</div>
        <div class="k" style="margin-top:8px">Recommended (build only after review)</div>
        <ol style="margin:2px 0 0 16px;padding:0;font-size:10px">${D.RECOMMENDATIONS.map((r) => `<li style="margin:1px 0">
          ${esc(r.title)}</li>`).join('')}</ol>
      </div>
    </div>`;
  return htmlDoc({ title: 'Campus C98 one page', css: baseCss() + SHARED, body });
}

/** The full report. */
function buildDocument() {
  const t = D.assertConsistent();
  const body = `
    <h1>Campus C98 &middot; Today's feed for a brand-new Explorer</h1>
    <p class="lede"><strong>Asked:</strong> measure which kinds of card a new Explorer's Today feed holds in their first
      session and which get any interaction, then recommend what a first-session feed should hold; build only after
      review. <strong>Delivered:</strong> a production measurement of ${n(D.TOTALS.people)} ad Explorers' feeds, a control
      showing the logging works, and three recommendations.</p>

    <div class="bad"><strong>TAKEAWAY:</strong> the feed is both too big and out of sight. In their first hour each new
      Explorer had about ${t.perPerson} items generated, about ${t.videosPerPerson} of them videos; 3 of 14,049 were
      opened. Only ${D.SCROLL.scrolled} of ${D.SCROLL.onToday} people on Today scrolled the page at all, and
      ${D.ANY_CARD.people - D.ANY_CARD.viaFeed} of the ${D.ANY_CARD.people} who opened a card did it outside the feed.</div>

    <h2>1. What the source measures</h2>
    <p><code>today_feed_impressions</code> gets one row per item the server builds for a learner. The composer fetches ahead
      (+4 per page, up to 6 rounds), rows the page later hides are still written, and nothing records what scrolled into
      view. The only interaction recorded is an open from the feed. This report therefore says "generated" and "opened",
      never "shown" or "clicked". First session = rows within 60 minutes of the person's first feed row.</p>
    <p><strong>Control (F9):</strong> for learners who are not Explorers the same logging recorded ${n(D.CONTROL.opened)} opens
      in ${n(D.CONTROL.generated)} rows (${D.CONTROL.pct}%). The near-zero for Explorers is real, not a broken log.</p>

    <h2>2. What a first-session feed holds (F2, F3)</h2>
    <p>${D.DEPTH.map((d) => `${d.people} people had ${esc(d.items)} items`).join('; ')}.</p>
    <table><thead><tr><th>Item type</th><th>Kind</th><th class="n">Generated</th><th class="n">People</th>
      <th class="n">Opened</th><th class="n">Best position</th></tr></thead><tbody>
      ${D.TYPES.map((r) => `<tr><td>${esc(r.type.replace(/_/g, ' '))}</td><td>${esc(r.kind)}</td><td class="n">${n(r.generated)}</td>
        <td class="n">${r.people}</td><td class="n">${r.opened}</td><td class="n">${r.best}</td></tr>`).join('')}
    </tbody></table>
    <p class="src">F3. Anchored = class cards (Explorers get Week 0 only); ambient = variety items between them (blog,
      testimonial, podcast), one after every two class cards.</p>

    <h2>3. Is it beginner-safe? (F4)</h2>
    <table><thead><tr><th>Fit</th><th>Surface</th><th class="n">Generated</th><th class="n">Opened</th></tr></thead><tbody>
      ${D.FIT.map((r) => `<tr><td>${esc(r.fit)}</td><td>${esc(r.surface)}</td><td class="n">${n(r.generated)}</td><td class="n">${r.opened}</td></tr>`).join('')}
    </tbody></table>
    <p>The content is not the problem in the narrow sense: every class card is Week 0. The problem is volume and order:
      about ${t.videosPerPerson} Week 0 videos plus a stream of blog, testimonial and podcast items, for someone who has
      not yet finished one lesson.</p>

    <h2>4. Where in the feed anything was opened (F5, F6)</h2>
    <table><thead><tr><th>Position</th><th class="n">Generated</th><th class="n">Opened</th></tr></thead><tbody>
      ${D.POSITIONS.map((r) => `<tr><td>${esc(r.pos)}</td><td class="n">${n(r.generated)}</td><td class="n">${r.opened}</td></tr>`).join('')}
    </tbody></table>
    <p>All three opens, ever: ${D.OPENS.map((o) => `a ${esc(o.type.replace(/_/g, ' '))} at position ${o.position} (${esc(o.opened)} UTC)`).join('; ')}.
      None since 28 October, the day before the first-lesson button (C91) shipped.</p>

    <h2>5. Where attention goes instead (F7, F8)</h2>
    <figure>${attentionChart(620)}<figcaption>F7, F8. "Scrolled" = any scroll event on Today within the first hour.</figcaption></figure>
    <p>The first-lesson button from C91 is doing the work the feed was meant to do: it opens a card directly, so those
      opens are not on the feed's rows at all.</p>

    <h2>6. Recommendations (build only after review)</h2>
    ${D.RECOMMENDATIONS.map((r) => `<h3>${r.n}. ${esc(r.title)}</h3><p><strong>Why:</strong> ${esc(r.why)}</p>
      <p><strong>What:</strong> ${esc(r.what)}</p>`).join('')}

    <h2>7. What this does not establish</h2>
    <ul>${D.NOT_ESTABLISHED.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>

    <h2>8. Reproduce</h2>
    <p>On the production host, from <code>/opt/colaberry-accelerator</code>:
      <code>bash scripts/audits/explorer-ad-funnel/run.sh feed</code>. Read-only: one transaction, always rolled back.
      Ticket: <a href="${esc(D.TICKET)}">${esc(D.TICKET)}</a>. C91 (first lesson):
      <a href="${esc(D.C91_TICKET)}">${esc(D.C91_TICKET)}</a>.</p>`;
  return htmlDoc({ title: 'Campus C98 Today feed', css: baseCss() + SHARED, body });
}

module.exports = { buildVisual, buildDocument };
