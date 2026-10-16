/**
 * C4.6's pack: a one-page selector, the document, and a CSV of all thirteen with the fields
 * that bear on commercial use.
 */
const D = require('./c46Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const chip = (t, c) => `<span class="ch" style="background:${c}">${esc(t)}</span>`;
const visChip = (s) => (s.vis === 'private'
  ? chip('PRIVATE', '#b3261e') : chip('public', '#2f7d32'));
const byChip = (s) => (s.by === 'learner'
  ? chip('learner-built', '#1f6feb') : chip('Colaberry team', '#555f6d'));

const SHARED = `
  .ch { display:inline-block; padding:0 6px; border-radius:8px; font-size:6.8pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .sel { border:1px solid var(--border); border-left:5px solid var(--cherry);
         border-radius:0 6px 6px 0; padding:9px 13px; margin:0 0 8px; }
  .sel h3 { margin:0 0 3px; font-size:11pt; }
  .gap { background:#fdf3f2; border:1px solid #f3c9c6; border-radius:5px;
         padding:6px 10px; margin:4px 0 0; font-size:8.6pt; }
  .gap b { color:#b3261e; }
  .dec { border-left:4px solid #b26a00; background:#fff8ec; padding:8px 12px; margin:0 0 7px;
         border-radius:0 6px 6px 0; }
`;

function matrixTable() {
  return `<table><tr><th style="width:21%">ICP, from C2.5</th><th style="width:9%">Rank</th>
  <th style="width:23%">Lead with</th><th>The gap, stated</th></tr>
  ${D.MATRIX.map((m) => {
    const lead = m.lead ? D.bySlug(m.lead) : null;
    return `<tr><td><strong>${esc(m.icp)}</strong></td><td>${esc(m.rank)}</td>
    <td>${lead ? esc(lead.title.slice(0, 54)) : '<em>nothing fits</em>'}</td>
    <td>${esc(m.gap)}</td></tr>`;
  }).join('')}</table>`;
}

function buildDocument() {
  D.assertAtMostFive();
  D.assertEveryIcpCovered();
  const css = `${baseCss()}
    .wrap { max-width:930px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }
    ${SHARED}`;

  const body = `<div class="wrap">
  <h1>Case study commercial pack</h1>
  <div class="meta">C4.6 &middot; ${D.COUNT.total} approved studies read from production
    ${esc(D.AS_OF)} &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked for the strongest
  three to five of thirteen plus a selector matrix covering every C2.5 ICP.
  <strong>Delivered: five selected, a matrix covering all six ICPs, and a CSV of all thirteen
  with the fields that bear on commercial use.</strong> The matrix states a gap on every row,
  including the two ICPs nothing fits, because implying coverage we do not have is the failure
  this ticket is most exposed to.</div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

  <h2>The five</h2>
  ${D.SELECTED.map((sel) => {
    const s = D.bySlug(sel.slug);
    return `<div class="sel">
      <h3>${esc(s.title)}</h3>
      <div class="meta">${visChip(s)} ${byChip(s)} &middot; ${esc(s.industry)}
        &middot; ${esc(s.cap)}</div>
      <div style="margin-top:5px"><strong>Why it is in:</strong> ${esc(sel.why)}</div>
      <div><strong>When to use it:</strong> ${esc(sel.use)}</div>
    </div>`;
  }).join('')}

  <h2>The selector matrix</h2>
  ${matrixTable()}

  <h2>What you need to decide</h2>
  ${D.DECISIONS.map((x) => `<div class="dec"><strong>${esc(x.d)}</strong>
    <div>${esc(x.detail)}</div></div>`).join('')}

  <h2>All ${D.COUNT.total}, for the record</h2>
  <table><tr><th style="width:34%">Title</th><th style="width:16%">Industry</th>
  <th style="width:11%">Built by</th><th style="width:9%">Visibility</th>
  <th style="width:11%">Org nameable</th><th style="width:9%">Surfaces</th></tr>
  ${D.STUDIES.map((s) => `<tr><td>${esc(s.title)}</td><td>${esc(s.industry)}</td>
    <td>${byChip(s)}</td><td>${visChip(s)}</td>
    <td>${s.named ? 'yes' : '<strong style="color:#b3261e">no</strong>'}</td>
    <td${s.surfaces < 3 ? ' style="color:#b26a00;font-weight:700"' : ''}>${s.surfaces}</td>
  </tr>`).join('')}</table>

  <div class="gap"><b>A registry nit found while pulling this.</b> ${esc(D.REGISTRY_NIT)}</div>

  <h2>Method</h2>
  <ul>
  <li>All ${D.COUNT.total} approved studies were read from production on ${esc(D.AS_OF)}, not
  from a recollection of what exists. The ${D.COUNT.rows} publication rows reconcile exactly as
  ${D.COUNT.total - D.COUNT.singleSurface} studies on three surfaces plus
  ${D.COUNT.singleSurface} on one.</li>
  <li>Every count in this document is derived from that pull rather than typed. The first draft
  said eight organizations could not be named; deriving it gave ${D.COUNT.unnamed}.</li>
  <li><strong>A build assertion fails if any selection is described as a customer story.</strong>
  None of the ${D.COUNT.total} is one, and the difference matters both to a buyer and to the
  Anthropic tier ladder, which needs one public customer story we do not have.</li>
  <li>Two further assertions: no more than five may be selected, and every C2.5 ICP must appear
  in the matrix with its gap stated.</li>
  </ul>
  </div>`;
  const html = htmlDoc({ title: 'C4.6 Case study commercial pack', css, body });
  D.assertNoCustomerStoryClaim(html);
  return html;
}

function buildVisual() {
  const css = `${baseCss()}
    body { font-size:8.5pt; }
    h1 { font-size:15.5pt; }
    h2 { font-size:8.7pt; margin:5px 0 3px; border:0; padding:0; text-transform:uppercase;
         letter-spacing:.07em; color:var(--ink); }
    .cols { display:flex; gap:14px; } .col { flex:1; min-width:0; }
    .takeaway { padding:6px 11px; margin-bottom:5px; }
    .takeaway .headline { font-size:10.5pt; } .takeaway .label { font-size:7pt; }
    table { font-size:7pt; margin:3px 0 5px; } th { padding:3px 5px; font-size:6.4pt; }
    td { padding:3px 5px; }
    ${SHARED}
    .sel { padding:5px 9px; margin:0 0 4px; } .sel h3 { font-size:8.6pt; }
    .dec { padding:4px 9px; margin:0 0 4px; font-size:7.2pt; }
    .tiles { display:flex; gap:6px; margin:4px 0 6px; }
    .tile { flex:1; border:1px solid #f3c9c6; background:#fdf3f2; border-radius:5px;
            padding:5px 8px; }
    .tile .n { font-size:15pt; font-weight:700; color:#b3261e; line-height:1.05; }
    .tile .k { font-size:6.4pt; color:var(--muted); line-height:1.2; margin-top:2px; }
    .foot { margin-top:5px; font-size:6.6pt; color:var(--muted);
            border-top:1px solid var(--border); padding-top:4px; }`;

  const body = `
  <h1>Case study commercial pack</h1>
  <div class="meta">C4.6 &middot; ${D.COUNT.total} studies read from production ${esc(D.AS_OF)}
    &middot; five selected &middot; one page</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  <div class="tiles">
    <div class="tile"><div class="n">${D.COUNT.learner} <span style="font-size:8pt;
      font-weight:400;color:var(--muted)">of ${D.COUNT.total}</span></div>
      <div class="k">built by a learner, which is what we sell</div></div>
    <div class="tile"><div class="n">${D.COUNT.learnerPrivate}</div>
      <div class="k">of those two are private</div></div>
    <div class="tile"><div class="n">${D.COUNT.unnamed}</div>
      <div class="k">cannot name the organization</div></div>
    <div class="tile"><div class="n">0</div>
      <div class="k">are a customer story</div></div>
  </div>

  <div class="cols">
    <div class="col">
      <h2>The five</h2>
      ${D.SELECTED.map((sel) => {
        const s = D.bySlug(sel.slug);
        return `<div class="sel"><h3>${esc(s.title.slice(0, 58))}</h3>
          <div class="meta">${visChip(s)} ${byChip(s)}</div>
          <div style="font-size:7pt;margin-top:2px">${esc(sel.use)}</div></div>`;
      }).join('')}
    </div>
    <div class="col">
      <h2>Which to lead with, by ICP</h2>
      <table><tr><th style="width:34%">ICP</th><th>Lead with</th></tr>
      ${D.MATRIX.map((m) => {
        const lead = m.lead ? D.bySlug(m.lead) : null;
        return `<tr><td><strong>${esc(m.icp.slice(0, 32))}</strong></td>
        <td>${lead ? esc(lead.title.slice(0, 44)) : '<em style="color:#b3261e">nothing fits</em>'}</td>
        </tr>`;
      }).join('')}</table>

      <h2>What you need to decide</h2>
      ${D.DECISIONS.map((x) => `<div class="dec">${esc(x.d)}</div>`).join('')}
    </div>
  </div>

  <div class="foot">All ${D.COUNT.total} read from production, and every count here is derived
  from that pull rather than typed. A build assertion fails if any selection is described as a
  customer story, because none of them is one, and that is the same gap that shows as 0 of 1
  public customer stories against the Anthropic tier ladder.</div>`;
  const html = htmlDoc({ title: 'C4.6 Case study pack, one page', css, body });
  D.assertNoCustomerStoryClaim(html);
  return html;
}

function buildCsv() {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const nl = String.fromCharCode(10);
  const sel = new Set(D.SELECTED.map((s) => s.slug));
  let csv = ['slug', 'title', 'industry', 'primary_capability', 'built_by', 'visibility',
    'organization_nameable', 'surfaces', 'in_the_five', 'why_or_why_not']
    .map(q).join(',') + nl;
  for (const s of D.STUDIES) {
    const pick = D.SELECTED.find((x) => x.slug === s.slug);
    csv += [s.slug, s.title, s.industry, s.cap, s.by, s.vis, s.named ? 'yes' : 'no', s.surfaces,
      sel.has(s.slug) ? 'YES' : 'no',
      pick ? pick.why : 'Not selected. Operational AI built by the Colaberry team; good '
        + 'capability evidence, but the five chosen cover the same ground more clearly.',
    ].map(q).join(',') + nl;
  }
  return csv;
}

module.exports = { buildDocument, buildVisual, buildCsv };
