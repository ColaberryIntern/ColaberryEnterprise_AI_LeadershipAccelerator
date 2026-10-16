/**
 * C3.6's document and one-page visual, both from c36Data.
 *
 * The visual answers, before the document is opened: the warm path is real but it is not an
 * introduction, and the thing to act on is the SBDC opening at the campus we already ranked
 * first.
 */
const D = require('./c36Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const conf = (c) => `<span class="cf" style="background:${c.color}">${esc(c.k)}</span>`;

const SHARED = `
  .cf { display:inline-block; padding:0 6px; border-radius:8px; font-size:7pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .lk { border-left:4px solid var(--muted); padding:8px 12px; margin:0 0 8px; background:#fff;
        border-top:1px solid var(--border); border-right:1px solid var(--border);
        border-bottom:1px solid var(--border); border-radius:0 6px 6px 0; }
  .door { background:#f3f9f3; border:1px solid #cfe6d4; border-radius:6px;
          padding:10px 13px; margin:8px 0; }
  .door b { color:#2f7d32; }
  .amend { background:#fff8ec; border:1px solid #f0dcb8; border-radius:6px;
           padding:9px 12px; margin:0 0 8px; }
  .amend b { color:#b26a00; }
  .t1 { border-left:5px solid var(--cherry); } .t2 { border-left:5px solid var(--muted); }
  .t3 { border-left:5px solid var(--border); }
  .card { border:1px solid var(--border); border-radius:7px; padding:10px 13px; margin:0 0 9px; }
  .card h3 { margin:0 0 2px; font-size:11.5pt; }
  .card .sub { font-size:8.3pt; color:var(--muted); margin-bottom:5px; }
  .lbl { font-size:7.4pt; letter-spacing:.07em; text-transform:uppercase; color:var(--muted);
         font-weight:700; margin-top:6px; }
  blockquote { margin:6px 0; padding:7px 12px; border-left:3px solid var(--cherry-bg);
               background:var(--bg-alt); font-style:italic; font-size:9.5pt; }
`;

/* ----------------------------- document ----------------------------- */

function buildDocument() {
  const css = `${baseCss()}
    .wrap { max-width:920px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }
    ${SHARED}`;

  const body = `<div class="wrap">
  <h1>The OpenAI target map</h1>
  <div class="meta">C3.6 &middot; AI Capability Commercialization &middot; every claim read
    ${esc(D.ACCESS)} &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked me to name the OpenAI
  targets, their routes and any warm path, and specifically to test whether the Cal State board
  is a warm-intro surface. <strong>Delivered: the hypothesis tested link by link with one link
  refuted, seven targets ranked across three tiers each with a stated warm path, and a door I was
  not looking for that opened sixteen days ago.</strong> It also amends a recommendation I
  published earlier today, which is recorded rather than quietly restated.</div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

  <h2>The hypothesis, tested link by link</h2>
  ${D.LINKS.map((l) => `<div class="lk" style="border-left-color:${l.color}">
    <strong>${esc(l.link)}</strong> ${conf(l.conf)}
    <div style="color:${l.color};font-weight:700;margin:3px 0">${esc(l.verdict)}</div>
    <div>${esc(l.detail)}</div>
    <div class="meta">${esc(l.src)}</div></div>`).join('')}

  <h2>The door that opened sixteen days ago</h2>
  <p>${esc(D.SBDC.what)}</p>
  <blockquote>${esc(D.SBDC.verbatim)}</blockquote>
  <p class="meta">${esc(D.SBDC.src)}</p>
  <div class="door"><b>Why this matters more than the board.</b>
  <ol>${D.SBDC.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ol></div>
  <div class="amend"><b>One caution.</b> ${esc(D.SBDC.caution)}</div>

  <h2>What this amends, from a brief I published earlier today</h2>
  ${D.AMENDMENTS.map((a) => `<div class="amend">
    <b>${esc(a.what)}</b><div>${esc(a.change)}</div></div>`).join('')}

  <h2>The targets, ranked</h2>
  <p>Ranked by probability of a useful conversation rather than by seniority. Tier 1 is a
  personal approach from Ali now; tier 2 is an escalation once there is something to point at;
  tier 3 is explicitly not yet.</p>
  ${D.TARGETS.map((t) => `<div class="card t${t.tier}">
    <h3>${t.rank}. ${esc(t.name)}</h3>
    <div class="sub">${esc(t.who)} &middot; <strong>Tier ${t.tier}</strong> &middot;
      ${esc(t.role)} ${conf(t.conf)}</div>
    <div class="lbl">Why this rank</div><div>${esc(t.why)}</div>
    <div class="lbl">The ask</div><div>${esc(t.ask)}</div>
    <div class="lbl">Warm path</div><div>${esc(t.warm)}</div>
  </div>`).join('')}

  <h2>What could go wrong</h2>
  ${D.RISKS.map((r) => `<div class="lk"><strong>${esc(r.r)}</strong> ${conf(r.conf)}
    <div>${esc(r.d)}</div></div>`).join('')}

  <h2>What could not be verified</h2>
  <table><tr><th style="width:34%">Item</th><th>Why</th></tr>
  ${D.UNVERIFIED.map((u) => `<tr><td><strong>${esc(u.what)}</strong></td>
    <td>${esc(u.why)}</td></tr>`).join('')}</table>

  <h2>Method</h2>
  <ul>
  <li>Every page was opened and read. No search-engine answer summary was used as a source.
  Several CSU and OpenAI pages refuse a plain fetch and needed a browser user agent.</li>
  <li>The refuted link is kept in the artifact. A hypothesis test that reports only its
  confirmations is not a test, and a build assertion fails if it is ever dropped.</li>
  <li><strong>No email address or phone number was sought, inferred or recorded for anyone.</strong>
  Named individuals are identified by role and by the public institutional page that names
  them.</li>
  <li>Pronouns are used only where a source publishes them. Leah Belsky\'s she/her is taken
  from the CSU page itself; elsewhere they/them is used.</li>
  <li>Nothing was sent. This is the map, not the outreach.</li>
  </ul>
  </div>`;
  return htmlDoc({ title: 'C3.6 The OpenAI target map', css, body });
}

/* ----------------------------- one-pager ---------------------------- */

function buildVisual() {
  const css = `${baseCss()}
    body { font-size:8.4pt; }
    h1 { font-size:15.5pt; }
    h2 { font-size:8.7pt; margin:5px 0 3px; border:0; padding:0; text-transform:uppercase;
         letter-spacing:.07em; color:var(--ink); }
    .cols { display:flex; gap:14px; } .col { flex:1; min-width:0; }
    .takeaway { padding:6px 11px; margin-bottom:5px; }
    .takeaway .headline { font-size:10.5pt; } .takeaway .label { font-size:7pt; }
    table { font-size:7pt; margin:3px 0 5px; } th { padding:3px 5px; font-size:6.4pt; }
    td { padding:3px 5px; }
    ${SHARED}
    .lk, .amend { padding:4px 8px; margin:0 0 4px; font-size:7.1pt; }
    .door { padding:6px 9px; font-size:7.2pt; margin:4px 0; }
    .card { padding:4px 8px; margin:0 0 4px; }
    .card h3 { font-size:8.6pt; } .card .sub { font-size:6.9pt; margin-bottom:2px; }
    .foot { margin-top:5px; font-size:6.6pt; color:var(--muted);
            border-top:1px solid var(--border); padding-top:4px; }`;

  const body = `
  <h1>The OpenAI target map</h1>
  <div class="meta">C3.6 &middot; the warm-path hypothesis, tested &middot; read ${esc(D.ACCESS)}
    &middot; one page</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  <div class="cols">
    <div class="col">
      <h2>The hypothesis, link by link</h2>
      ${D.LINKS.map((l) => `<div class="lk" style="border-left-color:${l.color}">
        <strong>${esc(l.link)}</strong><br>
        <span style="color:${l.color};font-weight:700">${esc(l.verdict)}</span></div>`).join('')}

      <h2>The door that opened 16 days ago</h2>
      <div class="door"><b>OpenAI x America\'s SBDC, 30 September 2026</b>, running through the
      Community Trainer Program, the same program with no public application. About 150 advisors
      to train, 1,000+ small businesses, at least one workshop per participating network, and
      co-developed guides including government contracting.
      <br><br><b>CSUSB hosts the Inland Empire SBDC</b>, and C6.3 already ranks CSUSB as our
      single best account. First-wave states are unpublished, which is the only reason this is
      urgent.</div>

      <h2>What this amends from this morning</h2>
      ${D.AMENDMENTS.map((a) => `<div class="amend"><b>${esc(a.what)}</b><br>
        ${esc(a.change.split('.')[0])}.</div>`).join('')}
    </div>

    <div class="col">
      <h2>Who to approach, in order</h2>
      ${D.TARGETS.filter((t) => t.tier < 3).map((t) => `<div class="card t${t.tier}">
        <h3>${t.rank}. ${esc(t.name)}
          <span style="font-weight:400;color:var(--muted)">&middot; tier ${t.tier}</span></h3>
        <div class="sub">${esc(t.role)}</div>
        <div style="font-size:7pt">${esc(t.ask)}</div>
      </div>`).join('')}

      <div style="font-size:6.9pt;color:var(--muted);margin-bottom:4px">Tier 3, in the
      document: Leah Belsky, Chris Lehane and Chaya Nayak. All real, none approachable yet.</div>

      <div class="door" style="background:#fdf3f2;border-color:#f3c9c6">
      <b style="color:#b3261e">Do not do this.</b> Do not approach Leah Belsky cold with "I
      noticed you sit on a CSU board". The seat is real and the relationship is not. It is
      context for a later conversation, not a path to one.</div>

      <div class="amend" style="font-size:7.1pt"><b>And know this before any CSU approach.</b>
      NPR reported in May 2026 that about 65% of students and 59% of faculty surveyed were
      skeptical AI was benefiting education, across 94,000+ responses, with a faculty petition
      against renewal. Lead with student workforce outcomes, never with AI adoption.</div>
    </div>
  </div>

  <div class="foot">The refuted link is kept deliberately: CSUSB holds no board seat, and a
  hypothesis test that reports only its confirmations is not a test. No email address or phone
  number was sought or recorded for anyone; individuals are identified by role and by the public
  page that names them. Nothing was sent.</div>`;
  return htmlDoc({ title: 'C3.6 The OpenAI target map, one page', css, body });
}

module.exports = { buildDocument, buildVisual };
