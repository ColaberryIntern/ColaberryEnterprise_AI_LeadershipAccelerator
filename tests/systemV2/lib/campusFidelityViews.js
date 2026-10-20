/**
 * C11b fidelity gate: the 12 views of the campus, each with how to reach it and the data-testids that MUST be present and
 * visible before its screenshot is taken. Mirrors .loop-architect/runs/20261020-campus-p11b/fidelity-checklist.md (the
 * human-readable version); scripts/captureCampusLocal.js --fidelity reads this file and fails the run on any miss.
 *
 * Accounts use the e2e audiences: member, explorer, business, staff ("sponsor" in the prototype = business here).
 */
const ACCOUNTS = ['member', 'explorer', 'business', 'staff'];

const MAP_ART = ['cm-world', 'cm-ground-grass', 'cm-quad-lawn', 'cm-quad-label', 'cm-fountain', 'cm-paths', 'cm-trees',
  'cm-district', 'cm-district-sign', 'cm-gate-pillars', 'cm-avatar'];
const BUILDINGS = {
  member: ['lecture', 'library', 'tower', 'studio', 'amphi', 'testing', 'observatory', 'commons', 'gallery', 'career', 'arcade'],
  explorer: ['lecture', 'library', 'tower', 'studio', 'amphi', 'testing', 'observatory', 'commons', 'gallery', 'career', 'arcade'],
  business: ['lecture', 'library', 'tower', 'studio', 'amphi', 'testing', 'observatory', 'commons', 'gallery', 'career', 'arcade'],
  staff: ['lecture', 'library', 'tower', 'studio', 'amphi', 'testing', 'observatory', 'commons', 'gallery', 'career', 'arcade'],
};
const buildingIds = (a) => BUILDINGS[a].flatMap((id) => [`cm-bld-${id}`, `cm-label-${id}`]);
const STATS = {
  member: ['cm-stats-level', 'cm-stats-points', 'cm-stats-online', 'cm-stats-bell', 'cm-stats-messages', 'cm-stats-avatar'],
  explorer: ['cm-stats-acct', 'cm-stats-online', 'cm-stats-messages', 'cm-stats-enroll', 'cm-stats-avatar'],
  business: ['cm-stats-online', 'cm-stats-bell', 'cm-stats-avatar'], // company / seats / invite only with real partner data
  staff: ['cm-stats-acct', 'cm-stats-online', 'cm-stats-bell', 'cm-stats-avatar'],
};
const TOPBAR = ['cm-topbar', 'cm-topbar-brand', 'cm-topbar-search', 'cm-topbar-list', 'cm-stats'];
const CONCIERGE = ['cm-concierge', 'cm-cc-where', 'cm-cc-greeting', 'cm-cc-lead', 'cm-cc-helpdesk', 'cm-cc-now'];
const CONCIERGE_BY = { member: [], explorer: ['cm-cc-pass', 'cm-cc-enroll'], business: [], staff: [] };
const SIGNATURE = { member: 'commons', explorer: 'lecture', business: 'career', staff: 'career' };

/** A view: route to open, then steps (each a { click } or { evaluate }) and the required ids for an account and size. */
const VIEWS = [
  { name: '01-gate', fresh: true, route: '/portal/campus?gate=1',
    required: (a) => ['cm-gate', 'cm-gate-arch-text', 'cm-gate-logo', 'cm-gate-greeting', 'cm-gate-sub', 'cm-gate-id', 'cm-gate-enter', 'cm-gate-tour'] },
  { name: '02-home', route: '/portal/campus',
    required: (a, size) => [...MAP_ART, ...buildingIds(a), ...TOPBAR, ...STATS[a], ...CONCIERGE, ...CONCIERGE_BY[a], ...(size === 'phone' ? ['cm-tabbar'] : [])] },
  { name: '03-arrive', route: '/portal/campus', steps: (a) => [{ click: `[data-testid="cm-bld-${SIGNATURE[a]}"]` }],
    required: () => ['cm-arrive', 'cm-arrive-hero', 'cm-arrive-kicker', 'cm-arrive-name', 'cm-arrive-cta', 'cm-arrive-who', 'cm-arrive-rooms', 'cm-arrive-back', 'cm-arrive-elsewhere'] },
  { name: '04-inside', route: '/portal/campus', steps: (a) => [{ click: `[data-testid="cm-bld-${SIGNATURE[a]}"]` }, { click: '[data-testid="cm-arrive-look-inside"]' }],
    required: () => ['cm-inside', 'cm-inside-feature', 'cm-inside-furniture', 'cm-inside-you', 'cm-inside-door', 'cm-inside-count', 'cm-inside-out'] },
  { name: '05-page', route: '/portal/library',
    required: () => ['cm-page-top', 'cm-page-bar', 'cm-page-mini', 'cm-trail', 'cm-step-outside', 'cm-whereto', 'cm-page-side', 'cm-page-minimap', 'cm-page-rail'] },
  { name: '06-live', route: '/portal/campus', needsLive: true,
    required: () => ['cm-world', 'cm-cc-live'] },
  { name: '07-notifications', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-stats-bell"]' }],
    required: () => ['cm-notifs'], accounts: ['member', 'business', 'staff'] },
  { name: '08-person-card', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-cc-helpdesk"] button' }],
    required: () => ['cm-person'] },
  { name: '09-chat', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-cc-helpdesk"] button' }, { click: '[data-testid="cm-person-message"]' }],
    required: () => ['cm-person'] },
  { name: '10-toast', route: '/portal/campus', steps: () => [{ evaluate: "window.dispatchEvent(new CustomEvent('cm-test-toast'))" }],
    required: () => ['cm-dm-toast', 'cm-dm-toast-reply'] },
  { name: '11-list', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-topbar-list"]' }],
    required: () => ['cm-list'] },
  { name: '12-me', route: '/portal/campus', steps: () => [{ click: '[data-testid="cm-stats-avatar"]' }],
    required: () => ['cm-me'] },
];

module.exports = { ACCOUNTS, VIEWS, SIGNATURE, REFERENCE_ACCOUNT: { member: 'member', explorer: 'explorer', business: 'sponsor', staff: 'staff' } };
