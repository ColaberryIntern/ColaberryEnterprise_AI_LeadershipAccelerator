/**
 * The C4 sales set: the master deck, the one-pager and the capability statement.
 *
 * Three artifacts, three tickets, one data module, so a figure cannot differ between them.
 */
const D = require('./c4Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const cites = (ids) => (ids.length
  ? `<div class="cites">Registry: ${ids.map((i) => `<code>${esc(i)}</code>`).join(' &middot; ')}</div>`
  : '');

const SHARED = `
  .cites { font-size:8pt; color:var(--muted); margin-top:8px; }
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
           margin:0 0 15px; border-radius:0 5px 5px 0; }
  .tier { border-radius:7px; padding:11px 15px; margin:0 0 11px; }
  .tier h3 { margin:0 0 3px; font-size:12pt; }
  .tier.live { background:#f3f9f3; border:2px solid #2f7d32; }
  .tier.pilot { background:#fff8ec; border:2px solid #b26a00; }
  .tier.road { background:#f7fafc; border:2px solid var(--muted); }
  .tier.live h3 { color:#2f7d32; } .tier.pilot h3 { color:#b26a00; }
  .tier.road h3 { color:var(--muted); }
`;

/* --------------------------- C4.1, the deck --------------------------- */

function buildDeck() {
  const cited = D.assertRegistryGated();
  const next = D.assertOneNextStep();
  const css = `${baseCss()}
    .wrap { max-width:960px; margin:0 auto; padding:0; }
    ${SHARED}
    .s { min-height:196mm; display:flex; flex-direction:column; justify-content:center;
         padding:0 28px; break-after:page; page-break-after:always; }
    .s:last-of-type { break-after:auto; page-break-after:auto; }
    .s .k { font-size:9.5pt; letter-spacing:.1em; text-transform:uppercase;
            color:var(--muted); font-weight:700; }
    .s h2 { font-size:25pt; border:0; padding:0; margin:6px 0 16px; color:var(--cherry-deep); }
    .s li { font-size:14pt; line-height:1.55; margin:12px 0; }
    .s.next { background:var(--cherry-bg); }
    .s.next h2 { color:var(--cherry); }`;

  const body = `<div class="wrap">
  <div class="s">
    <div class="k">Colaberry &middot; ${esc(D.AS_OF)}</div>
    <h2 style="font-size:28pt">${esc(D.PROMISE)}</h2>
    <p class="meta" style="font-size:10pt">Master commercial deck. Every figure traces to a row
    of the Colaberry claim registry and carries the date it was read from production. Figures
    without a registry source are not printed.</p>
  </div>
  ${D.DECK.map((s) => `<div class="s${s.isNext ? ' next' : ''}">
    <div class="k">${esc(s.kicker)} &middot; ${s.n} of ${D.DECK.length}</div>
    <h2>${esc(s.title)}</h2>
    <ul>${s.body.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
    ${cites(s.claims)}
  </div>`).join('')}
  </div>`;
  return { html: htmlDoc({ title: 'C4.1 Master commercial deck', css, body }), cited, next };
}

/* ------------------------- C4.2, the one-pager ------------------------- */

function buildOnePager() {
  D.assertOnePagerSourced();
  const P = D.ONE_PAGER;
  const css = `${baseCss()}
    body { font-size:10pt; }
    .pg { padding:4px 2px; }
    h1 { font-size:21pt; }
    h2 { font-size:9.5pt; margin:11px 0 4px; border:0; padding:0; text-transform:uppercase;
         letter-spacing:.08em; color:var(--ink); }
    ${SHARED}
    .lead { font-size:12.5pt; line-height:1.45; margin:0 0 10px; }
    .proof { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin:4px 0 8px; }
    .pf { border:1px solid var(--border); border-left:4px solid var(--cherry);
          border-radius:0 5px 5px 0; padding:7px 10px; font-size:9.3pt; }
    .note { font-size:9pt; }
    .next { background:var(--cherry-bg); border:2px solid var(--cherry); border-radius:6px;
            padding:10px 14px; margin:9px 0 0; font-size:11pt; font-weight:700; }
    .foot { margin-top:9px; font-size:7.6pt; color:var(--muted);
            border-top:1px solid var(--border); padding-top:6px; }`;

  const body = `<div class="pg">
  <h1>Colaberry</h1>
  <div class="meta">Proof of what your people actually built &middot; figures read from
    production ${esc(D.AS_OF)}</div>
  <div class="rule"></div>

  <p class="lead">${esc(P.who)}</p>

  <h2>Why this is different</h2>
  <p>${esc(P.why)}</p>

  <h2>What is running today</h2>
  <div class="proof">${P.proof.map((p) => `<div class="pf">${esc(p)}</div>`).join('')}</div>

  <h2>What we are not claiming</h2>
  <p class="note">${esc(P.notClaiming)}</p>

  <div class="next">The next step: ${esc(P.next)}</div>

  <div class="foot">Every figure on this page traces to a row of the Colaberry claim registry and
  carries the date it was read from production. A figure without a registry source is not
  printed. Written to be read by someone this was forwarded to, with no prior context and nobody
  in the room to explain it.</div>
  </div>`;
  return htmlDoc({ title: 'Colaberry, one page', css, body });
}

/* --------------------- C4.3, the capability statement -------------------- */

function buildCapability() {
  const counts = D.assertNothingDarkUnderLive();
  const T = D.TIERS;
  const css = `${baseCss()}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    ${SHARED}`;

  const tier = (cls, title, note, rows) => `<div class="tier ${cls}">
    <h3>${esc(title)}</h3>
    <div class="meta" style="margin-bottom:6px">${esc(note)}</div>
    <table><tr><th style="width:34%">Capability</th><th>Evidence</th>
    <th style="width:13%">Source</th></tr>
    ${rows.map((r) => `<tr><td><strong>${esc(r.what)}</strong></td><td>${esc(r.detail)}</td>
      <td>${r.clm ? `<code>${esc(r.clm)}</code>` : '<span class="meta">counted</span>'}</td>
    </tr>`).join('')}</table></div>`;

  const body = `<div class="wrap">
  <h1>Platform capability statement</h1>
  <div class="meta">C4.3 &middot; three tiers, kept separate on purpose &middot; figures read
    from production ${esc(D.AS_OF)} &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked for what the platform
  does, split honestly into live, pilot and roadmap, with nothing flag-gated appearing under
  live. <strong>Delivered: ${counts.live} live capabilities each traced to a registry row,
  ${counts.pilot} in pilot, and the ${T.counts.dark} built-but-not-switched-on capabilities
  stated explicitly in the third tier rather than quietly omitted.</strong> A build assertion
  fails if anything flag-gated is ever moved up.</div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">Of ${T.counts.total} capabilities counted on ${esc(T.counts.asof)},
    ${T.counts.live} are live and ${T.counts.dark} are built but not switched on. The second
    number is the one that matters in a sales conversation, because flag-gated code demos
    exactly like live code.</div>
  </div>

  ${tier('live', 'LIVE', 'Running in production today. Every row traces to a registry claim with '
    + 'a date.', T.live)}
  ${tier('pilot', 'PILOT', 'Running, with one cohort. Not a completed outcome study and not to '
    + 'be presented as one.', T.pilot)}
  ${tier('road', 'BUILT BUT NOT SWITCHED ON, DESIGNED, OR ROADMAP',
    'Listed here rather than above on purpose.', T.roadmap)}

  <h2>Why the third tier is stated rather than dropped</h2>
  <p>A capability behind a feature flag is real code. It demonstrates, it looks finished, and in
  a live demo it is indistinguishable from something customers use every day. That is exactly
  why it cannot sit in the live tier, and why omitting it entirely would be its own kind of
  misleading: a reader comparing this statement to a demo would conclude we had understated
  ourselves, and ask for the flag to be turned on.</p>

  <h2>Method</h2>
  <ul>
  <li>Every live capability cites a C0.6 registry row, and figures were re-read from production
  on ${esc(D.AS_OF)} rather than copied from the registry snapshot.</li>
  <li><strong>A build assertion fails if a flag-gated capability appears under live</strong>, and
  a second fails if the built-but-not-switched-on group is omitted from the statement
  entirely.</li>
  <li>The capability counts are as at ${esc(T.counts.asof)} and are stated with that date.</li>
  </ul>
  </div>`;
  return htmlDoc({ title: 'C4.3 Platform capability statement', css, body });
}

module.exports = { buildDeck, buildOnePager, buildCapability };
