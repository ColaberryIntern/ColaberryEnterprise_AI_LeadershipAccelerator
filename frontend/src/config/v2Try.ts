/**
 * v2Try.ts -- content for the free-workspace front door at /v2/try.
 *
 * WHY THIS PAGE EXISTS RATHER THAN A REWRITE OF /try
 * The live free workspace (`ManagementPreviewPage`, routed at /try) is real,
 * working, and -- checked directly, not assumed -- already labels its own sample
 * data in the rendered UI ("7 members - sample data", "Free preview with sample
 * data, shaped to the real metrics we capture"). It did not need replacing. What
 * was missing was anything in V2 that set expectations before sending someone
 * there, and any statement of where free stops and paid starts.
 *
 * WHAT IS DELIBERATELY ABSENT: A FEATURE COMPARISON TABLE
 * The obvious design here is a free-vs-paid matrix. There is no verified source
 * for which capabilities sit on which side of that line -- the registry carries
 * the prices and the free-tier claim, not an entitlement breakdown. Building the
 * matrix would mean inventing the boundary and publishing it as fact, so this
 * page states only what is evidenced and links to the live pricing page for the
 * rest.
 *
 * ROUTE SCOPING
 * This page declares route '/try', which is in the approved list for
 * `pricing.free`. It is NOT approved for `pricing.individual.annual`, so the
 * monthly figure cannot render here even if someone adds a <Claim> for it. That
 * is the registry working as intended, not an oversight.
 */

export interface FreeInclusion {
  readonly title: string;
  readonly detail: string;
}

/**
 * What the free account actually gives you.
 *
 * Every entry below is taken from what the live workspace itself states or
 * demonstrably does. Nothing here is aspirational.
 */
export const FREE_INCLUDES: readonly FreeInclusion[] = [
  {
    title: 'Both perspectives, one account',
    detail:
      'The learner experience your team would use, and the management view of how they are ' +
      'progressing. Most tools give a manager one or the other.',
  },
  {
    title: 'Shaped to the real measurements',
    detail:
      'The workspace opens on sample data arranged in exactly the metrics the platform ' +
      'captures, so you are evaluating the real shape of the thing rather than a mock-up.',
  },
  {
    title: 'Your team replaces the sample',
    detail:
      'Invite people and the sample gives way to their actual progress. Nothing you see ' +
      'before that point is anyone real.',
  },
];

/** What to expect on arrival, so the sample data is never mistaken for a claim. */
export const ARRIVAL_NOTE =
  'The workspace opens with sample data and says so on screen. That is a demonstration of ' +
  'the format, not a customer, and not a result.';

export interface PaidBoundary {
  readonly title: string;
  readonly detail: string;
  /** Internal V2 route, or a live route outside the V2 shell. */
  readonly href: string;
  readonly linkLabel: string;
  /** True when the destination is outside the V2 shell. */
  readonly external?: boolean;
}

/**
 * Where free stops. Deliberately two entries and no figures: the individual
 * subscription price is registry-approved for /pricing and '/', not for this
 * route, and engagement pricing is "scoped on a call" by decision.
 */
export const PAID_BOUNDARIES: readonly PaidBoundary[] = [
  {
    title: 'Subscriptions, for individuals and teams',
    detail:
      'Ongoing access for people who are doing the work, rather than evaluating it. Current ' +
      'rates are published in full on the pricing page.',
    href: '/pricing',
    linkLabel: 'See pricing',
    external: true,
  },
  {
    title: 'Engagements, when you want the work done with you',
    detail:
      'Architects working alongside your team on a specific workflow. Scoped to what you ' +
      'actually need, which is why there is no list price.',
    href: '/v2/services',
    linkLabel: 'Compare engagements',
  },
];
