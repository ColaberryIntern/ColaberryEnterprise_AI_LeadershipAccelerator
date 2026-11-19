/**
 * Artifacts for the two onboarding-feedback analysis tickets (19 Nov 2026).
 *
 *   10528130140  Welcome-sequence drop-offs re-derived with their real bases
 *   10528130041  OH11 premise correction: a progress row is materialization, not an open
 *
 * Each ticket gets TWO PDFs, in this order: a one-page landscape visual, then the document.
 * A reader who opens one page should learn the shape of the problem; the document is for the
 * person who has to act on it.
 *
 * ## Why the numbers are hard-coded here rather than queried
 *
 * These are a MEASUREMENT TAKEN AT A NAMED MOMENT -- read-only, against production, on
 * 19 Nov 2026. Re-querying at render time would silently produce a different artifact from the
 * one quoted on the ticket, which is the exact failure the tickets are about. The window is
 * printed on every page so a later reader can tell whether it is still current.
 *
 * ## Why some cells say "not measurable"
 *
 * Drop-off 2 was stated as "reached the card, nothing played". There is no reached-the-card
 * signal in the product, so the honest cell is the absence, not a number that looks like the
 * others. Filling it in would reproduce the defect this artifact documents.
 *
 * Usage (from anywhere; NODE_PATH must reach a node_modules with playwright):
 *   OUT=<dir> node scripts/artifacts/buildOnboardingFunnelArtifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');
const { TOKENS, SEV, esc, baseCss, barChart } = require('./artifactTheme');
const { findAllBritishSpellings } = require('./britishSpellings');

const OUT = process.env.OUT || path.join(__dirname, 'out');
const WINDOW = 'Measured read-only against production on 19 Nov 2026. Accounts window: 11-18 Nov 2026.';

/* ------------------------------------------------------------------ the measurement ---- */

/** The five drop-offs, as stated on 18 Nov and as re-derived with each base named. */
const DROPOFFS = [
  {
    n: 'D1',
    name: 'Created an account, never arrived',
    stated: '16 of 82',
    measured: '98 of 204 (48%)',
    base: 'enrollments created 11-18 Nov, against any sign-in use',
    verdict: 'changed',
    note: 'Ads-only traffic (utm_source fb / ig) is worse: 42 of 68 (62%). The stated base of 82 '
      + 'could not be reproduced from any date or source filter.',
  },
  {
    n: 'D2',
    name: 'Reached the card, nothing played',
    stated: '57 of 138',
    measured: 'not measurable as phrased',
    base: 'no reached-the-card signal exists for this path',
    verdict: 'void',
    note: 'The 138 was progress rows CREATED that week (58 of 148 on recount), which is '
      + 'materialization, not arrival. The only true screen-reached signal, today_card_events, '
      + 'holds 9 people for that week.',
  },
  {
    n: 'D3',
    name: 'Started the video, did not finish',
    stated: '69 under 10%, 78 at 100%',
    measured: '60 under 10%, 67 middle, 110 at 100%',
    base: '244 rows carrying a playback beat',
    verdict: 'changed',
    note: 'The middle is 27% of the base, not the empty band the stated pair implies. Percentages '
      + 'measured before 19 Nov were computed on values the duration repair then rewrote.',
  },
  {
    n: 'D4',
    name: 'Past 75%, never collected the credit',
    stated: '6',
    measured: '19',
    base: 'watched_pct >= 75 with no first-win ledger row',
    verdict: 'changed',
    note: '18 of the 19 are STILL GATED today. They did the work the gate asks for and are being '
      + 'returned to the same video on every new tab.',
  },
  {
    n: 'D5',
    name: 'Collected the credit, skipped the Quick check',
    stated: '17 to 4 (76.5% drop)',
    measured: '74 to 27 (63.5% drop)',
    base: 'first-win credit events 11-18 Nov',
    verdict: 'changed',
    note: 'Read by enrollment cohort instead it is 29 to 17 (week of 9 Nov) and 67 to 17 (week of '
      + '16 Nov). Two defensible readings, different bases, different answers -- which is the '
      + 'whole point of this ticket.',
  },
];

/** The three measurements that prove a progress row is not an open. */
const PROOFS = [
  {
    n: '1,015 = 1,015',
    k: 'rows on each card',
    text: 'The welcome video and the Quick check hold exactly the same row count. Two cards with '
      + 'very different completion cannot have identical open counts.',
  },
  {
    n: '794 of 948',
    k: 'pairs created within 2s',
    text: 'Of the people holding both rows, 794 had them written less than two seconds apart. No '
      + 'human opens two cards that fast.',
  },
  {
    n: '506',
    k: 'rows, no arrival at all',
    text: 'Welcome-card rows belonging to accounts with no sign-in and no screen event of any '
      + 'kind. Nobody was there to open anything.',
  },
];

/* ------------------------------------------------------------------ shared fragments ---- */

const CHIP = {
  changed: `<span class="chip" style="background:${SEV.bad}">CHANGED</span>`,
  void: `<span class="chip" style="background:${SEV.watch}">NOT MEASURABLE</span>`,
  ok: `<span class="chip" style="background:${SEV.ok}">CONFIRMED</span>`,
};

/**
 * The two-lane diagram, hand-rolled rather than left to Mermaid.
 *
 * Mermaid needs a CDN and a layout engine; this picture is five boxes and two arrows, and the
 * whole argument of the artifact is that a diagram-shaped hole is worse than no diagram.
 */
function laneDiagram() {
  const { CHERRY, MUTED, INK, BORDER, BG_ALT } = TOKENS;
  const box = (x, y, w, h, fill, stroke, lines, bold) => {
    const t = lines.map((l, i) => `<text x="${x + w / 2}" y="${y + 20 + i * 13}" font-size="${
      i === 0 && bold ? 11 : 9.5}" font-weight="${i === 0 && bold ? 700 : 400}"
      text-anchor="middle" fill="${INK}">${esc(l)}</text>`).join('');
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}"
      stroke="${stroke}" stroke-width="1.4"/>${t}`;
  };
  const arrow = (x1, y, x2, label) => `
    <line x1="${x1}" y1="${y}" x2="${x2 - 7}" y2="${y}" stroke="${MUTED}" stroke-width="1.6"/>
    <polygon points="${x2},${y} ${x2 - 8},${y - 4.5} ${x2 - 8},${y + 4.5}" fill="${MUTED}"/>
    ${label ? `<text x="${(x1 + x2) / 2}" y="${y - 7}" font-size="8" text-anchor="middle"
       fill="${MUTED}">${esc(label)}</text>` : ''}`;

  return `<svg viewBox="0 0 900 250" width="100%" role="img">
    <text x="0" y="12" font-size="9" font-weight="700" fill="${SEV.bad}"
      letter-spacing="0.5">WHAT ACTUALLY WRITES A PROGRESS ROW -- NO HUMAN INVOLVED</text>
    ${box(0, 22, 190, 56, BG_ALT, BORDER, ['Account created', 'or enrolled in a cohort'], true)}
    ${arrow(190, 50, 245, '')}
    ${box(245, 22, 200, 56, BG_ALT, BORDER, ['Timeline materialized', 'server-side, in one pass'], true)}
    ${arrow(445, 50, 500, '')}
    ${box(500, 22, 400, 56, '#fdf3f2', SEV.bad,
    ['A row for EVERY card at once', 'welcome video, Quick check, all of them'], true)}

    <text x="0" y="128" font-size="9" font-weight="700" fill="${SEV.ok}"
      letter-spacing="0.5">WHAT A HUMAN DOING SOMETHING WRITES</text>
    ${box(0, 138, 190, 56, BG_ALT, BORDER, ['Learner opens', 'the card on screen'], true)}
    ${arrow(190, 166, 245, '')}
    ${box(245, 200, 0, 0, '#fff', '#fff', [], false)}
    ${box(245, 138, 200, 56, '#f3f9f3', SEV.ok, ['today_card_events', 'first occurrence only'], true)}
    ${arrow(445, 166, 500, '')}
    ${box(500, 138, 400, 56, '#f3f9f3', SEV.ok,
    ['36 people all-time on this card', '9 in the window -- and none for the redirect path'], true)}

    <text x="0" y="225" font-size="9" fill="${MUTED}">started_at on a progress row is written by the
      first playback beat, so it is a PLAYED signal, not an OPENED one.</text>
    <text x="0" y="240" font-size="9" fill="${MUTED}">There is no opened-the-card signal anywhere in
      the first-lesson path. The nearest honest substitutes are above.</text>
  </svg>`;
}

/* ------------------------------------------------------------------ visual 1 ---- */

function visualDropoffs() {
  const rows = DROPOFFS.map((d) => `<tr>
    <td style="font-weight:700;color:${TOKENS.CHERRY_DEEP};white-space:nowrap">${d.n}</td>
    <td style="font-weight:600">${esc(d.name)}</td>
    <td style="text-align:center;color:${TOKENS.MUTED}">${esc(d.stated)}</td>
    <td style="text-align:center;font-weight:700">${esc(d.measured)}</td>
    <td style="white-space:nowrap">${CHIP[d.verdict]}</td>
    <td style="font-size:8pt;color:${TOKENS.MUTED}">${esc(d.base)}</td>
  </tr>`).join('');

  const curve = barChart({
    rows: [
      { label: 'Under 10% watched', value: 60, color: SEV.bad },
      { label: 'The middle band', value: 67, color: SEV.watch },
      { label: 'At 100%', value: 110, color: SEV.ok },
    ],
    max: 244,
    width: 420,
    labelW: 130,
    barH: 22,
  });

  const body = `
  <h1>Welcome-sequence drop-offs, re-derived</h1>
  <div class="meta">${esc(WINDOW)} Read-only: no row was written to take this measurement.</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">The five drop-offs were counted on four different bases. Three of five
      change materially once each base is named, one cannot be measured as phrased, and the cause
      is the same in every case: there is no opened-the-card signal in this product.</div>
  </div>

  <table>
    <thead><tr>
      <th style="width:4%"></th><th style="width:25%">Drop-off</th>
      <th style="width:14%;text-align:center">Stated 18 Nov</th>
      <th style="width:16%;text-align:center">Measured 19 Nov</th>
      <th style="width:13%"></th><th style="width:28%">Base it was measured on</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div style="display:flex;gap:16px;margin-top:4px">
    <div style="flex:1.05">
      <h3 style="margin-top:0">The watch curve is not bimodal</h3>
      ${curve}
      <div class="meta">Base: 244 rows carrying a playback beat. The bars do not sum to the base
        and are not drawn as if they do.</div>
    </div>
    <div style="flex:1">
      <div class="note warn" style="margin-top:0">
        <strong>Why the bases did not line up.</strong> A progress row is created when a learner's
        timeline is materialized server-side, not when they open a card. Counting rows counts
        enrollments. Both cards hold exactly 1,015 rows; 794 of 948 pairs were written within two
        seconds of each other.
      </div>
      <div class="note good">
        <strong>What is safe to size a design against.</strong> First-win ledger rows (the credit
        itself), today_card_events for screens that emit it, and sign-in use for arrival. Each one
        names its own population, so each one can be stated with a base.
      </div>
    </div>
  </div>

  <div style="display:flex;align-items:center;gap:18px;margin-top:8px;padding:12px 16px;
              border-radius:6px;background:${TOKENS.CHERRY_BG};
              border-left:5px solid ${TOKENS.CHERRY}">
    <div style="font-size:26pt;font-weight:700;line-height:1;color:${TOKENS.CHERRY_DEEP};
                white-space:nowrap">18 of 19</div>
    <div style="font-size:10pt;line-height:1.45">
      <strong>The one number to design against.</strong> Of the 19 learners who watched past 75%
      and never collected the credit, 18 are <strong>still gated today</strong> -- returned to the
      same video on every new browser tab. They did the work; the product is not counting it.
      This is D4, it is precisely measurable, and it is the drop-off a getting-started checklist
      can actually close.
    </div>
  </div>`;

  return htmlDoc({ title: 'Welcome-sequence drop-offs, re-derived', css: baseCss(), body });
}

/* ------------------------------------------------------------------ visual 2 ---- */

function visualPremise() {
  const cards = PROOFS.map((p) => `<div class="card">
    <div class="n" style="font-size:16pt">${esc(p.n)}</div>
    <div class="k">${esc(p.k)}</div>
    <div style="font-size:8.5pt;color:${TOKENS.MUTED};margin-top:6px;line-height:1.4">
      ${esc(p.text)}</div>
  </div>`).join('');

  const body = `
  <h1>A progress row is materialization, not an open</h1>
  <div class="meta">${esc(WINDOW)} Correction to the event spec premise in OH11.</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The correction</div>
    <div class="headline">OH11's description states that a timeline_card_progress row is created
      when the card is opened. It is not. The row is created when the timeline is materialized, for
      every card at once, before the learner has done anything. Any funnel built on that premise
      counts enrollments and reports them as views.</div>
  </div>

  <div class="cards">${cards}</div>

  ${laneDiagram()}

  <div style="display:flex;gap:16px;margin-top:10px">
    <div style="flex:1">
      <div class="note warn" style="margin-top:0">
        <strong>The corroborating case.</strong> The Quick check holds 1,015 rows, has
        <strong>zero</strong> populated started_at values, and 116 completions. If rows meant opens,
        a thousand people opened a card none of them ever started.
      </div>
    </div>
    <div style="flex:1">
      <div class="note good" style="margin-top:0">
        <strong>What to change in the spec.</strong> Keep the funnel; swap the substrate. Arrival
        from sign-in use, screen-reached from today_card_events where it is emitted, playback from
        started_at and watched_pct, and the conversion step from first-win ledger rows. State the
        base beside every number the spec asks anyone to report.
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'A progress row is materialization, not an open', css: baseCss(), body });
}

/* ------------------------------------------------------------------ document 1 ---- */

function docDropoffs() {
  const sections = DROPOFFS.map((d) => `
  <h3>${d.n}. ${esc(d.name)} &nbsp; ${CHIP[d.verdict]}</h3>
  <table style="margin-top:4px">
    <tbody>
      <tr><td style="width:22%;font-weight:700">Stated 18 Nov</td><td>${esc(d.stated)}</td></tr>
      <tr><td style="font-weight:700">Measured 19 Nov</td>
          <td style="font-weight:700">${esc(d.measured)}</td></tr>
      <tr><td style="font-weight:700">Base</td><td>${esc(d.base)}</td></tr>
      <tr><td style="font-weight:700">What changed and why</td><td>${esc(d.note)}</td></tr>
    </tbody>
  </table>`).join('');

  const body = `
  <h1>Welcome-sequence drop-offs: the measurement record</h1>
  <div class="meta">${esc(WINDOW)} Ticket 10528130140. Companion to the one-page visual.</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Why this document exists</div>
    <div class="headline">Aleem pointed out that the bases in the 18 Nov drop-off list do not line
      up: 82 new accounts, 138 who opened the card, 147 who played it. They do not line up because
      three different things were being counted and all three were called the same thing. This is
      the re-derivation, with the base named for every figure.</div>
  </div>

  <h2>The root cause, stated once</h2>
  <p>There is no opened-the-card signal in the first-lesson path. A
  <code>timeline_card_progress</code> row is written when a learner's timeline is materialized
  server-side -- one pass, every card, no human action. So a count of rows is a count of
  enrollments wearing a different name. <code>started_at</code> on that row is written by the first
  playback beat, which makes it a <em>played</em> signal; there is nothing in between.</p>

  <p>The evidence is in the companion artifact on ticket 10528130041, and in short: both cards hold
  exactly 1,015 rows; 794 of the 948 people holding both had them written within two seconds; 506
  welcome-card rows belong to accounts with no arrival signal of any kind; and the Quick check has
  1,015 rows, zero populated <code>started_at</code>, and 116 completions.</p>

  <div class="note warn">
    <strong>A second contaminant, specific to the watch figures.</strong> The duration repair that
    ran on 19 Nov rewrote <code>watched_pct</code> on 105 of this card's rows. Any percentage
    measured before that date was computed on values that have since changed, which is part of why
    D3 would not reconcile against anything.
  </div>

  <h2>The five drop-offs</h2>
  ${sections}

  <h2>Two findings that were not in the original five</h2>

  <h3>The Quick check is not gated behind the video</h3>
  <p>Its <code>unlock_rules</code> are empty. 61 people have completed the Quick check without ever
  completing the video, so D5 is not a funnel step in the sense the list implies -- the two cards
  are reachable independently, and a design that treats the Quick check as downstream of the video
  is designing a sequence the product does not enforce.</p>

  <h3>The Quick check is not too hard</h3>
  <p>Re-sourced from <code>runtime_assessment_attempts</code>, because the scores are not in
  <code>timeline_card_progress</code> at all and a query against that table returns zero rows and
  looks like an answer. 120 attempts by 120 distinct people; 102 scored 80% or above (85%); 70
  scored full marks (58%); the maximum <code>attempt_number</code> is 1, so nobody has ever
  retaken it. At the 18 Nov snapshot the same query gives 84.1% and 59.3%, which confirms the
  correction made on the ticket that day.</p>

  <h2>What this means for the design decisions on the table</h2>
  <p>The getting-started checklist should be sized against <strong>D4</strong>, not D2. D4 is the
  one drop-off that is both real and precisely measurable: 19 people are past 75% with no credit,
  and 18 of them are still gated right now. It is also the one a checklist can actually fix,
  because the missing action is a single deliberate click the learner does not know is required.</p>

  <p>D2 should be dropped from the list rather than re-estimated. Sizing a design against a number
  that cannot be measured means nobody will be able to tell afterwards whether the design worked.</p>

  <div class="note good">
    <strong>Standing rule applied here.</strong> Every figure in this document is a read-only
    measurement with its window named. Nothing was written to production to produce it, and no
    figure is carried forward from the 18 Nov list without being re-derived.
  </div>`;

  return htmlDoc({ title: 'Welcome-sequence drop-offs: the measurement record', css: baseCss(), body });
}

/* ------------------------------------------------------------------ document 2 ---- */

function docPremise() {
  const body = `
  <h1>OH11 premise correction: what a progress row actually means</h1>
  <div class="meta">${esc(WINDOW)} Ticket 10528130041. Companion to the one-page visual.</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The correction</div>
    <div class="headline">OH11's own description states that a timeline_card_progress row is
      created when the card is opened. That is not what the row means, and OH11 is the ticket that
      defines the measurement substrate for the whole onboarding design. The premise has to be
      fixed before the spec ships, not after the first report disagrees with itself.</div>
  </div>

  <h2>What the row actually is</h2>
  <p>A <code>timeline_card_progress</code> row is created when a learner's timeline is materialized
  server-side. That happens once, in a single pass, and it creates a row for every card in the
  program at the same moment -- before the learner has signed in, let alone opened anything. The
  row is a slot waiting to be filled, not a record of a visit.</p>

  <p><code>started_at</code> on that row is written by the first playback beat. That makes it a
  genuine signal, but a <em>played</em> one. Between materialization and playback there is no
  recorded state, which is precisely where an opened-the-card metric would have to live.</p>

  <h2>The three measurements that prove it</h2>
  <table>
    <thead><tr><th style="width:18%">Measurement</th><th style="width:22%">Value</th>
      <th>Why it settles the question</th></tr></thead>
    <tbody>
      ${PROOFS.map((p) => `<tr><td style="font-weight:700">${esc(p.k)}</td>
        <td style="font-weight:700;color:${TOKENS.CHERRY_DEEP}">${esc(p.n)}</td>
        <td>${esc(p.text)}</td></tr>`).join('')}
      <tr><td style="font-weight:700">Quick check rows</td>
        <td style="font-weight:700;color:${TOKENS.CHERRY_DEEP}">1,015 rows, 0 started_at</td>
        <td>And 116 completions. If a row meant an open, a thousand people opened a card that none
          of them ever started.</td></tr>
    </tbody>
  </table>

  <h2>What to use instead</h2>
  <table>
    <thead><tr><th style="width:22%">Funnel step</th><th style="width:30%">Honest substrate</th>
      <th>What it can and cannot tell you</th></tr></thead>
    <tbody>
      <tr><td>Arrived</td><td><code>sign_in_link_uses</code>, on <code>used_at</code></td>
        <td>A real arrival signal. Note the table is not named what you would guess -- a query
          against <code>sign_in_link_events</code> returns zero columns, not zero rows.</td></tr>
      <tr><td>Reached the screen</td><td><code>today_card_events</code></td>
        <td>First occurrence only, per enrollment, ref, event and source; began 3 Nov. It is the
          only true screen-reached signal, and it has <strong>no rows for the first-lesson redirect
          path</strong>, so it cannot measure the welcome video today.</td></tr>
      <tr><td>Played</td><td><code>started_at</code>, <code>watched_pct</code></td>
        <td>Reliable from 19 Nov onward. Earlier percentages were rewritten by the duration repair
          and should not be compared across that date.</td></tr>
      <tr><td>Converted</td><td>First-win ledger rows</td>
        <td>The credit itself, which is also what the gate reads. The most trustworthy number in
          the set, because the product acts on it.</td></tr>
    </tbody>
  </table>

  <div class="note warn">
    <strong>The gap worth deciding about.</strong> If the design needs an opened-the-card number
    for the welcome video, it does not exist and cannot be back-filled. Either
    <code>today_card_events</code> is extended to cover the first-lesson redirect path -- a small
    change, and the only way to get that number -- or the funnel starts at played and says so.
    Estimating it is the one option that should be off the table.
  </div>

  <h2>Why this matters more than a wrong number</h2>
  <p>OH11 is due 21 Nov and is the event spec every later onboarding decision will be reported
  against. A spec that tells people a row means an open will keep producing figures that cannot be
  reconciled, and each time it happens somebody will spend a day re-deriving them, as happened
  here. Fixing the sentence costs minutes. Leaving it costs a day every time the question is
  asked.</p>

  <div class="note good">
    <strong>What is already done.</strong> The correction is posted as a comment on OH11 itself, so
    whoever picks the ticket up sees it before building the spec. This document is the evidence
    behind that comment.
  </div>`;

  return htmlDoc({ title: 'OH11 premise correction', css: baseCss(), body });
}

/* ------------------------------------------------------------------ build ---- */

const JOBS = [
  { file: 'onboarding-dropoffs-visual.pdf', html: visualDropoffs, landscape: true, maxPages: 1 },
  { file: 'onboarding-dropoffs-record.pdf', html: docDropoffs, landscape: false, maxPages: 4 },
  { file: 'oh11-premise-visual.pdf', html: visualPremise, landscape: true, maxPages: 1 },
  { file: 'oh11-premise-record.pdf', html: docPremise, landscape: false, maxPages: 4 },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const job of JOBS) {
    const html = job.html();
    // Guard the prose before it becomes a PDF nobody will re-render.
    const text = html.replace(/<[^>]+>/g, ' ');
    const hits = findAllBritishSpellings(text);
    if (hits.length) {
      throw new Error(`${job.file}: British spelling in prose -- `
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

/**
 * Exported so the preview tool can model the SAME html on the real page surface. A preview that
 * re-states the content instead of importing it is a preview of something else.
 */
module.exports = { JOBS, OUT, main };

if (require.main === module) {
  main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
}
