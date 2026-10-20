/**
 * C3.5 - renders the seven parts into one HTML bundle.
 *
 * HTML ONLY. "PDF not generated before approval" is an acceptance criterion on this ticket,
 * so there is deliberately no PDF path here and the build asserts that no job asks for one.
 * That inverts the usual rule in this repo, where a ticket gets PDFs because Basecamp will
 * not preview HTML. Here the ticket wins, and the comment on the ticket says why the folder
 * holds an HTML file instead.
 *
 * One file rather than seven, because the parts are read in order by one person preparing
 * for one meeting, and seven attachments is how a bundle becomes six unopened attachments.
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
      <p style="margin:0 0 6px"><strong>${esc(D.GAP.commitment)}</strong></p>
      <p style="margin:0 0 6px">${esc(D.GAP.missing)}</p>
      <p style="margin:0 0 6px;font-size:11.5px;color:#475569">${esc(D.GAP.corroboration)}</p>
      <p style="margin:0"><strong>${esc(D.GAP.soWhat)}</strong></p>
    </div>

    <div class="flag"><strong>A figure this package deliberately does not use.</strong>
    The brief asked us to lead on ${esc(D.REFUSED_FIGURE.figure)}. ${esc(D.REFUSED_FIGURE.why)}
    ${esc(D.REFUSED_FIGURE.instead)}</div>

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
    sent. It is a draft for approval, and no PDF has been generated, which is an acceptance
    criterion on this ticket rather than an oversight.</p>`;
  return htmlDoc({ title: 'OpenAI meeting package', css, body });
}

module.exports = { buildBundle };
