/**
 * C5.0's two deliverables: the one-page visual, and the document behind it.
 *
 * The visual is the artifact Ali actually reads, so it carries the whole argument: what a
 * reader now gets, the probe result, the three defects, and the before and after for the
 * one page where all of this is already live.
 */
const D = require('./c50Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .src { display:inline-block; padding:1px 6px; border-radius:9px; font-size:7.4pt;
         font-weight:700; color:#fff; white-space:nowrap; }
  .defect { border:1px solid var(--border); border-left:4px solid #b3261e; border-radius:0 6px 6px 0;
            padding:9px 12px; margin:0 0 9px; background:#fdf7f6; }
  .defect .hd { font-weight:700; }
  .defect .fix { border-left:3px solid #2f7d32; background:#f3f9f3; padding:6px 10px;
                 margin-top:7px; border-radius:0 4px 4px 0; }
  .live { background:#b3261e; color:#fff; font-size:7.2pt; font-weight:700; padding:1px 6px;
          border-radius:9px; margin-left:6px; letter-spacing:.04em; }
  .mono { font-family:Consolas, monospace; font-size:8.6pt; }
  .ba { display:flex; gap:8px; margin:8px 0 10px; }
  .ba .cell { flex:1; border:1px solid var(--border); border-radius:6px; padding:8px 10px;
              text-align:center; }
  .ba .cell .was { font-size:12pt; font-weight:700; color:var(--muted);
                   text-decoration:line-through; }
  .ba .cell .now { font-size:19pt; font-weight:700; color:#2f7d32; line-height:1.05; }
  .ba .cell .k { font-size:7.4pt; color:var(--muted); text-transform:uppercase;
                 letter-spacing:.04em; margin-top:3px; }
`;

const srcChip = (s) => `<span class="src" style="background:${s.color}">${esc(s.k)}</span>`;

function probeBar() {
  // Drawn rather than stated: 212 of 213 is a shape a reader takes in without reading.
  const total = 213;
  const ok = 212;
  const w = 640;
  const okW = Math.round((ok / total) * w);
  return `<svg width="${w}" height="54" viewBox="0 0 ${w} 54" role="img"
      aria-label="212 of 213 commit links returned 200 to an anonymous request, 1 returned 404">
    <rect x="0" y="6" width="${okW}" height="26" rx="4" fill="#2f7d32"></rect>
    <rect x="${okW + 2}" y="6" width="${w - okW - 2}" height="26" rx="4" fill="#b3261e"></rect>
    <text x="10" y="24" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700"
      fill="#ffffff">212 open to anyone, no login</text>
    <text x="${w - 4}" y="48" font-family="Segoe UI, sans-serif" font-size="10"
      fill="#b3261e" text-anchor="end" font-weight="700">1 unreachable, and dropped before render</text>
  </svg>`;
}

function beforeAfter() {
  // A struck-through "n/a" reads as a number that was crossed out. Where there was no
  // before value, say there was nothing rather than striking a word.
  return `<div class="ba">${D.BEFORE_AFTER.map((b) => {
    const had = /^[0-9]+$/.test(String(b.before));
    return `<div class="cell">
      <div class="was"${had ? '' : ' style="text-decoration:none;font-size:9pt"'}>${
  had ? esc(b.before) : 'not possible'}</div>
      <div class="now">${esc(b.after)}</div>
      <div class="k">${esc(b.k)}</div>
    </div>`;
  }).join('')}</div>`;
}

function defectCards(short) {
  return D.DEFECTS.map((d) => `<div class="defect">
    <div class="hd">${d.n}. ${esc(d.title)}${d.live ? '<span class="live">WAS LIVE</span>' : ''}</div>
    <div class="meta" style="margin:2px 0 5px">Found by: ${esc(d.found)}</div>
    ${short ? '' : `<div>${esc(d.detail)}</div>`}
    <div class="fix"><b>Fixed:</b> ${esc(short ? String(d.fix).split('. ')[0] + '.' : d.fix)}</div>
  </div>`).join('');
}

/* ------------------------------------------------------------------ *
 * 1. THE ONE-PAGE VISUAL
 * ------------------------------------------------------------------ */

function buildVisual() {
  const css = `${baseCss()}
    @page { size: A4 landscape; margin: 10mm; }
    .wrap { padding:0; }
    h1 { font-size:16pt; }
    h2 { font-size:10.5pt; margin:10px 0 5px; }
    body { font-size:9pt; }
    .cols { display:flex; gap:14px; align-items:flex-start; }
    .col { flex:1; }
    .defect { padding:7px 10px; margin:0 0 6px; }
    .takeaway { padding:9px 12px; margin:0 0 10px; }
    .takeaway .headline { font-size:11pt; }
    table { font-size:8.2pt; margin:4px 0 8px; }
    td, th { padding:4px 6px; }
    ${SHARED}`;

  const body = `<div class="wrap">
    <h1>C5.0 &middot; Commit verification, checkable by a stranger</h1>
    <div class="meta">Measured ${esc(D.AS_OF)} &middot; every figure probed, queried or fetched</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>Do the links actually resolve?</h2>
        ${probeBar()}
        <div class="meta">All 213 distinct commit URLs requested anonymously, with a known-good
          and a known-bad control at both ends of the run, so a throttled batch could not be
          mistaken for a pile of genuine absences.</div>

        <h2>That one published page, before and after</h2>
        ${beforeAfter()}

        <h2>What a reader gets, and what they never see</h2>
        <div class="mono" style="margin-bottom:3px">
          ${D.PUBLISHED_FIELDS.map((f) => esc(f.f)).join(' &middot; ')}</div>
        <div class="mono" style="color:#b3261e">never:
          ${D.NEVER_PUBLISHED.map((f) => esc(f.f)).join(' &middot; ')}</div>
        <div class="meta" style="margin-top:3px">Those three are the learner&rsquo;s failures,
          the same category as readiness.blocking that this page already refuses to show a
          hiring manager. The public type has no shape for them.</div>
        <div class="note good" style="margin:7px 0 0;padding:6px 10px"><b>The disclosure delta
          is zero, provably rather than by argument.</b> A link is emitted only for a
          repository a logged-out stranger can already open, because that is the literal test
          applied before rendering.</div>

        <h2>What is still not true</h2>
        <ol style="margin:0;padding-left:15px">${D.LIMITS.slice(0, 3).map(
    (l) => `<li style="margin-bottom:2px">${esc(String(l).split('. ')[0])}.</li>`,
  ).join('')}</ol>
      </div>

      <div class="col">
        <h2>Three defects, found by proving it rather than asserting it</h2>
        ${defectCards(true)}
        <div class="note">Two of the three were already in production. Neither was found by
          reading the code; both were found by fetching the live page and probing the links
          the way the ticket says to assume a hostile reader will.</div>
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'C5.0 - Commit verification made checkable', css, body });
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
    <h1>C5.0 &middot; Make commit verification externally checkable</h1>
    <div class="meta">Measured ${esc(D.AS_OF)} &middot; Ticket C5.0 &middot; group 05</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> That a stranger with a link can see, for one named
      learner and one story, what the story asked for, the commit that satisfied it and the
      verification result, without logging in and without taking our word for it. That it
      survives a hostile reader. And that learner privacy is settled explicitly, in writing,
      before building.
      <br><br>
      <b>What was delivered.</b> A per-commit deep link on the public portfolio page, gated on
      measured reachability, with the privacy decision written below. Plus three defects the
      proving turned up, two of them already live.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>1. What a reader now gets</h2>
    <p>Each verified story on a public portfolio page carries a link to the commit that
    satisfied it. The reader clicks it and lands on GitHub, in the learner&rsquo;s own
    repository, on the specific commit. Up to now the page reached the repository and left
    them to go hunting through a commit history for the one we meant.</p>
    <table>
      <tr><th style="width:34%">Field</th><th>Why it is there</th></tr>
      ${D.PUBLISHED_FIELDS.map((f) => `<tr><td class="mono">${esc(f.f)}</td>
        <td>${esc(f.why)}</td></tr>`).join('')}
    </table>

    <h2>2. The privacy decision, written before building</h2>
    <p>These three fields exist on every verification record and none of them reaches a
    reader. They are the learner&rsquo;s failures, which is the same category as
    <code>readiness.blocking</code> that this page already refuses to show a hiring manager.
    The public type has no shape for them, so they cannot leak through a filter mistake.</p>
    <table>
      <tr><th style="width:34%">Never published</th><th>What it is</th></tr>
      ${D.NEVER_PUBLISHED.map((f) => `<tr><td class="mono" style="color:#b3261e">${esc(f.f)}</td>
        <td>${esc(f.why)}</td></tr>`).join('')}
    </table>
    <div class="note good"><b>The disclosure delta is zero, and that is now provable rather
    than argued.</b> A link is emitted only for a repository a logged-out stranger can already
    open, because that is the literal test applied before rendering. A commit inside a
    repository a reader can already open is a fact that reader can already see; this saves
    them a search rather than revealing anything. The privacy requirement and the proof
    requirement therefore never conflicted, which is why no escalation was needed.</div>

    <h2>3. Do the links resolve? Measured, not assumed</h2>
    ${probeBar()}
    <table>
      <tr><th style="width:46%">Measurement</th><th style="width:9%">Value</th>
        <th style="width:13%">Source</th><th>How</th></tr>
      ${D.NUMBERS.map((n) => `<tr><td>${esc(n.k)}</td><td><b>${esc(n.v)}</b></td>
        <td>${srcChip(n.src)}</td><td class="meta">${esc(n.how)}</td></tr>`).join('')}
    </table>
    <p>The controls matter as much as the result. Every run probes a URL known to exist and
    one known not to, at the start and again at the end. If the known-good control stops
    returning 200 the channel is being throttled, and every absence in that run would be
    worthless; the tool fails rather than printing a log that would be read as evidence.</p>

    <div class="pagebreak"></div>
    <h2>4. Three defects, found by proving rather than asserting</h2>
    ${defectCards(false)}

    <h3>The collision in defect 3, in full</h3>
    <p>One identifier, four different pieces of work, four repositories:</p>
    <table>
      <tr><th>Story id</th><th>Commit</th><th>Repository</th><th>What it actually was</th></tr>
      ${D.COLLISION.map((c) => `<tr><td class="mono">${esc(c.id)}</td>
        <td class="mono">${esc(c.sha)}</td><td class="mono">${esc(c.repo)}</td>
        <td>${esc(c.title)}</td></tr>`).join('')}
    </table>

    <h2>5. That page, before and after</h2>
    ${beforeAfter()}
    <p>Both columns are measured. The before column is the live payload fetched from the
    public endpoint with no login; the after column is the same inputs run through the new
    code, with every resulting link then requested to confirm it returns 200.</p>

    <h2>6. What is still not true</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:6px">${esc(l)}</li>`).join('')}</ol>

    <div class="note warn"><b>The ticket&rsquo;s close actions have deliberately not been
    taken.</b> C1.6 dimension 4 stays PARTIAL and the claim registry row still blocks the
    external use of the word this ticket is about. The ticket is explicit that neither
    changes until a stranger can actually check a commit, and merged is not deployed.</div>
  </div>`;

  return htmlDoc({ title: 'C5.0 - Make commit verification externally checkable', css, body });
}

module.exports = { buildVisual, buildDocument };
