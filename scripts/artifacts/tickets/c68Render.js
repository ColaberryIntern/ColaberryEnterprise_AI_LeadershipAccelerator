/**
 * C6.8 renderers. All data comes from c68Data; nothing is restated here.
 *
 * The one-pager leads with the stop rule rather than the sequence, because the stop rule is
 * what this ticket is actually about: "volume without a stop rule becomes spam".
 */
const D = require('./c68Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .lede{font-size:12.5px;line-height:1.5;margin:0 0 10px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .ch{display:inline-block;padding:1px 7px;border-radius:9px;font-size:9.5px;
      font-weight:700;color:#fff}
  .ch-e{background:#1d4ed8}
  .ch-l{background:#0f766e}
  .seq td{vertical-align:top}
  .num{font-variant-numeric:tabular-nums;font-weight:700}
  .scope{font-size:9px;font-weight:700;letter-spacing:.04em}
  .seqscope{color:#b45309}
  .ctscope{color:#475569}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:8px 10px;margin:8px 0;
        font-size:11px}
  .ok{background:#f0fdf4;border-left:3px solid #16a34a;padding:8px 10px;margin:8px 0;
      font-size:11px}
`;

const channelChip = (c) => (c === 'Email'
  ? '<span class="ch ch-e">EMAIL</span>'
  : '<span class="ch ch-l">LINKEDIN</span>');

function sequenceTable(full) {
  return `<table class="seq">
    <thead><tr><th>#</th><th>Day</th><th>Channel</th><th>Action</th>
      ${full ? '<th>Why this, here</th>' : ''}</tr></thead>
    <tbody>${D.TOUCHES.map((t) => `<tr>
      <td class="num">${t.n}</td>
      <td class="num">${t.day}</td>
      <td>${channelChip(t.channel)}</td>
      <td><strong>${esc(t.action)}</strong><br>${esc(t.what)}</td>
      ${full ? `<td>${esc(t.why)}</td>` : ''}
    </tr>`).join('')}</tbody></table>`;
}

/**
 * `full` picks the long action text or the terse one.
 *
 * The one-pager was 132px over a single page and this table was the taller column, so the
 * short form exists to fit it. The document keeps every word: the fix for an overflowing
 * one-pager is to cut what the one-pager says, never what the spec says.
 */
function stopTable(full) {
  return `<table>
    <thead><tr><th>Stop when</th><th>Number</th><th>Scope</th><th>What happens</th></tr></thead>
    <tbody>${D.STOP_RULE.map((r) => `<tr>
      <td>${esc(r.trigger)}</td>
      <td class="num">${r.threshold}</td>
      <td class="scope ${r.scope === 'SEQUENCE' ? 'seqscope' : 'ctscope'}">${esc(r.scope)}</td>
      <td>${esc(full ? r.action : r.short)}${r.automatic ? '' : ' <strong>(manual)</strong>'}</td>
    </tr>`).join('')}</tbody></table>`;
}

function copyTable() {
  const registry = D.loadRegistry();
  return `<table>
    <thead><tr><th>Touch</th><th>Subject</th><th>Copy</th><th>Claims</th></tr></thead>
    <tbody>${Object.entries(D.COPY).map(([id, c]) => `<tr>
      <td><strong>${esc(id)}</strong></td>
      <td>${c.subject ? esc(c.subject) : '<em>n/a</em>'}</td>
      <td>${esc(c.body)}${c.requiresNonAffiliation
    ? `<br><br><em>${esc(D.NON_AFFILIATION)}</em>` : ''}</td>
      <td>${c.claims.length
    ? c.claims.map((k) => `<code>${esc(k)}</code><br><span style="font-size:9px;color:#64748b">`
      + `${esc(registry.get(k).verification)}</span>`).join('<br>')
    : '<em>none</em>'}</td>
    </tr>`).join('')}</tbody></table>`;
}

function buildVisual() {
  const stops = D.STOP_RULE.length;
  const sequenceStops = D.STOP_RULE.filter((r) => r.scope === 'SEQUENCE').length;
  const conflicted = D.assertNoProhibitedWord();
  const css = baseCss() + SHARED;
  const body = `
    <h1>C6.8 &middot; Tier-2 multi-touch sequence</h1>
    <p class="lede"><strong>Six touches over 21 days, and ${stops} numbered ways to stop,
    ${sequenceStops} of which kill the whole sequence rather than one contact.</strong>
    The stop rule is the deliverable here. Tier 2 is where volume lives, and volume without
    a brake is spam.</p>

    <div class="grid2">
      <div>
        <h2>The sequence</h2>
        ${sequenceTable(false)}
        <div class="ok"><strong>Touch 1 asks for nothing.</strong> A comment on their own
        recent post is a contribution. A connection request on day 0 is a withdrawal before
        any deposit has been made.</div>
      </div>
      <div>
        <h2>The stop rule, set before the first send</h2>
        ${stopTable(false)}
      </div>
    </div>

    <div class="flag"><strong>LinkedIn has no unsubscribe, and two publishable claims say a
    word we may not advertise.</strong> A refusal expressed on LinkedIn is only honored once
    a human records it, which is why touch 5 is the only LinkedIn message and three
    LinkedIn actions is a hard ceiling. Separately,
    <code>${conflicted.map(esc).join('</code> and <code>')}</code> are VERIFIED in the C0.6
    registry and contain "free"; outbound email is advertising, so this sequence uses
    neither. The registry gate and the advertising rule disagree, and that is a decision
    rather than something to paper over.</div>

    <p style="font-size:10px;color:#64748b;margin-top:6px">Nothing is configured to send.
    No campaign, no enrollment, no schedule. Measured against the claim registry on
    ${esc(D.AS_OF)}.</p>`;
  return htmlDoc({ title: 'C6.8 - Tier-2 Multi-Touch Campaign', css, body });
}

function buildDocument() {
  const claims = D.assertEveryClaimIsPublishable();
  const conflicted = D.assertNoProhibitedWord();
  const css = baseCss() + SHARED;
  const body = `
    <h1>C6.8 &middot; Tier-2 multi-touch sequence, stop rule and copy</h1>
    <p class="lede">The design and the copy. Nothing in here is configured for live sending,
    and the ticket ends BLOCKED pending your decision on the copy and on activation.</p>

    <h2>Who this is for, and who it is not</h2>
    <p>${esc(D.AUDIENCE.who)}</p>
    <p><strong>${esc(D.AUDIENCE.excluded)}</strong></p>
    <div class="flag"><strong>The roster does not exist yet.</strong>
    ${esc(D.AUDIENCE.notEnumerated)}</div>

    <h2>The sequence</h2>
    ${sequenceTable(true)}

    <h2>The stop rule</h2>
    <p>Every condition carries a number, and the build fails if one ever stops carrying one.
    "Stop when it is clearly not working" is the rule that never fires.</p>
    ${stopTable(true)}

    <h2>Unsubscribe and do-not-contact</h2>
    <h3>Email</h3>
    <ul>${D.SUPPRESSION.email.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <h3>LinkedIn</h3>
    <ul>${D.SUPPRESSION.linkedin.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>

    <h2>The copy</h2>
    <p>Each claim is checked against <code>frontend/src/config/claimsRegistry.ts</code> when
    this document is built. ${claims.used.length} distinct claims are cited, every one of
    them VERIFIED or OWNER_ATTESTED, out of ${claims.registrySize} in the registry. A claim
    that is later downgraded stops this artifact building rather than letting the copy keep
    asserting it.</p>
    ${copyTable()}

    <h2>What this design refuses to claim</h2>
    <ul>
      <li><strong>That engaging a post first measurably beats a cold request.</strong> The
      ticket asserts it and the sequence is built that way, but no registry row supports a
      figure, so no figure is given. It is a design principle here, not a result.</li>
      <li><strong>Any reply or meeting rate.</strong> There is none to report. C9.8
      established there have been no buyer conversations at all, so the 40-contact review
      gate exists precisely to produce the first real number.</li>
      <li><strong>The word "free".</strong> ${conflicted.map((c) => `<code>${esc(c)}</code>`)
    .join(' and ')} are publishable per the registry and carry it anyway. Outbound email is
      advertising, so neither is used.</li>
    </ul>

    <h2>Limits</h2>
    <ul>
      <li>No tier-2 account roster exists. This specifies the sequence, not who receives it.</li>
      <li>LinkedIn suppression is manual, which is the weakest part of the design.</li>
      <li>The 5 percent reply-rate gate at 40 contacts is a judgment set before the first
      send so it cannot be rationalized afterwards. It is not derived from our own data,
      because we have none.</li>
      <li>Nothing is activated. No campaign record, no enrollment, no schedule.</li>
    </ul>

    <h2>What needs your decision</h2>
    <ol>
      <li>The copy, all four blocks.</li>
      <li>Whether the 40-contact, 5 percent review gate is the right brake.</li>
      <li>The "free" conflict: reword those two registry claims, or leave them unusable in
      advertising.</li>
      <li>Activation, which no code here performs.</li>
    </ol>

    <p style="font-size:10px;color:#64748b;margin-top:12px">
    <strong>REVIEW STATE: BLOCKED - ALI DECISION REQUIRED</strong></p>`;
  return htmlDoc({ title: 'C6.8 - Tier-2 Multi-Touch Campaign', css, body });
}

module.exports = { buildVisual, buildDocument };
