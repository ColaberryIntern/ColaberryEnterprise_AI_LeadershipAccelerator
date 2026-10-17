/**
 * C7.0's two deliverables: the one-page visual, and the go/no-go document.
 *
 * The visual leads with the two decisions and the single number that drives both, because
 * the ticket's whole purpose is to stop two different gates being confused with each other.
 */
const D = require('./c70Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .src { display:inline-block; padding:1px 6px; border-radius:9px; font-size:7.3pt;
         font-weight:700; color:#fff; white-space:nowrap; }
  .dec { border:1px solid var(--border); border-left:4px solid #b3261e; border-radius:0 6px 6px 0;
         padding:9px 12px; margin:0 0 9px; background:#fdf7f6; }
  .dec .q { font-weight:700; font-size:10.5pt; }
  .dec .rec { color:#b3261e; font-weight:700; margin:3px 0 5px; }
  .dec .why { font-size:9pt; }
  .split { display:flex; gap:9px; margin:9px 0 12px; }
  .split .c { flex:1; border:1px solid var(--border); border-radius:6px; padding:9px 11px;
              text-align:center; }
  .split .c .n { font-size:21pt; font-weight:700; line-height:1; }
  .split .c .k { font-size:7.4pt; color:var(--muted); text-transform:uppercase;
                 letter-spacing:.04em; margin-top:4px; }
  .cite { font-size:8pt; color:var(--muted); font-style:italic; }
`;

const srcChip = (s) => `<span class="src" style="background:${s.color}">${esc(s.k)}</span>`;

/** 8 of 76, drawn, because the ratio is the argument. */
function contractBar() {
  const w = 640;
  const withC = Math.round((8 / 76) * w);
  return `<svg width="${w}" height="56" viewBox="0 0 ${w} 56" role="img"
      aria-label="8 of 76 certified vendor programs carry a DIR cooperative contract; 68 do not">
    <rect x="0" y="6" width="${withC}" height="26" rx="4" fill="#2f7d32"></rect>
    <rect x="${withC + 2}" y="6" width="${w - withC - 2}" height="26" rx="4" fill="#b3261e"></rect>
    <text x="${withC + 12}" y="24" font-family="Segoe UI, sans-serif" font-size="12"
      font-weight="700" fill="#ffffff">68 a state agency cannot simply buy</text>
    <text x="0" y="50" font-family="Segoe UI, sans-serif" font-size="10" fill="#2f7d32"
      font-weight="700">8 carry a DIR cooperative contract</text>
  </svg>`;
}

function decisionCards(short) {
  return D.DECISIONS.map((d) => `<div class="dec">
    <div class="q">${d.n}. ${esc(d.q)}</div>
    <div class="rec">${esc(d.rec)}</div>
    ${short ? '' : `<div class="why">${esc(d.because)}</div>
    <div class="cite" style="margin-top:4px">What it would cost: ${esc(d.cost)}</div>`}
  </div>`).join('');
}

/* ------------------------------------------------------------------ *
 * 1. THE ONE-PAGE VISUAL
 * ------------------------------------------------------------------ */

function buildVisual() {
  const css = `${baseCss()}
    /* No @page size: renderArtifactPdf emits Letter and sets the margin itself. Declaring a
       size here fights it and silently forces a second sheet. */
    @page { margin: 10mm; }
    .wrap { padding:0; }
    h1 { font-size:16pt; }
    h2 { font-size:10.5pt; margin:10px 0 5px; }
    body { font-size:9pt; }
    .cols { display:flex; gap:14px; align-items:flex-start; }
    .col { flex:1; }
    .takeaway { padding:9px 12px; margin:0 0 10px; }
    .takeaway .headline { font-size:10.5pt; }
    .dec { padding:7px 10px; margin:0 0 6px; }
    table { font-size:8.2pt; margin:4px 0 8px; }
    td, th { padding:4px 6px; }
    ${SHARED}`;

  const body = `<div class="wrap">
    <h1>C7.0 &middot; ETPL go/no-go and the HB 3512 channel</h1>
    <div class="meta">Verified against primary sources ${esc(D.AS_OF)} &middot;
      the chapter 132 workstream stays withdrawn</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>The two decisions</h2>
        ${decisionCards(true)}

        <h2>Why certification is not the asset</h2>
        ${contractBar()}
        <div class="meta">DIR&rsquo;s own footnote: state agencies, which includes higher
          education and public junior colleges, &ldquo;must select a program that is offered
          through DIR&rsquo;s cooperative contracts&rdquo;, or request an exemption. It does
          NOT bind local government or school districts, and that is the segment a certified
          program without a vehicle can still sell to.</div>

        <h2>Where DIR stands today</h2>
        <table>
          <tr><td style="width:46%">Applications</td><td><b>Still closed.</b> The page is
            byte-identical to its 10 Oct archive</td></tr>
          <tr><td>Reopening date</td><td><b>None published anywhere.</b> 31 August is
            DIR&rsquo;s annual cadence, a planning assumption, not a fact</td></tr>
          <tr><td>Way in</td><td>One undocumented email exception route. No form, no
            criteria, no timeline</td></tr>
          <tr><td>Certified programs</td><td>127, at revision Final 4.0 of 21 Sep 2026</td></tr>
          <tr><td>Cost to certify</td><td>$0, which is also why nothing keeps competitors
            out</td></tr>
        </table>
        <div class="meta"><b>The free substitute has one gap.</b> DIR gives its own certified
          program away, but states it has no tracking and issues no completion certificates.
          Against a 31 August compliance deadline that is the only wedge, and it is thin.</div>
      </div>

      <div class="col">
        <h2>What an ETPL listing would cost us</h2>
        <table>
          ${D.ETPL_COST.slice(0, 5).map((c) => `<tr><td style="width:34%">${esc(c.k)}</td>
            <td>${esc(c.v)}</td></tr>`).join('')}
        </table>
        <div class="note warn" style="padding:6px 10px"><b>The reporting covers every student,
          not only the funded ones.</b> For a program we also sell commercially, that means
          handing TWC student-level data including Social Security numbers for the private-pay
          cohort too.</div>

        <h2>What we already satisfy</h2>
        <table>
          ${D.ALREADY_MET.map((a) => `<tr><td style="width:34%">${esc(a.k)}</td>
            <td>${esc(a.v)}</td></tr>`).join('')}
        </table>
        <div class="meta">So the no-go is a choice rather than a failure to qualify.</div>
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'C7.0 - ETPL go/no-go and the HB 3512 channel', css, body });
}

/* ------------------------------------------------------------------ *
 * 2. THE DOCUMENT
 * ------------------------------------------------------------------ */

function buildDocument() {
  const css = `${baseCss()}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }
    ${SHARED}`;

  const body = `<div class="wrap">
    <h1>C7.0 &middot; ETPL go/no-go and the HB 3512 channel</h1>
    <div class="meta">Verified against primary sources ${esc(D.AS_OF)} &middot; Ticket C7.0</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for, as it stands after your correction of 8 October.</b>
      Workstream 1 is withdrawn: Colaberry is already a TWC-licensed career school and Swati
      already owns that thread. What remains is a decision on whether to pursue an ETPL
      listing, the real DIR re-opening date rather than a guess, and a written decision on the
      awareness module made on channel value rather than training revenue.
      <br><br>
      <b>What was delivered.</b> Both decisions with the evidence under them, the DIR status
      re-verified today, and the finding that changes the second question.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>1. The two decisions</h2>
    ${decisionCards(false)}

    <h2>2. Why DIR certification does not make us buyable</h2>
    ${contractBar()}
    <p>Printed at the foot of DIR&rsquo;s own vendor tables: state agencies &ldquo;must select
    a program that is offered through DIR&rsquo;s cooperative contracts&rdquo;, and an agency
    wanting to buy outside one &ldquo;must request an exemption&rdquo;. A companion footnote
    defines state agency to include institutions of higher education and public junior
    colleges. So for that whole buyer class, a certified program with no contract vehicle
    makes the buyer do extra paperwork to choose us, against competitors who do not.</p>
    <p><b>The footnote does not reach local government or school districts.</b> They are
    covered by the training mandate and are not bound by that procurement sentence. That is
    where a certified-but-uncontracted program can still sell, and it is the honest shape of
    the channel if we ever get certified.</p>

    <h2>3. The measurements</h2>
    <table>
      <tr><th style="width:42%">Measurement</th><th style="width:12%">Value</th>
        <th style="width:14%">Source</th><th>How</th></tr>
      ${D.NUMBERS.map((n) => `<tr><td>${esc(n.k)}</td><td><b>${esc(n.v)}</b></td>
        <td>${srcChip(n.src)}</td><td class="meta">${esc(n.how)}</td></tr>`).join('')}
    </table>
    <div class="note"><b>The free substitute has one real gap.</b> DIR publishes its own
    certified program at no cost, but states that it &ldquo;does not include tracking
    capabilities or provide certificates of completion&rdquo;, leaving employers to document
    completion themselves. Against an annual compliance certification due 31 August, that
    recordkeeping burden is the only thing worth selling against, and it is a thin wedge.</div>

    <div class="pagebreak"></div>
    <h2>4. What an ETPL listing would actually cost</h2>
    <table>
      <tr><th style="width:26%">Obligation</th><th style="width:44%">What it means</th>
        <th>Authority</th></tr>
      ${D.ETPL_COST.map((c) => `<tr><td>${esc(c.k)}</td><td>${esc(c.v)}</td>
        <td class="cite">${esc(c.cite)}</td></tr>`).join('')}
    </table>
    <p>Against that, what listing buys is access to students funded through an Individual
    Training Account. The incumbent worker revenue that motivated this question does not need
    it: a board may fund that work through a training contract, and contract-funded programs
    are exempt from this chapter&rsquo;s information and performance requirements.</p>

    <h2>5. What we already satisfy, so the no-go is a choice</h2>
    <table>
      <tr><th style="width:26%">Requirement</th><th style="width:30%">Status</th>
        <th>Authority</th></tr>
      ${D.ALREADY_MET.map((a) => `<tr><td>${esc(a.k)}</td><td><b>${esc(a.v)}</b></td>
        <td class="cite">${esc(a.cite)}</td></tr>`).join('')}
    </table>

    <h2>6. The constraint that outlives both decisions</h2>
    <div class="note warn"><b>${esc(D.TEXAS_TRAP.what)}.</b> ${esc(D.TEXAS_TRAP.detail)}</div>
    <ol>${D.TEXAS_TRAP.follows.map((f) => `<li style="margin-bottom:5px">${esc(f)}</li>`).join('')}</ol>

    <h2>7. What we could not establish</h2>
    <ol>${D.UNVERIFIED.map((u) => `<li style="margin-bottom:5px">${esc(u)}</li>`).join('')}</ol>
    <div class="note warn"><b>A live defect on TWC&rsquo;s own page.</b> ${esc(D.TWC_PAGE_DEFECT)}</div>
    <p>The highest-value remaining question is not on this ticket and should get its own: how
    a DIR cooperative contract is obtained, whether those vehicles are open, and what it
    costs. One contract number appears against two unrelated vendors, which suggests a
    reseller vehicle; if that is right, buying through an existing holder may be faster than
    winning an award.</p>
  </div>`;

  return htmlDoc({ title: 'C7.0 - ETPL go/no-go and the HB 3512 channel', css, body });
}

module.exports = { buildVisual, buildDocument };
