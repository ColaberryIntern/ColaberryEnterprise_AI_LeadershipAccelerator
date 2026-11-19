/**
 * Artifacts for the onboarding alignment ticket: which effort owns which drop-off.
 *
 * Three separate pieces of work -- Aleem's getting-started checklist, OH12's card swap trial and
 * OH5's end-of-session survey -- all aim at the same drop-off, while the one drop-off that is
 * both precisely measurable and currently harming named people has no owner at all. That is the
 * whole argument, and it is a picture before it is a document.
 *
 * Figures are the read-only measurement of 19 Nov 2026 (accounts window 11-18 Nov), the same
 * numbers carried by the drop-offs artifact. See buildOnboardingFunnelArtifacts.js for why they
 * are hard-coded rather than re-queried at render time.
 *
 * Usage:
 *   OUT=<dir> node scripts/artifacts/buildOnboardingAlignmentArtifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');
const { TOKENS, SEV, esc, baseCss } = require('./artifactTheme');
const { findAllBritishSpellings } = require('./britishSpellings');

const OUT = process.env.OUT || path.join(__dirname, 'out');
const WINDOW = 'Measured read-only against production on 19 Nov 2026. Accounts window: 11-18 Nov 2026.';

/** The four efforts currently pointed at the welcome sequence. */
const EFFORTS = [
  { key: 'CHK', name: "Aleem's getting-started checklist", ticket: '10518251810', when: 'in design' },
  { key: 'SWP', name: 'OH12: swap the second card', ticket: '10522666153', when: 'due 25 Nov' },
  { key: 'SUR', name: 'OH5: end-of-session survey + score', ticket: '10518095813', when: 'due 19 Nov' },
  { key: 'MSR', name: 'OH11: the event spec they all report against', ticket: '10522666119', when: 'due 21 Nov' },
];

/**
 * Who is aiming at what. `hit` means the effort targets that drop-off directly; `feeds` means it
 * supplies measurement rather than a fix.
 */
const MATRIX = [
  {
    n: 'D1', name: 'Created an account, never arrived', size: '98 of 204 (48%)',
    CHK: '', SWP: '', SUR: '', MSR: 'feeds',
    owner: 'NOBODY', note: 'The largest loss of the five, and upstream of the product entirely: '
      + 'an ads and landing-page problem. Ads-only traffic is 42 of 68.',
  },
  {
    n: 'D2', name: 'Reached the card, nothing played', size: 'not measurable',
    CHK: '', SWP: '', SUR: '', MSR: 'feeds',
    owner: 'VOID', note: 'No reached-the-card signal exists. Drop it rather than re-estimate it.',
  },
  {
    n: 'D3', name: 'Started the video, did not finish', size: '60 under 10%, 110 at 100%',
    CHK: '', SWP: '', SUR: '', MSR: 'feeds',
    owner: 'PR 4246', note: 'Partly an instrument fault: watch beats are being discarded, so these '
      + 'percentages are understated.',
  },
  {
    n: 'D4', name: 'Past 75%, never collected the credit', size: '19, of whom 18 still gated',
    CHK: '', SWP: '', SUR: '', MSR: 'feeds',
    owner: 'NOBODY', note: 'THE GAP. Measurable, harming named people today, and the one a '
      + 'checklist actually closes.',
  },
  {
    n: 'D5', name: 'Collected the credit, skipped the Quick check', size: '74 to 27 (63.5%)',
    CHK: 'hit', SWP: 'hit', SUR: 'hit', MSR: 'feeds',
    owner: 'THREE', note: 'All three land here. If they ship together the numbers cannot tell '
      + 'them apart.',
  },
];

const MARK = {
  hit: `<span style="color:${SEV.bad};font-weight:700;font-size:13pt">&#9679;</span>`,
  feeds: `<span style="color:${TOKENS.MUTED};font-size:11pt">&#9675;</span>`,
  '': `<span style="color:#e8ecf1">&#183;</span>`,
};
const OWNER_CHIP = {
  NOBODY: `<span class="chip" style="background:${SEV.bad}">NO OWNER</span>`,
  VOID: `<span class="chip" style="background:${SEV.watch}">NOT MEASURABLE</span>`,
  THREE: `<span class="chip" style="background:${SEV.watch}">3 OWNERS</span>`,
  'PR 4246': `<span class="chip" style="background:${SEV.ok}">PR 4246</span>`,
};

/* ------------------------------------------------------------------ visual ---- */

function visual() {
  const head = EFFORTS.map((e) => `<th style="text-align:center;width:7%">${esc(e.key)}</th>`).join('');
  const rows = MATRIX.map((r) => `<tr>
    <td style="font-weight:700;color:${TOKENS.CHERRY_DEEP}">${r.n}</td>
    <td style="font-weight:600">${esc(r.name)}</td>
    <td style="font-size:8.5pt;white-space:nowrap">${esc(r.size)}</td>
    ${EFFORTS.map((e) => `<td style="text-align:center">${MARK[r[e.key]]}</td>`).join('')}
    <td style="white-space:nowrap">${OWNER_CHIP[r.owner]}</td>
    <td style="font-size:8pt;color:${TOKENS.MUTED}">${esc(r.note)}</td>
  </tr>`).join('');

  const key = EFFORTS.map((e) => `<div style="font-size:8.5pt;margin-bottom:3px">
      <strong style="color:${TOKENS.CHERRY_DEEP}">${esc(e.key)}</strong>
      &nbsp;${esc(e.name)} <span style="color:${TOKENS.MUTED}">(${esc(e.when)})</span></div>`).join('');

  const body = `
  <h1>Five drop-offs, four efforts, and the one nobody owns</h1>
  <div class="meta">${esc(WINDOW)} Read-only: no row was written to take this measurement.</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">Three separate pieces of work all aim at the last drop-off. The drop-off
      that is both precisely measurable and actively harming named people today has no owner at
      all, and the largest loss of the five is upstream of the product entirely.</div>
  </div>

  <table>
    <thead><tr>
      <th style="width:4%"></th><th style="width:21%">Drop-off</th><th style="width:12%">Size</th>
      ${head}<th style="width:11%">Owner</th><th style="width:24%">What that means</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div style="display:flex;gap:16px;margin-top:2px">
    <div style="flex:1.1">
      <h3 style="margin-top:0">The four efforts</h3>
      ${key}
      <div style="font-size:8pt;color:${TOKENS.MUTED};margin-top:6px">
        ${MARK.hit} aims at this drop-off directly &nbsp;&nbsp;
        ${MARK.feeds} supplies the measurement rather than a fix
      </div>
    </div>
    <div style="flex:1">
      <div class="note good" style="margin-top:0">
        <strong>Suggested split.</strong> The checklist takes <strong>D4</strong>, where a visible
        next step is exactly the missing thing. OH12 keeps <strong>D5</strong> as a content trial.
        OH5 owns the intent question outright, and the checklist's welcome moment reads that
        answer instead of asking it a second time.
      </div>
    </div>
  </div>

  <div style="display:flex;align-items:center;gap:18px;margin-top:8px;padding:12px 16px;
              border-radius:6px;background:${TOKENS.CHERRY_BG};
              border-left:5px solid ${TOKENS.CHERRY}">
    <div style="font-size:26pt;font-weight:700;line-height:1;color:${TOKENS.CHERRY_DEEP};
                white-space:nowrap">18 of 19</div>
    <div style="font-size:10pt;line-height:1.45">
      <strong>D4, the unowned one.</strong> Of the 19 who watched past 75% and never collected
      the credit, 18 are <strong>still gated right now</strong> -- sent back to the same video on
      every new browser tab. No other drop-off here has names attached to it today.
    </div>
  </div>`;

  return htmlDoc({ title: 'Five drop-offs, four efforts', css: baseCss(), body });
}

/* ------------------------------------------------------------------ document ---- */

function doc() {
  const rows = MATRIX.map((r) => `<tr>
    <td style="font-weight:700">${r.n}</td><td>${esc(r.name)}</td>
    <td style="white-space:nowrap">${esc(r.size)}</td>
    <td>${OWNER_CHIP[r.owner]}</td><td>${esc(r.note)}</td></tr>`).join('');

  const body = `
  <h1>Lining up the checklist, the card swap and the survey</h1>
  <div class="meta">${esc(WINDOW)} Companion to the one-page visual.</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Why this exists</div>
    <div class="headline">Four pieces of work are pointed at the same welcome sequence, and they
      were specified separately. Three of them aim at the same drop-off; the one drop-off with
      people being harmed by it today has nobody on it.</div>
  </div>

  <h2>The map</h2>
  <table>
    <thead><tr><th style="width:5%"></th><th style="width:24%">Drop-off</th>
      <th style="width:16%">Size</th><th style="width:13%">Owner</th><th>What that means</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <h2>The overlap, stated plainly</h2>
  <p><strong>Aleem's checklist, OH12's card swap and OH5's survey all land on D5.</strong> That is
  defensible individually and a problem collectively: if all three ship inside the same window,
  the numbers cannot tell them apart, and whichever one happens to be measured last will look like
  the cause. OH12's own description already says "coordinate with Aleem rather than solving it
  twice" -- this is that coordination, with the third effort added.</p>

  <p>There is a second, quieter overlap. <strong>OH5 asks a new attendee their start timeline,
  budget fit and biggest question at the END of the Open House. Aleem's welcome moment asks a new
  account essentially the same intent question at the START of the product.</strong> A person who
  attends and then signs up gets asked twice, days apart, by two systems that do not know about
  each other. The second ask reads as not having listened to the first.</p>

  <h2>Suggested ownership</h2>
  <table>
    <thead><tr><th style="width:26%">Effort</th><th style="width:16%">Takes</th>
      <th>Why that one</th></tr></thead>
    <tbody>
      <tr><td>Aleem's getting-started checklist</td><td><strong>D4</strong></td>
        <td>A visible next step with progress shown is precisely the missing thing for someone who
          finished the video and does not know a deliberate click is required. It is measurable
          against first-win ledger rows, so the checklist can be shown to have worked.</td></tr>
      <tr><td>OH12 card swap</td><td><strong>D5</strong></td>
        <td>Keeps it as the content-relevance trial it was designed to be, now with the corrected
          base and with the sequencing caveat below.</td></tr>
      <tr><td>OH5 survey</td><td><strong>The intent question</strong></td>
        <td>It happens first, to a warmer audience, and the participation score depends on it. The
          welcome moment reads that answer where one exists and only asks when there is no Open
          House registration behind the account.</td></tr>
      <tr><td>OH11 event spec</td><td><strong>The substrate</strong></td>
        <td>Every claim above is reported against it, which is why its premise had to be corrected
          before any of this could be trusted.</td></tr>
    </tbody>
  </table>

  <h2>Three constraints that bind all of them</h2>

  <h3>1. The funnel steps they report against are wrong today</h3>
  <p>A <code>timeline_card_progress</code> row is materialization, not an open: every card gets a
  row at once when the timeline is built, before the learner arrives. Any week-over-week comparison
  on row counts compares enrollment counts. Use first-win ledger rows for conversion and
  <code>today_card_events</code> where it is emitted. OH12's acceptance criteria currently specify
  the broken version.</p>

  <h3>2. The Quick check is not downstream of the video</h3>
  <p>Its <code>unlock_rules</code> are empty and 61 people have completed it without ever
  completing the video. "Learners who collect the video credit skip the Quick check" describes two
  independently reachable cards, not a sequence, so moving the Quick check to third does not stop
  anyone reaching it second.</p>

  <h3>3. The measuring instrument is about to change</h3>
  <p>Watch beats are currently discarded by a save loop and an edge-keyed rate limiter (PR 4246),
  so watch percentages across YouTube and Vimeo cards are understated. Any before-and-after
  comparison straddling that deploy compares two different instruments, so each trial window should
  sit entirely on one side of it.</p>

  <div class="note warn">
    <strong>The thing most worth not losing.</strong> D1 is the largest loss on the page -- 98 of
    204, and 42 of 68 for ads-only traffic -- and no effort here touches it, because nothing in the
    product can reach somebody who never arrived. It belongs to whoever owns the ad and the landing
    page. It is listed so it is not quietly dropped by being outside everyone's scope.
  </div>`;

  return htmlDoc({ title: 'Lining up the checklist, the card swap and the survey', css: baseCss(), body });
}

/* ------------------------------------------------------------------ build ---- */

const JOBS = [
  { file: 'onboarding-alignment-visual.pdf', html: visual, landscape: true, maxPages: 1 },
  { file: 'onboarding-alignment-record.pdf', html: doc, landscape: false, maxPages: 4 },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const job of JOBS) {
    const html = job.html();
    const hits = findAllBritishSpellings(html.replace(/<[^>]+>/g, ' '));
    if (hits.length) {
      throw new Error(`${job.file}: British spelling -- `
        + hits.map((h) => `${h.word} -> ${h.american}`).join(', '));
    }
    const r = await renderPdf({
      html,
      outPath: path.join(OUT, job.file),
      landscape: job.landscape,
      maxPages: job.maxPages,
      margin: job.landscape ? '11mm' : '15mm',
    });
    console.log(`${job.file}: ${r.pages} page(s), ${(r.bytes / 1024).toFixed(0)} KB`);
  }
  console.log(`\nwrote ${JOBS.length} PDFs to ${OUT}`);
}

module.exports = { JOBS, OUT, main };

if (require.main === module) {
  main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
}
