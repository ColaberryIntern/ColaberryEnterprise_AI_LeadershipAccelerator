/**
 * C11b fidelity gate: the 12 views of the campus, each with how to reach it and what MUST be present and visible before its
 * screenshot is taken (a data-testid, or a CSS selector for components without one). scripts/captureCampusLocal.js --fidelity
 * reads this file and fails the run on any miss.
 *
 * `known` lists, per view, prototype elements that were deliberately NOT built, each with its reason (the real-data rule, or a
 * server feature that does not exist). They are reported on every run, never silently dropped, and carried into the PR as the
 * allowed differences. Accounts use the e2e audiences ("sponsor" in the prototype = business here).
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
const CONCIERGE = ['cm-concierge', 'cm-cc-where', 'cm-cc-greeting', 'cm-cc-lead', 'cm-cc-helpdesk', 'cm-cc-chips'];
const CONCIERGE_BY = { member: ['cm-cc-tour'], explorer: ['cm-cc-pass', 'cm-cc-enroll', 'cm-cc-tour'], business: ['cm-cc-tour'], staff: [] };
const SIGNATURE = { member: 'commons', explorer: 'lecture', business: 'career', staff: 'career' };
/** Tap a building even when the phone framing leaves it off screen (a real user pans to it first). */
const tap = (id) => ({ evaluate: `document.querySelector('[data-testid="cm-bld-${id}"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))` });

const HOME_KNOWN = (a, size) => [
  ...(size === 'phone' ? ['phone: the stats pill is hidden as in the prototype phone layout; the campus tab bar has no Alerts tab yet'] : []),
  'top bar messages icon: not built (the home has no DM inbox host; messages stay on Today)',
  'concierge "Right now" list: folded into the plan and live cards (one place per fact)',
  ...(a === 'business' ? ['partner company / seats / invite chips: no real partner data on this account'] : []),
  ...(a === 'explorer' ? ['top bar "Enroll" pill: the enroll link lives in the Explorer pass'] : []),
];

/** A view: route to open, then steps (each a { click } or { evaluate }) and the required ids for an account and size. */
const VIEWS = [
  { name: '01-gate', fresh: true, route: '/portal/campus',
    required: (a) => ['cm-gate', 'cm-gate-arch-text', 'cm-gate-logo', 'cm-gate-greeting', 'cm-gate-sub', 'cm-gate-id', 'cm-gate-enter', ...(a === 'staff' ? [] : ['cm-gate-tour'])],
    known: () => ['the gate streak line claims nothing: it is information only (claiming stays on Today)'] },
  { name: '02-home', route: '/portal/campus',
    required: (a, size) => [...MAP_ART, ...buildingIds(), ...TOPBAR, ...(size === 'phone' ? [] : ['cm-stats', ...STATS[a]]), ...CONCIERGE, ...CONCIERGE_BY[a], ...(size === 'phone' ? ['.cm-tabbar'] : [])],
    known: HOME_KNOWN },
  { name: '03-arrive', route: '/portal/campus', steps: (a) => [tap(SIGNATURE[a])],
    required: () => ['cm-card', 'cm-arrive-hero', 'cm-arrive-now', '.cm-arrive .cm-cta', 'cm-arrive-back', 'cm-arrive-elsewhere', '.cm-arrive .cm-rooms'] },
  { name: '04-inside', route: '/portal/campus', steps: (a) => [tap(SIGNATURE[a])],
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
  { name: '08-person-card', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-cc-helpdesk"] button' }],
    required: () => ['cm-card', 'cm-arrive-hero', '.cm-desks'],
    known: () => ['a help desk press walks to the desk building (its card holds the desk) instead of opening a staff popover'] },
  { name: '09-chat', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-cc-helpdesk"] button' }],
    required: () => ['.cm-desks'],
    known: () => ['chat with a desk opens through Today (the existing DM dock); not rebuilt on the home'] },
  { name: '10-toast', route: '/portal/campus', required: () => ['cm-world'],
    known: () => ['the DM toast (Reply, Walk over) needs a real incoming message; covered by campusPanels and campusDmToast tests'] },
  { name: '11-list', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-topbar-list"]' }],
    required: () => ['cm-list', '.cm-list-intro'] },
  { name: '12-me', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-stats-me"]' }],
    required: () => ['cm-me', 'cm-me-entrance'], desktopOnly: true,
    known: () => ['"show which building I am in" is not offered: there is no server setting behind it'] },
];

module.exports = { ACCOUNTS, VIEWS, SIGNATURE, REFERENCE_ACCOUNT: { member: 'member', explorer: 'explorer', business: 'sponsor', staff: 'staff' } };
