/**
 * v2Journey - the five-stage model behind /how-it-works, and the accelerator offer.
 *
 * WHY THE STAGES CARRY A `delivery` FIELD. The C2.2 service blueprint audited what the
 * platform can actually evidence, stage by stage, and the answer is not uniform. Five of
 * its ten stages are shipped capability carrying real volume. Two are gaps, and both sit at
 * day 80 to 90: deployment candidate selection has no capability at all, and the executive
 * impact report has no generator.
 *
 * Both tickets say "never describe roadmap as live", so the distinction has to survive into
 * the page rather than be smoothed over in the copy. `delivery: 'platform'` means software
 * does it today. `delivery: 'people'` means the engagement does it and a person does the
 * work. Neither is a weakness; claiming the first where only the second is true would be.
 *
 * A test asserts no stage marked `people` is described in platform language, and that the
 * two the blueprint named as gaps are not marked `platform`.
 */

export type Delivery = 'platform' | 'people';

export interface JourneyStage {
  key: string;
  /** One word, as the five-stage model names it. */
  name: string;
  /** What happens, in the buyer's terms. */
  summary: string;
  /** How it is actually delivered today. See the note above. */
  delivery: Delivery;
  /** What the buyer gets out of this stage. */
  output: string;
}

export const JOURNEY: JourneyStage[] = [
  {
    key: 'learn',
    name: 'Learn',
    summary:
      'Every participant is measured before anything changes, then follows a path aimed at '
      + 'building rather than at finishing a course.',
    delivery: 'platform',
    output: 'A capability baseline per person, so the claim at the end has a before.',
  },
  {
    key: 'build',
    name: 'Build',
    summary:
      'Each participant builds working software against one of your own named business '
      + 'problems, in their own repository.',
    delivery: 'platform',
    output: 'Working code, committed, with the work visible as it happens.',
  },
  {
    key: 'prove',
    name: 'Prove',
    summary:
      'Each piece of work is checked against the acceptance criteria the task set, and the '
      + 'award links to the commit that satisfied it.',
    delivery: 'platform',
    output:
      'Evidence a stranger can open without an account and without taking our word for it.',
  },
  {
    key: 'deploy',
    name: 'Deploy',
    summary:
      'We work with your sponsor to choose which builds are worth taking further, and what '
      + 'it would take to run them for real.',
    delivery: 'people',
    output: 'A shortlist your sponsor agrees with, and an honest account of the gap.',
  },
  {
    key: 'manage',
    name: 'Manage',
    summary:
      'A written account at the end of what each participant built and what changed against '
      + 'the baseline you supplied.',
    delivery: 'people',
    output: 'A report your sponsor can take to their own leadership.',
  },
];

/**
 * The two stages the C2.2 audit found no platform capability for. Named here so the test
 * can assert they are never marked `platform`, rather than trusting a reader to remember.
 */
export const BLUEPRINT_GAPS = ['deploy', 'manage'];

/* ------------------------------------------------------------------ *
 * The accelerator offer
 * ------------------------------------------------------------------ */

export interface OfferPoint {
  h: string;
  body: string;
}

/**
 * NO DURATION IS WRITTEN HERE.
 *
 * The ticket is called "90-Day Accelerator" and the C2.2 blueprint is a ninety-day service
 * blueprint, but the ONLY verified duration in the C0.6 registry is `program.duration`,
 * whose public wording is "12 weeks", evidenced by `curriculum_blueprints` weeks 0 to 12
 * and by the live site. Twelve weeks is 84 days, not 90.
 *
 * CLM-029 is the control: a figure with no source row in the registry does not go out. So
 * the page renders the registry's claim and no other duration, and a test asserts the
 * string "90 day" never appears. If ninety is the number we want to sell, it needs a
 * registry row, and that is a decision rather than a copy edit.
 */
export const OFFER: OfferPoint[] = [
  {
    h: 'Your own problems, not case studies',
    body:
      'Participants build against business problems you name, owned by people on your side '
      + 'who can answer questions while the build is happening.',
  },
  {
    h: 'Evidence per person',
    body:
      'You get a record of what each named participant built, linked to the commit behind '
      + 'it, rather than a completion rate for the cohort.',
  },
  {
    h: 'A baseline, measured twice',
    body:
      'Capability is measured in the first week and again at the end, with the same '
      + 'instrument, so the change is something you can see rather than something we assert.',
  },
];

/** What the engagement needs from the customer. Straight from C7.2's obligations. */
export const OFFER_NEEDS: string[] = [
  'A named executive sponsor who meets us monthly.',
  'Three to ten real business problems in writing, each with a named owner.',
  'Named participants with their managers signed up to the time.',
  'Agreement that we may measure the outcome and publish a named reference.',
];
