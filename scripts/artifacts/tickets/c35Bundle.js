/**
 * C3.5 - renders the seven parts into a one-page visual and a full bundle.
 *
 * PDFS ARE NOW IN SCOPE, and the sequence is the point. "PDF not generated before approval"
 * was an acceptance criterion, so for as long as the package was unread this file produced
 * HTML only. Ali asked to see the actual documents on 20 October 2026, which is the
 * approval the criterion was waiting for; `D.PDF_APPROVAL` records the sentence and the
 * date rather than a bare boolean, and the build still refuses a PDF job without it.
 *
 * One bundle rather than seven files, because the parts are read in order by one person
 * preparing for one meeting, and seven attachments is how a bundle becomes six unopened
 * attachments. The visual is the exception: it is the page that gets looked at on a phone.
 */
const D = require('./c35Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .part{border-top:2px solid #e2e8f0;margin:22px 0 0;padding:16px 0 0}
  .partk{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;
         font-weight:700;margin:0 0 4px}
  .lede{font-size:13px;line-height:1.55;margin:0 0 10px}
  .ask{background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 14px;margin:14px 0;
       font-size:13px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;margin:10px 0;
        font-size:11.5px}
  .gap{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px;
       margin:10px 0}
  .num{font-variant-numeric:tabular-nums;font-weight:700}
  .claimref{font-size:9px;color:#94a3b8}
  ul,ol{margin:6px 0 10px 18px;padding:0}
  li{margin:4px 0}
  .toc{font-size:11.5px;columns:2;margin:10px 0 0}
`;

const claimNote = (keys) => (keys && keys.length
  ? ` <span class="claimref">[${keys.map(esc).join(', ')}]</span>` : '');

function buildBundle() {
  const used = D.assertClaimsArePublishableAndNeutral();
  const css = baseCss() + SHARED;
  const body = `
    <h1>OpenAI meeting package</h1>
    <p class="lede">Colaberry Enterprise AI &middot; prepared ${esc(D.AS_OF)}. Seven parts,
    one ask. Every factual statement traces to the evidence appendix at the end.</p>

    <div class="toc">1. Leave-behind &middot; 2. Deck &middot; 3. Capability statement
    &middot; 4. Demo outline &middot; 5. Agenda &middot; 6. FAQ &middot; 7. Evidence</div>

    <div class="gap">
      <p class="partk">The gap we are leading on</p>
      <p style="margin:0 0 6px"><strong>${esc(D.GAP.scale)}</strong></p>
      <p style="margin:0 0 6px"><strong>${esc(D.GAP.commitment)}</strong></p>
      <p style="margin:0 0 6px">${esc(D.GAP.missing)}</p>
      <p style="margin:0 0 6px;font-size:11.5px;color:#475569">${esc(D.GAP.corroboration)}</p>
      <p style="margin:0"><strong>${esc(D.GAP.soWhat)}</strong></p>
    </div>

    <div class="flag"><strong>Two figures, two different populations. They are not
    interchangeable.</strong>
    ${D.PUBLIC_FIGURES.map((f) => `<p style="margin:6px 0 0">
      <strong>${esc(f.figure)} ${esc(f.population)}</strong> by ${esc(f.by)}
      &mdash; ${esc(f.role)}.<br>
      <span style="font-size:11.5px;color:#475569">&ldquo;${esc(f.wording)}&rdquo;
      ${esc(f.source)}</span></p>`).join('')}
    <p style="margin:8px 0 0;font-size:11.5px;color:#475569">Separated on purpose. Crossing
    them would be wrong in a way the reader of this document would catch immediately,
    because it is their own program.</p></div>

    <div class="part">
      <p class="partk">Part 1 &middot; Leave-behind</p>
      <h2>${esc(D.LEAVE_BEHIND.title)}</h2>
      <p class="lede">${esc(D.LEAVE_BEHIND.lede)}${claimNote(D.LEAVE_BEHIND.claims)}</p>
      <ul>${D.LEAVE_BEHIND.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    </div>

    <div class="part">
      <p class="partk">Part 2 &middot; Deck</p>
      <table>
        <thead><tr><th></th><th>Section</th><th>What it says</th></tr></thead>
        <tbody>${D.DECK.map((d) => `<tr>
          <td class="num">${d.n}</td>
          <td><strong>${esc(d.title)}</strong></td>
          <td>${esc(d.body)}${claimNote(d.claims)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="part">
      <p class="partk">Part 3 &middot; Capability statement</p>
      <table>
        <thead><tr><th>What we can do</th><th>Specifically</th></tr></thead>
        <tbody>${D.CAPABILITY.map((c) => `<tr>
          <td><strong>${esc(c.what)}</strong></td>
          <td>${esc(c.detail)}${claimNote(c.claims)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="part">
      <p class="partk">Part 4 &middot; Demo outline</p>
      <p>Four screens, in this order. The last one is the point.</p>
      <ol>${D.DEMO.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>
    </div>

    <div class="part">
      <p class="partk">Part 5 &middot; Agenda</p>
      <table>
        <thead><tr><th>Minutes</th><th>What</th></tr></thead>
        <tbody>${D.AGENDA.map((a) => `<tr>
          <td class="num">${a.mins}</td><td>${esc(a.item)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="part">
      <p class="partk">Part 6 &middot; FAQ</p>
      ${D.FAQ.map((f) => `<p><strong>${esc(f.q)}</strong><br>${esc(f.a)}</p>`).join('')}
    </div>

    <div class="part">
      <p class="partk">Part 7 &middot; Evidence appendix</p>
      <p>Where every factual statement above comes from. Nothing here rests on a figure we
      cannot point at.</p>
      <table>
        <thead><tr><th>Statement</th><th>Source</th></tr></thead>
        <tbody>${D.EVIDENCE.map((e) => `<tr>
          <td>${esc(e.claim)}</td><td>${esc(e.source)}</td>
        </tr>`).join('')}</tbody>
      </table>
      <p style="font-size:11px;color:#64748b">Claims about us resolve through the C0.6
      registry. ${used.length} are cited in this bundle:
      ${used.map((u) => `<code>${esc(u)}</code>`).join(', ')}.</p>
    </div>

    <div class="ask">
      <p class="partk" style="color:#166534">The ask</p>
      <strong>${esc(D.THE_ASK)}</strong>
    </div>

    <p style="font-size:10px;color:#64748b;margin-top:14px">Nothing in this package has been
    sent. It is a draft for approval. PDFs were held back until
    ${esc(D.PDF_APPROVAL.on)}, when ${esc(D.PDF_APPROVAL.approvedBy)} asked to see the
    documents; that sequence was an acceptance criterion on this ticket.</p>`;
  return htmlDoc({ title: 'OpenAI meeting package', css, body });
}

const VISUAL = `
  .wrap{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px}
  .box{border:1px solid #e2e8f0;border-radius:7px;padding:11px 13px}
  .fig{display:flex;gap:11px;align-items:baseline;margin:0 0 7px}
  .fign{font-size:27px;font-weight:800;letter-spacing:-.02em;line-height:1;
        font-variant-numeric:tabular-nums}
  .figp{font-size:12px;font-weight:700}
  .figb{font-size:10.5px;color:#64748b}
  .k{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;
     font-weight:700;margin:0 0 5px}
  .hole{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px}
  .askbox{background:#f0fdf4;border-left:4px solid #16a34a;padding:10px 13px;
          font-size:12.5px;margin-top:12px}
  .parts{font-size:10.5px;color:#475569;margin:7px 0 0;line-height:1.7}
  p{margin:0 0 6px}
`;

/**
 * The one-page landscape visual.
 *
 * It exists because the bundle is seven parts and nobody reads seven parts on a phone. Its
 * whole job is to make the two figures sit side by side with their populations attached,
 * since that pairing is the thing this document can most easily get wrong.
 */
function buildVisual() {
  const css = baseCss() + VISUAL;
  const [scale, near] = D.PUBLIC_FIGURES;
  const body = `
    <h1 style="margin:0">The assessment behind the certificate</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">OpenAI meeting package
    &middot; C3.5 &middot; prepared ${esc(D.AS_OF)} &middot; nothing sent</p>

    <div class="wrap">
      <div>
        <div class="box">
          <p class="k">What they have committed to publicly</p>
          ${[scale, near].map((f) => `<div class="fig">
            <span class="fign">${esc(f.figure)}</span>
            <span><span class="figp">${esc(f.population)}</span>
            <span class="figb">by ${esc(f.by)} &middot; ${esc(f.role)}</span></span>
          </div>`).join('')}
          <p class="figb" style="margin:0">Two different populations. Not interchangeable.</p>
        </div>
        <div class="box" style="margin-top:12px">
          <p class="k">The hole</p>
          <div class="hole">${esc(D.GAP.missing)} ${esc(D.GAP.corroboration)}</div>
        </div>
      </div>

      <div>
        <div class="box">
          <p class="k">Why it matters now</p>
          <p style="font-size:12px"><strong>${esc(D.GAP.soWhat)}</strong></p>
        </div>
        <div class="box" style="margin-top:12px">
          <p class="k">What we bring</p>
          ${D.LEAVE_BEHIND.points.map((p) => `<p style="font-size:11px">${esc(p)}</p>`).join('')}
        </div>
      </div>
    </div>

    <div class="wrap" style="margin-top:12px">
      <div class="box">
        <p class="k">The thirty minutes</p>
        ${D.AGENDA.map((a) => `<p style="font-size:11px;margin:0 0 4px">
          <span class="fign" style="font-size:13px">${esc(String(a.mins))}</span>
          <span class="figb" style="font-size:9.5px">min</span>
          &nbsp;${esc(a.item)}</p>`).join('')}
      </div>
      <div class="box">
        <p class="k">What the demo shows, in order</p>
        ${D.DEMO.map((d, i) => `<p style="font-size:11px;margin:0 0 4px">
          <span class="figb">${i + 1}.</span> ${esc(d)}</p>`).join('')}
      </div>
    </div>

    <div class="askbox"><strong>The ask:</strong> ${esc(D.THE_ASK)}</div>
    <p class="parts">Full package, seven parts: leave-behind &middot; deck &middot;
    capability statement &middot; demo outline &middot; agenda &middot; FAQ &middot;
    evidence appendix, where every factual statement above is sourced.</p>`;
  return htmlDoc({ title: 'OpenAI meeting package', css, body });
}

module.exports = { buildBundle, buildVisual };
