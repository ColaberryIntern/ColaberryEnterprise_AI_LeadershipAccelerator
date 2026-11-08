/**
 * Every figure ADS-2's two artifacts quote, in one place, so the visual and the document cannot
 * disagree. Nothing here is estimated: each number came from a read-only query against
 * `accelerator_prod` or from a headless browser run against the live hostnames on 2026-11-06.
 *
 * The uncomfortable number is REAL_PROOF.agree. It is what disproves this ticket's own claim to be
 * "the gate on every other ad-reporting ticket", so it is recorded first and plainly rather than
 * buried under the shipping note.
 */

const TICKET = 'ADS-2';
const TICKET_URL = 'https://3.basecamp.com/3945211/buckets/7463955/todos/10467338730';
const MEASURED_ON = '2026-11-06';
const DB = 'accelerator_prod';
const SESSION = 'CC-20261102-k9r4';

/** The page that changed. */
const PAGE = {
  slug: 'ai-learning-platform',
  brand: 'colaberry-training',
  id: 'fca4199a-c73d-4a06-974c-7f88f3c326eb',
  status: 'published',
  sections: 9,
  path: '/lp/colaberry-training/ai-learning-platform',
};

/** The edit itself. Two stored values; the renderer emits three anchors from them. */
const CHANGE = {
  from: 'https://www.refactored.ai/portal/signup',
  to: '/portal/signup',
  storedHrefs: 2,
  storedAt: ['sections[0].cta.href', 'sections[8].cta.href'],
  renderedAnchors: 3,
  label: 'Start Learning AI for $0',
  labelChanged: false,
};

/** Scope check, so the fix is not quietly narrower than the problem. */
const SCOPE = {
  hostedPagesContainingAbsoluteHref: 1,
  occurrences: 2,
  remainingAfterChange: 0,
};

/** The sibling page the ticket told us to change too. It needed something different. */
const SIBLING = {
  slug: 'start-learning-ai-for-0',
  status: 'draft',
  ctaCount: 2,
  href: '/apply',
  pointsAtRefactored: false,
};

/** Headless Chromium, both hostnames, 2026-11-06. */
const BROWSER = [
  {
    host: 'enterprise.colaberry.ai', status: 200, anchors: 3, allSameOrigin: true,
    originPreserved: true, landedPath: '/portal/signup', fingerprintSurvived: '1/1',
  },
  {
    host: 'www.refactored.ai', status: 200, anchors: 3, allSameOrigin: true,
    originPreserved: true, landedPath: '/portal/signup', fingerprintSurvived: '1/1',
  },
];

/** The session the probe created. No lead was submitted, deliberately. */
const PROBE = {
  campaign: 'TESTCAMP123',
  utmSource: 'fb',
  utmContent: 'ads2probe',
  sessionId: 'f2be8ef9-34a0-48bf-a603-d0cee731fa23',
  visitorId: '0b60dd9a-3e7b-469d-9dee-de51a0893e88',
  fingerprint: 'b841847cc0721474c0721475c0721476',
  visitorFirstSeen: '2026-10-15',
  leadId: null,
};

/** Real production rows, which is what actually closed the acceptance test. */
const REAL_PROOF = {
  agree: 25,
  sampled: 25,
  campaign: '52708443249234',
  allEnteredOn: PAGE.path,
  allSource: 'free_signup',
};

const POPULATION = {
  taggedSessionsWithLead: 562,
  taggedSessionsWithoutLead: 1262,
  leadsWithCampaign: 909,
  leadsTotal: 25354,
};

/**
 * Claims this ticket made that production contradicted. Listed rather than quietly fixed: the
 * third one is the reason the ladder's ordering was wrong.
 */
const CORRECTIONS = [
  {
    was: '"Change all three CTA hrefs"',
    now: 'Two stored values, three rendered anchors',
    why: 'The page holds two hrefs. The renderer emits a sticky cta-sm plus the two section CTAs, '
      + 'so the ticket counted the rendered page: the right number in the wrong unit.',
  },
  {
    was: '"Apply the same change to start-learning-ai-for-0"',
    now: 'Does not apply as written; left alone',
    why: 'That page already points at /apply, relative and same-origin. Nothing on it goes to '
      + 'refactored.ai. Repointing it would be a destination change, not an origin fix.',
  },
  {
    was: '"It is the gate on every other ad-reporting ticket"',
    now: 'It was not a gate at all',
    why: '25 of 25 recent tagged sessions already joined to a correctly attributed lead, before '
      + 'this change shipped. Attribution was working.',
  },
];

/** Why attribution already worked, and what that tells us about ADS-5. */
const HOSTNAME_INFERENCE = 'Those leads were attributed while the CTA was still an absolute link '
  + 'to www.refactored.ai, which only works if the visitor was already on that host. Landing on '
  + 'enterprise.colaberry.ai would have sent them cross-origin and lost the attribution. So the '
  + 'ads point at www.refactored.ai, which answers ADS-5\'s open question by inference.';

/** Two ways this edit could have gone wrong silently. Both were guarded before the write. */
const TRAPS = [
  {
    trap: 'The public /lp/ route fails closed',
    detail: 'A published row whose content JSONB does not parse serves a 404, not a degraded page. '
      + 'A careless edit here takes the page down rather than making it ugly.',
    guard: 'The rewritten content was parsed with parseLandingPageContent before the write and '
      + 'again after. Relative paths are explicitly allowed by safeUrl, which falls through to '
      + 'startsWith("/") when new URL() throws.',
  },
  {
    trap: 'Sequelize does not notice a mutated JSONB object',
    detail: 'Mutating a nested value in place leaves the field unchanged as far as the model is '
      + 'concerned, so save() is a no-op that still reports success.',
    guard: 'The field was reassigned and marked with changed("content", true), then re-read from '
      + 'the database and re-parsed. Same shape as the utm_medium write in ADS-3.',
  },
];

const VERIFICATION = [
  ['The stored hrefs', 'Read back from the database after the write: 0 absolute, 2 relative, status still published, content still parses.'],
  ['The live page', 'GET on both hostnames: HTTP 200, zero absolute hrefs, three relative CTA anchors each.'],
  ['The origin hop', 'Headless Chromium: cb_visitor_fp written on the landing page, identical value readable after the CTA click, origin preserved.'],
  ['UTM capture', 'A visitor_sessions row carrying TESTCAMP123, joined to the visitor holding exactly the probe fingerprint.'],
  ['The write hop', '25 of 25 recent tagged sessions joined to a lead agree on campaign, all from the landing page, all source free_signup.'],
  ['Scope', 'Exactly one hosted page in the database contained the absolute href; zero remain.'],
];

const NOT_ESTABLISHED = [
  'No signup was submitted through the changed CTAs. The write hop is proven by other users\' real '
    + 'rows, not by a click of ours end to end. That was a deliberate trade: completing the form '
    + 'mints an account, fires a welcome email, and writes across four tables that would then have '
    + 'to be unpicked through a foreign-key graph in production.',
  'The hostname the ads point at is established by inference, not by reading an ad. It is a tight '
    + 'inference, but ADS-5 should confirm it against Ads Manager before anyone depends on it.',
  'This says nothing about cost. The spend ledger is still empty, so no cost-per-signup exists '
    + 'until the Meta token lands (ADS-4) and the daily sync runs (ADS-6).',
  'The 1,262 tagged sessions with no lead are not a defect measured here. They are overwhelmingly '
    + 'people who visited and did not sign up, which is ordinary funnel behavior, not lost '
    + 'attribution.',
];

const NOT_ESTABLISHED_SHORT = [
  'No signup was submitted through the new CTAs; the write hop is proven by other users\' real rows.',
  'The ad hostname is inferred, not read from Ads Manager. ADS-5 should confirm it.',
  'Nothing here measures cost: the spend ledger is still empty until ADS-4 and ADS-6.',
];

/** An observation the probe produced that is worth knowing but was not acted on. */
const FINGERPRINT_NOTE = 'The probe\'s fingerprint resolved to a visitors row created 2026-10-15, '
  + 'not that day. Headless Chromium regenerates one fixed cb_visitor_fp, so every automated run '
  + 'collapses into a single visitor. Harmless for real traffic, which varies; but per-visitor '
  + 'counts should not be read as per-person counts where bots are included.';

const CODE = [
  ['landing_pages.content', 'The two CTA hrefs. Operator content in JSONB, not code: no deploy was involved.'],
  ['routes/publicLandingPageRoutes.ts', 'Serves /lp/:brand/:slug, reads content live, fails closed to 404 on a parse error.'],
  ['schemas/landingPageContentSchema.ts', 'safeUrl: http(s) absolute, or a site-relative path starting with a single slash.'],
];

module.exports = {
  TICKET, TICKET_URL, MEASURED_ON, DB, SESSION,
  PAGE, CHANGE, SCOPE, SIBLING, BROWSER, PROBE, REAL_PROOF, POPULATION,
  CORRECTIONS, HOSTNAME_INFERENCE, TRAPS, VERIFICATION,
  NOT_ESTABLISHED, NOT_ESTABLISHED_SHORT, FINGERPRINT_NOTE, CODE,
};
