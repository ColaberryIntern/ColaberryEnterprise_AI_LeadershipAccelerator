/**
 * C8.6 - renders the one-page hypothesis board and the full document.
 *
 * Both read c86Data, which parses the hypotheses and their kill conditions out of the
 * shipped register, so neither page can state a kill condition the code does not enforce.
 */
const D = require('./c86Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .hid{display:inline-block;background:#0f766e;color:#fff;font-size:9px;font-weight:700;
       padding:1px 6px;border-radius:3px;margin-right:5px}
  .dead{display:inline-block;background:#fdecea;color:#b3261e;font-size:8.5px;
        font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  code{font-size:10px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:9px 11px;font-size:11px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
        margin:8px 0}
  p{margin:0 0 8px} ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

/** Days remaining as a bar, shortest first. Encodes TIME, never evidence: there is none. */
function runway(w = 940) {
  const rows = D.HYPOTHESES.map((h) => ({
    h, days: D.OBSERVED.verdicts[h.key].daysLeft,
  })).sort((a, b) => a.days - b.days);

  const rowH = 30;
  // Widened from 252 after looking at the render: the two longest names ran off the
  // left edge of the page while the height check reported 77px to spare. The
  // parenthetical is dropped here and kept in full in the table below.
  const left = 312;
  const maxDays = Math.max(...rows.map((r) => r.days));
  const scale = (w - left - 86) / maxDays;
  const h = rows.length * rowH + 30;

  const bars = rows.map((r, i) => {
    const y = 8 + i * rowH;
    const bw = Math.max(2, r.days * scale);
    const name = r.h.label.split(' (')[0];
    return `<rect x="${left}" y="${y}" width="${bw}" height="${rowH - 10}" rx="3"
        fill="#fdecea" stroke="#b3261e"/>
      <text x="${left - 8}" y="${y + 14}" text-anchor="end" font-size="9.5"
        font-weight="600" fill="#334155">${esc(name)}</text>
      <text x="${left + bw + 7}" y="${y + 14}" font-size="10"
        fill="#b3261e" font-weight="700">${r.days} days</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img"
    aria-label="Days remaining on each revenue hypothesis, all with zero evidence">
    ${bars}
    <text x="${left}" y="${h - 6}" font-size="9.5" fill="#64748b">
      Bar length is TIME REMAINING, not progress. Every one of these has zero evidence.</text>
  </svg>`;
}

/** One page: all five bets, all empty, with the clock on each. */
function buildVisual() {
  const count = D.assertFiveHypothesesParsed();
  const soonest = Math.min(...Object.values(D.OBSERVED.verdicts).map((v) => v.daysLeft));

  const body = `
    <h1 style="margin:0">Five revenue bets, no evidence on any of them</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">C8.6 hypothesis health
    &middot; register from C0.1 section 6 &middot; counts from the C8.4 funnel
    &middot; measured ${esc(D.AS_OF)}</p>

    <div class="bad" style="margin-top:9px"><strong>All ${count} hypotheses read "no
    evidence in flight": zero at the target stage AND zero at every precursor.</strong>
    The soonest deadline is <strong>${soonest} days away</strong> and nothing has been
    contacted for it, let alone proposed. ${D.OBSERVED.strategicAccounts} organizations
    carry the strategic-account type, so the funnel has no denominator either. This is an
    empty pipeline, not a slow one.</div>

    ${runway()}

    <table>
      <thead><tr><th style="width:21%">Hypothesis</th><th style="width:20%">Needs</th>
        <th>Kill condition</th></tr></thead>
      <tbody>${D.HYPOTHESES.map((h, i) => `<tr>
        <td><span class="hid">${i + 1}</span><strong>${esc(h.label)}</strong><br>
          <span style="font-size:9.5px;color:#64748b">${esc(h.whoPays)}</span></td>
        <td>${esc(h.evidenceRequired)} <span class="dead">0 so far</span></td>
        <td>${esc(h.killCondition)}</td></tr>`).join('')}</tbody>
    </table>

    <div class="flag"><strong>Killing one is Ali’s call, not the board’s.</strong>
    C8.6 assigns that decision to him by name. This states the tripwire and the date; it
    retires nothing.</div>`;

  return htmlDoc({ title: 'C8.6 hypothesis health', css: baseCss() + SHARED, body });
}

/** The full document. */
function buildDocument() {
  const count = D.assertFiveHypothesesParsed();

  const body = `
    <h1>C8.6 &middot; Revenue hypothesis health</h1>
    <p class="lede" style="font-size:13px">Which revenue bets are gaining evidence and
    which are dying, computed from the funnel rather than from anybody’s sense of how
    it is going. The register comes from C0.1 section 6; the kill conditions are new,
    because that register has none.</p>

    <div class="bad"><strong>The finding.</strong> All ${count} hypotheses read "no
    evidence in flight" against production on ${esc(D.AS_OF)}: zero at the target stage
    and zero at every precursor. The accelerator bet has ${D.OBSERVED.verdicts.paid_accelerator.daysLeft}
    days left and nothing contacted. ${D.OBSERVED.strategicAccounts} organizations carry
    the strategic-account type.</div>

    <h2>What C0.1 registers, and what it does not</h2>
    <p>Section 6 lists five hypotheses, each with "evidence required to stay alive" and a
    state. All five read <em>Untested</em>. There is no kill condition anywhere, which is
    how a bet stays Untested until nobody remembers it was a bet. C8.6 names that failure
    directly: "keeping a hypothesis alive without evidence".</p>
    <p>Every price and buyer in that register reads UNKNOWN by design, and the register
    says why: filling them with estimates "would make this register useless as a test".
    None is reproduced here, and the build refuses a document that quotes one.</p>

    <h2>The five, with their kill conditions</h2>
    ${D.HYPOTHESES.map((h, i) => `
      <h3><span class="hid">${i + 1}</span>${esc(h.label)}</h3>
      <table><tbody>
        <tr><td style="width:20%"><strong>Who pays</strong></td><td>${esc(h.whoPays)}</td></tr>
        <tr><td><strong>Evidence required</strong></td>
          <td>${esc(h.evidenceRequired)} &mdash; <strong>0 so far</strong>, with
          ${D.OBSERVED.verdicts[h.key].daysLeft} days remaining</td></tr>
        <tr><td><strong>Kill condition</strong></td><td>${esc(h.killCondition)}</td></tr>
        <tr><td><strong>Dated tripwires</strong></td>
          <td>${h.tripwireDates.map((d) => `<code>${esc(d)}</code>`).join(', ')}</td></tr>
        ${h.registerLabel !== h.label ? `<tr><td><strong>In C0.1 it reads</strong></td>
          <td>${esc(h.registerLabel)}</td></tr>` : ''}
      </tbody></table>`).join('')}

    <h2>Why no sales cycle is projected</h2>
    <p><strong>The tempting approach:</strong> ${esc(D.NO_PROJECTION.tempting)}</p>
    <p><strong>Why it is not used:</strong> ${esc(D.NO_PROJECTION.whyNot)}</p>
    <p><strong>What is used instead:</strong> ${esc(D.NO_PROJECTION.instead)}</p>

    <h2>The distinction the board refuses to blur</h2>
    <p><strong>${esc(D.UNCOUNTABLE_RULE.what)}</strong></p>
    <p>${esc(D.UNCOUNTABLE_RULE.why)}</p>

    <h2>What this does not do</h2>
    <ul>
      <li><strong>It does not kill anything.</strong> C8.6 puts that decision with Ali by
      name. The board makes dying obvious and states the tripwire; retiring a bet is a
      judgment about strategy, not about arithmetic.</li>
      <li><strong>It does not add hypotheses.</strong> C8.6 puts new ones out of scope;
      this measures the five that are registered.</li>
      <li><strong>It does not claim a conversion rate.</strong> With an empty funnel
      there is no honest basis for one.</li>
      <li><strong>It cannot see what the funnel cannot see.</strong> Where a stage has no
      source, the hypothesis reads as not yet measurable rather than as failing.</li>
    </ul>

    <p style="font-size:11px;color:#64748b;margin-top:22px">Prepared ${esc(D.AS_OF)}.
    Hypotheses and kill conditions parsed from the shipped register. Counts measured
    against production the same day.</p>`;

  return htmlDoc({
    title: 'C8.6 revenue hypothesis health', css: baseCss() + SHARED, body,
  });
}

module.exports = { buildVisual, buildDocument };
