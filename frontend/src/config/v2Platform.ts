/**
 * v2Platform.ts — content for the Platform Showroom.
 *
 * TWO HARD RULES, both from the capability inventory (IMPLEMENTATION_STATUS 1.1):
 *
 * 1. Only surfaces that EXIST may be depicted. The four-view console, the
 *    Opportunity Lab backend, the Proof/evidence taxonomy and the Deal Workspace
 *    are all `unbuilt` and are absent here. Their claims are registry-blocked on
 *    capability, so adding them would render nothing anyway.
 *
 * 2. Experience Studio is live but ADMIN-ONLY. It may be described as a
 *    capability; its surface must never be exposed publicly.
 *
 * The sample figures below deliberately mirror the REAL metric contract in
 * frontend/src/services/orgApi.ts (OrgOverview) rather than inventing a shape,
 * so the showroom cannot drift from the product it depicts. Note `attendance_rate`
 * is 0..1 in the contract and is presented as a percentage here.
 */

export interface ShowroomSurface {
  readonly key: string;
  readonly label: string;
  /** Registry claim key gating whether this may be shown at all. */
  readonly claimKey: string;
  readonly blurb: string;
  /** Where this actually lives in the product today. */
  readonly livesAt: string;
  readonly stats: readonly { readonly value: string; readonly label: string }[];
  readonly rows: readonly { readonly label: string; readonly pct: number }[];
}

export const SHOWROOM_SURFACES: readonly ShowroomSurface[] = [
  {
    key: 'readiness',
    label: 'Executive AI readiness',
    claimKey: 'surface.readiness.rollup',
    blurb:
      'What a CIO or Chief People Officer sees: where the organization stands, how fast it ' +
      'is moving, and the evidence each number rests on.',
    livesAt: 'Portal, company view',
    stats: [
      { value: '63%', label: 'Average architect readiness' },
      { value: '1,640', label: 'Builder XP this week' },
      { value: '12', label: 'Evidence records this week' },
      { value: '9', label: 'Evaluations passed this month' },
    ],
    rows: [
      { label: 'Operations', pct: 74 },
      { label: 'Finance', pct: 58 },
      { label: 'Customer Ops', pct: 47 },
      { label: 'Engineering', pct: 81 },
    ],
  },
  {
    key: 'roster',
    label: 'Team roster and ladder',
    claimKey: 'surface.readiness.rollup',
    blurb:
      'Every person on the roster, their level on the nine-rank ladder, readiness, weekly ' +
      'builder XP and streak. Click through to the evidence for any individual.',
    livesAt: 'Portal, company roster and member drilldown',
    stats: [
      { value: '9', label: 'Ladder ranks, Builder to Architect' },
      { value: '7', label: 'Level-ups in the last 30 days' },
      { value: '86%', label: 'Live-session attendance' },
      { value: '17', label: 'Projects and artifacts shipped' },
    ],
    rows: [
      { label: 'Builder to Practitioner', pct: 62 },
      { label: 'Developer to Senior', pct: 44 },
      { label: 'Candidate to Architect', pct: 23 },
    ],
  },
  {
    key: 'workspace',
    label: 'Free company workspace',
    claimKey: 'surface.free.workspace',
    blurb:
      'One free account gives a manager both perspectives at once: the learner experience and ' +
      'their own organization view, with sample data until their team fills it.',
    livesAt: 'The free workspace at /try',
    stats: [
      { value: '2', label: 'Perspectives in one account' },
      { value: '0', label: 'Credit card required' },
      { value: '1', label: 'Workflow you can map' },
      { value: 'Free', label: 'To invite your team' },
    ],
    rows: [
      { label: 'Explore free', pct: 100 },
      { label: 'Invite your team', pct: 66 },
      { label: 'Activate licences', pct: 33 },
    ],
  },
];

/**
 * Experience Studio is live but admin-gated. Described, never exposed — the
 * brief forbids surfacing administrative or internal tools publicly.
 */
export const STUDIO_DESCRIPTION = {
  label: 'Experience Studio',
  blurb:
    'Behind the learner-facing surfaces sits a component pipeline: each learning experience ' +
    'is designed, rendered, generated, evaluated and reflected on as a governed component, ' +
    'with an approval step before anything reaches a learner.',
  note:
    'Experience Studio is an internal authoring surface. It is described here because it ' +
    'explains how the curriculum is governed, and is deliberately not shown or linked.',
} as const;

/** How readiness is earned — the explainer that separates this from a training report. */
export const DATA_EARNED: readonly { readonly title: string; readonly detail: string }[] = [
  {
    title: 'Evidence records',
    detail:
      'Artifacts, commits and implementation notes attached to a real project, not a ' +
      'checkbox on a course.',
  },
  {
    title: 'Evaluations',
    detail: 'Scored against defined criteria, with a pass threshold and a visible result.',
  },
  {
    title: 'Reviewed artifacts',
    detail: 'A human reviews the shipped work before it counts toward readiness.',
  },
  {
    title: 'Project activity',
    detail: 'Sustained building across weeks, rather than a single burst before a deadline.',
  },
  {
    title: 'Live participation',
    detail: 'Attendance at working sessions where builders present and defend decisions.',
  },
  {
    title: 'Promotion gates',
    detail:
      'Movement up the ladder requires the evidence, evaluation and attendance thresholds ' +
      'to be met, not a manager marking someone complete.',
  },
] as const;
