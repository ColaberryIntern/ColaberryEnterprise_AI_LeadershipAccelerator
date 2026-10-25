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
const CONCIERGE = ['cm-concierge', 'cm-cc-where', 'cm-cc-greeting', 'cm-cc-lead'];
/** WP-4: the prototype hides the help desk from partners (renderHelpdesk); everyone else has it. */
const HELPDESK = (a) => (a === 'business' ? [] : ['cm-cc-helpdesk']);
const CONCIERGE_BY = { member: ['cm-cc-tour', 'cm-cc-chips'], explorer: ['cm-cc-pass', 'cm-cc-enroll', 'cm-cc-tour', 'cm-cc-chips'], business: ['cm-cc-tour', 'cm-cc-chips'], staff: ['cm-cc-staff-tools'] };
const SIGNATURE = { member: 'commons', explorer: 'lecture', business: 'career', staff: 'career' };
/** Tap a building even when the phone framing leaves it off screen (a real user pans to it first). */
// waits up to 10 s for the building: the map can render after the concierge, and a null tap failed at random accounts
const tap = (id) => ({ evaluate: `(async () => { for (let i = 0; i < 50; i++) { const el = document.querySelector('[data-testid="cm-bld-${id}"]'); if (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; } await new Promise((r) => setTimeout(r, 200)); } throw new Error('no building ${id}'); })()` });
/** WP-3: the prototype walk (330 units/s, eased, at least 600 ms): the longest walk on the campus settles inside this. */
const WALKED = { wait: 2600 };

const HOME_KNOWN = (a, size) => [
  ...(size === 'phone' ? ['phone: the stats pill is hidden as in the prototype phone layout; the campus tab bar has no Alerts tab yet'] : []),
  'top bar messages icon: comes with the chat on the home (decision Q6, WP-10)',
  'concierge "Right now": real rows only (plan, next class, busiest building, next event); a quiet local stack may have none',
  ...(a === 'explorer' ? ['pulse "K Explorers like you": needs an Explorer tag in presence (WP-9)'] : []),
  ...(a === 'business' ? ['partner company / seats / invite chips and "of your N people": no team size or company endpoint yet (WP-9)'] : []),
  ...(a === 'explorer' ? ['top bar "Enroll" pill: the enroll link lives in the Explorer pass'] : []),
];

/** v6 D1 (C24): no door anywhere in a room; the room's spot (or none), at most one left-wall board, and the board itself. */
const NO_DOOR = "document.querySelector('[data-testid=\"cm-inside-door\"]') ? 'a door element is still in the room' : ''";
const roomOk = (id, spots) => `(() => {
  const r = document.querySelector('[data-testid="cm-room3d"]');
  if (!r) return 'no 3D room';
  if (r.getAttribute('data-room') !== '${id}') return 'room is ' + r.getAttribute('data-room');
  if (document.querySelector('[data-testid="cm-inside-door"]')) return 'a door element is still in the room';
  const n = document.querySelectorAll('.cm-r3-spot').length;
  if (n !== ${spots}) return 'spots: ' + n + ' (want ${spots})';
  if (document.querySelectorAll('[data-testid="cm-wall-board"]').length > 1) return 'more than one left-wall board';
  if (!document.querySelector('[data-testid="cm-board-title"]')) return 'the board has no title';
  return '';
})()`;
/** v6 D1 fidelity view 21-room: the five rooms the ticket names, as a member (the click-throughs are in campus.e2e.js). */
const ROOM_VIEWS = [['lecture', 1], ['studio', 1], ['testing', 1], ['library', 1], ['amphi', 0]].map(([id, spots]) => ({
  name: `21-room-${id}`, route: '/portal/campus', accounts: ['member'], steps: () => [tap(id), WALKED],
  required: () => ['cm-inside', 'cm-room3d', 'cm-board', 'cm-ways', ...(spots ? ['.cm-r3-spot'] : [])], assert: () => roomOk(id, spots) }));

/** The map's viewBox right now, and the drag / zoom that move it well away from the whole campus. */
const VB = "document.querySelector('svg.cm-map.has-camera').getAttribute('viewBox')";
const DISTURB = [
  { evaluate: `window.__cmVb0 = ${VB}` },
  { click: '[data-testid="cm-zoom-in"]' }, { click: '[data-testid="cm-zoom-in"]' },
  { evaluate: "(() => { const s = document.querySelector('svg.cm-map.has-camera'); s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 400 })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: 800, clientY: 400 })); window.dispatchEvent(new PointerEvent('pointerup', {})); })()" },
];
const AT_BASE = `(() => { const a = ${VB}.split(' ').map(Number), b = String(window.__cmVb0 || '').split(' ').map(Number);
  if (b.length !== 4) return 'no baseline'; return a.every((v, i) => Math.abs(v - b[i]) <= 1) ? '' : 'viewBox ' + a.join(' ') + ' is not the whole campus ' + b.join(' '); })()`;
// C16: what 22-page-nav asserts on the page (an empty string = all good)
const PAGE_NAV_OK = `(() => {
  const bar = document.querySelector('[data-testid="cm-locbar"]'); if (!bar) return 'no location bar';
  const r = bar.getBoundingClientRect(); const out = [];
  if (Math.abs(r.width - document.documentElement.clientWidth) > 2) out.push('bar is ' + Math.round(r.width) + ' wide, the viewport ' + document.documentElement.clientWidth);
  if (Math.abs(r.top) > 1) out.push('after scrolling the bar is at ' + Math.round(r.top) + ', not the top');
  bar.querySelectorAll('button, .cm-lb-t, input').forEach((el) => { if (el.scrollWidth > el.clientWidth + 1 && !el.matches('.cm-lb-t')) out.push('overflow: ' + (el.textContent || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 30)); });
  const head = document.querySelector('.te-top'); if (head && /YOUR NEXT STEP/i.test(head.textContent || '')) out.push('"YOUR NEXT STEP" is inside the header');
  const up = document.querySelector('[data-testid="cm-page-rail"] [data-testid="cm-up-next"]');
  if (up) { const u = up.getBoundingClientRect(); if (u.bottom < 0 || u.top > innerHeight) out.push('the rail Up next is not in view after scrolling'); }
  return out.join('; ');
})()`;
// WP-5: the help desk opens the staff card (a popover, Q7), so 08 and 09 no longer open a building card
const CARD_VIEWS = ['03-arrive', '04-inside', '14-step-outside', '15-panel-with-card', '16-tour', '19-room-wall', '20-live-arrive'];

/** A view: route to open, then steps (each a { click }, { evaluate } or { wait }) and the required ids for an account and size. */
const VIEWS = [
  { name: '01-gate', fresh: true, route: '/portal/campus',
    required: (a) => ['cm-gate', 'cm-gate-arch-text', 'cm-gate-logo', 'cm-gate-greeting', 'cm-gate-sub', 'cm-gate-id', 'cm-gate-enter', ...(a === 'staff' ? [] : ['cm-gate-tour'])],
    known: () => ['WP-4 (Q9): Enter claims today\'s streak; the line shows the server\'s points and appears only for a member with an unclaimed or running streak'] },
  { name: '02-home', route: '/portal/campus',
    required: (a, size) => [...MAP_ART, ...buildingIds(), ...TOPBAR, ...(size === 'phone' ? [] : ['cm-stats', ...STATS[a]]), ...CONCIERGE, ...HELPDESK(a), ...CONCIERGE_BY[a], ...(size === 'phone' ? ['.cm-tabbar'] : [])],
    known: HOME_KNOWN },
  { name: '03-arrive', route: '/portal/campus', steps: (a) => [tap(SIGNATURE[a]), WALKED],
    required: (a) => ['cm-card', 'cm-arrive-hero', 'cm-arrive-now', ...(a === 'explorer' ? [] : ['cm-ways', 'cm-way-board']), 'cm-arrive-back', 'cm-arrive-elsewhere', '.cm-arrive .cm-rooms'] }, // v6 D1: the two ways in replace the single action (an explorer's lecture preview is locked: no ways, the enroll action stays)
  { name: '04-inside', route: '/portal/campus', steps: (a) => [tap(SIGNATURE[a]), WALKED],
    required: () => ['cm-inside', 'cm-room3d', 'cm-board', 'cm-inside-you', 'cm-inside-out'], // v6 D1: the CSS 3D room; the board replaced the door
    assert: () => NO_DOOR,
    known: () => ['the room opens on arrival, as the prototype flyIn does (no separate "look inside" step)', 'the prototype interiors invented events, dates, client names and tickets: neutral signs instead'] },
  { name: '05-page', route: '/portal/library',
    required: (a, size) => ['cm-locbar', 'cm-trail', 'cm-step-out', '.cm-locbar .cm-whereto', ...(size === 'phone' ? [] : ['cm-page-side', 'cm-page-rail'])], // C16: the bar
    known: () => ['the page countdown header (next class / next event) is the existing portal header, not rebuilt'] },
  { name: '06-live', route: '/portal/campus', needsLive: true,
    // WP-6: the marquee over the live building, the bar's state chip and clock, the card's chip and chime
    required: (a, size) => ['cm-world', 'cm-cc-live', 'cm-beams', 'svg.cm-map.is-evening.ls-live', 'cm-marquee', 'cm-live-chip', ...(size === 'phone' ? [] : ['cm-live-sub']), 'cm-cc-live-chime'],
    known: () => ['the prototype crowd of walking dots was random: not drawn (the building head count is real)'] },
  { name: '07-notifications', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-stats-bell"] button' }],
    required: () => ['.cm-bell-panel'], desktopOnly: true },
  { name: '08-person-card', route: '/portal/campus', accounts: ['member', 'explorer', 'staff'], steps: () => [{ click: '[data-testid="cm-cc-helpdesk"] button' }, { wait: 500 }],
    required: () => ['cm-staff-card', '.cm-pc-tag', '.cm-pc-where', '.cm-pc-acts'],
    known: () => ['the learner person card (a popover at the press) needs someone else on campus; covered by campusPeopleRooms'] },
  { name: '09-chat', route: '/portal/campus', accounts: ['member', 'explorer', 'staff'], steps: () => [{ click: '[data-testid="cm-cc-helpdesk"] button' }, { wait: 500 }],
    required: () => ['cm-staff-card'],
    known: () => ['chat with a desk opens through Today (the existing DM dock); not rebuilt on the home'] },
  { name: '10-toast', route: '/portal/campus', required: () => ['cm-world'],
    known: () => ['the DM toast (Reply, Walk over) needs a real incoming message; covered by campusPanels and campusDmToast tests'] },
  { name: '11-list', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-topbar-list"]' }],
    required: () => ['cm-list', '.cm-list-intro'] },
  { name: '12-me', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-stats-me"]' }],
    // WP-7: the figure, the photo button, the entrance and share settings for everyone; the locker tiles for learners
    required: (a) => ['cm-me', 'cm-me-figure', 'cm-me-photo', 'cm-me-entrance', 'cm-me-share', ...(a === 'member' || a === 'explorer' ? ['cm-locker'] : ['cm-me-earners'])],
    desktopOnly: true,
    known: () => ["a partner's title and company are not shown: the campus does not know them"] },
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
  // WP-4: the Wayfinder from the top bar pill: the palette over the blurred campus, grouped results, the footer hints
  { name: '18-wayfinder', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-topbar-search"]' }],
    required: (a, size) => ['cm-wayfinder', 'cm-wf-input', '[role="group"][aria-label="All buildings"]', '.cm-wf-item', ...(size === 'phone' ? [] : ['.cm-wf-hint'])],
    known: () => ['search logging for staff insights: decision Q11\'s separate project'] },
  // WP-5: a room whose back wall carries real facts (the Schedule board: TODAY · <weekday>, the next session, event and plan)
  { name: '19-room-wall', route: '/portal/campus', steps: () => [tap('tower'), WALKED],
    required: () => ['cm-inside', 'cm-room3d', 'cm-board', 'cm-r3-you'], assert: () => roomOk('tower', 0) }, // v6 D1: Schedule has a board, no spot
  ...ROOM_VIEWS,
  // C19 (round 3 §2.3 + v6 D1): the workstation, reached the real way (into the Studio, sit at your desk). A story as a member:
  // the throwaway seed has a project but no Classroom week, so the lesson workstation is covered by its unit test instead.
  { name: '23-workstation', route: '/portal/campus', accounts: ['member'], steps: () => [tap('studio'), WALKED, { click: '.cm-r3-spot' }, { wait: 2600 }],
    // under 1100 px the angled side monitor folds away (the prototype's .mon.side{display:none}), so the terminal is wide-only
    required: (a, size) => ['cm-ws', 'cm-ws-trail', 'cm-ws-section', 'cm-ws-standup', 'cm-ws-bench', 'cm-ws-desk', 'cm-ws-cory', 'cm-ws-status', ...(size === 'phone' ? [] : ['cm-ws-term'])],
    assert: () => `(() => { const n = document.querySelectorAll('.cm-ws-bezel').length; if (n !== 2) return 'bezels: ' + n + ' (want 2)';
      const t = document.querySelector('[data-testid="cm-ws-trail"]').textContent; return t.startsWith('Your desk · ') ? '' : 'trail: ' + t; })()` },
  // C21 (v6 D3): Admissions beside the gate: the board's four prices come from the claims registry and $199 is absent; the
  // service rows render for a member and a business viewer; /portal/plans renders the four cards.
  { name: '24-admissions', route: '/portal/campus', accounts: ['member', 'business'], steps: () => [tap('admissions'), WALKED],
    required: () => ['cm-room3d', 'cm-board-plans', 'cm-board-talk', 'cm-adm-services', 'cm-adm-maya', '.cm-r3-spot'],
    assert: () => `(() => { const b = document.querySelector('[data-testid="cm-board-plans"]').textContent;
      for (const want of ['$149', '$1,200', 'Scoped on a call', 'No card needed']) if (!b.includes(want)) return 'board lacks ' + want;
      return document.body.textContent.includes('$199') ? '$199 is on the page' : ''; })()` },
  // C27 (v6 D5): the Schedule room's board is the week strip and upcoming events (Sign up / You're going); the arrival card lists them.
  { name: '25-schedule', route: '/portal/campus', accounts: ['member'], steps: () => [tap('tower'), WALKED, { wait: 1500 }],
    required: () => ['cm-room3d', 'cm-board-strip', 'cm-ev-upcoming'],
    assert: () => `(() => { const n = document.querySelectorAll('[data-testid="cm-board-strip"] .d').length; if (n !== 7) return 'strip days: ' + n;
      return document.querySelectorAll('[data-testid="cm-board-strip"] .d.is-today').length === 1 ? '' : 'today not marked once'; })()` },
  { name: '24-plans', route: '/portal/plans', accounts: ['member', 'business'], steps: () => [{ wait: 1500 }],
    required: () => ['cm-plans', 'cm-plan-explorer', 'cm-plan-individual', 'cm-plan-team', 'cm-plan-services', 'cm-plans-account', 'cm-plans-talk'] },
  // WP-6: arriving at the live building: the hero in the state's colour, the stage, the live room as the main action
  // C16 (round 3 §2.4): the light location bar on a page at 1440 and 1920: it spans the viewport, no control's text overflows, and
  // after scrolling 800 px it is at the top with the rail's Up next in view and no "YOUR NEXT STEP" inside the header.
  { name: '22-page-nav', route: '/portal/classroom', sizes: ['desktop', 'wide'],
    steps: () => [{ wait: 900 }, { evaluate: 'window.scrollTo(0, 800)', settle: 900 }],
    required: () => ['cm-locbar', 'cm-locbar-map', 'cm-trail', 'cm-step-out', 'cm-whereto', 'cm-page-rail'],
    assert: () => PAGE_NAV_OK },
  { name: '20-live-arrive', route: '/portal/campus', needsLive: true, steps: () => [tap('commons'), WALKED],
    required: () => ['.cm-arrive-hero.is-live', 'cm-stage', 'cm-arrive-cta'],
    known: () => ['DOORS OPEN and REPLAY: discovery lists only live and reconnecting broadcasts today (kept out on purpose, #3346)', 'auto check-in needs a broadcast with a class session; the local seed has none'] },
];

/** WP-1: the side panel (and the tour in it) is required on every view past the gate. */
function panelFor(view, a, size) {
  if (view.name === '01-gate' || view.name === '23-workstation') return []; // the workstation is full screen, as the prototype's #ws
  const tour = a === 'staff' ? [] : ['cm-cc-tour'];
  if (view.route !== '/portal/campus' && view.name !== '14-step-outside') return size === 'phone' ? ['cm-steps-open'] : ['cm-page-rail', ...tour.map((t) => `[data-testid="cm-page-rail"] [data-testid="${t}"]`)];
  if (size === 'phone' && (CARD_VIEWS.includes(view.name) || view.name.startsWith('21-room-') || view.name === '24-admissions' || view.name === '25-schedule')) return ['cm-cc-peek'];
  return ['cm-concierge', ...tour];
}
const withPanel = (view) => ({ ...view, required: (a, size) => [...view.required(a, size), ...panelFor(view, a, size)] });
const ALL_VIEWS = VIEWS.map(withPanel);

module.exports = { ACCOUNTS, VIEWS: ALL_VIEWS, SIGNATURE, REFERENCE_ACCOUNT: { member: 'member', explorer: 'explorer', business: 'sponsor', staff: 'staff' } };
