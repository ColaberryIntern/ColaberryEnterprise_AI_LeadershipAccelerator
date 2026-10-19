/**
 * AF2.3's one-page visual. Landscape, Letter, and it must fit on ONE page or the renderer refuses
 * to write it.
 *
 * Ali's rule: the important visual gets its own PDF and arrives BEFORE the document, because a
 * reader who opens one page understands the shape of the problem, and a reader who opens fourteen
 * pages understands that there is a document.
 *
 * Everything here reads `af23Data` -- there is not a single hand-typed number below.
 */
const D = require('./af23Data');
const { esc, baseCss, stackBar, SEV } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const CSS = `${baseCss()}
  body { font-size: 9pt; }
  h1 { font-size: 16pt; }
  .wrap { display: flex; gap: 14px; }
  .col-main { flex: 1.45; }
  .col-side { flex: 1; }
  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; margin: 8px 0 10px; }
  .tile {
    border: 1px solid var(--border); border-radius: 5px; padding: 6px 8px; background: #fff;
    border-top: 3px solid var(--muted);
  }
  .tile .n { font-size: 15pt; font-weight: 700; line-height: 1.05; }
  .tile .k { font-size: 6.6pt; color: var(--muted); text-transform: uppercase;
             letter-spacing: .04em; line-height: 1.25; margin-top: 2px; }
  table { font-size: 7.6pt; margin: 4px 0 8px; }
  th { padding: 3px 5px; font-size: 6.8pt; }
  td { padding: 3px 5px; }
  .chip { font-size: 6.4pt; padding: 1px 5px; }
  h2 { font-size: 9.5pt; margin: 10px 0 4px; }
  .takeaway { padding: 8px 11px; margin-bottom: 9px; }
  .takeaway .headline { font-size: 11pt; }
  .takeaway .label { font-size: 7pt; }
  .opt { font-size: 7.6pt; margin-bottom: 5px; padding-left: 20px; position: relative; }
  .opt .id {
    position: absolute; left: 0; top: 0; width: 15px; height: 15px; border-radius: 3px;
    background: var(--muted); color: #fff; font-weight: 700; font-size: 7.4pt;
    text-align: center; line-height: 15px;
  }
  .opt.rec .id { background: var(--cherry); }
  .footer { margin-top: 9px; font-size: 6.8pt; color: var(--muted);
            border-top: 1px solid var(--border); padding-top: 5px; }
  .chain { margin: 6px 0 0; }
  .chain .mermaid svg { max-height: 86px; width: 100%; }
`;

/** Five tiles, one per verdict, each colored by the verdict it counts. */
function tiles() {
  const t = [
    { n: D.COUNTS.scopable, k: 'Scopable today', c: D.V.SCOPABLE.color },
    { n: D.COUNTS.collides, k: 'Role covers 2 domains', c: D.V.COLLIDES.color },
    { n: D.COUNTS.noRole, k: 'No role below Admin', c: D.V.NO_ROLE.color },
    { n: D.COUNTS.noSurface, k: 'No surface at all', c: D.V.NO_SURFACE.color },
    { n: D.COUNTS.interns, k: 'Interns in scope', c: '#2d3748' },
  ];
  return `<div class="grid">${t.map((x) => `
    <div class="tile" style="border-top-color:${x.c}">
      <div class="n" style="color:${x.c}">${x.n}</div><div class="k">${esc(x.k)}</div>
    </div>`).join('')}</div>`;
}

/** The seven interns, worst first: the reader should meet the problem before the solved cases. */
function internTable() {
  const order = [D.V.NO_SURFACE, D.V.NO_ROLE, D.V.COLLIDES, D.V.READONLY, D.V.SCOPABLE];
  const rows = [...D.INTERNS].sort(
    (a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict),
  );
  return `<table>
  <tr><th>Intern</th><th>Domain</th><th>Section</th><th>Routes</th><th>Narrowest role</th>
      <th>Verdict</th></tr>
  ${rows.map((d) => `<tr>
    <td><strong>${esc(d.intern)}</strong></td>
    <td><code>${esc(d.key)}</code></td>
    <td>${d.section ? `<code>${esc(d.section)}</code>` : '<em>none</em>'}</td>
    <td style="text-align:right">${d.routes || '&mdash;'}</td>
    <td>${esc(d.role || d.roleSections)}</td>
    <td><span class="chip" style="background:${d.verdict.color}">${esc(d.verdict.label)}</span></td>
  </tr>`).join('')}
  </table>`;
}

/**
 * The five-link chain, so the cost of link 2 stalling is visible rather than asserted.
 *
 * Full width at the foot of the page rather than inside a column: the first draft put it in the
 * right-hand column, where mermaid scaled the text down to roughly 4pt and the diagram became a
 * gray smudge that LOOKED like information. A diagram nobody can read is worse than no diagram,
 * because the page still appears to have covered the point.
 */
function chainDiagram() {
  const nodes = D.CHAIN.map((c) => {
    const id = `L${c.n}`;
    // One short line per node. Two-line labels force mermaid to shrink the whole row.
    const label = `${c.ticket} ${c.short}`;
    return `  ${id}["${label}"]`;
  }).join('\n');
  const edges = D.CHAIN.slice(1).map((c) => `  L${c.n - 1} --> L${c.n}`).join('\n');
  const style = D.CHAIN.map((c) => (c.state === 'this'
    ? `  style L${c.n} fill:#FB2832,stroke:#C20E1E,color:#ffffff`
    : `  style L${c.n} fill:#f7fafc,stroke:#e2e8f0,color:#718096`)).join('\n');
  return `<figure class="chain">
    <div class="mermaid">graph LR\n${nodes}\n${edges}\n${style}</div>
    <figcaption>The five-link chain for one intern. <strong>Link 2 is this ticket</strong>, and
      links 3 to 5 have nothing to stand on until it lands.</figcaption>
  </figure>`;
}

function build() {
  const parts = [
    { label: `Scopable (${D.COUNTS.scopable})`, value: D.COUNTS.scopable, color: D.V.SCOPABLE.color },
    { label: `Collides (${D.COUNTS.collides})`, value: D.COUNTS.collides, color: D.V.COLLIDES.color },
    { label: `No role (${D.COUNTS.noRole})`, value: D.COUNTS.noRole, color: D.V.NO_ROLE.color },
    { label: `No surface (${D.COUNTS.noSurface})`, value: D.COUNTS.noSurface, color: D.V.NO_SURFACE.color },
  ];

  const body = `
  <h1>AF2.3 &middot; Department tab scoping</h1>
  <div class="meta">The ten domains against the admin sections that exist &middot; measured
    ${esc(D.MEASURED_ON)} &middot; one page</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  ${tiles()}

  <div class="wrap">
    <div class="col-main">
      <h2>The seven interns, worst case first</h2>
      ${internTable()}
    </div>
    <div class="col-side">
      <h2>The grant model is the constraint</h2>
      <div class="note warn" style="font-size:7.4pt;padding:7px 9px;margin:4px 0 8px">
        ${esc(D.RBAC.grantModel)} Issuing the grants needs four new roles and a widened CHECK
        constraint &mdash; an RBAC change, and a governance boundary.
      </div>
      <h2>Where the ${D.COUNTS.interns} interns stand</h2>
      ${stackBar({ parts, width: 380, height: 22 })}
      <h2>Your decision</h2>
      ${D.OPTIONS.map((o) => `
        <div class="opt${o.recommended ? ' rec' : ''}">
          <span class="id">${o.id}</span><strong>${esc(o.title)}</strong>${o.recommended
            ? ' <span style="color:var(--cherry);font-weight:700">&#9733; recommended</span>' : ''}
          <br><span style="color:var(--muted)">${esc(o.covers)}</span>
        </div>`).join('')}
    </div>
  </div>

  ${chainDiagram()}

  <div class="footer">
    Sources: ${esc(D.SOURCES.gate)} &middot; ${esc(D.SOURCES.roles)} &middot; ${esc(D.SOURCES.db)}.
    Built from the same data module as the document, so a number here cannot drift from a number
    there. No grant has been issued to any intern.
  </div>`;

  return htmlDoc({ title: 'AF2.3 department tab scoping, one page', css: CSS, body });
}

module.exports = { build };
