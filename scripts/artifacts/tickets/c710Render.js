/**
 * C7.10 - renders the one-page expansion map and the full framework document.
 *
 * Both read c710Data. The timeline on the visual is drawn from the same day numbers the
 * prose uses, so the picture cannot disagree with the text about when a signal appears.
 */
const D = require('./c710Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .k{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;
     font-weight:700;margin:0 0 5px}
  .box{border:1px solid #e2e8f0;border-radius:7px;padding:11px 13px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
        margin:8px 0}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:9px 11px;font-size:11px}
  table{width:100%;border-collapse:collapse;font-size:11.5px;margin:8px 0}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  .pid{display:inline-block;background:#0f766e;color:#fff;font-size:9px;font-weight:700;
       padding:1px 6px;border-radius:3px;margin-right:5px}
  .unp{display:inline-block;background:#fee2e2;color:#991b1b;font-size:8.5px;
       font-weight:700;padding:1px 5px;border-radius:3px;text-transform:uppercase}
  .pr{display:inline-block;background:#dcfce7;color:#166534;font-size:8.5px;
      font-weight:700;padding:1px 5px;border-radius:3px}
  p{margin:0 0 8px}
  ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

/** The pilot timeline, drawn from the same day numbers the prose uses. */
function timeline(w = 940, h = 150) {
  const pad = 46;
  const maxDay = 90;
  const x = (d) => pad + (d / maxDay) * (w - pad * 2);
  const lane = 52;

  const axis = `<line x1="${pad}" y1="${lane}" x2="${w - pad}" y2="${lane}"
    stroke="#cbd5e1" stroke-width="2"/>`
    + [0, 30, 45, 60, 75, 90].map((d) =>
      `<line x1="${x(d)}" y1="${lane - 5}" x2="${x(d)}" y2="${lane + 5}" stroke="#94a3b8"/>
       <text x="${x(d)}" y="${lane + 20}" text-anchor="middle" font-size="10"
         fill="#64748b">day ${d}</text>`).join('');

  const decision = `<line x1="${x(D.PILOT.decisionDay)}" y1="18" x2="${x(D.PILOT.decisionDay)}"
      y2="${h - 12}" stroke="#b91c1c" stroke-width="2" stroke-dasharray="4 3"/>
    <text x="${x(D.PILOT.decisionDay) + 5}" y="26" font-size="10" fill="#b91c1c"
      font-weight="700">day ${D.PILOT.decisionDay}: what to propose</text>`;

  const rows = D.PATHS.map((p, i) => {
    const y = lane + 40 + i * 17;
    return `<line x1="${x(p.day)}" y1="${y}" x2="${x(p.offerAt)}" y2="${y}"
        stroke="#0f766e" stroke-width="3" stroke-linecap="round"
        opacity="${p.priced ? 0.9 : 0.4}"/>
      <circle cx="${x(p.day)}" cy="${y}" r="3.5" fill="#0f766e"/>
      <text x="${x(p.day) - 7}" y="${y + 3.5}" text-anchor="end" font-size="9.5"
        fill="#334155">${esc(p.id)} ${esc(p.name)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h + D.PATHS.length * 17}" class="chart" role="img"
    aria-label="When each expansion signal appears and when the offer is made">
    ${axis}${decision}${rows}</svg>`;
}

/** One page: the five paths, when each signal shows, and the decision point. */
function buildVisual() {
  const pricing = D.assertUnpricedPathsAreFlagged();
  const body = `
    <h1 style="margin:0">A pilot is a project until it expands</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">C7.10 expansion framework
    &middot; pilot at ${'$' + D.PILOT.price.toLocaleString()} &middot; decision at day
    ${D.PILOT.decisionDay} &middot; prepared ${esc(D.AS_OF)}</p>

    <div class="bad" style="margin-top:9px"><strong>Designed, not observed.</strong>
    ${esc(D.NO_EXPERIENCE.evidence)} Every trigger and timing below comes from the
    economics and from how these conversations usually go. The first pilot tests this
    framework as much as the delivery.</div>

    ${timeline()}

    <table>
      <thead><tr><th style="width:21%">Path</th><th style="width:33%">The trigger</th>
        <th style="width:14%">Signal by</th><th>Price</th></tr></thead>
      <tbody>${D.PATHS.map((p) => `<tr>
        <td><span class="pid">${esc(p.id)}</span><strong>${esc(p.name)}</strong></td>
        <td>${esc(p.trigger)}</td>
        <td>day ${p.day}, offer day ${p.offerAt}</td>
        <td>${p.priced ? `<span class="pr">C2.3</span> ${esc(p.price)}`
    : `<span class="unp">unpriced</span> no approved rate`}</td></tr>`).join('')}</tbody>
    </table>

    <div class="flag"><strong>${pricing.unpriced.join(' and ')} have no approved price.</strong>
    C2.3 covers staffed cohorts and self-paced licenses. Consulting and partner deployment
    sit outside both families, and putting a plausible number beside them is how a deal
    gets priced in the room.</div>`;

  return htmlDoc({ title: 'C7.10 expansion framework', css: baseCss() + SHARED, body });
}

/** The full framework, including the negative signals the ticket asks for by name. */
function buildDocument() {
  const body = `
    <h1>C7.10 &middot; Pilot expansion and renewal</h1>
    <p class="lede" style="font-size:13px">A pilot that does not expand is a project, not a
    business. This defines what to propose at day ${D.PILOT.decisionDay}, what signal
    justifies each proposal, and the signals that mean a customer will not expand so
    effort moves somewhere better.</p>

    <div class="bad"><strong>Read this first.</strong> ${esc(D.NO_EXPERIENCE.evidence)}
    ${esc(D.NO_EXPERIENCE.consequence)}</div>

    <h2>The pilot this attaches to</h2>
    <table><tbody>
      <tr><td><strong>Price</strong></td><td>$${D.PILOT.price.toLocaleString()}, list only,
        with ${esc(D.PILOT.discountHeadroom)} of discount headroom</td></tr>
      <tr><td><strong>Net contribution</strong></td>
        <td>$${D.PILOT.netContribution.toLocaleString()}, which is
        ${esc(D.PILOT.netAsShareOfPrice)} of price. The pilot is not where the money is;
        the expansion is.</td></tr>
      <tr><td><strong>Decision point</strong></td><td>Day ${D.PILOT.decisionDay}</td></tr>
      <tr><td><strong>Source</strong></td><td>${esc(D.PILOT.src)}</td></tr>
    </tbody></table>

    <h2>What C2.3 actually prices</h2>
    <table>
      <thead><tr><th>Family</th><th>Basis</th><th>Figure</th><th>Note</th></tr></thead>
      <tbody>${D.PRICE_LIST.map((p) => `<tr><td><strong>${esc(p.family)}</strong></td>
        <td>${esc(p.basis)}</td><td>${esc(p.figure)}</td>
        <td>${esc(p.note)}</td></tr>`).join('')}</tbody>
    </table>

    <h2>The five paths</h2>
    ${D.PATHS.map((p) => `
      <h3><span class="pid">${esc(p.id)}</span>${esc(p.name)}
        ${p.priced ? '<span class="pr">priced from C2.3</span>'
    : '<span class="unp">no approved price</span>'}</h3>
      <table><tbody>
        <tr><td style="width:19%"><strong>Trigger</strong></td><td>${esc(p.trigger)}</td></tr>
        <tr><td><strong>Why that one</strong></td><td>${esc(p.why)}</td></tr>
        <tr><td><strong>Timing</strong></td><td>Signal visible by day ${p.day}; offer made
          at day ${p.offerAt}. A signal seen at day ${p.day} and acted on at day
          ${p.offerAt} is a planned conversion; the same signal noticed afterwards is a
          scramble.</td></tr>
        <tr><td><strong>Offer</strong></td><td>${esc(p.offer)}</td></tr>
        <tr><td><strong>Price</strong></td><td>${esc(p.price)}</td></tr>
        <tr><td><strong>Owner</strong></td><td>${esc(p.owner)}</td></tr>
      </tbody></table>`).join('')}

    <h2>The signals that say they will not expand</h2>
    <p>The ticket names the failure mode for this work: assuming expansion. These exist to
    redirect effort early rather than to be right at the post-mortem, so each says what to
    do rather than only what it means.</p>
    <table>
      <thead><tr><th style="width:27%">Signal</th><th style="width:9%">By</th>
        <th style="width:30%">What it means</th><th>What to do</th></tr></thead>
      <tbody>${D.NEGATIVE_SIGNALS.map((s) => `<tr>
        <td><strong>${esc(s.signal)}</strong></td>
        <td>${typeof s.by === 'number' ? `day ${s.by}` : esc(s.by)}</td>
        <td>${esc(s.means)}</td><td>${esc(s.do)}</td></tr>`).join('')}</tbody>
    </table>

    <h2>What this framework does not cover</h2>
    <ul>
      <li><strong>Consulting and partner deployment have no approved price.</strong> C2.3
      covers two families and neither of those is in it. They need a rate before either is
      offered, or they will be priced in the room.</li>
      <li><strong>No conversion rate is claimed.</strong> With zero pilots run there is no
      honest basis for one, and a made-up conversion rate in a framework like this would
      propagate into every forecast that cites it.</li>
      <li><strong>The two floors in C2.3 are referenced but not reproduced here</strong>,
      because this document could not read their values. Check them before discounting.</li>
    </ul>

    <p style="font-size:11px;color:#64748b;margin-top:22px">Prepared ${esc(D.AS_OF)}.
    Pricing from C2.3, approved 12 October 2026. Net contribution from C2.4. No pilot has
    been run.</p>`;

  return htmlDoc({ title: 'C7.10 pilot expansion and renewal', css: baseCss() + SHARED, body });
}

module.exports = { buildVisual, buildDocument };
