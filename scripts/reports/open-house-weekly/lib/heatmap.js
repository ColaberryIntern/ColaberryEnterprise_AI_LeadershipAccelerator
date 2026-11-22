/**
 * C125: the landing page heat map. How far down the page people get, and where they click.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE CHANGING ANYTHING HERE. It is the difference between a heat map and a lie.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * A heat map normally means a cloud of recorded click coordinates over a screenshot. THIS IS
 * NOT THAT, AND IT CANNOT BE, because the coordinates do not exist. Verified against production
 * on 18 Nov 2026: of every row in `page_events`, the number carrying an x, y, offset, scroll
 * position or viewport key is ZERO. `frontend/public/v1/track.js` records WHICH element was
 * clicked (its `data-track` label, its text, its href) and never where the pointer was.
 *
 * So this draws the page to scale and places each recorded click on the element it names, whose
 * position is MEASURED by rendering the live page at phone size (`measurePage.js`). Two separate
 * claims, and the report must never merge them:
 *
 *   - "130 people clicked Save my seat"      <- RECORDED. A fact about people.
 *   - "Save my seat sits at 527px"           <- MEASURED, today, at 390x844. A fact about the page.
 *
 * The join between them is the element's label, resolved by the same two expressions the tracker
 * uses. When a label matches more than one element the clicks CANNOT be attributed, and this file
 * says so rather than picking one.
 *
 * ── HOW DEPTH BECOMES PIXELS, which is the one piece of real arithmetic here ──────────────────
 *
 * The tracker fires `scroll` at five thresholds only - 25, 50, 75, 90, 100 - computed as
 * `scrollY / (scrollHeight - clientHeight)`. A threshold is therefore a statement about the
 * lowest pixel that was ON SCREEN, not about the top of the viewport:
 *
 *     lowest pixel seen at threshold t  =  t/100 * scrollable  +  clientHeight
 *
 * Forgetting `+ clientHeight` is the mistake that matters. On this page it is 844px of an
 * 7478px page, and it is the whole reason the closing CTA (top 7244px) is visible to someone
 * whose last recorded threshold was 100% rather than being unreachable: an element can be past
 * the "100% scrolled" line in depth terms and still be read, because the final screenful is
 * visible without scrolling any further.
 *
 * `reachAt(y)` is a deliberate LOWER BOUND. It returns the count at the first threshold whose
 * line is at or below... no: at or BELOW y means they did not see y. It returns the count at the
 * first threshold whose line reaches y or beyond. Somebody who stopped at 40% saw further than
 * the 25% line but is only ever counted in d25, so the true number who saw a pixel between two
 * lines is somewhere between the two counts. Every label this file produces therefore says
 * "at least", and `pessimistic: true` records that the figure is a floor. Reporting the upper
 * bound instead would overstate how much of the page is read, which is the one direction this
 * report must never err in.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('./brand');

/**
 * The page geometry for a snapshot.
 *
 * IT TRAVELS IN THE SNAPSHOT, like `snap.email` does, rather than as an argument threaded
 * through `buildHtml`. Two reasons. The measurement has to happen on a machine with a browser
 * and the render happens inside a container that has none, so the two are already separated by
 * `run.sh` and the snapshot is the thing that crosses between them. And a snapshot kept on the
 * host is re-rendered weeks later when an old week is looked at: geometry stored alongside the
 * numbers means that render uses the page AS IT WAS, instead of silently placing old clicks on
 * today's layout.
 *
 * The committed file is the fallback for when measuring fails, and it is the reason a browser
 * failure costs the report a caveat rather than a panel. `buildHeat` marks it stale past ten
 * days so a fallback that has quietly become the normal path says so on the page.
 */
const COMMITTED = path.join(__dirname, 'landingPageGeometry.json');

function loadGeometry(snap) {
  if (snap && snap.geometry && snap.geometry.bands) return snap.geometry;
  try { return JSON.parse(fs.readFileSync(COMMITTED, 'utf8')); } catch (_e) { return null; }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const THRESHOLDS = [25, 50, 75, 90, 100];

/** The lowest pixel on screen for someone whose deepest recorded threshold is `t`. */
function pixelOfThreshold(t, geom) {
  return (t / 100) * geom.scrollable + geom.clientHeight;
}

/**
 * At least this many of the window's visitors had pixel `y` on screen.
 *
 * The first screenful needs no scroll at all, so everyone who arrived saw it; that is the only
 * branch that uses `visitors` rather than a scroll count.
 */
function reachAt(y, scroll, visitors, geom) {
  if (y <= geom.clientHeight) return { n: visitors, basis: 'arrived', pessimistic: false };
  for (const t of THRESHOLDS) {
    if (pixelOfThreshold(t, geom) >= y) {
      return { n: scroll[`d${t}`] ?? 0, basis: `d${t}`, pessimistic: true };
    }
  }
  return { n: 0, basis: 'beyond the page', pessimistic: false };
}

/**
 * Which ramp step a reach count earns, as a share of the people who arrived. Dark = more.
 *
 * THE BREAKPOINTS ARE FIXED, NOT FITTED TO THE WEEK. A scale stretched to each week's own range
 * would repaint the whole page whenever the best band moved, and two weeks could not be laid
 * side by side - the same color would mean a different number in each. The cost of a fixed
 * scale is that a page which loses almost everyone early renders as one dark band over seven
 * pale ones. On this page that is not a flaw in the scale, it is the finding.
 *
 * They are spaced for a funnel rather than evenly, because the measured distribution is not
 * even: the first screenful is always 100% and everything below it has so far landed between
 * 5% and 20%. Even 20-point steps would put all seven lower bands in one color.
 */
/**
 * The floors, as shares of the people who arrived. ONE DEFINITION, because the legend is
 * generated from this same array. They were briefly out of step during development - the shading
 * said one thing and the key beside it said another, which is worse than no key at all.
 */
const RAMP_BREAKS = [0.08, 0.15, 0.25, 0.5];

function rampIndexFor(n, visitors) {
  if (!visitors || n <= 0) return -1;                       // -1 renders as the empty state
  const share = n / visitors;
  let i = 0;
  for (const b of RAMP_BREAKS) if (share >= b) i += 1;
  return i;
}

/** The key, in ramp order, derived from the same breaks so the two can never disagree. */
function rampLegendSteps() {
  const pc = (f) => `${Math.round(f * 100)}%`;
  const steps = [[`under ${pc(RAMP_BREAKS[0])}`, 0]];
  for (let i = 0; i < RAMP_BREAKS.length; i++) {
    steps.push([
      i === RAMP_BREAKS.length - 1 ? `${pc(RAMP_BREAKS[i])} or more` : `${pc(RAMP_BREAKS[i])} to ${pc(RAMP_BREAKS[i + 1])}`,
      i + 1,
    ]);
  }
  return steps;
}

/**
 * Group the recorded clicks by their label, then place each group on the measured page.
 *
 * `collect.sql` emits one row per (label, event_type, href), so the same button reached through
 * two hostnames arrives as two rows. They are one button to a reader, so they are summed here
 * and their hrefs kept as a list.
 */
function placeClicks(clicks, targets) {
  const byLabel = new Map();
  for (const c of clicks || []) {
    const key = c.label;
    const g = byLabel.get(key) || { label: key, event_type: c.event_type, clicks: 0, people: 0, hrefs: [], orphans: 0 };
    g.clicks += c.clicks;
    // People overlap across hrefs in principle, so this is an upper bound on distinct people and
    // is only ever shown as "up to". Clicks are exact; people are not, once rows are merged.
    g.people += c.people;
    g.orphans += c.people_without_pageview || 0;
    if (c.href && !g.hrefs.includes(c.href)) g.hrefs.push(c.href);
    g.peopleMerged = (g.peopleMerged || 0) + 1;
    byLabel.set(key, g);
  }

  const placed = [];
  const unplaced = [];
  for (const g of byLabel.values()) {
    const hits = (targets || []).filter((t) => t.data_track === g.label || t.element_text === g.label);
    const mark = {
      ...g,
      peopleExact: g.peopleMerged === 1,
      positions: hits.map((t) => ({ top_px: t.top_px, depth: t.depth, sticky: !!t.sticky })),
      ambiguous: hits.length > 1,
      anySticky: hits.some((t) => t.sticky),
    };
    if (!hits.length) {
      unplaced.push({
        ...mark,
        // Both phrasings are matched on purpose. `collect.sql` writes "an unlabeled button"
        // today, and the snapshots already saved on the host from before that wording say
        // "(a button with no label)". Those snapshots are re-rendered whenever an older week is
        // looked at, and matching only the current phrase would give them the wrong reason.
        why: /unlabeled|no label/.test(g.label)
          ? 'The tracker recorded no label for it, so there is nothing to match against the page. It is a link or button with no text and no data-track value.'
          : 'No element on the page carries this label today, so it has been changed or removed since these clicks happened.',
      });
    } else {
      placed.push(mark);
    }
  }
  placed.sort((a, b) => b.clicks - a.clicks);
  unplaced.sort((a, b) => b.clicks - a.clicks);
  return { placed, unplaced };
}

/**
 * The whole model. Returns `{ ok: false, reason }` rather than throwing when there is nothing to
 * draw, because a missing geometry file must cost the report one panel and not the whole run.
 */
function buildHeat(win, geom, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  if (!geom || !geom.bands || !geom.bands.length) {
    return { ok: false, reason: 'The landing page has not been measured, so there is nothing to place clicks on. Run measurePage.js.' };
  }
  const heat = win.heat || null;
  const scroll = win.scroll || { d25: 0, d50: 0, d75: 0, d90: 0, d100: 0 };
  const visitors = win.visitors || 0;

  const bands = geom.bands.map((b) => {
    const top = reachAt(b.top_px, scroll, visitors, geom);
    const bottom = reachAt(b.top_px + b.height_px, scroll, visitors, geom);
    return {
      ...b,
      reachTop: top,
      reachBottom: bottom,
      ramp: rampIndexFor(top.n, visitors),
      pctTop: visitors ? Math.round((top.n / visitors) * 1000) / 10 : null,
    };
  });

  const lines = THRESHOLDS.map((t) => ({
    t, y: Math.round(pixelOfThreshold(t, geom)), n: scroll[`d${t}`] ?? 0,
    pct: visitors ? Math.round(((scroll[`d${t}`] ?? 0) / visitors) * 1000) / 10 : null,
  }));

  const { placed, unplaced } = placeClicks(heat && heat.clicks, geom.targets);
  const seat = (heat && heat.by_seat || []).find((s) => s.seat === true) || null;
  const noSeat = (heat && heat.by_seat || []).find((s) => s.seat === false) || null;

  const ageDays = geom.measured_at ? Math.floor((now - new Date(geom.measured_at)) / 86400000) : null;

  return {
    ok: true,
    visitors,
    scroll,
    geom: {
      url: geom.url,
      scrollHeight: geom.scrollHeight,
      clientHeight: geom.clientHeight,
      scrollable: geom.scrollable,
      viewport: geom.viewport,
      measured_at: geom.measured_at,
      screens: Math.round((geom.scrollHeight / geom.clientHeight) * 10) / 10,
      ageDays,
      stale: ageDays !== null && ageDays > 10,
    },
    bands,
    lines,
    marks: placed,
    unplaced,
    seat,
    noSeat,
    hasClickData: !!(heat && heat.clicks),
  };
}

// ── Drawing ────────────────────────────────────────────────────────────────────────────────────

const PAGE_W = 190;          // the silhouette, in SVG units
const CHART_W = 620;
const CHART_H = 560;
const PAD_T = 34;
const PAD_B = 30;
const AXIS_X = 96;           // right edge of the "people who saw this far" column
const MARK_X = AXIS_X + PAGE_W + 34;

/**
 * The heat map as inline SVG: the page to scale, shaded by how many people got that far, with
 * every recorded click placed on the element it names.
 */
function heatSvg(h) {
  if (!h.ok) return `<p class="muted">${esc(h.reason)}</p>`;
  const plotH = CHART_H - PAD_T - PAD_B;
  const yOf = (px) => PAD_T + (px / Math.max(1, h.geom.scrollHeight)) * plotH;

  const bandRects = h.bands.map((b) => {
    const y = yOf(b.top_px), hh = Math.max(2, yOf(b.top_px + b.height_px) - y);
    const fill = b.ramp < 0 ? 'none' : B.REACH_RAMP[b.ramp];
    // White from the third step up; the two palest steps take ink. Both sub-lines use the SAME
    // ink as their heading rather than a muted grey: a grey that is comfortable on white is
    // close to invisible on #FB2832, which is where this panel's own numbers were hiding.
    const onDark = b.ramp >= 2;
    const fg = onDark ? '#ffffff' : B.ink;
    const fgSub = onDark ? 'rgba(255,255,255,.88)' : B.ink;
    const label = (b.eyebrow || b.heading || b.type || '').slice(0, 24);
    const title = `${b.eyebrow ? b.eyebrow + ': ' : ''}${b.heading || b.type || 'section'} - at least ${b.reachTop.n} of ${h.visitors} saw the start of it`;
    return `<rect x="${AXIS_X}" y="${y.toFixed(1)}" width="${PAGE_W}" height="${hh.toFixed(1)}" fill="${fill}"
        stroke="${B.line}" stroke-width="1"${b.ramp < 0 ? ` stroke-dasharray="3 3"` : ''}><title>${esc(title)}</title></rect>`;
  }).join('');

  // Band captions are drawn as their OWN layer, after the threshold lines below, so a dashed
  // line cannot be struck through a heading. Painting each band as rect-plus-text in one pass
  // put the lines on top of four of the nine captions.
  const bandLabels = h.bands.map((b) => {
    const y = yOf(b.top_px), hh = Math.max(2, yOf(b.top_px + b.height_px) - y);
    const onDark = b.ramp >= 2;
    const fg = onDark ? '#ffffff' : B.ink;
    const fgSub = onDark ? 'rgba(255,255,255,.88)' : B.ink;
    const label = (b.eyebrow || b.heading || b.type || '').slice(0, 24);
    // The halo is the BAND'S OWN fill, not white. Its only job is to hide the dashed threshold
    // line where a caption crosses it, so matching the band makes it invisible everywhere else.
    // White looked like a highlighter pen wherever the band was not white, which was everywhere.
    const halo = b.ramp < 0 ? '#ffffff' : B.REACH_RAMP[b.ramp];
    const pad = (t, dy, size, fill, weight) =>
      `<text x="${AXIS_X + 8}" y="${dy.toFixed(1)}" font-size="${size}" ${weight ? `font-weight="${weight}" ` : ''}fill="${fill}"
        stroke="${halo}" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round">${esc(t)}</text>`;
    return `<g>${hh > 13 ? pad(label, y + Math.min(hh / 2 + 3.5, 14), 9.5, fg, 700) : ''}
      ${hh > 28 ? pad(`${b.reachTop.n} people`, y + Math.min(hh / 2 + 15, 26), 9, fgSub) : ''}</g>`;
  }).join('');

  // The five recorded thresholds, drawn where the lowest pixel they prove sits.
  const reachLines = h.lines.map((l) => {
    const y = yOf(l.y);
    return `<g><line x1="${AXIS_X - 6}" x2="${AXIS_X + PAGE_W + 6}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"
        stroke="${B.ink}" stroke-width="1" stroke-dasharray="4 3" opacity=".55"/>
      <text x="${AXIS_X - 10}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" font-weight="700" fill="${B.ink}">${l.n}</text>
      <text x="${AXIS_X - 10}" y="${(y + 14).toFixed(1)}" text-anchor="end" font-size="8.5" fill="${B.inkSoft}">saw to ${l.t}%</text></g>`;
  }).join('');

  // Click markers.
  //
  // ONE LABEL PER GROUP, however many places it was found in. Drawing the label once per
  // position repeated "124 clicks" beside each of the three Save my seat buttons, which reads
  // as 372 clicks on a panel whose whole point is that the 124 CANNOT be split between them.
  // So: a dot on every position, a single count, and a line from each dot to that one count.
  //
  // Every marker is direct-labeled and carries a white ring. The ring is what makes one marker
  // hue legible against both ends of a ramp it has 1.1:1 contrast with at the dark end.
  let slot = 0;
  const marks = h.marks.map((m) => {
    const ly = PAD_T + 16 + slot * 40; slot += 1;
    const note = m.anySticky
      ? (m.positions.length > 1
        ? `${m.positions.length} places, one of them the sticky header, so not attributable`
        : 'in the sticky header, so on screen at every depth')
      : m.ambiguous ? `${m.positions.length} places with this label, so not attributable` : null;
    const dots = m.positions.map((p) => {
      const y = yOf(p.top_px);
      return `<path d="M ${AXIS_X + PAGE_W + 7} ${y.toFixed(1)} L ${MARK_X - 9} ${ly.toFixed(1)}" fill="none" stroke="${B.MARK.fill}" stroke-width="1" opacity=".45"/>
        <circle cx="${AXIS_X + PAGE_W}" cy="${y.toFixed(1)}" r="6" fill="${B.MARK.fill}" stroke="${B.MARK.ring}" stroke-width="2">
          <title>${esc(m.label)} at ${p.top_px}px${p.sticky ? ', in the sticky header' : ''}</title></circle>`;
    }).join('');
    return `<g>${dots}
      <text x="${MARK_X - 5}" y="${(ly + 1).toFixed(1)}" font-size="11.5" font-weight="700" fill="${B.ink}">${m.clicks} click${m.clicks === 1 ? '' : 's'}</text>
      <text x="${MARK_X - 5}" y="${(ly + 13).toFixed(1)}" font-size="10" fill="${B.cherryDeep}">${esc(m.label.slice(0, 32))}</text>
      ${note ? `<text x="${MARK_X - 5}" y="${(ly + 24).toFixed(1)}" font-size="8.5" fill="${B.inkSoft}">${esc(note)}</text>` : ''}
    </g>`;
  }).join('');

  // The three column headings. They used to overlap, because the left one was written from x=4
  // and ran past AXIS_X; it is right-aligned to the axis now so it cannot collide whatever it says.
  const scale = `<g>
    <text x="${AXIS_X - 10}" y="${PAD_T - 16}" text-anchor="end" font-size="9.5" font-weight="700" fill="${B.ink}">SAW THIS FAR</text>
    <text x="${AXIS_X}" y="${PAD_T - 16}" font-size="9.5" font-weight="700" fill="${B.ink}">THE PAGE, TO SCALE</text>
    <text x="${MARK_X - 5}" y="${PAD_T - 16}" font-size="9.5" font-weight="700" fill="${B.ink}">RECORDED CLICKS</text>
    <text x="${AXIS_X}" y="${CHART_H - 8}" font-size="9" fill="${B.inkSoft}">${h.geom.scrollHeight.toLocaleString('en-US')}px tall, ${h.geom.screens} phone screens at ${h.geom.viewport.width}x${h.geom.viewport.height}</text>
  </g>`;

  return `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" class="chart"
    aria-label="Landing page heat map: how far down the page people scrolled, and where the recorded clicks land">
    ${scale}${bandRects}${reachLines}${bandLabels}${marks}</svg>`;
}

/** The ramp legend, so the shading is never read by guesswork. */
function heatLegend(h) {
  if (!h.ok) return '';
  const steps = rampLegendSteps();
  return `<div class="hmlegend">
    <span class="hml"><b>Share of visitors who saw that part of the page:</b></span>
    ${steps.map(([label, i]) => `<span class="hml"><i style="background:${B.REACH_RAMP[i]}"></i>${esc(label)}</span>`).join('')}
    <span class="hml"><i style="background:#fff;border:1px dashed ${B.line}"></i>nobody recorded</span>
    <span class="hml"><i style="background:${B.MARK.fill};border-radius:50%"></i>a recorded click, placed on the element it names</span>
  </div>`;
}

/** Everything the panel says in words. Each line is built from a number, never written by hand. */
function heatNotes(h) {
  if (!h.ok) return [h.reason];
  const out = [];
  out.push(`The page is ${h.geom.screens} phone screens long. ${h.lines[0].n} of ${h.visitors} visitors (${h.lines[0].pct}%) scrolled far enough to be recorded at all, and ${h.lines[4].n} (${h.lines[4].pct}%) reached the bottom.`);
  // The single most important caveat on this panel, and the one a reader will otherwise get
  // wrong: the gap between "arrived" and the first recorded threshold is a measurement hole,
  // not a cliff. It is stated in pixels and screens because "25%" sounds small and is not.
  const firstScreens = Math.round((h.lines[0].y / Math.max(1, h.geom.clientHeight)) * 10) / 10;
  out.push(`The first point scrolling is recorded at is 25%, which on a page this long is ${h.lines[0].y.toLocaleString('en-US')}px down, or the first ${firstScreens} screens. Above that line the only thing known is that someone arrived, so the hero's own drop-off is invisible and the top band is shaded by everyone who landed. Recording every 10% would close that hole.`);
  if (h.seat && h.seat.people) {
    out.push(`${h.seat.under25} of the ${h.seat.people} people who clicked Save my seat had not reached a quarter of the way down when they clicked. The CTA sits above the fold and in the sticky header, so the page converts before it is read.`);
  }
  const amb = h.marks.filter((m) => m.ambiguous);
  for (const m of amb) {
    out.push(`"${m.label}" appears in ${m.positions.length} places on the page and all of them report the same label, so its ${m.clicks} clicks cannot be attributed to any one of them. Giving each copy its own data-track value is the fix, and it is a one-line change per button.`);
  }
  // The unlabeled ones are collapsed into a single line. They arrive as one row per element
  // tag, so a page with an unlabeled link and an unlabeled button produced two notes that
  // said the same sentence twice and pushed the findings that matter off the bottom.
  const nameless = h.unplaced.filter((u) => /unlabeled|no label/.test(u.label));
  const named = h.unplaced.filter((u) => !/unlabeled|no label/.test(u.label));
  if (nameless.length) {
    const n = nameless.reduce((a, u) => a + u.clicks, 0);
    out.push(`${n} click${n === 1 ? '' : 's'} landed on ${nameless.length === 1 ? 'an element' : `${nameless.length} kinds of element`} with no text and no data-track value, so there is nothing to match them against and they cannot be placed. Labeling those controls would make them countable.`);
  }
  for (const u of named) {
    out.push(`${u.clicks} click${u.clicks === 1 ? '' : 's'} on "${u.label}" could not be placed. ${u.why}`);
  }
  if (h.geom.stale) out.push(`The page was last measured ${h.geom.ageDays} days ago, so these positions may no longer match what visitors see. Re-run measurePage.js.`);
  return out;
}

// ── The email edition: tables only, no SVG (Outlook's engine renders neither) ──────────────────

/**
 * A compact heat map for the email body.
 *
 * SVG IS NOT AN OPTION HERE. Outlook desktop renders mail through Word, which draws no SVG at
 * all, and an <img> would have to be hosted somewhere and would be blocked by default anyway.
 * So the same model is drawn as nested tables with background colors, which every client
 * including Word understands. It carries the bands, the shading and the counts; the click
 * placement needs the attached report.
 */
function heatEmailRows(h, K) {
  const { C, esc: e } = K;
  if (!h.ok) return `<div style="font-size:13px;color:${C.ink2}">${e(h.reason)}</div>`;
  const rows = h.bands.map((b) => {
    const fill = b.ramp < 0 ? '#ffffff' : B.REACH_RAMP[b.ramp];
    const w = Math.max(3, Math.round((b.reachTop.n / Math.max(1, h.visitors)) * 100));
    // THE COUNT SITS OUTSIDE THE BAR. Inside, a 9px number had to be white on the two dark
    // steps and ink on the two pale ones, and was hard to read on both; on a short bar it had
    // nowhere to sit at all. Outside it is one size, one color, and always legible.
    return `<tr>
      <td valign="top" style="padding:3px 8px 3px 0;font-size:11.5px;color:${B.ink};white-space:nowrap">${e((b.eyebrow || b.heading || b.type || '').slice(0, 22))}</td>
      <td width="140" style="width:140px;padding:3px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${B.bgElevated}" style="background:${B.bgElevated}"><tr>
          <td width="${w}%" bgcolor="${fill}" style="background:${fill};height:13px;line-height:13px;font-size:0">&nbsp;</td>
          <td style="height:13px;line-height:13px;font-size:0">&nbsp;</td>
        </tr></table></td>
      <td align="right" style="padding:3px 0 3px 10px;font-size:11.5px;font-weight:700;color:${B.ink};white-space:nowrap">${b.reachTop.n}</td>
      <td style="padding:3px 0 3px 6px;font-size:11px;color:${B.inkSoft};white-space:nowrap">${b.pctTop}% got here</td>
    </tr>`;
  }).join('');
  const clickRows = h.marks.concat(h.unplaced).slice(0, 6).map((m) => `<tr>
      <td style="padding:3px 8px 3px 0;font-size:11.5px;color:${B.ink}">${e(m.label.slice(0, 34))}</td>
      <td align="right" style="padding:3px 0;font-size:11.5px;font-weight:700;color:${B.cherryDeep};white-space:nowrap">${m.clicks}</td>
      <td style="padding:3px 0 3px 8px;font-size:10.5px;color:${B.inkSoft}">${m.positions && m.positions.length
        ? (m.anySticky ? 'sticky header, every depth' : m.ambiguous ? `${m.positions.length} places, not attributable` : `at ${m.positions[0].top_px}px`)
        : 'not on the page today'}</td>
    </tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
    <div style="font-size:12px;font-weight:700;color:${B.ink};margin:14px 0 4px 0">What they clicked</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${clickRows}</table>
    <div style="font-size:11px;color:${B.inkSoft};margin-top:10px;line-height:1.5">Counts are people who had that part of the page on screen, and they are a floor: scrolling is recorded at five points only (25, 50, 75, 90, 100%). Click positions are measured by rendering the page at ${h.geom.viewport.width}x${h.geom.viewport.height}; the clicks themselves carry no coordinates. Full placement is in the attached report.</div>`;
}

module.exports = {
  buildHeat, heatSvg, heatLegend, heatNotes, heatEmailRows, loadGeometry,
  pixelOfThreshold, reachAt, rampIndexFor, rampLegendSteps, placeClicks, THRESHOLDS, RAMP_BREAKS, COMMITTED,
};
