/**
 * C5.7 - the higher education page. THE single source for both PDFs.
 *
 * ## Why this artifact exists after the code shipped
 *
 * The page was built and merged on 18 October as PR #3187, and the ticket's automated
 * watcher posted both events. What never happened is the artifact, and the thing the
 * ticket actually asks for last: "Production URL recorded after deploy". The watcher says
 * so itself: "Merged is not deployed. This watcher reads pull request state only; it has no
 * deploy signal."
 *
 * So this document closes the gap between merged and verified, and the method it used is
 * the part worth keeping.
 *
 * ## THE TRAP: ON A SINGLE-PAGE APP, A 200 PROVES NOTHING
 *
 * Measured on 2026-10-19 against the production host:
 *
 *     /higher-education              -> 200
 *     /definitely-not-a-page-qqq111x -> 200
 *
 * Both. The router serves index.html for every path, so the status code cannot tell a live
 * route from one that was never built. Any "production verified" claim resting on a 200
 * from an SPA is worthless, and would have passed here while proving nothing.
 *
 * The honest channel is the SERVED JAVASCRIPT BUNDLE, validated in both directions: strings
 * unique to this page must be present, AND strings from work that is NOT merged must be
 * absent. The absent half is what makes the present half mean something, because a grep
 * that matches everything matches nothing.
 */

const AS_OF = '2026-10-19';

/* ── what shipped ─────────────────────────────────────────────────────────── */

const PAGE = {
  route: '/higher-education',
  productionUrl: 'https://enterprise.colaberry.ai/higher-education',
  auth: 'Public. No authentication, no role requirement.',
  featureFlag: 'None. The page is gated by `ready: true` in v2Segments.ts, which is content, '
    + 'not a runtime flag.',
  dataSource: 'frontend/src/config/v2Segments.ts. The page fetches nothing.',
  component: 'frontend/src/pages/publicV2/SegmentPageV2.tsx, rendered for slug '
    + '"higher-education"',
  pr: 3187,
  prMergedAt: '2026-10-18T15:56:42Z',
  mergeCommit: '696ab2bd973beeb621dff0354c2548ea121fed0b',
  rollback: 'Set `ready: false` on the higher-education entry in v2Segments.ts and deploy. '
    + 'The route is generated from readySegments(), so the page stops being mounted without '
    + 'a routing change or a revert.',
};

/* ── the production verification, in both directions ──────────────────────── */

const DEPLOYED_COMMIT = 'b349fb2fffb7dce5030c32c1d6375f162f16f9f7';
const BUNDLE = { path: '/static/js/main.78e9b2c9.js', bytes: 1776696 };

/**
 * Probes run against the live host. `expect` is the whole point of the table.
 *
 * The PRESENT rows alone would be a one-way check, and a one-way check on a bundle that
 * contains the entire site is close to meaningless. The ABSENT rows are drawn from C5.9,
 * which is written but unmerged, so if they ever appear the probe is reading something
 * other than what is deployed.
 */
const PROBES = [
  { expect: 'present', needle: 'higher-education', what: 'the segment slug' },
  { expect: 'present', needle: 'AI readiness for continuing education', what: 'its SEO title' },
  { expect: 'present', needle: 'need evidence, not attendance', what: 'a phrase unique to this page' },
  { expect: 'absent', needle: 'STORY-1042', what: 'the C5.9 demo record, written but unmerged' },
  { expect: 'absent', needle: 'cbv2-demo__panelbar', what: 'a C5.9 CSS class, unmerged' },
  { expect: 'absent', needle: 'zzz-not-a-real-string-qqq111x', what: 'a string that exists nowhere' },
];

const STATUS_CODE_TRAP = {
  live: { path: '/higher-education', status: 200 },
  nonsense: { path: '/definitely-not-a-page-qqq111x', status: 200 },
  lesson: 'Identical. The status code channel cannot prove a route exists on this host, so '
    + 'it is reported and then set aside rather than used as evidence.',
};

/* ── the acceptance criteria ──────────────────────────────────────────────── */

const CRITERIA = [
  {
    c: 'Page is actually routed, proven by the route tree not just the file',
    met: true,
    evidence: 'App.tsx maps readySegments() to routes inside the PublicLayoutV2 block, and '
      + 'the higher-education entry carries ready: true. SegmentPageV2.test.tsx reads '
      + 'App.tsx off disk and asserts the mapping, because a page under pages/ can look '
      + 'finished and be unreachable.',
  },
  {
    c: 'Every claim traces to the registry',
    met: true,
    evidence: 'The page renders exactly one claim, positioning.primary, through <Claim>, '
      + 'which returns null when a claim may not ship. There is no way to pass raw copy '
      + 'through that component, so an unregistered assertion cannot be rendered by it.',
  },
  {
    c: 'CTA instrumented',
    met: true,
    // Quotes the live analytics event name verbatim; renaming it is a separate decision.
    evidence: 'trackEvent("cta_click", { cta_name: "segment_enquiry", segment }) fires on ' // spelling-exempt
      + 'the single call to action, and the link carries data-track with the segment slug.',
  },
  {
    c: 'PR open, not merged',
    met: false,
    evidence: 'Overtaken by events: PR 3187 was merged on 18 October, before this artifact '
      + 'was written. Recorded as not met rather than quietly reinterpreted.',
  },
  {
    c: 'Production URL recorded after deploy',
    met: true,
    evidence: 'Verified on 2026-10-19 against the deployed bundle, in both directions. This '
      + 'is the criterion the ticket was still open for.',
  },
];

/* ── the one thing the page does NOT do ───────────────────────────────────── */

const LIMITS = [
  // The quoted phrase is the ticket's own wording. Correcting someone else's spelling
  // inside a quotation makes it not a quotation.
  'One call to action, to /contact. The ticket\'s stated metric is "visitors from this '
    + 'segment reach an enquiry", and the page cannot report on that: nothing yet joins a ' // spelling-exempt
    + 'cta_click to a submitted form.',
  'The page is content in a config file, not a CMS entry. Changing copy is a deploy.',
  'No screenshot is attached. The verification here is the served bundle, which is stronger '
    + 'than a screenshot because a screenshot cannot distinguish a live route from a local '
    + 'build of one.',
];

/* ── assertions ───────────────────────────────────────────────────────────── */

/** The verification must be two-way. A present-only probe set is not evidence. */
function assertProbesAreTwoWay() {
  const present = PROBES.filter((p) => p.expect === 'present').length;
  const absent = PROBES.filter((p) => p.expect === 'absent').length;
  if (present < 2) throw new Error('C5.7: fewer than two PRESENT probes');
  if (absent < 2) {
    throw new Error('C5.7: a verification with no ABSENT control proves nothing. A grep that '
      + 'matches everything matches nothing.');
  }
  return { present, absent };
}

/**
 * The status-code trap must stay recorded.
 *
 * It is the reason this verification was done the hard way, and dropping it would leave a
 * future reader thinking a 200 was the evidence.
 */
function assertStatusCodeTrapIsStated() {
  if (STATUS_CODE_TRAP.live.status !== STATUS_CODE_TRAP.nonsense.status) {
    throw new Error('C5.7: the trap is that both paths return the same status. If they now '
      + 'differ, re-measure and rewrite this section rather than keeping a stale lesson.');
  }
  return STATUS_CODE_TRAP.live.status;
}

/** An unmet criterion must stay unmet. The temptation is to reinterpret it. */
function assertUnmetCriteriaAreAdmitted() {
  const unmet = CRITERIA.filter((c) => !c.met);
  for (const c of unmet) {
    if (!/Overtaken|not met|cannot/i.test(c.evidence)) {
      throw new Error(`C5.7: "${c.c}" is marked unmet but the evidence does not say so`);
    }
  }
  return { total: CRITERIA.length, met: CRITERIA.length - unmet.length, unmet: unmet.length };
}

/** The manifest the ticket asks for must be complete. */
function assertManifestIsComplete() {
  const required = ['route', 'productionUrl', 'auth', 'featureFlag', 'dataSource', 'pr',
    'prMergedAt', 'rollback'];
  for (const key of required) {
    if (!PAGE[key] && PAGE[key] !== 0) {
      throw new Error(`C5.7: the manifest is missing "${key}"`);
    }
  }
  return required.length;
}

module.exports = {
  AS_OF,
  PAGE,
  DEPLOYED_COMMIT,
  BUNDLE,
  PROBES,
  STATUS_CODE_TRAP,
  CRITERIA,
  LIMITS,
  assertProbesAreTwoWay,
  assertStatusCodeTrapIsStated,
  assertUnmetCriteriaAreAdmitted,
  assertManifestIsComplete,
};
