/**
 * C5.1's deliverables: the one-page site map, and the document with annotated wireframes.
 *
 * The wireframes are deliberately crude boxes. At this stage the question is what each page
 * is for and who it is for, and a polished mock invites a conversation about the polish.
 */
const D = require('./c51Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .st { display:inline-block; padding:1px 6px; border-radius:9px; font-size:7.2pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .pg { border:1px solid var(--border); border-radius:6px; padding:8px 11px; margin:0 0 7px; }
  .pg .rt { font-family:Consolas, monospace; font-weight:700; color:var(--cherry); }
  .pg .lab { font-weight:700; font-size:8.3pt; margin-top:5px; }
  .wire { border:2px solid var(--ink); border-radius:4px; padding:0; margin:0 0 10px;
          overflow:hidden; }
  .wire .bar { background:var(--ink); color:#fff; font-size:8.2pt; font-weight:700;
               padding:3px 8px; }
  .wire .band { border-bottom:1px dashed var(--border); padding:7px 9px; font-size:8.4pt; }
  .wire .band:last-child { border-bottom:none; }
  .wire .band b { display:block; font-size:7.6pt; text-transform:uppercase;
                  letter-spacing:.05em; color:var(--muted); }
  .doors { display:flex; gap:5px; margin-top:4px; flex-wrap:wrap; }
  .doors span { border:1px solid var(--cherry); color:var(--cherry); border-radius:4px;
                padding:2px 6px; font-size:7.6pt; font-weight:700; }
`;

const ST = {
  rewrite: { k: 'REWRITE IN PLACE', color: '#1f6feb' },
  new: { k: 'NEW ROUTE, FREE', color: '#2f7d32' },
  gap: { k: 'NO TICKET YET', color: '#b26a00' },
};
const stChip = (s) => `<span class="st" style="background:${ST[s].color}">${ST[s].k}</span>`;

/** The homepage wireframe, which is the one that carries the argument. */
function homeWireframe() {
  const home = D.PAGES.find((p) => p.route === '/');
  return `<div class="wire">
    <div class="bar">/ &nbsp; the homepage, one story</div>
    <div class="band"><b>Band 1 &middot; the promise, once</b>${esc(home.story)}</div>
    <div class="band"><b>Band 2 &middot; the proof, live</b>A real learner page and a real
      commit link, clickable without logging in since 17 Oct 2026. Links to the existing
      /proof surface rather than rebuilding it.</div>
    <div class="band"><b>Band 3 &middot; how it works</b>Learn, Build, Prove, Deploy, Manage.
      One line each, linking to /how-it-works.</div>
    <div class="band"><b>Band 4 &middot; the five doors</b>The only place the segments
      appear.
      <div class="doors">${D.PAGES.filter((p) => p.segment)
    .map((p) => `<span>${esc(p.name)}</span>`).join('')}</div></div>
    <div class="band"><b>Band 5 &middot; one inquiry</b>/contact. The same surface every
      segment page sends to.</div>
  </div>`;
}

/** The segment-page template, which all four share so they cannot drift apart. */
function segmentWireframe() {
  return `<div class="wire">
    <div class="bar">/&lt;segment&gt; &nbsp; the template all four share</div>
    <div class="band"><b>Band 1 &middot; the promise in this segment’s noun</b>The
      category noun moves by segment per C2.1; the promise does not.</div>
    <div class="band"><b>Band 2 &middot; what this buyer gets</b>Three things, specific to
      the segment, each traceable to an approved claim.</div>
    <div class="band"><b>Band 3 &middot; proof in their shape</b>The same commit evidence,
      framed as this buyer would check it.</div>
    <div class="band"><b>Band 4 &middot; one call to action</b>/contact?segment=&lt;slug&gt;.
      Exactly one, so the path is countable.</div>
  </div>`;
}

function pageCards(short) {
  return D.PAGES.map((p) => `<div class="pg">
    <div><span class="rt">${esc(p.route)}</span> &nbsp; <b>${esc(p.name)}</b>
      &nbsp; ${stChip(p.status)} <span class="meta">${esc(p.ticket)}</span></div>
    <div style="margin-top:3px">${esc(p.job)}</div>
    ${short ? '' : `<div class="lab">Story</div><div>${esc(p.story)}</div>
      <div class="lab">One call to action</div><div>${esc(p.cta)}</div>`}
  </div>`).join('');
}

/* ------------------------------------------------------------------ *
 * 1. THE ONE-PAGE SITE MAP
 * ------------------------------------------------------------------ */

function buildVisual() {
  const css = `${baseCss()}
    /* NO @page RULE AT ALL. renderArtifactPdf sets both the page size and the margin when it
       calls pdf(). Declaring a margin here as well stacks with it: 10mm in CSS plus 10mm
       from the renderer leaves about 665px of usable height on Letter landscape, not 740,
       and the page breaks while every measurement says it fits. */
    .wrap { padding:0; }
    h1 { font-size:16pt; }
    h2 { font-size:10.5pt; margin:9px 0 5px; }
    body { font-size:9pt; }
    .cols { display:flex; gap:13px; align-items:flex-start; }
    .col { flex:1; }
    .takeaway { padding:9px 12px; margin:0 0 9px; }
    .takeaway .headline { font-size:10.5pt; }
    ${SHARED}
    /* AFTER the shared block on purpose: these are the landscape overrides, and equal
       specificity means last one wins. Putting them before SHARED silently does nothing. */
    table { font-size:8pt; margin:3px 0 6px; }
    td, th { padding:2px 6px; }
    .wire .band { padding:4px 9px; }
    .pg { padding:6px 9px; margin:0 0 5px; }`;

  const body = `<div class="wrap">
    <h1>C5.1 &middot; Commercial Website Information Architecture</h1>
    <div class="meta">Routes checked against the real tree ${esc(D.AS_OF)}
      &middot; 189 routes declared &middot; structure only, no copy and no code</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>

    <div class="cols">
      <!-- Columns are balanced on MEASURED height, not on how the sections group by topic.
           The left column held both wireframe and the eight-row site map and overflowed. -->
      <div class="col">
        ${homeWireframe()}
        <h2>Already taken, and easy to misread</h2>
        <table>
          <tr><th style="width:26%">Route</th><th>Why it matters</th></tr>
          ${D.TRAPS.map((t) => `<tr><td><code>${esc(t.route)}</code></td><td>${esc(t.why)}</td></tr>`).join('')}
        </table>
      </div>

      <div class="col">
        ${segmentWireframe()}
        <h2>The site map, every route verified unclaimed</h2>
        <table>
          <tr><th style="width:30%">Route</th><th style="width:36%">Page</th><th>Ticket</th></tr>
          ${D.PAGES.map((p) => `<tr><td><code>${esc(p.route)}</code></td><td>${esc(p.name)}</td><td>${esc(p.ticket)}</td></tr>`).join('')}
        </table>

        <div class="note warn" style="padding:6px 10px"><b>${esc(D.INQUIRY_GAP.what)}</b>
          ${esc(D.INQUIRY_GAP.evidence)}</div>
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'C5.1 - Commercial Website Information Architecture', css, body });
}

/* ------------------------------------------------------------------ *
 * 2. THE DOCUMENT, with the annotated wireframes
 * ------------------------------------------------------------------ */

function buildDocument() {
  const css = `${baseCss()}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }
    ${SHARED}`;

  const body = `<div class="wrap">
    <h1>C5.1 &middot; Commercial Website Information Architecture</h1>
    <div class="meta">Routes verified against the real tree ${esc(D.AS_OF)} &middot;
      Ticket C5.1 &middot; blocks C5.2 to C5.8</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Design the site structure before any page is written,
      so the homepage does not become an everything-platform. A site map plus annotated
      wireframes, with every proposed route verified as free, a homepage that tells one
      story, and one path to inquiry per segment.
      <br><br>
      <b>What was delivered.</b> All of that, with the route check implemented as a build
      assertion that re-reads the codebase rather than as a table that goes stale, and one
      criterion reported as not met because the current contact surface cannot support it.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>1. The homepage, annotated</h2>
    <p>The ticket names the failure mode precisely: designing for all five audiences at once.
    So the segments appear in exactly one band, as doors, and nowhere else on the page. A
    build assertion fails if the homepage story ever names a segment.</p>
    ${homeWireframe()}

    <h2>2. The segment template, annotated</h2>
    <p>Four segment pages share one template so they cannot drift into four different
    arguments. The category noun moves by segment, per C2.1; the promise underneath does
    not.</p>
    ${segmentWireframe()}

    <h2>3. The site map</h2>
    ${pageCards(false)}

    <div class="pagebreak"></div>
    <h2>4. Reused rather than rebuilt</h2>
    <p>The ticket asks what existing capability should be reused. These pages already exist
    and should be linked, not replaced.</p>
    <table>
      <tr><th style="width:24%">Route</th><th>How it is used</th></tr>
      ${D.REUSE.map((r) => `<tr><td><code>${esc(r.route)}</code></td>
        <td>${esc(r.what)}</td></tr>`).join('')}
    </table>

    <h2>5. Routes that are already taken</h2>
    <table>
      <tr><th style="width:24%">Route</th><th>Why it matters</th></tr>
      ${D.TRAPS.map((t) => `<tr><td><code>${esc(t.route)}</code></td>
        <td>${esc(t.why)}</td></tr>`).join('')}
    </table>
    <div class="note"><b>This is why the criterion says verified.</b> Two of the four are
    exactly the routes a reasonable person would propose for two of these pages. A build
    assertion re-reads the route tree and fails if any proposed route stops being free.</div>

    <h2>6. The criterion the current site cannot meet</h2>
    <div class="note warn"><b>${esc(D.INQUIRY_GAP.what)}</b><br><br>
      ${esc(D.INQUIRY_GAP.evidence)}</div>
    <p><b>The fix.</b> ${esc(D.INQUIRY_GAP.fix)}</p>
    <p><b>A constraint to budget for.</b> ${esc(D.INQUIRY_GAP.constraint)}</p>

    <h2>7. What this needs you to decide</h2>
    ${D.DECISIONS.map((d) => `<div class="pg">
      <div><b>${esc(d.q)}</b></div>
      <div class="lab">Decided, 18 October 2026</div>
      <div><b>${esc(d.decided)}</b>${d.overridden
    ? ' <span style="color:#b26a00">(this overrides what I recommended)</span>' : ''}</div>
      <div class="lab">What was recommended</div><div>${esc(d.recommended)}</div>
      <div class="lab">Reasoning</div><div>${esc(d.detail)}</div>
      <div class="lab">What follows</div><div>${esc(d.consequence)}</div>
    </div>`).join('')}

    <h2>8. Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>
  </div>`;

  return htmlDoc({ title: 'C5.1 - Commercial Website Information Architecture', css, body });
}

module.exports = { buildVisual, buildDocument };
