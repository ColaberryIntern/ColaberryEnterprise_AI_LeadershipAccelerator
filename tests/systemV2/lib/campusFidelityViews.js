/**
 * C11b fidelity gate: the 12 views of the campus, each with how to reach it and what MUST be present and visible before its
 * screenshot is taken (a data-testid, or a CSS selector for components without one). scripts/captureCampusLocal.js --fidelity
 * reads this file and fails the run on any miss.
 *
 * `known` lists, per view, prototype elements that were deliberately NOT built, each with its reason (the real-data rule, or a
 * server feature that does not exist). They are reported on every run, never silently dropped, and carried into the PR as the
 * allowed differences. Accounts use the e2e audiences ("sponsor" in the prototype = business here).
 *
 * WP-1 (owner requirements, docs/design/campus/CAMPUS_DESIGN_PARITY_PROMPT.md section 2):
 *  - every view past the gate must show the side panel with the tour (or, on a phone with a card open, its peek strip; on a page,
 *    the rail or, on a phone, the Next steps button): withPanel() adds it to each view's required list;
 *  - 13-recenter drags and zooms the map, opens and closes a card, and asserts the viewBox is back on the whole campus;
 *  - 14-step-outside starts on a page and asserts Step outside lands on /portal/campus inside the same building, panel visible.
 * A view's `assert` is a page expression that returns '' when it holds, else what was wrong (reported as a miss).
 */
const ACCOUNTS = ['member', 'explorer', 'business', 'staff'];

const MAP_ART = ['cm-world', 'cm-ground-grass', 'cm-quad-lawn', 'cm-quad-label', 'cm-fountain', 'cm-paths', 'cm-trees',
  'cm-district', 'cm-district-sign', 'cm-gate-pillars', 'cm-avatar'];
const ALL = ['lecture', 'library', 'tower', 'studio', 'amphi', 'testing', 'observatory', 'commons', 'gallery', 'career', 'arcade'];
const buildingIds = () => ALL.flatMap((id) => [`cm-bld-${id}`, `cm-label-${id}`]);
const STATS = {
  member: ['cm-stats-level', 'cm-stats-points', 'cm-stats-online', 'cm-stats-bell', 'cm-stats-me'],
  explorer: ['cm-stats-acct-explorer', 'cm-stats-online', 'cm-stats-bell', 'cm-stats-me'],
  business: ['cm-stats-acct-business', 'cm-stats-online', 'cm-stats-bell', 'cm-stats-me'],
  staff: ['cm-stats-acct-staff', 'cm-stats-online', 'cm-stats-bell', 'cm-stats-me'],
};
const TOPBAR = ['cm-topbar', 'cm-topbar-brand', 'cm-topbar-search', 'cm-topbar-list'];
const CONCIERGE = ['cm-concierge', 'cm-cc-where', 'cm-cc-greeting', 'cm-cc-lead', 'cm-cc-helpdesk'];
const CONCIERGE_BY = { member: ['cm-cc-tour', 'cm-cc-chips'], explorer: ['cm-cc-pass', 'cm-cc-enroll', 'cm-cc-tour', 'cm-cc-chips'], business: ['cm-cc-tour', 'cm-cc-chips'], staff: ['cm-cc-staff-tools'] };
const SIGNATURE = { member: 'commons', explorer: 'lecture', business: 'career', staff: 'career' };
/** Tap a building even when the phone framing leaves it off screen (a real user pans to it first). */
const tap = (id) => ({ evaluate: `document.querySelector('[data-testid="cm-bld-${id}"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))` });
/** WP-3: the prototype walk (330 units/s, eased, at least 600 ms): the longest walk on the campus settles inside this. */
const WALKED = { wait: 2600 };

const HOME_KNOWN = (a, size) => [
  ...(size === 'phone' ? ['phone: the stats pill is hidden as in the prototype phone layout; the campus tab bar has no Alerts tab yet'] : []),
  'top bar messages icon: not built (the home has no DM inbox host; messages stay on Today)',
  'concierge "Right now" list: folded into the plan and live cards (one place per fact)',
  ...(a === 'business' ? ['partner company / seats / invite chips: no real partner data on this account'] : []),
  ...(a === 'explorer' ? ['top bar "Enroll" pill: the enroll link lives in the Explorer pass'] : []),
];

/** The map's viewBox right now, and the drag / zoom that move it well away from the whole campus. */
const VB = "document.querySelector('svg.cm-map.has-camera').getAttribute('viewBox')";
const DISTURB = [
  { evaluate: `window.__cmVb0 = ${VB}` },
  { click: '[data-testid="cm-zoom-in"]' }, { click: '[data-testid="cm-zoom-in"]' },
  { evaluate: "(() => { const s = document.querySelector('svg.cm-map.has-camera'); s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 400 })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: 800, clientY: 400 })); window.dispatchEvent(new PointerEvent('pointerup', {})); })()" },
];
const AT_BASE = `(() => { const a = ${VB}.split(' ').map(Number), b = String(window.__cmVb0 || '').split(' ').map(Number);
  if (b.length !== 4) return 'no baseline'; return a.every((v, i) => Math.abs(v - b[i]) <= 1) ? '' : 'viewBox ' + a.join(' ') + ' is not the whole campus ' + b.join(' '); })()`;
const CARD_VIEWS = ['03-arrive', '04-inside', '08-person-card', '09-chat', '14-step-outside', '15-panel-with-card', '16-tour'];

/** A view: route to open, then steps (each a { click }, { evaluate } or { wait }) and the required ids for an account and size. */
const VIEWS = [
  { name: '01-gate', fresh: true, route: '/portal/campus',
    required: (a) => ['cm-gate', 'cm-gate-arch-text', 'cm-gate-logo', 'cm-gate-greeting', 'cm-gate-sub', 'cm-gate-id', 'cm-gate-enter', ...(a === 'staff' ? [] : ['cm-gate-tour'])],
    known: () => ['the gate streak line claims nothing: it is information only (claiming stays on Today)'] },
  { name: '02-home', route: '/portal/campus',
    required: (a, size) => [...MAP_ART, ...buildingIds(), ...TOPBAR, ...(size === 'phone' ? [] : ['cm-stats', ...STATS[a]]), ...CONCIERGE, ...CONCIERGE_BY[a], ...(size === 'phone' ? ['.cm-tabbar'] : [])],
    known: HOME_KNOWN },
  { name: '03-arrive', route: '/portal/campus', steps: (a) => [tap(SIGNATURE[a]), WALKED],
    required: () => ['cm-card', 'cm-arrive-hero', 'cm-arrive-now', '.cm-arrive .cm-cta', 'cm-arrive-back', 'cm-arrive-elsewhere', '.cm-arrive .cm-rooms'] },
  { name: '04-inside', route: '/portal/campus', steps: (a) => [tap(SIGNATURE[a]), WALKED],
    required: () => ['cm-inside', 'cm-inside-room', 'cm-inside-you', 'cm-inside-door', 'cm-inside-out'],
    known: () => ['the room opens on arrival, as the prototype flyIn does (no separate "look inside" step)', 'the prototype interiors invented events, dates, client names and tickets: neutral signs instead'] },
  { name: '05-page', route: '/portal/library',
    required: (a, size) => ['cm-banner', 'cm-trail', 'cm-step-out', '.cm-banner .cm-whereto', ...(size === 'phone' ? [] : ['cm-page-side', 'cm-page-rail'])],
    known: () => ['the page countdown header (next class / next event) is the existing portal header, not rebuilt'] },
  { name: '06-live', route: '/portal/campus', needsLive: true,
    required: () => ['cm-world', 'cm-cc-live', 'cm-beams', 'svg.cm-map.is-evening'],
    known: () => ['the prototype crowd of walking dots was random: not drawn (the building head count is real)'] },
  { name: '07-notifications', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-stats-bell"] button' }],
    required: () => ['.cm-bell-panel'], desktopOnly: true },
  { name: '08-person-card', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-cc-helpdesk"] button' }, WALKED],
    required: () => ['cm-card', 'cm-arrive-hero', '.cm-desks'],
    known: () => ['a help desk press walks to the desk building (its card holds the desk) instead of opening a staff popover'] },
  { name: '09-chat', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-cc-helpdesk"] button' }, WALKED],
    required: () => ['.cm-desks'],
    known: () => ['chat with a desk opens through Today (the existing DM dock); not rebuilt on the home'] },
  { name: '10-toast', route: '/portal/campus', required: () => ['cm-world'],
    known: () => ['the DM toast (Reply, Walk over) needs a real incoming message; covered by campusPanels and campusDmToast tests'] },
  { name: '11-list', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-topbar-list"]' }],
    required: () => ['cm-list', '.cm-list-intro'] },
  { name: '12-me', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-stats-me"]' }],
    required: () => ['cm-me', 'cm-me-entrance'], desktopOnly: true,
    known: () => ['"show which building I am in" is not offered: there is no server setting behind it'] },
  { name: '13-recenter', route: '/portal/campus',
    steps: (a) => [{ wait: 600 }, ...DISTURB, tap(SIGNATURE[a]), WALKED, { click: '[data-testid="cm-arrive-back"]' }, { wait: 1600 }],
    required: () => ['cm-world'], assert: () => AT_BASE },
  { name: '14-step-outside', route: '/portal/library',
    steps: () => [{ click: '[data-testid="cm-step-out"]' }, WALKED],
    required: () => ['cm-home', 'cm-card', 'cm-inside'],
    assert: () => "location.pathname === '/portal/campus' ? '' : 'still on ' + location.pathname" },
  { name: '15-panel-with-card', route: '/portal/campus', steps: (a) => [tap(SIGNATURE[a]), WALKED],
    required: () => ['cm-card'] },
  // WP-2: the tour inside the stop's arrival panel (stop card on top, nav at the foot), the room behind it, STOP badges on the map
  { name: '16-tour', route: '/portal/campus', accounts: ['member', 'explorer', 'business'],
    steps: () => [{ click: '[data-testid="cm-cc-tour-start"]' }, WALKED],
    required: () => ['cm-card', '.cm-arrive [data-testid="cm-tour"]', 'cm-tour-nav', 'cm-tour-next', 'cm-inside', '.cm-tour-stop.is-live'] },
  // WP-3: mid-walk, as the prototype's travelTo: the toast with Skip, the red route line, the destination highlighted
  // reduceMotion: false: every other view runs with reduce motion ON (instant arrivals, stable shots); this one must walk
  // the Library: the farthest walk from the gate (about 1.5 s), so every check lands mid-walk; a vertical route has a zero-width
  // box, so the route is asserted by its path, not by visibility
  { name: '17-travel', route: '/portal/campus', reduceMotion: false, steps: () => [{ ...tap('library'), settle: 150 }],
    required: () => ['cm-travel-text', 'cm-travel-skip', '.cm-bld.is-hl[data-building="library"]'],
    assert: () => "/^M500 640L/.test(document.querySelector('[data-testid=\"cm-route-line\"]')?.getAttribute('d') || '') ? '' : 'no route from the gate'",
    known: () => ['the people-chip peek needs someone on campus; covered by the campusTravel and campusPeople tests'] },
];

/** WP-1: the side panel (and the tour in it) is required on every view past the gate. */
function panelFor(view, a, size) {
  if (view.name === '01-gate') return [];
  const tour = a === 'staff' ? [] : ['cm-cc-tour'];
  if (view.route !== '/portal/campus' && view.name !== '14-step-outside') return size === 'phone' ? ['cm-steps-open'] : ['cm-page-rail', ...tour.map((t) => `[data-testid="cm-page-rail"] [data-testid="${t}"]`)];
  if (size === 'phone' && CARD_VIEWS.includes(view.name)) return ['cm-cc-peek'];
  return ['cm-concierge', ...tour];
}
const withPanel = (view) => ({ ...view, required: (a, size) => [...view.required(a, size), ...panelFor(view, a, size)] });
const ALL_VIEWS = VIEWS.map(withPanel);

module.exports = { ACCOUNTS, VIEWS: ALL_VIEWS, SIGNATURE, REFERENCE_ACCOUNT: { member: 'member', explorer: 'explorer', business: 'sponsor', staff: 'staff' } };
