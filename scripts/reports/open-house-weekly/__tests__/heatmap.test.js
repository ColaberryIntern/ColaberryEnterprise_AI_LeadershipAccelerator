// C125: unit tests for the landing page heat map and the Colaberry Training branding.
// Run: node --test scripts/reports/open-house-weekly/__tests__
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const HM = require('../lib/heatmap');
const B = require('../lib/brand');
const { buildHtml } = require('../render');
const { renderEmail } = require('../lib/emailRender');
const { buildView } = require('../lib/view');
const targets = require('../targets');

// A page 7478px tall in an 844px viewport: the real landing page's shape on 18 Nov 2026.
const geom = () => ({
  url: 'https://example.test/lp',
  scrollHeight: 7478, clientHeight: 844, scrollable: 6634,
  viewport: { width: 390, height: 844 },
  measured_at: '2026-11-18T10:00:00.000Z',
  bands: [
    { index: 0, type: 'hero', eyebrow: 'OPEN HOUSE', heading: 'Sign up', top_px: 58, height_px: 1269, depth_from: 0.9, depth_to: 20 },
    { index: 1, type: 'text', eyebrow: 'THE FUTURE', heading: 'AI now', top_px: 1327, height_px: 884, depth_from: 20, depth_to: 33.3 },
    { index: 2, type: 'cta', eyebrow: 'SAVE YOUR SEAT', heading: 'Join us', top_px: 7006, height_px: 366, depth_from: 105.6, depth_to: 111.1 },
  ],
  targets: [
    { event_type: 'cta_click', data_track: 'Save my seat', element_text: 'Save my seat', element_tag: 'a', href: '/open-house', depth: 0.2, top_px: 11, sticky: true },
    { event_type: 'cta_click', data_track: 'Save my seat', element_text: 'Save my seat', element_tag: 'a', href: '/open-house', depth: 7.9, top_px: 527, sticky: false },
    { event_type: 'cta_click', data_track: 'Save my seat', element_text: 'Save my seat', element_tag: 'a', href: '/open-house', depth: 109.2, top_px: 7244, sticky: false },
    { event_type: 'click', data_track: null, element_text: '', element_tag: 'a', href: '/', depth: 0.2, top_px: 14, sticky: true },
  ],
});

const win = (over = {}) => ({
  from_ct: '2026-11-11 00:00', to_ct: '2026-11-18 00:00', hours: 168, visitors: 344,
  scroll: { d25: 62, d50: 46, d75: 33, d90: 28, d100: 20 },
  heat: {
    clicks: [
      { label: 'Save my seat', event_type: 'cta_click', data_track: 'Save my seat', element_text: 'Save my seat', href: 'https://a.test/open-house', element_tag: null, clicks: 123, people: 108, people_without_pageview: 0 },
      { label: 'Save my seat', event_type: 'cta_click', data_track: 'Save my seat', element_text: 'Save my seat', href: 'https://b.test/open-house', element_tag: null, clicks: 1, people: 1, people_without_pageview: 0 },
      { label: 'an unlabeled button', event_type: 'click', data_track: null, element_text: null, href: null, element_tag: 'button', clicks: 9, people: 9, people_without_pageview: 1 },
      { label: 'Start Learning AI for $0', event_type: 'cta_click', data_track: 'Start Learning AI for $0', element_text: 'Start', href: '/portal/signup', element_tag: null, clicks: 1, people: 1, people_without_pageview: 0 },
    ],
    by_seat: [
      { seat: true, people: 109, under25: 88, d25: 21, d50: 18, d75: 14, d90: 12, d100: 9 },
      { seat: false, people: 235, under25: 194, d25: 41, d50: 28, d75: 19, d90: 16, d100: 11 },
    ],
  },
  ...over,
});

test('a threshold is the LOWEST PIXEL SEEN, so the viewport is part of it', () => {
  const g = geom();
  // 25% of 6634 is 1658px of scrolling, but the reader can see 844px below that.
  assert.equal(Math.round(HM.pixelOfThreshold(25, g)), 2503);
  assert.equal(Math.round(HM.pixelOfThreshold(100, g)), g.scrollHeight);  // 100% reaches the end
  // Forgetting + clientHeight would put the 100% line a whole screen short of the page bottom,
  // and would make the closing CTA at 7244px unreachable by anyone. It is not.
  assert.ok(HM.pixelOfThreshold(100, g) > 7244);
});

test('reachAt: the first screen is everyone, deeper is a lower bound, past the page is nobody', () => {
  const g = geom(), s = win().scroll, v = 344;
  assert.deepEqual(HM.reachAt(100, s, v, g), { n: 344, basis: 'arrived', pessimistic: false });
  assert.equal(HM.reachAt(844, s, v, g).n, 344);                 // exactly one screen: still free
  // 1500px needs scrolling; the first line at or beyond it is 25%, so at least 62 saw it.
  const mid = HM.reachAt(1500, s, v, g);
  assert.equal(mid.n, 62);
  assert.equal(mid.basis, 'd25');
  assert.equal(mid.pessimistic, true, 'anything past the fold must be flagged as a floor');
  assert.equal(HM.reachAt(7478, s, v, g).n, 20);                 // the very bottom
  assert.equal(HM.reachAt(99999, s, v, g).n, 0);
});

test('reachAt never rises as you go down the page', () => {
  const g = geom(), s = win().scroll;
  let last = Infinity;
  for (let y = 0; y <= g.scrollHeight; y += 97) {
    const n = HM.reachAt(y, s, 344, g).n;
    assert.ok(n <= last, `reach rose at ${y}px: ${n} > ${last}`);
    last = n;
  }
});

test('the ramp and its key are generated from one set of breaks', () => {
  const steps = HM.rampLegendSteps();
  assert.equal(steps.length, B.REACH_RAMP.length, 'a key entry for every ramp step');
  // Every break must land in the step the key claims it does.
  for (let i = 0; i < HM.RAMP_BREAKS.length; i++) {
    assert.equal(HM.rampIndexFor(HM.RAMP_BREAKS[i] * 1000, 1000), i + 1);
    assert.equal(HM.rampIndexFor(HM.RAMP_BREAKS[i] * 1000 - 1, 1000), i);
  }
  assert.equal(HM.rampIndexFor(0, 344), -1, 'nobody is its own state, not the palest step');
  assert.equal(HM.rampIndexFor(344, 344), B.REACH_RAMP.length - 1);

  // THE KEY'S WORDS MUST BE THE REAL NUMBERS, not just the right COUNT of entries. Checking
  // only the length let a hand-written key saying "under 7% / 7 to 15% / 15 to 30% / 30 to
  // 60%" sit above shading that actually broke at 8, 15, 25 and 50 - every one of the 48
  // tests passed while the legend lied about four of its five steps. Verified by mutation on
  // 18 Nov 2026: re-hardcoding the key is caught here and nowhere else.
  for (const [label, idx] of steps) {
    const pcts = (label.match(/\d+/g) || []).map(Number);
    if (idx === 0) {
      assert.deepEqual(pcts, [Math.round(HM.RAMP_BREAKS[0] * 100)], `key step 0 says "${label}"`);
    } else if (idx === steps.length - 1) {
      assert.deepEqual(pcts, [Math.round(HM.RAMP_BREAKS[idx - 1] * 100)], `top key step says "${label}"`);
    } else {
      assert.deepEqual(pcts, [Math.round(HM.RAMP_BREAKS[idx - 1] * 100), Math.round(HM.RAMP_BREAKS[idx] * 100)],
        `key step ${idx} says "${label}" but the shading breaks elsewhere`);
    }
  }
});

test('placeClicks: rows for one label are merged, and three matches mean not attributable', () => {
  const { placed, unplaced } = HM.placeClicks(win().heat.clicks, geom().targets);
  const seat = placed.find((m) => m.label === 'Save my seat');
  assert.equal(seat.clicks, 124, 'the two hrefs are one button');
  assert.equal(seat.positions.length, 3);
  assert.equal(seat.ambiguous, true);
  assert.equal(seat.anySticky, true);
  assert.equal(seat.peopleExact, false, 'merged rows cannot give an exact person count');
  assert.equal(unplaced.length, 2);
  assert.match(unplaced.find((u) => /unlabeled/.test(u.label)).why, /no text and no data-track/);
  // The $0 CTA was on the page at launch and is not on it now. That must read as removed,
  // not as unlabeled, because it is a content change somebody made.
  assert.match(unplaced.find((u) => /\$0/.test(u.label)).why, /changed or removed/);
});

test('placeClicks: an older snapshot whose unlabeled rows use the earlier wording still reads right', () => {
  const { unplaced } = HM.placeClicks([{ label: '(a button with no label)', event_type: 'click', clicks: 3, people: 3 }], geom().targets);
  assert.match(unplaced[0].why, /no text and no data-track/);
});

test('buildHeat: bands, lines and marks line up with the measured page', () => {
  const h = HM.buildHeat(win(), geom());
  assert.equal(h.ok, true);
  assert.equal(h.bands.length, 3);
  assert.equal(h.bands[0].reachTop.n, 344, 'the hero starts inside the first screen');
  assert.equal(h.bands[2].ramp, HM.rampIndexFor(20, 344), 'the closing band is shaded by who reached it');
  assert.equal(h.lines.length, 5);
  assert.equal(h.geom.screens, 8.9);
  assert.equal(h.geom.stale, false);
  assert.equal(h.seat.under25, 88);
});

test('buildHeat: a geometry older than ten days is called stale', () => {
  const old = { ...geom(), measured_at: '2026-10-01T10:00:00.000Z' };
  const h = HM.buildHeat(win(), old, { now: '2026-11-18T10:00:00.000Z' });
  assert.equal(h.geom.stale, true);
  assert.match(HM.heatNotes(h).join(' '), /last measured 48 days ago/);
});

test('buildHeat: no geometry costs the panel, not the run', () => {
  const h = HM.buildHeat(win(), null);
  assert.equal(h.ok, false);
  assert.match(h.reason, /measurePage/);
  assert.doesNotThrow(() => HM.heatSvg(h));
  assert.doesNotThrow(() => HM.heatNotes(h));
});

test('the drawing states a merged click total ONCE, however many places it was found in', () => {
  const svg = HM.heatSvg(HM.buildHeat(win(), geom()));
  assert.equal((svg.match(/124 clicks/g) || []).length, 1,
    'one label per group: repeating it per position reads as three times the clicks');
  assert.equal((svg.match(/<circle /g) || []).length, 3, 'but a dot on each of the three places');
});

test('every note is built from a number, and the ones that matter are present', () => {
  const notes = HM.heatNotes(HM.buildHeat(win(), geom())).join('\n');
  assert.match(notes, /8\.9 phone screens/);
  assert.match(notes, /2,503px down/);                 // the measurement hole, stated in pixels
  assert.match(notes, /88 of the 109/);                // converts before it is read
  assert.match(notes, /3 places/);                     // not attributable
  // The unlabeled ones collapse into one line; a click on a button that has been REMOVED from
  // the page keeps its own, because that is a content change somebody made and not a gap in
  // the instrumentation. 9 and 1 must therefore stay apart rather than becoming 10.
  assert.match(notes, /9 clicks landed on an element with no text/);
  assert.match(notes, /1 click on "Start Learning AI for \$0" could not be placed/);
  assert.doesNotMatch(notes, /10 clicks/);
});

test('the email edition carries no SVG, because Outlook draws none', () => {
  const K = require(path.join(__dirname, '..', '..', '..', '..', 'backend', 'src', 'scripts', 'lib', 'emailLayoutKit'));
  const rows = HM.heatEmailRows(HM.buildHeat(win(), geom()), K);
  assert.doesNotMatch(rows, /<svg|<canvas/i);
  assert.match(rows, /bgcolor=/, 'shading has to be a table cell background');
  assert.match(rows, /124/);
});

test('escaping: a hostile band heading cannot inject markup into the chart', () => {
  const g = geom();
  g.bands[0].eyebrow = '<script>alert(1)</script>';
  g.targets[0].data_track = '<img onerror=x>';
  const h = HM.buildHeat(win({ heat: { clicks: [{ label: '<img onerror=x>', event_type: 'cta_click', clicks: 2, people: 2 }], by_seat: [] } }), g);
  const svg = HM.heatSvg(h);
  assert.doesNotMatch(svg, /<script>alert/);
  assert.doesNotMatch(svg, /<img onerror/);
});

test('the committed geometry is real, current in shape, and matches what the tracker looks for', () => {
  const g = JSON.parse(fs.readFileSync(HM.COMMITTED, 'utf8'));
  assert.ok(g.bands.length > 0 && g.targets.length > 0);
  assert.ok(g.scrollHeight > g.clientHeight, 'a page that does not scroll has no scroll depth');
  assert.equal(g.scrollable, g.scrollHeight - g.clientHeight);
  // Every target must carry the two keys the click rows are joined on, or placement silently
  // degrades to "nothing on the page carries this label".
  for (const t of g.targets) {
    assert.ok('data_track' in t && 'element_text' in t, 'the join keys must exist');
    assert.equal(typeof t.top_px, 'number');
    assert.equal(typeof t.sticky, 'boolean');
  }
});

test('brand: the palette is the training theme, and the ramp passes its own rules', () => {
  // Pinned to backend/src/services/marketing/landingPageTheme.ts, the theme the landing page
  // itself renders with. A drift here means the report and the page it measures disagree.
  assert.equal(B.accent, '#FB2832');
  assert.equal(B.accentDeep, '#C20E1E');
  assert.equal(B.accentSoft, '#FFF0F1');
  assert.equal(B.accent2, '#5BA63C');
  assert.equal(B.accent3, '#367895');
  assert.equal(B.fg, '#1A1A1A');
  // The ramp is one hue, light to dark, and contains both brand reds.
  assert.ok(B.REACH_RAMP.includes(B.cherry) && B.REACH_RAMP.includes(B.cherryDeep));
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  for (let i = 1; i < B.REACH_RAMP.length; i++) {
    assert.ok(lum(B.REACH_RAMP[i]) < lum(B.REACH_RAMP[i - 1]), `ramp step ${i} must be darker than ${i - 1}`);
  }
  // Text contrast: the deep red is the one allowed to carry running text on white.
  const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  assert.ok(contrast(B.cherryDeep, '#FFFFFF') >= 4.5, 'cherryDeep must be AA on white');
  assert.ok(contrast(B.cherry, '#FFFFFF') < 4.5, 'cherry is a fill color; if this ever passes, revisit the rule');
});

test('the report renders the heat section, in brand, with no navy left anywhere', () => {
  const snap = { generated_ct: '2026-11-18 12:20', launch_ct: '2026-11-10 15:10', email: null, geometry: geom(),
    windows: { cur: { ...win(), engagement: { seat: 109, start: 0, read: 10, skimmed: 20, bounced: 205 },
      median_visit_s: 29, by_source: [], by_device: [], start_path: { clicks: 0, accounts: 0 },
      signups: { total: 92, landing_page: 92, training_site: 0, other_door: 0, lp_linked_to_visit: 90, lp_from_seat_click: 77 },
      journey: { signups: 92, new_account: 84, existing_account: 8, email_sent: 84, entered: 65, entered_button: 60, entered_link: 5,
        played: 30, finished: 22, took_check: 4, aced: 4, kept_going: 10, returned_later: 3, exits: [],
        credited: 16, median_min_signup_to_enter: 0.2, median_min_enter_to_finish: 3 },
      daily: [] } } };
  const html = buildHtml(snap);
  assert.match(html, /id="sec-heat"/);
  assert.match(html, /The landing page, heat mapped/);
  assert.match(html, /colaberry-horizontal-white\.png/, 'the masthead logo');
  assert.doesNotMatch(html, /#1a365d|#2b6cb0/i, 'the old navy palette must be gone');
  assert.equal(html, buildHtml(snap), 'deterministic');
});

test('the email carries the heat map and the brand, and stays under the Gmail clip', () => {
  const snap = { generated_ct: '2026-11-18 12:20', launch_ct: '2026-11-10 15:10', email: null, geometry: geom(),
    windows: { cur: { ...win(), engagement: { seat: 109, start: 0, read: 10, skimmed: 20, bounced: 205 },
      median_visit_s: 29, by_source: [], by_device: [], start_path: { clicks: 0, accounts: 0 },
      signups: { total: 92, landing_page: 92, training_site: 0, other_door: 0, lp_linked_to_visit: 90, lp_from_seat_click: 77 },
      journey: { signups: 92, new_account: 84, existing_account: 8, email_sent: 84, entered: 65, entered_button: 60, entered_link: 5,
        played: 30, finished: 22, took_check: 4, aced: 4, kept_going: 10, returned_later: 3, exits: [],
        credited: 16, median_min_signup_to_enter: 0.2, median_min_enter_to_finish: 3 },
      daily: [] } } };
  const email = renderEmail(buildView(snap, targets, []));
  assert.match(email.html, /COLABERRY TRAINING/);
  assert.match(email.html, /colaberry-horizontal-white\.png/);
  assert.match(email.html, /Landing page heat map/i);
  assert.match(email.html, /alt="Colaberry"/, 'the brand survives images being blocked');
  assert.match(email.text, /LANDING PAGE HEAT MAP/, 'the plain text edition carries it too');
  assert.ok(Buffer.byteLength(email.html) < 100 * 1024, 'under the Gmail clip');
  assert.doesNotMatch(email.html, /<svg/i, 'no SVG anywhere in an email');
});

test('the recipient list includes everyone it is meant to, once each', () => {
  const { DEFAULT_TO } = require('../sendWeekly');
  const list = DEFAULT_TO.split(',').map((s) => s.trim());
  for (const who of ['taiwo@colaberry.com', 'sohail@colaberry.com', 'aleem@colaberry.com', 'ali@colaberry.com']) {
    assert.ok(list.includes(who), `${who} must be on the weekly report`);
  }
  assert.equal(new Set(list).size, list.length, 'no duplicate recipients');
});

test('emailLayoutKit: the banner override is additive, so other emails are untouched', () => {
  const K = require(path.join(__dirname, '..', '..', '..', '..', 'backend', 'src', 'scripts', 'lib', 'emailLayoutKit'));
  const plain = K.shell({ title: 't', body: '', banner: 'X' });
  assert.match(plain, new RegExp(K.C.navy), 'with no override the banner is still navy');
  const branded = K.shell({ title: 't', body: '', banner: 'X', bannerBg: '#1A1A1A', pageBg: '#F8F8F7' });
  assert.match(branded, /bgcolor="#1A1A1A"/);
  assert.match(branded, /background:#F8F8F7/);
});
