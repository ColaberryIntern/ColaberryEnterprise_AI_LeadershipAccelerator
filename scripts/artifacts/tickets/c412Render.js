/**
 * C4.12's two deliverables: the one-page visual, and the recut document.
 *
 * The visual leads with the one figure that is reproducible, mislabeled and claims something
 * that is actually zero, because that is the finding somebody has to act on before the
 * six-pager goes anywhere.
 */
const D = require('./c412Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SEV = {
  wrong: { label: 'WRONG', color: '#b3261e' },
  stale: { label: 'STALE', color: '#b26a00' },
  retired: { label: 'RETIRED', color: '#b3261e' },
  mislabeled: { label: 'MISLABELED', color: '#b26a00' },
  judgment: { label: 'JUDGMENT', color: '#7a4fb6' },
  missing: { label: 'MISSING', color: '#1f6feb' },
};

const SHARED = `
  .chip2 { display:inline-block; padding:1px 6px; border-radius:9px; font-size:7.3pt;
           font-weight:700; color:#fff; white-space:nowrap; }
  .row { border:1px solid var(--border); border-radius:6px; padding:8px 11px; margin:0 0 7px; }
  .row .hd { font-weight:700; }
  .was { color:#b3261e; text-decoration:line-through; }
  .now { color:#2f7d32; font-weight:700; }
  .q { font-family:Consolas, monospace; font-size:8pt; background:var(--bg-alt);
       padding:4px 7px; border-radius:4px; display:block; margin-top:5px;
       word-break:break-all; }
  .big { display:flex; gap:8px; margin:9px 0 12px; }
  .big .c { flex:1; border:1px solid var(--border); border-radius:6px; padding:9px 10px;
            text-align:center; }
  .big .c .n { font-size:22pt; font-weight:700; line-height:1; }
  .big .c .k { font-size:7.4pt; color:var(--muted); text-transform:uppercase;
               letter-spacing:.04em; margin-top:4px; }
  .big .c .note { font-size:7.6pt; color:var(--muted); margin-top:3px; }
`;

const sevChip = (s) => `<span class="chip2" style="background:${SEV[s].color}">${SEV[s].label}</span>`;

function seventeenBlock() {
  return `<div class="big">${D.SEVENTEEN.map((s) => {
    const zero = s.v === '0';
    return `<div class="c"${zero ? ' style="border-color:#b3261e;background:#fdf3f2"' : ''}>
      <div class="n" style="color:${zero ? '#b3261e' : 'var(--cherry)'}">${esc(s.v)}</div>
      <div class="k">${esc(s.k)}</div>
      <div class="note">${esc(s.note)}</div>
    </div>`;
  }).join('')}</div>`;
}

/** One card per figure. `rows` lets the visual split them across two columns cleanly. */
function rowCards(short, rows = D.ROWS) {
  return rows.map((r) => `<div class="row">
    <div class="hd">${r.n}. ${esc(r.where)} ${sevChip(r.severity)}</div>
    <div style="margin:4px 0 2px">
      <span class="was">${esc(r.prints)}</span>
      &nbsp;&rarr;&nbsp;<span class="now">${esc(r.becomes)}</span>
    </div>
    ${short ? '' : `<div class="meta" style="color:var(--ink);margin-top:4px">${esc(r.why)}</div>
    <code class="q">${esc(r.query)}</code>`}
  </div>`).join('');
}

/* ------------------------------------------------------------------ *
 * 1. THE ONE-PAGE VISUAL
 * ------------------------------------------------------------------ */

function buildVisual() {
  const css = `${baseCss()}
    /* NO @page size HERE, deliberately. renderArtifactPdf emits Letter and passes the margin
       itself; declaring "size: A4 landscape" in CSS fights that and forces a second sheet.
       The page-count guard is what caught it, and it caught it in a case the eye could not:
       this page measures SHORTER than a known-good one-pager and still broke onto page two. */
    @page { margin: 10mm; }
    .wrap { padding:0; }
    h1 { font-size:16pt; }
    h2 { font-size:10.5pt; margin:10px 0 5px; }
    body { font-size:9pt; }
    .cols { display:flex; gap:14px; align-items:flex-start; }
    .col { flex:1; }
    .takeaway { padding:9px 12px; margin:0 0 10px; }
    .takeaway .headline { font-size:11pt; }
    .row { padding:6px 9px; margin:0 0 5px; }
    ${SHARED}`;

  const body = `<div class="wrap">
    <h1>C4.12 &middot; Recut the FDE Pathway six-pager</h1>
    <div class="meta">Every figure re-derived ${esc(D.AS_OF)} against production</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>

    <h2>The retired figure, settled</h2>
    ${seventeenBlock()}
    <div class="meta">CLM-003 retired this on 8 October because no query reproduced it. One
      does, returning 17, and it counts learners with <strong>at least one</strong> verified
      story. The page claims completion; by that reading the number is <strong>zero</strong>.
      The line still comes off, for a better reason than the one on record.</div>

    <h2 style="margin-top:12px">Every figure, what it prints and what it becomes</h2>
    <div class="cols">
      <div class="col">${rowCards(true, D.ROWS.slice(0, 4))}</div>
      <div class="col">
        ${rowCards(true, D.ROWS.slice(4))}
        <div class="note" style="margin-top:7px;padding:6px 10px">Rows 6 and 7 are judgment
          and policy rather than arithmetic, and are tagged so they cannot be mistaken for
          measurements. They need a decision, not a re-run.</div>
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'C4.12 - Recut the FDE Pathway six-pager', css, body });
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
    <h1>C4.12 &middot; Recut the FDE Pathway six-pager against the claim registry</h1>
    <div class="meta">Every figure re-derived ${esc(D.AS_OF)} &middot; Ticket C4.12</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> The six-page FDE Pathway cannot go to anyone until its
      figures are recut against the claim registry, starting with a retired figure it still
      prints.
      <br><br>
      <b>What was delivered.</b> Every figure on the page re-derived against production today,
      with the query beside it, plus two findings that change the ticket&rsquo;s own
      instructions. The six-pager is a designed PDF with no generator in this repository, so
      this is the recut rather than a replacement file.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>1. The retired figure, settled</h2>
    <p>The ticket says the 17 &ldquo;comes off entirely, unless someone can name the query
    that produces it, in which case the registry row reopens first&rdquo;. The query can be
    named. It still comes off, and the reason is stronger than the one recorded.</p>
    ${seventeenBlock()}
    <div class="note warn"><b>Reproducible is not the same as correct.</b> A figure nobody can
    reproduce gets caught by the first person who checks. A figure that reproduces cleanly
    under the wrong label survives every check and goes out. This one would have gone to a
    frontier lab reading &ldquo;17 learners build-complete&rdquo; while the number of learners
    who have completed anything, on the page&rsquo;s own meaning, is zero.</div>
    <p>The honest alternatives, if a learner figure is wanted on the page: <b>17 learners have
    at least one commit-verified story</b>, or <b>345 verified stories across 29 projects and
    17 learners, as of ${esc(D.AS_OF)}</b>. Both are true and both survive being checked.</p>

    <h2>2. The recut, figure by figure</h2>
    ${rowCards(false)}

    <h2>3. What is still open</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:6px">${esc(l)}</li>`).join('')}</ol>

    <div class="note"><b>Nothing here is a new claim.</b> Every corrected figure traces to a
    query printed beside it, which is the control CLM-029 exists to enforce: a number without
    a source row does not go out. The two judgment items are tagged as judgment rather than
    presented as measurement.</div>
  </div>`;

  return htmlDoc({ title: 'C4.12 - Recut the FDE Pathway six-pager', css, body });
}

module.exports = { buildVisual, buildDocument };
