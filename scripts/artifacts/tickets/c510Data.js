/**
 * C5.10 - the sponsor outcome dashboard, measured against production.
 *
 * This ticket was built and merged on 2026-10-23 as PR #3318 and then never finished:
 * no artifact was produced, nothing was filed in "05 - Website & Demo", the website
 * manifest the ticket asks for was never filled in, and the ticket carries only the two
 * automatic merge-watcher comments. This file is the evidence half of closing that gap.
 *
 * ## Everything below was read, not recalled
 *
 * Routes and source come from `origin/main` at d450179b. HTTP codes come from live
 * requests on 2026-10-28. The deploy check greps the static bundle inside the running
 * nginx container rather than trusting the merge. The counts come from read-only SELECTs
 * against accelerator_prod.
 *
 * ## The one number that is not here
 *
 * There is no conversion, outcome or satisfaction figure, because there is no cohort to
 * take one from. The ticket says as much in its own "evidence missing" line: outcome
 * data from a real paid cohort. A dashboard about sponsor outcomes that invented one
 * would be the exact failure its "what could make this misleading" question names.
 */

/** Verified 2026-10-28 against the running production stack. */
const OBSERVED = '2026-10-28';

/** The merged build this ticket was closed-but-not-finished on. */
const PR = {
  number: 3318,
  title: 'C5.10: say where every sponsor figure came from, and stop claiming we certify',
  branch: 'workstream/c510-sponsor-provenance',
  mergedAt: '2026-10-23T02:04:07Z',
};

/**
 * The website manifest the ticket asks for, filled in from live checks.
 *
 * `auth` is the field most likely to be misread, so it says both halves: the ROUTE is
 * public and ungated, and the DATA is gated by a magic-link session. A reader who takes
 * only the first half thinks sponsor data leaks; a reader who takes only the second
 * thinks the page is behind a login wall. Neither is true on its own.
 */
const MANIFEST = [
  ['Repo', 'ColaberryEnterprise_AI_LeadershipAccelerator'],
  ['Branch', 'workstream/c510-sponsor-artifact (this PR); #3318 shipped the page'],
  ['Route', '/sponsor/dashboard, mounted at frontend/src/routes/publicRoutes.tsx:56'],
  ['Production URL', 'https://enterprise.colaberry.ai/sponsor/dashboard - HTTP 200'],
  ['Auth / role', 'Route is public with no guard. Data needs a magic-link session: '
    + '?token= is exchanged at GET /api/sponsor/verify and replayed as x-sponsor-token. '
    + 'No session renders sample data plus an email gate.'],
  ['Feature flag', 'None. The page is live to anyone with the URL.'],
  ['Data source', 'GET /api/sponsor/dashboard (backend/src/routes/leadRoutes.ts:109 -> '
    + 'handleGetSponsorDashboard, backend/src/controllers/challengeController.ts:274). '
    + 'Seats read sponsors.seats_purchased and the sponsor_seats table.'],
  ['Deploy evidence', 'Markers "Not yet measured", "Sample data" and "cbsd-prov" found '
    + 'in /usr/share/nginx/html/static inside accelerator-nginx; index.html rebuilt '
    + '2026-10-28 01:59 UTC.'],
  ['Verified at', '2026-10-28, by live HTTP plus a grep of the deployed bundle'],
  ['Rollback', 'git revert the PR on main, then redeploy: on 95.216.199.47, '
    + 'scripts/deploy-prod.sh. The page is additive, so a revert removes the '
    + 'provenance badges and restores the previous copy; no data migration is involved.'],
];

/**
 * The four provenance classes the page defines, and whether each can actually appear.
 *
 * This is the finding the acceptance criterion turns on. All four are defined, styled
 * and given their own glyph, so they ARE visually distinct. Two of them have no render
 * site anywhere in the page, so the distinction cannot be photographed.
 */
const PROVENANCE = [
  { cls: 'measured', glyph: '✔', renders: 0, reachable: true,
    where: 'Four seat cards, when a live payload maps cleanly.',
    note: 'Reachable in code and never reached in production - see the login counts.' },
  { cls: 'sample', glyph: '◆', renders: 4, reachable: true,
    where: 'The same four seat cards, whenever there is no session or the payload '
      + 'does not match the contract.',
    note: 'This is the only state production has ever rendered.' },
  { cls: 'target', glyph: '◎', renders: 0, reachable: false,
    where: 'Nowhere. Defined, styled, never rendered.',
    note: 'Nothing on the page is a target, so nothing is mislabeled as measured. '
      + 'The criterion is satisfied in substance and undemonstrable on the face.' },
  { cls: 'not-yet-measured', glyph: '◷', renders: 0, reachable: false,
    where: 'Nowhere. Defined, styled, never rendered.',
    note: 'The honest home for the outcome metrics a sponsor actually asks about, '
      + 'which the page currently omits rather than marks. Ali’s call.' },
];

/** What carries a provenance badge and what does not. */
const COVERAGE = [
  { area: 'Seats purchased / redeemed / available / reassignable', badged: true,
    detail: 'Each of the four carries its own badge, driven by the live sample flag.' },
  { area: 'Demo Day standouts (name, points, projects)', badged: false,
    detail: 'Three cards with a person’s name, points and project count, and no '
      + 'marker. The section header calls them "ready to present".' },
  { area: 'Participant table (rank, tier, points, projects, prep)', badged: false,
    detail: 'Ten rows of named people and numbers. One sentence under the table says '
      + 'the view is sample; the rows themselves say nothing.' },
  { area: 'Prep-complete count in prose', badged: false,
    detail: 'A computed sentence above the table. Reads "3 of 10" against sample data.' },
];

/**
 * Production state, from read-only SELECTs on accelerator_prod on 2026-10-28.
 *
 * `auditVocabulary` is here because without it the login counts prove nothing: zero
 * successes could mean nobody succeeded or that success is not recorded. The model
 * declares exactly three events and the service emits all three, so a zero in
 * link_generated and link_accessed is an absence of the event, not an absence of
 * instrumentation.
 */
const PRODUCTION = {
  sponsors: 1,
  sponsorRow: {
    company: 'Northwind Trading Co.',
    seatsPurchased: 25,
    plan: 'annual',
    billingStatus: 'paid',
    createdAt: '2026-06-26',
  },
  sponsorSeats: 0,
  seatsRedeemed: 0,
  auditVocabulary: ['link_generated', 'link_accessed', 'link_rejected'],
  auditVocabularySource: 'backend/src/models/SponsorPortalAuditLog.ts:12, all three '
    + 'emitted from backend/src/services/sponsorAuthService.ts',
  linkGenerated: 0,
  linkAccessed: 0,
  linkRejected: 14,
  rejectionReasons: [
    { reason: 'malformed_token', count: 13,
      note: 'No email, no sponsor id, spread one at a time from 10 August to 19 October '
        + 'at 04:10, 05:42, 05:54, 08:02, 21:37, 22:20 - automated probing of a public '
        + 'endpoint, not sponsors mistyping.' },
    { reason: 'unknown_or_expired_token', count: 1,
      note: 'A token fingerprint was recorded, inside the three-second burst on '
        + '10 August that produced the first three rejections. A test, not a sponsor.' },
  ],
};

/** The certification claims this PR removes, and the guard that let them through. */
const CERT_FIX = {
  oldGuard: "expect(code).not.toMatch(/>\\s*Certified\\s*</) and "
    + 'expect(code).not.toMatch(/Not yet certified/)',
  claimsLeftLive: [
    'These builders have shipped enough, climbed high enough, and certified - they are '
      + 'the people to put on stage at Demo Day.',
    'As your team ships projects and certifies, standouts will surface here.',
    '{certifiedCount} of {participants.length} active builders certified so far.',
  ],
  worstOne: 'The third. It is a computed number asserting a credential beside real '
    + 'employee names, and it rendered as "3 of 10 active builders certified so far".',
  newGuard: 'Strip the tokens that legitimately carry the word - the API field '
    + 'cert_earned, the certified flag, the table key - then fail on anything still '
    + 'containing "certif" in any casing.',
  mutationsCaught: 5,
};

/** Known deviations, recorded rather than smoothed over. */
const DEVIATIONS = [
  { what: 'Acceptance criterion 4 reads "PR open, not merged". #3318 was merged on '
      + '2026-10-23, nineteen minutes after it opened.',
    why: 'Recorded as a deviation. It cannot be un-merged, and the criterion exists to '
      + 'keep Ali’s review ahead of the merge, which did not happen here.' },
  { what: 'SponsorDashboardPage.tsx is 781 lines, past the repository’s 500-line '
      + 'hard ceiling, and the rule says the next change splits it first.',
    why: 'This change is subtractive - it removes claims and adds no new surface - so '
      + 'it does not grow the file. The split is still owed and is a refactor Ali has '
      + 'not asked for; raising it here rather than doing it silently.' },
  { what: 'Frontend jest cannot run in this worktree.',
    why: 'The suite’s assertions were executed directly by a runner that also '
      + 'mutation-tests the new guard. CI remains the gate.' },
];

module.exports = {
  OBSERVED, PR, MANIFEST, PROVENANCE, COVERAGE, PRODUCTION, CERT_FIX, DEVIATIONS,
};
