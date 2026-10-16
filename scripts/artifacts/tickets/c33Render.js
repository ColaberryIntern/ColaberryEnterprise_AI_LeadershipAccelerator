/**
 * C3.3's document, one-page visual and CSV, all from c33Data so no row can disagree with another.
 *
 * The visual's job is to answer, before anyone opens the document: there is no warm path, here is
 * what to use instead, and here is who to write to first.
 */
const D = require('./c33Data');
const { esc, baseCss, barChart, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const conf = (c) => `<span class="conf" style="background:${c.color}">${esc(c.k)}</span>`;

const SHARED = `
  .conf { display:inline-block; padding:0 6px; border-radius:8px; font-size:7pt;
          font-weight:700; color:#fff; white-space:nowrap; }
  .t1 { border-left:5px solid var(--cherry); }
  .t2 { border-left:5px solid var(--muted); }
  .card { border:1px solid var(--border); border-radius:7px; padding:11px 14px; margin:0 0 10px; }
  .card h3 { margin:0 0 2px; font-size:12pt; }
  .card .sub { font-size:8.5pt; color:var(--muted); margin-bottom:6px; }
  .lbl { font-size:7.6pt; letter-spacing:.07em; text-transform:uppercase; color:var(--muted);
         font-weight:700; margin-top:7px; }
  .cold { background:#fdf3f2; border:1px solid #f3c9c6; border-radius:6px; padding:9px 12px;
          margin:0 0 8px; }
  .cold .v { font-weight:700; color:#b3261e; }
`;

/* ----------------------------- document ----------------------------- */

const DOC_CSS = `${baseCss()}
  .wrap { max-width: 920px; margin: 0 auto; padding: 30px 24px 60px; }
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px; margin:0 0 15px;
           border-radius:0 5px 5px 0; }
  ${SHARED}
`;

function targetCard(t) {
  return `<div class="card t${t.tier}">
  <h3>${t.rank}. ${esc(t.name)}</h3>
  <div class="sub">${esc(t.who)} &middot; <strong>Tier ${t.tier}</strong>
    ${t.tier === 1 ? '(personal note from Ali)' : '(sequence, or hold)'}</div>
  <div><strong>Title:</strong> ${esc(t.title)} ${conf(t.titleConf)}</div>
  <div class="meta">${esc(t.titleSrc)} &middot; read ${esc(D.ACCESS)}</div>
  <div class="lbl">What they own</div><div>${esc(t.owns)}</div>
  <div class="lbl">Why this rank</div><div>${esc(t.why)}</div>
  <div class="lbl">Route</div><div>${esc(t.route)}</div>
  <div class="lbl">Warm path</div><div>${esc(t.warm)}</div>
  <div class="lbl">The opening ${conf(t.openingConf)}</div><div>${esc(t.opening)}</div>
  <div class="meta">Source: ${esc(t.openingSrc)}</div>
  <div class="lbl">Risk</div><div>${esc(t.risk)}</div>
  </div>`;
}

function buildDocument() {
  const s = D.SUBSTITUTE;
  const body = `<div class="wrap">
  <h1>Anthropic target map</h1>
  <div class="meta">C3.3 &middot; AI Capability Commercialization &middot; every title re-read
    ${esc(D.ACCESS)} &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked who to approach, in
  what order, and through which warm path, with a specific researched opening per person.
  <strong>Delivered: four targets ranked, split into tier 1 and tier 2, each with a route, a
  sourced title, a specific opening drawn from something that person actually said, and the risk
  of approaching them.</strong> On the warm path the honest answer is that there is not one, and
  one of the four candidates is actively a liability.</div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">All four candidate warm paths are cold, and XPRIZE is worse than cold:
    its current frontier-AI tie-up is a Google program, so leading with it in front of Anthropic
    argues against us. What replaces an introduction is the three numbers Anthropic publishes,
    stated honestly including the zeros.</div>
  </div>

  <h2>Why there is no warm path</h2>
  <p>The ticket's premise is that cold outreach to an AI lab mostly fails and the warm path is the
  asset. All four candidates were checked directly.</p>
  ${D.WARM_PATHS.map((w) => `<div class="cold">
    <span class="v">${esc(w.name)}: ${esc(w.verdict)}</span>
    <div>${esc(w.detail)}</div>
    <div style="margin-top:5px"><strong>So:</strong> ${esc(w.implication)}</div>
  </div>`).join('')}

  <h2>What replaces it</h2>
  <p><strong>${esc(s.headline)}</strong></p>
  <ul>${s.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
  <p>${esc(s.conclusion)}</p>
  <table><tr><th>What Anthropic counts</th><th>Select needs</th><th>Colaberry today</th>
  <th>Note</th></tr>
  ${s.ourStanding.map((o) => `<tr><td><strong>${esc(o.metric)}</strong></td>
    <td>${o.target}</td><td><strong style="color:#b3261e">${o.ours}</strong></td>
    <td class="meta">${esc(o.note)}</td></tr>`).join('')}</table>
  <div class="note"><strong>Why leading with three zeros is the right move rather than a
  weakness.</strong> Both targets validate partners numerically, so a message that states the
  numbers, including the ones that are zero, is speaking their language and is checkable. A
  message that avoids them invites the same question with less goodwill.</div>

  <h2>The targets, ranked</h2>
  <p>Ranked by probability of a useful reply, not by seniority. Tier 1 is a personal note from
  Ali; tier 2 is a sequence or a hold.</p>
  ${D.TARGETS.map(targetCard).join('')}

  <h2>Method</h2>
  <ul>
  <li>Every page was opened and read; no search-engine answer summary was used as a source.</li>
  <li>Every title carries its source and the date it was read. One is marked NOT VERIFIED rather
  than guessed.</li>
  <li><strong>No email address was sought, inferred or recorded for any individual.</strong> The
  only addresses in this artifact are organizational desks published on Anthropic's own pages,
  and a build assertion fails if any other address ever appears.</li>
  <li>Nothing was sent. This is the map, not the outreach.</li>
  </ul>
  </div>`;
  return htmlDoc({ title: 'C3.3 Anthropic target map', css: DOC_CSS, body });
}

/* ----------------------------- one-pager ----------------------------- */

const VIS_CSS = `${baseCss()}
  body { font-size: 8.6pt; }
  h1 { font-size: 16pt; }
  h2 { font-size: 8.8pt; margin: 5px 0 3px; border:0; padding:0; text-transform:uppercase;
       letter-spacing:.07em; color:var(--ink); }
  .wrap2 { display:flex; gap:15px; }
  .col { flex:1; min-width:0; }
  .takeaway { padding:6px 11px; margin-bottom:6px; }
  .takeaway .headline { font-size:10.5pt; }
  .takeaway .label { font-size:7pt; }
  table { font-size:7.3pt; margin:3px 0 6px; }
  th { padding:3px 5px; font-size:6.6pt; } td { padding:3px 5px; }
  ${SHARED}
  .card { padding:6px 9px; margin:0 0 5px; }
  .card h3 { font-size:9pt; } .card .sub { font-size:7pt; margin-bottom:3px; }
  .cold { padding:5px 8px; margin:0 0 4px; font-size:7.2pt; }
  .tiles { display:flex; gap:6px; margin:4px 0 5px; }
  .tile { flex:1; border:1px solid #f3c9c6; background:#fdf3f2; border-radius:5px;
          padding:5px 8px; }
  .tile .n { font-size:15pt; font-weight:700; color:#b3261e; line-height:1.05; }
  .tile .n .of { font-size:8pt; font-weight:400; color:var(--muted); }
  .tile .k { font-size:6.5pt; color:var(--muted); line-height:1.2; margin-top:2px; }
  .foot { margin-top:6px; font-size:6.8pt; color:var(--muted);
          border-top:1px solid var(--border); padding-top:5px; }
`;

function buildVisual() {
  const s = D.SUBSTITUTE;
  // Deliberately NOT a bar chart. Every actual value is zero, so bars would encode the
  // requirement and a reader would see length as progress. Tiles state the gap plainly.
  const gap = `<div class="tiles">${s.ourStanding.map((o) => `<div class="tile">
    <div class="n">${o.ours} <span class="of">of ${o.target}</span></div>
    <div class="k">${esc(o.metric.replace(', trailing 12 months', ''))}</div>
  </div>`).join('')}</div>`;

  const body = `
  <h1>Anthropic target map</h1>
  <div class="meta">C3.3 &middot; four targets ranked &middot; every title re-read
    ${esc(D.ACCESS)} &middot; one page</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">There is no warm path. All four candidates are cold, and XPRIZE is a
    counter-signal because its current frontier-AI partner is Google.</div>
  </div>

  <div class="wrap2">
    <div class="col">
      <h2>The four candidate warm paths</h2>
      ${D.WARM_PATHS.map((w) => `<div class="cold">
        <span class="v">${esc(w.name)}</span> &middot; ${esc(w.verdict)}</div>`).join('')}

      <h2>What replaces an introduction</h2>
      <div style="font-size:7.4pt;margin-bottom:3px">Both reachable targets validate partners in
      one currency: countable delivery evidence. Anthropic publishes the bar, so open by stating
      where we stand against it, zeros included.</div>
      ${gap}
      <div style="font-size:7pt;color:var(--muted)">Each tile is where Colaberry stands against
      what Select requires. Certification exams are sold only to organizations already admitted,
      so the first number cannot be moved before admission; it is a consequence of not being in,
      not a measure of effort.</div>
    </div>

    <div class="col">
      <h2>Who to write to, in order</h2>
      ${D.TARGETS.map((t) => `<div class="card t${t.tier}">
        <h3>${t.rank}. ${esc(t.name)}
          <span style="font-weight:400;color:var(--muted)">&middot; tier ${t.tier}</span></h3>
        <div class="sub">${t.title === 'NOT VERIFIED'
          ? '<em>title not established</em>' : esc(t.title)} ${conf(t.titleConf)}</div>
        <div style="font-size:7.2pt">${esc(t.route)}</div>
      </div>`).join('')}
      <div class="cold" style="background:#f7fafc;border-color:#e2e8f0">
        <span class="v" style="color:var(--ink)">Start here.</span> Ali already has an open,
        unanswered thread with the partner desk from 21 August. Approaching an individual while
        that sits unanswered looks like going around them.</div>
    </div>
  </div>

  <h2 style="margin-top:7px">What to actually say, for the two tier-1 approaches</h2>
  <div class="wrap2">
    ${D.TARGETS.filter((t) => t.tier === 1).map((t) => `<div class="col">
      <div class="card t1"><h3>${esc(t.name)}</h3>
      <div style="font-size:7.2pt">${esc(t.opening)}</div>
      <div style="font-size:6.8pt;color:var(--muted);margin-top:3px">Source:
        ${esc(t.openingSrc)}</div></div>
    </div>`).join('')}
  </div>

  <div class="foot">No email address was sought, inferred or recorded for any individual; the only
  addresses anywhere in this artifact are organizational desks Anthropic publishes, and a build
  assertion fails if any other appears. One title is marked NOT VERIFIED rather than guessed.
  Nothing was sent: this is the map, not the outreach.</div>`;
  return htmlDoc({ title: 'C3.3 Anthropic target map, one page', css: VIS_CSS, body });
}

/* ------------------------------- CSV -------------------------------- */

function buildCsv() {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['rank', 'tier', 'tier_meaning', 'name', 'organization', 'title',
    'title_confidence', 'title_source', 'access_date', 'owns', 'why_this_rank', 'route',
    'warm_path', 'opening', 'opening_source', 'opening_confidence', 'risk', 'email_address'];
  let csv = head.map(q).join(',') + '\n';
  for (const t of D.TARGETS) {
    csv += [t.rank, t.tier, t.tier === 1 ? 'personal note from Ali' : 'sequence or hold',
      t.name, t.who, t.title, t.titleConf.k, t.titleSrc, D.ACCESS, t.owns, t.why, t.route,
      t.warm, t.opening, t.openingSrc, t.openingConf.k, t.risk,
      'NONE - not sought, not inferred, not recorded',
    ].map(q).join(',') + '\n';
  }
  return csv;
}

module.exports = { buildDocument, buildVisual, buildCsv };
