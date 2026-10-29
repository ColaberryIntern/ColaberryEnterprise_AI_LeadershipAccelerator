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

/** Campus HQ: the accounts whose signature building is the elevator tower (career). */
const isHqAccount = (a) => SIGNATURE[a] === 'career';
/** Campus HQ: ride by floor LABEL (numbers follow the sidebar, so a test that names a number breaks when a group is added). */
const hqButton = (label) => ({ evaluate: `(() => { const b = [...document.querySelectorAll('.cm-hq-cab .fb')].find((x) => x.querySelector('b')?.textContent === ${JSON.stringify(label)}); if (!b) throw new Error('no floor button ${label}'); b.click(); })()`, settle: 1800 });
const hqHover = (label) => ({ evaluate: `(() => { const b = [...document.querySelectorAll('.cm-hq-cab .fb')].find((x) => x.querySelector('b')?.textContent === ${JSON.stringify(label)}); b.focus(); b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); })()`, settle: 500 });
/** H8: no text in the HQ overflows its box (an ellipsis is a deliberate cut, not an overflow). */
const HQ_NO_OVERFLOW = `(() => {
  for (const el of document.querySelectorAll('.cm-hq b, .cm-hq small, .cm-hq .pl, .cm-hq code, .cm-hq-side b, .cm-hq-side small, .cm-hq-side .st, .cm-hq-side .go')) {
    if (el.offsetParent === null) continue;
    const cs = getComputedStyle(el); if (cs.textOverflow === 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 1 && cs.display !== 'inline') return 'text overflows: ' + el.textContent.slice(0, 40);
  }
  return '';
})()`;
const HQ_IN = [tap('career'), WALKED];
const HQ_LOBBY = [...HQ_IN, { click: '[data-testid="cm-hq-walk-in"]' }];
const HQ_CAB = [...HQ_LOBBY, { click: '[data-testid="cm-hq-call"]' }];
/** C87: Dara stays on the Program floor, at the Curriculum office door (a badge without that floor is never sent her desk). */
const DARA_AT_CURRICULUM = "(() => [...document.querySelectorAll('.cm-hq-floor [data-testid=\"cm-hq-people\"]')].some((p) => /^At Curriculum: .*Dara/.test(p.getAttribute('aria-label') || '')) ? '' : 'Dara is not at the Curriculum door')()";
const HQ_VIEWS = [
  { name: '34-hq-agent', route: '/portal/campus', accounts: ['staff'], steps: () => [...HQ_CAB, hqButton('Program')],
    required: () => ['cm-hq-floor', '.cm-hq-floor [data-testid="cm-hq-people"]'], assert: () => DARA_AT_CURRICULUM },
  { name: '34-hq-outside', route: '/portal/campus', accounts: ['staff-marketing', 'member'], steps: () => HQ_IN,
    required: () => ['cm-hq', 'cm-hq-ext', 'cm-hq-walk-in', 'cm-hq-badge', 'cm-hq-panel'], assert: () => HQ_NO_OVERFLOW },
  { name: '34-hq-lobby', route: '/portal/campus', accounts: ['staff', 'member'], steps: () => HQ_LOBBY,
    required: (a, size) => ['cm-hq-lobby', 'cm-hq-reader', ...(size === 'phone' ? [] : ['cm-hq-concierge', 'cm-hq-directory'])], assert: () => HQ_NO_OVERFLOW },
  { name: '34-hq-elevator', route: '/portal/campus', accounts: ['staff'], steps: () => [...HQ_CAB, hqHover('Marketing')],
    required: (a, size) => ['cm-hq-cab', '.cm-hq-cab .fb.lock', '.cm-hq-cab .fb:not(.lock)', ...(size === 'phone' ? [] : ['cm-hq-guide-rooms'])], assert: () => HQ_NO_OVERFLOW },
  { name: '34-hq-floor', route: '/portal/campus', accounts: ['staff'], steps: () => [...HQ_CAB, hqButton('Campaigns')],
    required: () => ['cm-hq-floor', 'cm-hq-office', 'cm-hq-to-cab', 'cm-hq-panel-floor'], assert: () => HQ_NO_OVERFLOW },
  { name: '34-hq-partial', route: '/portal/campus', accounts: ['staff-mentor'], steps: () => [...HQ_CAB, hqButton('Executive Floor')],
    required: () => ['cm-hq-floor', 'cm-hq-office', 'cm-hq-office-locked', 'cm-hq-panel-floor'], assert: () => HQ_NO_OVERFLOW },
];

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
  required: () => ['cm-inside', 'cm-room3d', 'cm-board', 'cm-ways', ...(spots ? ['.cm-r3-spot'] : []), ...(id === 'library' || id === 'amphi' ? ['cm-wall-board'] : [])], assert: () => roomOk(id, spots) }));
/** C43 (room fix F3): every room has its left-wall board (from real data, or its empty line); these four had a blank wall. */
/** C45 (room fix F5): the window is big and shows the neighbours as themselves (Classroom, Library; Meeting Rooms' high strip). */
const WINDOW_VIEWS = [['lecture', 0.6], ['library', 0.6], ['commons', 0.2]].map(([id, minH]) => ({
  name: `31-room-windows-${id}`, route: '/portal/campus', accounts: ['member'], steps: () => [tap(id), WALKED, { wait: 800 }],
  required: () => ['cm-room3d', 'cm-room-window', ...(id === 'commons' ? [] : ['[data-mini]'])],
  assert: () => `(() => { const w = document.querySelector('[data-testid=\"cm-room-window\"]'); const f = w.closest('.face'); if (!f) return 'window not on a wall';
    const r = w.offsetHeight / f.offsetHeight; return r >= ${minH} ? '' : 'window is ' + Math.round(r * 100) + '% of the wall height'; })()` }));
const WALL_VIEWS = ['tower', 'observatory', 'gallery', 'career'].map((id) => ({
  name: `21-room-wall-${id}`, route: '/portal/campus', accounts: ['member'], steps: () => [tap(id), WALKED],
  required: () => ['cm-room3d', 'cm-wall-board'],
  assert: () => "(() => document.querySelector('[data-testid=\"cm-room3d\"] .face.left [data-testid=\"cm-wall-board\"]') ? '' : 'no board on the left wall')()" }));

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
    // C23: no longer a "known": Q9 is built (cm-gate-streak, useGateStreak). The line needs a real streak, so it is not required.
    required: (a) => ['cm-gate', 'cm-gate-arch-text', 'cm-gate-logo', 'cm-gate-greeting', 'cm-gate-sub', 'cm-gate-id', 'cm-gate-enter', ...(a === 'staff' ? [] : ['cm-gate-tour'])] },
  { name: '02-home', route: '/portal/campus',
    required: (a, size) => [...MAP_ART, ...buildingIds(), ...TOPBAR, ...(size === 'phone' ? [] : ['cm-stats', ...STATS[a]]), ...CONCIERGE, ...HELPDESK(a), ...CONCIERGE_BY[a], ...(size === 'phone' ? ['.cm-tabbar'] : [])],
    known: HOME_KNOWN },
  { name: '03-arrive', route: '/portal/campus', steps: (a) => [tap(SIGNATURE[a]), WALKED],
    // v6 D1: the two ways in replace the single action (an explorer's lecture preview is locked: no ways, the enroll action stays).
    // Campus HQ: the career building (business and staff) is the elevator tower: its badge and floors take the ways' place.
    required: (a) => ['cm-card', 'cm-arrive-hero', 'cm-arrive-now', ...(a === 'explorer' ? [] : isHqAccount(a) ? ['cm-hq-badge', 'cm-hq-panel'] : ['cm-ways', 'cm-way-board']), 'cm-arrive-back', 'cm-arrive-elsewhere', '.cm-arrive .cm-rooms'] },
  { name: '04-inside', route: '/portal/campus', steps: (a) => [tap(SIGNATURE[a]), WALKED],
    // v6 D1: the CSS 3D room; the board replaced the door. Campus HQ: the career building shows the tower instead.
    required: (a) => (isHqAccount(a) ? ['cm-inside', 'cm-hq', 'cm-hq-ext', 'cm-inside-out'] : ['cm-inside', 'cm-room3d', 'cm-board', 'cm-inside-you', 'cm-inside-out']),
    assert: () => NO_DOOR,
    known: () => ['the room opens on arrival, as the prototype flyIn does (no separate "look inside" step)', 'rooms show real-data boards only (C27, C33, C43); the prototype interiors invented events, dates, client names and tickets, never drawn'] },
  { name: '05-page', route: '/portal/library',
    required: (a, size) => ['cm-locbar', 'cm-trail', 'cm-step-out', '.cm-locbar .cm-whereto', ...(size === 'phone' ? [] : ['cm-page-side', 'cm-page-rail'])], // C16: the bar
    known: () => ['the page countdown header (next class / next event) is the existing portal header, not rebuilt'] },
  { name: '06-live', route: '/portal/campus', needsLive: true,
    // WP-6: the marquee over the live building, the bar's state chip and clock, the card's chip and chime
    required: (a, size) => ['cm-world', 'cm-cc-live', 'cm-beams', 'svg.cm-map.is-evening.ls-live', 'cm-marquee', 'cm-live-chip', ...(size === 'phone' ? [] : ['cm-live-sub']), 'cm-cc-live-chime'],
    known: () => ['ambient walkers: decision Q1 (real present people walking) is still open; the prototype\'s random crowd is never drawn'] },
  { name: '07-notifications', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-stats-bell"] button' }],
    required: () => ['.cm-bell-panel'], desktopOnly: true },
  { name: '08-person-card', route: '/portal/campus', accounts: ['member', 'explorer', 'staff'], steps: () => [{ click: '[data-testid="cm-cc-helpdesk"] button' }, { wait: 500 }],
    required: () => ['cm-staff-card', '.cm-pc-tag', '.cm-pc-where', '.cm-pc-acts'],
    known: () => ['the learner person card (a popover at the press) needs someone else on campus; covered by campusPeopleRooms'] },
  { name: '09-chat', route: '/portal/campus', accounts: ['member', 'explorer', 'staff'], steps: () => [{ click: '[data-testid="cm-cc-helpdesk"] button' }, { wait: 500 }],
    required: () => ['cm-staff-card'],
    // C23: corrected. The chat now opens on the home itself (CampusDmDock); only the seed is missing.
    known: () => ['a desk\'s Message opens the chat dock on the home (CampusDmDock), but only for a desk on duty with a real account, which the local seed has none of; covered by campusDmDock'] },
  { name: '10-toast', route: '/portal/campus', required: () => ['cm-world'],
    known: () => ['the DM toast shows on the next 45 s poll after a new message; its face, place, message, Reply and Walk over are covered by campusPanels and campusDmToast'] },
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
  ...ROOM_VIEWS, ...WALL_VIEWS, ...WINDOW_VIEWS, ...HQ_VIEWS,
  // C19 (round 3 §2.3 + v6 D1): the workstation, reached the real way (into the Studio, sit at your desk). A story as a member:
  // the throwaway seed has a project but no Classroom week, so the lesson workstation is covered by its unit test instead.
  // C40: the frame gets out of the way. Under 1600 px the angled side monitor folds away; under 1200 px Cory is a drawer (closed) and
  // the desk props go. The card's screen must get at least 70% of the height everywhere it is checked, and 75% of the width once
  // Cory is a drawer (half a laptop screen, 1100 x 1000: the Claude Code layout); at 1440 the side monitor and Cory share the width.
  { name: '23-workstation', route: '/portal/campus', accounts: ['member'], sizes: ['desktop', 'half', 'phone'], steps: () => [tap('studio'), WALKED, { click: '.cm-r3-spot' }, { wait: 2600 }],
    required: (a, size) => ['cm-ws', 'cm-ws-trail', 'cm-ws-section', 'cm-ws-standup', 'cm-ws-bench', 'cm-ws-cory', 'cm-ws-status', ...(size === 'desktop' ? ['cm-ws-desk'] : ['cm-ws-cory-toggle'])],
    assert: () => `(() => { const n = document.querySelectorAll('.cm-ws-bezel').length; if (n !== 2) return 'bezels: ' + n + ' (want 2)';
      const t = document.querySelector('[data-testid="cm-ws-trail"]').textContent; if (!t.startsWith('Your desk · ')) return 'trail: ' + t;
      const vw = innerWidth, vh = innerHeight; if (vw < 700) return '';
      const r = document.querySelector('.cm-ws-screen').getBoundingClientRect();
      const needW = vw < 1200 ? 0.75 : vw < 1600 ? 0.7 : 0.5; // 75% with Cory in a drawer, 70% on a 1440 laptop beside Cory, 50% wide (side monitor) if (r.width < vw * needW) return 'screen width ' + Math.round(r.width) + ' < ' + Math.round(needW * 100) + '% of ' + vw;
      if (r.height < vh * 0.7) return 'screen height ' + Math.round(r.height) + ' < 70% of ' + vh;
      const cory = document.querySelector('[data-testid="cm-ws-cory"]').getBoundingClientRect();
      return vw < 1200 && cory.left < vw - 2 ? 'Cory drawer is open on arrival' : ''; })()` },
  // C21 (v6 D3): Admissions beside the gate: the board's four prices come from the claims registry and $199 is absent; the
  // service rows render for a member and a business viewer; /portal/plans renders the four cards.
  { name: '24-admissions', route: '/portal/campus', accounts: ['member', 'business'], steps: () => [tap('admissions'), WALKED],
    required: () => ['cm-room3d', 'cm-board-plans', 'cm-board-talk', 'cm-adm-services', 'cm-adm-maya', '.cm-r3-spot'],
    assert: () => `(() => { const b = document.querySelector('[data-testid="cm-board-plans"]').textContent;
      for (const want of ['$149', '$1,200', 'Scoped on a call', 'No card needed']) if (!b.includes(want)) return 'board lacks ' + want;
      return document.body.textContent.includes('$199') ? '$199 is on the page' : ''; })()` },
  // C27 (v6 D5): the Schedule room's board is the week strip and upcoming events (Sign up / You're going); the arrival card lists them.
  { name: '25-schedule', route: '/portal/campus', accounts: ['member'], steps: () => [tap('tower'), WALKED, { wait: 1500 }],
    required: () => ['cm-room3d', 'cm-board-strip', 'cm-ag-rows'], // C33: one list of classes, events and booked sessions
    assert: () => `(() => { const n = document.querySelectorAll('[data-testid="cm-board-strip"] .d').length; if (n !== 7) return 'strip days: ' + n;
      return document.querySelectorAll('[data-testid="cm-board-strip"] .d.is-today').length === 1 ? '' : 'today not marked once'; })()` },
  // C29 (v7 R2): Meeting Rooms is a hallway: at most six doors (live rooms, your bookings, your rooms), each matching its card row
  // in the same order and state; the board counts the open rooms; + New room and Book a session are on the board and the card.
  { name: '26-meeting-rooms', route: '/portal/campus', accounts: ['member'], steps: () => [tap('commons'), WALKED, { wait: 2000 }],
    required: () => ['cm-room3d', 'cm-board-new-room', 'cm-board-book-room', 'cm-hall-rows', 'cm-hall-new', 'cm-hall-book'],
    assert: () => `(() => { const doors = Array.from(document.querySelectorAll('[data-testid="cm-room3d"] .cm-mdoor')); if (doors.length !== 6) return 'doors: ' + doors.length + ' (want 6)';
      if (document.querySelectorAll('[data-testid="cm-room3d"] .face.right .cm-mdoor').length !== 3) return 'right wall doors != 3';
      for (const d of doors) { if (d.classList.contains('is-more') || d.classList.contains('is-empty')) continue; const n = d.getAttribute('data-testid').replace('cm-door-', '');
        const row = document.querySelector('[data-testid="cm-hall-row-' + n + '"]'); if (!row) return 'no card row for door ' + n;
        const name = d.querySelector('.plate b').textContent; if (!row.textContent.includes(name)) return 'door ' + n + ' (' + name + ') is not row ' + n;
        if (d.classList.contains('is-live') !== !!row.querySelector('.dot')) return 'door ' + n + ' live state differs from its row'; }
      const rows = document.querySelectorAll('[data-testid^="cm-hall-row-"]').length; const real = doors.filter((d) => !d.classList.contains('is-more') && !d.classList.contains('is-empty')).length;
      return rows === real ? '' : 'rows ' + rows + ' vs doors ' + real; })()` },
  // C30 (v7 R3): the Community Board on the Quad: the noticeboard is on the map; clicking it walks there and opens the cork board with
  // the real notes from the community feed. v14 (C67-C71): the board in sections: the header (status, search, Add a note, the Community
  // page), the ritual bar, nine sections, and Everything's Fresh grid; the drawer and the composer have their own views below.
  { name: '27-community-board', route: '/portal/campus', accounts: ['member'], sizes: ['desktop', 'half', 'phone'], steps: () => [{ click: '[data-testid="cm-cboard-sign"]' }, { wait: 2200 }],
    required: () => ['cm-cboard-sign', 'cm-cboard', 'cb-status', 'cb-search', 'cb-add', 'cm-cb-feed', 'cb-lanes'],
    assert: () => `(() => { const n = document.querySelectorAll('[data-testid="cb-lanes"] [data-testid^="cb-lane-"]').length; return n === 9 ? '' : 'sections: ' + n; })()` },
  { name: '33-board-compose', route: '/portal/campus', accounts: ['member'], steps: () => [{ click: '[data-testid="cm-cboard-sign"]' }, { wait: 2200 }, { click: '[data-testid="cb-add"]' }, { wait: 400 }],
    required: () => ['cb-compose', 'cb-type-q', 'cb-type-post', 'cb-compose-where', 'cb-compose-body', 'cb-compose-post'] },
  { name: '33-board-your-notes', route: '/portal/campus', accounts: ['member'], steps: () => [{ click: '[data-testid="cm-cboard-sign"]' }, { wait: 2200 }, { click: '[data-testid="cb-lane-mine"]' }, { wait: 1200 }],
    required: () => ['cb-lanes'] },
  // C34 (v8 G1): the Game Room page: the hero, both side cards, five game cards, the leaderboard, recent highs and the side column; no
  // control's text overflows its box.
  { name: '29-game-room', route: '/portal/game-room', accounts: ['member'], steps: () => [{ wait: 2500 }],
    required: () => ['gr-hero', 'gr-hero-time', 'gr-your-week', 'gr-champions', 'gr-games', 'gr-leaderboards', 'gr-recent', 'gr-playing', 'gr-challenge'],
    assert: () => `(() => { const n = document.querySelectorAll('[data-testid^="gr-card-"]').length; if (n !== 5) return 'cards: ' + n;
      const over = Array.from(document.querySelectorAll('.gr-page button, .gr-page a')).filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
      return over.length ? 'text overflows: ' + over.slice(0, 3).join(' | ') : ''; })()` },
  // C36 (v8 G5): the Game Room interior: five cabinets in an aisle, the champions wall with a row per game, the card's meter and games;
  // clicking the Bug Breaker cabinet opens the cabinet modal for Bug Breaker.
  { name: '30-game-room-interior', route: '/portal/campus', accounts: ['member'], steps: () => [tap('arcade'), WALKED, { wait: 2000 }, { click: '[data-testid="cm-cabinet-bug-breaker"]' }, { wait: 2500 }],
    required: () => ['cm-room3d', 'cm-champions', 'cm-arc-card', 'cm-arc-meter', 'gr-cabinet', 'gr-cab-title'],
    assert: () => `(() => { const n = document.querySelectorAll('[data-testid^="cm-cabinet-"][role="button"]').length; if (n !== 5) return 'cabinets: ' + n;
      const rows = document.querySelectorAll('[data-testid="cm-champions"] .r').length; if (rows !== 5) return 'champion rows: ' + rows;
      const t = document.querySelector('[data-testid="gr-cab-title"]').textContent; return t === 'BUG BREAKER' ? '' : 'cabinet title: ' + t; })()` },
  // C39 (v11): Chow Hall left of the gate; the room's craving screen, chalkboard, counter and window; the counter opens the order sheet
  // (chips and app cards) without leaving /portal/campus; no control's text overflows.
  { name: '30-chow-hall', route: '/portal/campus', accounts: ['member'], steps: () => [tap('chow'), WALKED, { wait: 2000 }, { click: '[data-testid="cm-spot-counter"]' }, { wait: 1200 }],
    required: () => ['cm-bld-chow', 'cm-room3d', 'cm-crave-screen', 'cm-chalkboard', 'cm-spot-counter', 'cm-room-window', 'cm-order', 'cm-order-apps', 'cm-crave-pizza'],
    assert: () => `(() => { if (location.pathname !== '/portal/campus') return 'path changed: ' + location.pathname;
      const gate = document.querySelector('[data-testid="cm-bld-gate"]'), chow = document.querySelector('[data-testid="cm-bld-chow"]');
      if (gate && chow && chow.getBoundingClientRect().left >= gate.getBoundingClientRect().left) return 'Chow Hall is not left of the gate';
      if (document.querySelectorAll('[data-testid="cm-order-apps"] a').length < 1) return 'no app cards';
      const over = Array.from(document.querySelectorAll('[data-testid="cm-order"] button, [data-testid="cm-order"] a')).filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
      return over.length ? 'text overflows: ' + over.slice(0, 3).join(' | ') : ''; })()` },
  // C37/C38 (v9, v10): the sky layer and the weather chip on the map (the clock alone while CAMPUS_WEATHER_ENABLED is off), and in the
  // Classroom the window on the right wall with the real view east ("Looking out at ...").
  // v13 (C49-C53): Today is the Explorer's home base. On the map: the red Today button, the Today card first in the panel, the TODAY
  // flag over the tower and START HERE at the gate; at the tower, Open Today as its primary and the "Today lives here" tile; the tour's
  // stop 1 is the tower with Open Today. The member twin: a neutral button, the slim row, no flag and no sign.
  { name: '32-today-explorer', route: '/portal/campus', accounts: ['explorer'], steps: () => [{ wait: 1200 }],
    required: (a, size) => ['cm-topbar-today', 'cm-today-flag', 'cm-gate-today', ...(size === 'phone' ? [] : ['cm-today-card'])],
    assert: () => `(() => { if (!document.querySelector('[data-testid="cm-topbar-today"]').classList.contains('is-primary')) return 'Today button is not red';
      const c = document.querySelector('[data-testid="cm-today-card"]'); if (c && c.offsetParent !== null) { const lead = document.querySelector('[data-testid="cm-cc-lead"]');
        if (lead && lead.nextElementSibling !== c && !(lead.nextElementSibling && lead.nextElementSibling.contains(c))) return 'the Today card is not first under the lead'; }
      return document.querySelector('[data-testid="cm-gate-today"]').textContent.includes('START HERE') ? '' : 'gate sign text'; })()` },
  { name: '32-today-explorer-tower', route: '/portal/campus', accounts: ['explorer'], steps: () => [tap('tower'), WALKED, { wait: 800 }],
    required: () => ['cm-card', 'cm-tower-today'],
    assert: () => `(() => document.querySelector('.cm-arrive').textContent.includes('Open Today') ? '' : 'the tower card has no Open Today')()` },
  { name: '32-today-explorer-tour', route: '/portal/campus', accounts: ['explorer'], steps: () => [{ click: '[data-testid="cm-cc-tour-start"]' }, WALKED, { wait: 800 }],
    required: () => ['cm-card', '.cm-arrive [data-testid="cm-tour"]', 'cm-tour-today'],
    assert: () => `(() => { const t = document.querySelector('[data-testid="cm-tour-title"]').textContent; return t === 'Start here: Today' ? '' : 'stop 1 title: ' + t; })()` },
  { name: '32-today-member', route: '/portal/campus', accounts: ['member'], steps: () => [{ wait: 1200 }],
    required: (a, size) => ['cm-topbar-today', ...(size === 'phone' ? [] : ['cm-today-row'])],
    assert: () => `(() => { if (document.querySelector('[data-testid="cm-topbar-today"]').classList.contains('is-primary')) return 'member Today button is red';
      if (document.querySelector('[data-testid="cm-today-flag"]')) return 'member sees the TODAY flag';
      return document.querySelector('[data-testid="cm-gate-today"]') ? 'member sees the gate sign' : ''; })()` },
  { name: '31-weather', route: '/portal/campus', accounts: ['member'], steps: () => [tap('lecture'), WALKED, { wait: 2000 }],
    required: (a, size) => ['cm-wx', 'cm-room-window', 'cm-win-looking', ...(size === 'phone' ? [] : ['cm-wx-chip'])],
    assert: () => `(() => { const l = document.querySelector('[data-testid="cm-win-looking"]').textContent; if (!/^Looking out at /.test(l)) return 'window sign: ' + l;
      const tod = document.querySelector('[data-testid="cm-wx"]').getAttribute('data-tod'); return ['dawn', 'day', 'dusk', 'night'].includes(tod) ? '' : 'time of day: ' + tod; })()` },
  { name: '24-plans', route: '/portal/plans', accounts: ['member', 'business'], steps: () => [{ wait: 1500 }],
    required: () => ['cm-plans', 'cm-plan-explorer', 'cm-plan-individual', 'cm-plan-team', 'cm-plan-services', 'cm-plans-account', 'cm-plans-talk'] },
  // WP-6: arriving at the live building: the hero in the state's colour, the stage, the live room as the main action
  // C16 (round 3 §2.4): the light location bar on a page at 1440 and 1920: it spans the viewport, no control's text overflows, and
  // after scrolling 800 px it is at the top with the rail's Up next in view and no "YOUR NEXT STEP" inside the header.
  { name: '22-page-nav', route: '/portal/classroom', sizes: ['desktop', 'wide'],
    steps: () => [{ wait: 900 }, { evaluate: 'window.scrollTo(0, 800)', settle: 900 }],
    required: () => ['cm-locbar', 'cm-locbar-map', 'cm-trail', 'cm-step-out', 'cm-whereto', 'cm-page-rail'],
    assert: () => PAGE_NAV_OK },
  // C28 (v7 R1): every broadcast airs in the Events Hall
  { name: '20-live-arrive', route: '/portal/campus', needsLive: true, steps: () => [tap('amphi'), WALKED],
    required: () => ['.cm-arrive-hero.is-live', 'cm-stage', 'cm-arrive-cta'],
    known: () => ['DOORS OPEN and REPLAY: discovery lists only live and reconnecting broadcasts today (kept out on purpose, #3346)', 'auto check-in needs a broadcast with a class session; the local seed has none'] },
  // C31 (v7 R4): on air (stubbed discovery): the marquee sits on the Events Hall's map group, "Happening now" is the first thing in the
  // side panel, the hall's screen shows the ON AIR chip, and the arrival tile reads COLABERRY LIVE.
  { name: '28-live', route: '/portal/campus', needsLive: true, accounts: ['member'], steps: () => [tap('amphi'), WALKED, { wait: 1500 }],
    // on a phone an open card folds the side panel to its peek strip (like every room view), so Happening now is checked on desktop
    required: (a, size) => ['cm-board-onair', 'cm-arrive-live-tile', ...(size === 'phone' ? [] : ['cm-cc-live-kicker'])],
    assert: () => `(() => { const m = document.querySelector('[data-testid="cm-marquee"]'); if (!m) return 'no marquee';
      const t = m.getAttribute('transform') || ''; if (!/^translate\\(700 /.test(t)) return 'marquee not over the Events Hall (x 700): ' + t;
      const body = document.querySelector('.cm-cc-body'); const first = body && body.firstElementChild;
      if (body && body.offsetParent !== null && (!first || first.getAttribute('data-testid') !== 'cm-cc-live')) return 'Happening now is not first';
      if (!document.querySelector('[data-testid="cm-board-onair"]').textContent.includes('ON AIR')) return 'screen chip lacks ON AIR';
      return document.querySelector('[data-testid="cm-arrive-live-tile"]').textContent.includes('COLABERRY LIVE') ? '' : 'tile lacks COLABERRY LIVE'; })()` },
];

/** WP-1: the side panel (and the tour in it) is required on every view past the gate. */
function panelFor(view, a, size) {
  if (view.name === '01-gate' || view.name === '23-workstation') return []; // the workstation is full screen, as the prototype's #ws
  const tour = a.startsWith('staff') ? [] : ['cm-cc-tour']; // staff, and the HQ's per-role staff accounts
  if (view.route !== '/portal/campus' && view.name !== '14-step-outside') return size === 'phone' ? ['cm-steps-open'] : ['cm-page-rail', ...tour.map((t) => `[data-testid="cm-page-rail"] [data-testid="${t}"]`)];
  if (size === 'phone' && (CARD_VIEWS.includes(view.name) || view.name.startsWith('34-hq-') || view.name.startsWith('21-room-') || view.name.startsWith('31-room-windows-') || view.name.startsWith('32-today-explorer-t') || view.name === '24-admissions' || view.name === '25-schedule' || view.name === '26-meeting-rooms' || view.name === '28-live' || view.name === '30-game-room-interior' || view.name === '30-chow-hall' || view.name === '31-weather')) return ['cm-cc-peek'];
  return ['cm-concierge', ...tour];
}
const withPanel = (view) => ({ ...view, required: (a, size) => [...view.required(a, size), ...panelFor(view, a, size)] });
const ALL_VIEWS = VIEWS.map(withPanel);

module.exports = { ACCOUNTS, VIEWS: ALL_VIEWS, SIGNATURE, REFERENCE_ACCOUNT: { member: 'member', explorer: 'explorer', business: 'sponsor', staff: 'staff' } };
