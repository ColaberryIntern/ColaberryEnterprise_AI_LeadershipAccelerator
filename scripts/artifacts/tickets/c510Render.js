/**
 * C5.10's two deliverables as HTML: the one-page scorecard and the full record.
 *
 * ## The one editorial decision in here
 *
 * The provenance table renders an unreachable class in amber, not red. A class that is
 * defined and never rendered is a gap in what the page can demonstrate, not a false
 * statement - nothing on the dashboard is mislabeled because of it. Red is reserved for
 * the two things that are actually wrong: a criterion that is not met, and a figure
 * group that carries no marker at all while sitting next to a named employee.
 *
 * Counts are written as words where they open a sentence, because a numeral at the start
 * of a line reads as a list marker in a document people skim.
 */
const T = require('../artifactTheme');
const D = require('./c510Data');
const C = require('./c510Criteria');

const { SEV, esc } = T;

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
const word = (n) => (n < WORDS.length ? WORDS[n] : String(n));
/** Sentence-initial form. A lowercase word opening a sentence reads as a typo. */
const Word = (n) => { const w = word(n); return w.charAt(0).toUpperCase() + w.slice(1); };

const VERDICT_TONE = { MET: SEV.ok, PARTIAL: SEV.watch, UNMET: SEV.bad };

function chip(text, color) {
  return '<span class="chip" style="background:' + color + '">' + esc(text) + '</span>';
}

/**
 * The headline, written once and used by both documents so they cannot disagree. The
 * 'brief' form drops the closing clause about the merged PR, which the one-pager already
 * carries in its own note and in criterion 3; it exists because the one-pager has a hard
 * one-page limit and this block is the second-tallest thing on it.
 */
function headline(which = 'detail') {
  const core = 'The dashboard is built, live, and honest about where its numbers come '
    + 'from - and no sponsor has ever seen a real one on it. Production holds '
    + word(D.PRODUCTION.sponsors) + ' sponsor row, '
    + word(D.PRODUCTION.sponsorSeats) + ' seats, '
    + word(D.PRODUCTION.linkGenerated) + ' magic links ever generated and '
    + word(D.PRODUCTION.linkAccessed) + ' successful logins, so every visit has '
    + 'rendered the sample view.';
  if (which === 'brief') {
    return core + ' The provenance work is deployed and correct; it has only ever '
      + 'labeled invented data.';
  }
  return core + ' The provenance work shipped in PR #' + D.PR.number + ' is correct and '
    + 'deployed; so far it has only ever labeled invented data.';
}

/**
 * `which` picks the long detail or the one-line brief. The one-pager has a hard
 * single-page limit and the criteria table was the block that broke it, so the brief
 * exists to keep the verdicts on the page rather than to hide the reasoning - the full
 * detail is two inches away in the other PDF.
 */
function criteriaRows(which = 'detail') {
  return C.criteria().map((c) => '<tr>'
    + '<td style="white-space:nowrap">' + chip(c.verdict, VERDICT_TONE[c.verdict]) + '</td>'
    + '<td><strong>' + esc(c.text) + '</strong><br><span class="meta">'
    + esc(which === 'brief' ? (c.brief || c.detail) : c.detail) + '</span></td>'
    + '</tr>').join('');
}

/**
 * In 'brief' mode the per-class note is dropped. Those notes are two lines each and
 * four of them were what pushed the one-pager onto a second page; the state chip and
 * the "where" already carry the finding, and the reasoning is in the full document.
 */
function provenanceRows(which = 'detail') {
  return D.PROVENANCE.map((p) => {
    // Keyed on whether it ACTUALLY renders, not on whether it could. 'measured' is
    // reachable in code and has never been reached in production, which is this
    // document's headline - painting it green would say the opposite of the takeaway
    // three inches above it.
    const tone = p.renders > 0 ? SEV.ok : SEV.watch;
    const state = p.reachable
      ? (p.renders > 0 ? 'Renders (' + p.renders + ')' : 'Reachable, never reached')
      : 'Never rendered';
    const where = which === 'brief'
      ? esc(p.where)
      : esc(p.where) + '<br><span class="meta">' + esc(p.note) + '</span>';
    return '<tr>'
      + '<td style="font-size:13pt;text-align:center">' + esc(p.glyph) + '</td>'
      + '<td><code>' + esc(p.cls) + '</code></td>'
      + '<td style="white-space:nowrap">' + chip(state, tone) + '</td>'
      + '<td>' + where + '</td>'
      + '</tr>';
  }).join('');
}

function coverageRows() {
  return D.COVERAGE.map((c) => '<tr>'
    + '<td style="white-space:nowrap">'
    + chip(c.badged ? 'Marked' : 'No marker', c.badged ? SEV.ok : SEV.bad) + '</td>'
    + '<td><strong>' + esc(c.area) + '</strong><br><span class="meta">'
    + esc(c.detail) + '</span></td>'
    + '</tr>').join('');
}

function manifestRows() {
  return D.MANIFEST.map(([k, v]) => '<tr>'
    + '<td style="white-space:nowrap;width:150px"><strong>' + esc(k) + '</strong></td>'
    + '<td>' + esc(v) + '</td>'
    + '</tr>').join('');
}

/* ------------------------------ the one-pager ---------------------------------------
 * A4 landscape at 10mm margins. Everything Ali needs to decide whether this is finished
 * and what is still his, on one page he can read without scrolling.
 * -----------------------------------------------------------------------------------*/
function buildVisual() {
  const cs = C.criteria();
  const met = cs.filter((c) => c.verdict === 'MET').length;
  const unreachable = D.PROVENANCE.filter((p) => !p.reachable).length;
  const bare = D.COVERAGE.filter((c) => !c.badged).length;

  return `<!doctype html><html><head><meta charset="utf-8">
<title>C5.10 Sponsor Dashboard</title><style>${T.baseCss()}
  body { font-size: 9.5pt; }
  h1 { font-size: 17pt; }
  .two { display: flex; gap: 14px; align-items: flex-start; }
  .two > * { flex: 1; min-width: 0; }
  table { font-size: 8.3pt; margin: 4px 0 8px; }
  td, th { padding: 4px 6px; }
  .takeaway { margin-bottom: 10px; padding: 9px 12px; }
  .takeaway .headline { font-size: 10.5pt; }
  h2 { margin: 7px 0 3px; font-size: 10.5pt; }
  .two { gap: 12px; }
  ol, p { margin-bottom: 6px; }
  .card .n { font-size: 17pt; }
  .note { margin: 6px 0; padding: 7px 10px; font-size: 8.3pt; }
</style></head><body>
<h1>C5.10 &middot; Sponsor outcome dashboard</h1>
<div class="meta">Measured against production on ${esc(D.OBSERVED)} &middot;
  <code>/sponsor/dashboard</code> &middot; built by PR #${D.PR.number}, merged
  ${esc(D.PR.mergedAt.slice(0, 10))} &middot; only sponsor row:
  ${esc(D.PRODUCTION.sponsorRow.company)},
  <code>${esc(D.PRODUCTION.sponsorRow.billingStatus)}</code></div>
<div class="rule"></div>

<div class="takeaway">
  <div class="label">Takeaway</div>
  <div class="headline">${esc(headline('brief'))}</div>
</div>

<div class="cards">
  <div class="card"><div class="n">${met} of ${cs.length}</div>
    <div class="k">Criteria fully met</div></div>
  <div class="card"><div class="n">${D.PRODUCTION.linkAccessed}</div>
    <div class="k">Sponsor logins, ever</div></div>
  <div class="card"><div class="n">${D.PRODUCTION.linkRejected}</div>
    <div class="k">Rejected attempts, all probes</div></div>
  <div class="card"><div class="n">${bare} of ${D.COVERAGE.length}</div>
    <div class="k">Figure groups with no marker</div></div>
</div>

<div class="two">
  <div>
    <h2>The four acceptance criteria</h2>
    <table><tbody>${criteriaRows('brief')}</tbody></table>
    <h2>What is live, and for whom</h2>
    <table><tbody>
      <tr><td style="white-space:nowrap;width:86px"><strong>URL</strong></td>
        <td><code>enterprise.colaberry.ai/sponsor/dashboard</code> &mdash; HTTP 200, and
          the deployed bundle carries this build's markers</td></tr>
      <tr><td><strong>Auth</strong></td>
        <td>Route is public and ungated; the <em>data</em> needs a magic-link session.
          No session renders the sample view plus an email gate.</td></tr>

    </tbody></table>
  </div>
  <div>
    <h2>Provenance: defined vs. reachable</h2>
    <table>
      <thead><tr><th></th><th>Class</th><th>State</th><th>Where</th></tr></thead>
      <tbody>${provenanceRows('brief')}</tbody>
    </table>
    <div class="note">${esc(Word(unreachable))} of the four have no render site, so the
      distinction the first criterion asks for cannot be photographed. Nothing is
      mislabeled by that &mdash; the page displays no targets at all.</div>
  </div>
</div>

<div class="two">
  <div class="note warn"><strong>Fixed here.</strong> #${D.PR.number} fixed the
    "Certified" column and left ${word(D.CERT_FIX.claimsLeftLive.length)} sentences of
    copy still saying we certified named employees, one of them a computed count. The
    guard named the two strings already removed, so it passed.</div>
  <div class="note"><strong>Still yours: which metrics a sponsor sees.</strong> Seats and
    points, no outcomes, and no cohort to take one from. Stay silent, or name the outcome
    metrics and stamp each <code>not yet measured</code>.</div>
</div>
</body></html>`;
}

/* ---------------------------- the full document -------------------------------------*/
function buildDocument() {
  const cs = C.criteria();

  return `<!doctype html><html><head><meta charset="utf-8">
<title>C5.10 Sponsor Outcome Dashboard</title><style>${T.baseCss()}</style></head><body>
<h1>C5.10 &middot; The sponsor outcome dashboard, measured against production</h1>
<div class="meta">AI Capability Commercialization &middot; verified ${esc(D.OBSERVED)}
  &middot; artifact folder: 05 - Website &amp; Demo</div>
<div class="rule"></div>

<div class="takeaway">
  <div class="label">Takeaway</div>
  <div class="headline">${esc(headline())}</div>
</div>

<h2>What was asked, and what was missing</h2>
<p>The ticket asks for a coded sponsor dashboard where every figure is visibly one of
measured, target or not-yet-measured, reusing the existing design system, at a route
confirmed to be mounted, behind an open PR. It also asks for a filled-in website
manifest and an artifact in <strong>05 - Website &amp; Demo</strong>.</p>
<p>The page was built and merged on ${esc(D.PR.mergedAt.slice(0, 10))} as PR
#${D.PR.number}. Then it stopped: no artifact was produced, nothing was filed in the
folder, the manifest was never filled in, and the ticket carries only the two automatic
merge-watcher comments. This document is the missing half, and it is written from live
checks rather than from the PR's own description of itself.</p>

<h2>The website manifest</h2>
<table><tbody>${manifestRows()}</tbody></table>

<h2>The four acceptance criteria</h2>
<table><tbody>${criteriaRows()}</tbody></table>

<h2>Provenance: four classes, two that can appear</h2>
<p>The page defines four provenance classes and gives each its own glyph, so the
distinction survives grayscale, color-blindness and a printed screenshot. That is the
right construction. Two of the four have no render site anywhere in the page.</p>
<table>
  <thead><tr><th></th><th>Class</th><th>State</th><th>Where it appears</th></tr></thead>
  <tbody>${provenanceRows()}</tbody>
</table>
<p>This is worth stating carefully, because the obvious reading is wrong. Nothing on the
dashboard is mislabeled: the page displays no targets, so no target is being passed off
as a measurement, which is the risk the ticket's own warning names. What cannot be done
is <em>demonstrate</em> the distinction, because two states never render. The criterion
is satisfied in substance and unprovable on the face of the page.</p>

<h2>Where the markers are, and where they are not</h2>
<p>PR #${D.PR.number} set out to replace a single banner with per-figure provenance, on
the grounds that "a sponsor screenshotting the seat count to forward to their CFO takes
the number and leaves the banner behind". It did that for the four seat cards. It did not
do it for the part of the page a sponsor is most likely to screenshot.</p>
<table><tbody>${coverageRows()}</tbody></table>
<div class="note warn">The section headed <em>"Your standouts, ready to present"</em>
renders three cards carrying a person's name, their points and their project count, with
no marker of any kind. Against sample data those are invented people. The original defect
- a number that travels without its provenance - still applies to every figure below the
seat cards.</div>

<h2>What production actually holds</h2>
<p>Read-only against <code>accelerator_prod</code> on ${esc(D.OBSERVED)}:</p>
<table>
  <thead><tr><th>What</th><th>Count</th><th>Reading</th></tr></thead>
  <tbody>
    <tr><td><code>sponsors</code></td><td>${D.PRODUCTION.sponsors}</td>
      <td>${esc(D.PRODUCTION.sponsorRow.company)},
        ${D.PRODUCTION.sponsorRow.seatsPurchased} seats,
        <code>${esc(D.PRODUCTION.sponsorRow.plan)}</code>,
        <code>${esc(D.PRODUCTION.sponsorRow.billingStatus)}</code>, created
        ${esc(D.PRODUCTION.sponsorRow.createdAt)}</td></tr>
    <tr><td><code>sponsor_seats</code></td><td>${D.PRODUCTION.sponsorSeats}</td>
      <td>No seat has been issued, so none has been redeemed</td></tr>
    <tr><td><code>link_generated</code></td><td>${D.PRODUCTION.linkGenerated}</td>
      <td>No magic link has ever been minted</td></tr>
    <tr><td><code>link_accessed</code></td><td>${D.PRODUCTION.linkAccessed}</td>
      <td>No sponsor has ever held a session on this page</td></tr>
    <tr><td><code>link_rejected</code></td><td>${D.PRODUCTION.linkRejected}</td>
      <td>${D.PRODUCTION.rejectionReasons.map((r) => esc(r.reason + ' x' + r.count))
        .join(', ')}</td></tr>
  </tbody>
</table>
<p><strong>Why those zeros are evidence rather than silence.</strong> A count of zero
successful logins would prove nothing if success were simply not recorded. The audit
model declares exactly three events - <code>${D.PRODUCTION.auditVocabulary.join('</code>, <code>')}</code>
- and the auth service emits all three (${esc(D.PRODUCTION.auditVocabularySource)}). A
zero in two of them is therefore an absence of the event, not an absence of
instrumentation.</p>
${D.PRODUCTION.rejectionReasons.map((r) => '<p class="meta"><strong>'
  + esc(r.reason) + ' &times;' + r.count + '.</strong> ' + esc(r.note) + '</p>').join('')}
<div class="note">The consequence for this ticket: the <code>measured</code> state is
reachable in code and has never been reached in production. Every person who has ever
opened this page saw ten invented builders at a company that does not exist. That is not
a defect in the page - the sample view is correctly marked as sample - but it does mean
the dashboard has never been exercised against a real sponsor's data, and the mapping
layer between the endpoint and the view has therefore never run on a live payload.</div>

<h2>The certification claim this PR removes</h2>
<p>PR #${D.PR.number} found the participant table's column headed <em>Cert</em>, with the
states "Certified" and "Not yet certified" beside a named employee, and fixed it. We
issue nothing: the exam is Anthropic's and we sell preparation for it. The column now
describes the preparation track.</p>
<p>${word(D.CERT_FIX.claimsLeftLive.length)} sentences of copy were left behind, and have
been live in production since:</p>
<ol>${D.CERT_FIX.claimsLeftLive.map((c) => '<li>' + esc(c) + '</li>').join('')}</ol>
<p>${esc(D.CERT_FIX.worstOne)}</p>
<div class="note warn"><strong>The guard is the real finding.</strong> The suite shipped
with <code>${esc(D.CERT_FIX.oldGuard)}</code>. Those describe the two strings one fix
removed from one column; they do not describe the rule. Both passed while all three
sentences above were live, in the same file, in the same pull request. A guard that knows
only the phrasing it was written against stops guarding the moment somebody rephrases.</div>
<p>The replacement asserts the claim instead: ${esc(D.CERT_FIX.newGuard)} The word still
appears legitimately in the data contract, so those tokens are exempted explicitly rather
than by luck, and a check confirms the exemption does not swallow a real claim.
${word(D.CERT_FIX.mutationsCaught)} mutations - each of the three original sentences plus
two rephrasings the old guard would have missed - are all caught.</p>

<h2>Deviations, recorded</h2>
<table>
  <thead><tr><th>What</th><th>How it is handled</th></tr></thead>
  <tbody>${D.DEVIATIONS.map((d) => '<tr><td>' + esc(d.what) + '</td><td>'
    + esc(d.why) + '</td></tr>').join('')}</tbody>
</table>

<h2>The decision that is yours</h2>
<p>The ticket reserves one thing to you: <em>which metrics a sponsor sees</em>. The page
currently shows seats and points. A funding sponsor's actual question is whether the
money produced anything, and there is no cohort to answer it from - the ticket says so
itself under missing evidence.</p>
<p>There are two honest ways to handle that, and they are not equivalent. The page can
stay silent on outcomes, which is where it is now. Or it can name the outcome metrics a
sponsor will be shown and stamp each one <code>not yet measured</code> - which is what
that fourth provenance class was built for, tells a sponsor in advance what we expect to
be judged on, and cannot be mistaken for a result. The second is more useful and more
exposing, which is why it is your call rather than mine.</p>
<p class="meta">Either way, ${word(D.COVERAGE.filter((c) => !c.badged).length)} of the
${D.COVERAGE.length} figure groups still carry no marker. That is a separate, smaller
piece of work and it does not need a decision from you.</p>
</body></html>`;
}

module.exports = { buildVisual, buildDocument, headline };
