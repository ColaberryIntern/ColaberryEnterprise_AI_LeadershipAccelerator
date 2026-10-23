/**
 * C8.4 - renders the one-page funnel map and the full stage-definition document.
 *
 * Both read c84Data, which parses the definitions out of funnelStages.ts, so neither
 * page can disagree with the code the weekly number is computed from.
 */
const D = require('./c84Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const TONE = {
  live: { bg: '#e8f5e9', fg: '#1b5e20', label: 'countable now' },
  empty: { bg: '#e3f2fd', fg: '#0d47a1', label: 'source empty' },
  undeployed: { bg: '#fff3e0', fg: '#e65100', label: 'not deployed' },
  absent: { bg: '#fdecea', fg: '#b3261e', label: 'no source' },
};

const SHARED = `
  .k{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;
     font-weight:700;margin:0 0 5px}
  .pill{display:inline-block;font-size:8.5px;font-weight:700;padding:1px 6px;
        border-radius:3px;text-transform:uppercase;letter-spacing:.03em}
  .sid{display:inline-block;background:#0f766e;color:#fff;font-size:9px;font-weight:700;
       padding:1px 6px;border-radius:3px;margin-right:5px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  code{font-size:10px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:9px 11px;font-size:11px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
        margin:8px 0}
  p{margin:0 0 8px} ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

const pill = (ev) => {
  const t = TONE[ev] || TONE.absent;
  return `<span class="pill" style="background:${t.bg};color:${t.fg}">${esc(t.label)}</span>`;
};

/**
 * The funnel as ten bands, each carrying its own trigger.
 *
 * The first draft put the triggers in a table beside this, and the page measured 884px
 * against 740px of usable landscape. The two were enumerating the same ten stages, so
 * the table went and the trigger moved inside the band: one object instead of two that
 * have to be read against each other.
 */
function funnel(w = 950) {
  const rowH = 31;
  const h = D.STAGES.length * rowH + 14;
  const labelW = 132;
  // A FIXED right gutter for the evidence label. The first version placed that label at
  // the end of each band, which clipped it on the widest row and collided with the
  // trigger text on the narrowest - visible only by looking at the render, not in the
  // height measurement, which was comfortably inside its budget.
  const gutter = 104;
  const maxW = w - labelW - gutter;
  const CHAR = 5.45; // 9px monospace, measured against this render

  const rows = D.STAGES.map((s, i) => {
    const t = TONE[s.evidence] || TONE.absent;
    const y = 7 + i * rowH;
    // Width narrows down the funnel to read as one. It encodes POSITION, never a count:
    // no count exists for most of these stages, and a width that looked like a volume
    // would be the inference this whole ticket refuses.
    const bw = maxW * (1 - i * 0.055);
    // Truncate against the band this row actually has, not a fixed character count.
    const room = Math.floor((bw - 16) / CHAR);
    const trigger = s.trigger.length > room ? `${s.trigger.slice(0, room - 1)}…` : s.trigger;
    return `
      <rect x="${labelW}" y="${y}" width="${bw}" height="${rowH - 8}" rx="3"
        fill="${t.bg}" stroke="${t.fg}" stroke-width="1"/>
      <text x="${labelW - 8}" y="${y + 15}" text-anchor="end" font-size="10.5"
        font-weight="600" fill="#334155">${s.n}. ${esc(s.label)}</text>
      <text x="${labelW + 8}" y="${y + 15}" font-size="9" fill="${t.fg}"
        font-family="ui-monospace,Menlo,monospace">${esc(trigger)}</text>
      <text x="${w - 4}" y="${y + 15}" text-anchor="end" font-size="8" fill="${t.fg}"
        font-weight="700">${esc(t.label.toUpperCase())}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img"
    aria-label="The ten funnel stages, what fires each, and whether it can be counted today">
    ${rows}</svg>`;
}

/** One page: the ten stages, what fires each, and the one decision that moves the number. */
function buildVisual() {
  const m = D.MEASURED;
  const absent = D.assertAbsentStagesSaySo();

  const body = `
    <h1 style="margin:0">Ten stages, counted the same way every week</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">C8.4 commercial funnel
    instrumentation &middot; definitions parsed from <code>funnelStages.ts</code>
    &middot; measured ${esc(D.AS_OF)}</p>

    <div class="bad" style="margin-top:9px"><strong>An email open is not engagement, and
    neither is a click.</strong> Opens are fired by a tracking pixel that Apple Mail
    Privacy Protection and corporate pre-fetchers load with no human involved, and link
    scanners follow links for the same reason. Counting them would report
    <strong>${m.engagedUnderLooseRule.toLocaleString()} engaged</strong> where
    <strong>${m.engagedUnderStrictRule} people actually replied or answered</strong>.
    This is the definition to argue with if you are going to argue with one.</div>

    ${funnel()}

    <div class="flag"><strong>${esc(absent.join(' and '))} cannot be counted at all
    today.</strong> No table records a delivered demo, and nothing marks an engagement as
    paid. They are reported as uncounted rather than as zero, because zero is a claim.</div>

    <table style="margin-top:10px">
      <thead><tr><th style="width:12%">Channel</th><th>Sent</th><th>Opened</th>
        <th>Clicked</th><th>Replied or answered</th><th>Did not land</th></tr></thead>
      <tbody>${m.outcomes.map((o) => `<tr>
        <td><strong>${esc(o.channel)}</strong></td>
        <td>${(o.sent || 0).toLocaleString()}</td>
        <td>${o.opened ? o.opened.toLocaleString() : '-'}</td>
        <td>${o.clicked ? o.clicked.toLocaleString() : '-'}</td>
        <td><strong>${(o.replied || o.answered || 0) || '-'}</strong></td>
        <td>${o.bounced ? `${o.bounced} bounced` : ''}${o.noAnswer
    ? `${o.noAnswer} no answer, ${o.voicemail} voicemail` : ''}</td></tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:10px;color:#64748b;margin:2px 0 0">The bolded column is the only
    one that fires Engaged. ${m.bookedMeetings} meetings booked.
    ${m.strategicAccounts} accounts carry
    <code>organization_type = 'strategic_account'</code> today.</p>`;

  return htmlDoc({ title: 'C8.4 funnel stage definitions', css: baseCss() + SHARED, body });
}

/** The full definition document: the thing that stops the stages being re-invented. */
function buildDocument() {
  const m = D.MEASURED;

  const body = `
    <h1>C8.4 &middot; Commercial funnel stage definitions</h1>
    <p class="lede" style="font-size:13px">Ten stages, each with a written definition and
    an evidenced trigger. The test of this document is the ticket's own: two people should
    independently count the pipeline the same way. Where no evidence exists, the stage
    says so rather than being inferred from a neighboring one.</p>

    <div class="bad"><strong>Read this first.</strong> These definitions are parsed from
    <code>backend/src/services/commercialization/funnelStages.ts</code>, which is what
    <code>funnelStageService</code> computes from. If this document and the running code
    ever disagree, the code is right and the build that produced this page is broken.</div>

    <h2>The decision that moves the headline number</h2>
    <p>Engagement fires on a <strong>reply or an answered call</strong>, and on nothing
    else. Both require a person to produce something aimed at us. An open and a click do
    not:</p>
    <ul>
      <li>Tracking pixels are loaded by Apple Mail Privacy Protection and by corporate
      pre-fetchers, with no human involved.</li>
      <li>Links are followed by security scanners (Proofpoint, Mimecast, Defender) before
      a recipient ever sees the mail.</li>
    </ul>
    <p>Measured ${esc(D.AS_OF)}: <strong>${m.engagedUnderLooseRule.toLocaleString()}</strong>
    opens and clicks against <strong>${m.engagedUnderStrictRule}</strong> replies and
    answered calls. The looser rule reports a funnel roughly four hundred times wider at
    this stage, made almost entirely of machines. <strong>This is the definition Ali is
    asked to confirm or overturn</strong>; it is set in one place and reversing it is a
    one-line change plus its tests.</p>

    <h2>What the channels actually recorded</h2>
    <table>
      <thead><tr><th>Channel</th><th>Sent</th><th>Opened</th><th>Clicked</th>
        <th>Replied / answered</th><th>Other</th></tr></thead>
      <tbody>${m.outcomes.map((o) => `<tr>
        <td><strong>${esc(o.channel)}</strong></td>
        <td>${(o.sent || 0).toLocaleString()}</td>
        <td>${o.opened ? o.opened.toLocaleString() : '-'}</td>
        <td>${o.clicked ? o.clicked.toLocaleString() : '-'}</td>
        <td>${(o.replied || o.answered || 0) || '-'}</td>
        <td>${o.bounced ? `${o.bounced} bounced` : ''}
            ${o.noAnswer ? `${o.noAnswer} no answer, ${o.voicemail} voicemail` : ''}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p style="font-size:11px;color:#64748b">${m.bookedMeetings} meetings booked.
    ${m.strategicAccounts} accounts currently carry
    <code>organization_type = 'strategic_account'</code>; the nine organizations that
    exist are ${m.organizationsByType.enterprise_customer} enterprise_customer and
    ${m.organizationsByType.client} client. The funnel genuinely starts empty.</p>

    <h2>The ten stages</h2>
    ${D.STAGES.map((s) => `
      <h3><span class="sid">${s.n}</span>${esc(s.label)} ${pill(s.evidence)}</h3>
      <table><tbody>
        <tr><td style="width:17%"><strong>Means</strong></td>
          <td>${esc(s.definition)}</td></tr>
        <tr><td><strong>Fires on</strong></td><td><code>${esc(s.trigger)}</code></td></tr>
        <tr><td><strong>Evidence lives in</strong></td>
          <td>${s.source ? `<code>${esc(s.source)}</code>` : 'nothing yet'}</td></tr>
        <tr><td><strong>Why this and not a looser trigger</strong></td>
          <td>${esc(s.rationale)}</td></tr>
        ${s.excludes ? `<tr><td><strong>Deliberately not counted</strong></td>
          <td>${esc(s.excludes)}</td></tr>` : ''}
      </tbody></table>`).join('')}

    <h2>What this does not yet answer</h2>
    <ul>
      <li><strong>Two stages cannot be counted at all.</strong> Nothing records a
      delivered demo, and nothing marks an engagement as paid. Until something logs them,
      they are reported as uncounted rather than as zero.</li>
      <li><strong>Three stages have a correctly shaped source that is empty.</strong>
      Pilot proposed, Contract and Expansion are zero because nobody records
      opportunities or contracts, not because the schema cannot hold them.</li>
      <li><strong>Mapped is shipped but not live.</strong> C8.3 added
      <code>leads.organization_id</code>; merged is not deployed, so no interaction can be
      attributed to an account yet. Until that deploy lands, the per-account funnel reports
      attribution as unavailable rather than reporting zeros.</li>
      <li><strong>No conversion rate is claimed.</strong> With an empty funnel there is no
      honest basis for one, and a made-up rate would propagate into every forecast that
      cites it.</li>
    </ul>

    <p style="font-size:11px;color:#64748b;margin-top:22px">Prepared ${esc(D.AS_OF)}.
    Definitions parsed from <code>funnelStages.ts</code>. Counts measured against
    production on the same date.</p>`;

  return htmlDoc({
    title: 'C8.4 commercial funnel stage definitions', css: baseCss() + SHARED, body,
  });
}

module.exports = { buildVisual, buildDocument };
