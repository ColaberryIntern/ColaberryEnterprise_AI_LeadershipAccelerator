/**
 * v2Demo.ts — the guided demo walkthrough (C5.9).
 *
 * WHY THIS IS CONTENT AND NOT A LIVE VIEW
 *
 * The demo exists so a prospect can see the product work without a live customer tenant.
 * Every public V2 page already renders from constants and fetches nothing, and that is not
 * a shortcut here, it is the mechanism: a page that cannot reach the backend cannot leak a
 * customer. `/demo` imports no API client, so "no real customer data reachable" is a
 * property of the module graph rather than a promise in a review.
 *
 * WHAT IT FOLLOWS
 *
 * The C4.4 storyboard (`scripts/artifacts/tickets/c45Data.js`), whose journey is: "A single
 * learner story going from unverified to verified against a real commit." Its stated reason
 * is worth repeating, because it governs what this page must NOT become: "A tour of the
 * platform would show more and prove less."
 *
 * WHERE THIS DEPARTS FROM THE STORYBOARD, DELIBERATELY
 *
 * In the live demo, seven of the eight frames are REAL and one is SAMPLE. Here every step is
 * SAMPLE, because there is no live tenant behind a public page and showing a real learner's
 * project to the open internet is not a thing we may do. The storyboard's own rule survives
 * the change and is the acceptance criterion for this page: every screen says what it is.
 *
 * WHAT IS NOT HERE
 *
 * No figures. The narration in the storyboard quotes counts ("345 stories verified across
 * 29 projects") that have no row in the C0.6 claim registry. They are true of our own
 * database and are fine for Ali to say on a call where he can date them, but on a public
 * page an unregistered number is a claim we cannot stand behind. So the steps describe the
 * mechanism and the registry supplies every assertion.
 */

/** The one sample record the whole walkthrough follows, so a reader tracks one thing. */
export interface DemoRecord {
  readonly storyRef: string;
  readonly title: string;
  readonly commitSha: string;
  readonly criteriaMet: number;
  readonly criteriaTotal: number;
}

export const DEMO_RECORD: DemoRecord = {
  storyRef: 'STORY-1042',
  title: 'Route inbound support email by intent',
  commitSha: 'a3f91c2',
  criteriaMet: 3,
  criteriaTotal: 3,
};

export interface DemoStep {
  readonly n: number;
  /** Short label for the step rail. */
  readonly label: string;
  /** What a viewer is looking at. */
  readonly screen: string;
  /** Why that screen matters. This is the argument, not the UI. */
  readonly meaning: string;
  /**
   * The sample fragment shown beside the step. Every one of these is invented, which is why
   * every step renders a Sample data badge next to it.
   */
  readonly detail: readonly string[];
}

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    n: 1,
    label: 'The board',
    screen: 'A project board part-way through an engagement.',
    meaning: 'Each row is something a person committed to delivering. Nothing here is a '
      + 'course module or a lesson completed. The unit of work is a claim about what '
      + 'somebody built.',
    detail: [
      `${DEMO_RECORD.storyRef} · ${DEMO_RECORD.title} · unverified`,
      'STORY-1043 · Summarize a ticket thread for handoff · unverified',
      'STORY-1039 · Classify refund requests · verified',
    ],
  },
  {
    n: 2,
    label: 'The claim',
    screen: 'One story, expanded, in its unverified state.',
    meaning: 'The learner says they have done it, and at this point the platform does not '
      + 'believe them. That is the entire point. Every other platform marks this complete '
      + 'because somebody ticked a box.',
    detail: [
      `${DEMO_RECORD.storyRef} · ${DEMO_RECORD.title}`,
      'State: unverified',
      `Acceptance criteria: 0 of ${DEMO_RECORD.criteriaTotal} checked`,
    ],
  },
  {
    n: 3,
    label: 'The commit',
    screen: 'The repository, with the matched commit highlighted.',
    meaning: 'The pipeline reads the commit on push and checks it against what the story '
      + 'asked for. There is no queue and no reviewer deciding whether to believe it.',
    detail: [
      `commit ${DEMO_RECORD.commitSha}`,
      `matched to ${DEMO_RECORD.storyRef}`,
      'checked on push, no manual step',
    ],
  },
  {
    n: 4,
    label: 'The state change',
    screen: 'The story flipping to verified.',
    meaning: 'The difference between those two states is the difference between a completion '
      + 'report and evidence. One is a person saying so; the other is a machine having '
      + 'checked.',
    detail: [
      `${DEMO_RECORD.storyRef} · State: verified`,
      `Acceptance criteria: ${DEMO_RECORD.criteriaMet} of ${DEMO_RECORD.criteriaTotal} checked`,
      `against commit ${DEMO_RECORD.commitSha}`,
    ],
  },
  {
    n: 5,
    label: 'The audit row',
    screen: 'The audit record written behind the state change.',
    meaning: 'Every write is audited, so the evidence outlives the conversation it was shown '
      + 'in. A number you cannot trace back to the event that produced it is a number you '
      + 'are asking someone to take on trust.',
    detail: [
      'event: story.verified',
      `subject: ${DEMO_RECORD.storyRef}`,
      `evidence: commit ${DEMO_RECORD.commitSha}`,
    ],
  },
  {
    n: 6,
    label: 'The project',
    screen: 'The project view, with the full set of verified stories.',
    meaning: 'This is the shape of a finished engagement: not a completion rate, but a list '
      + 'of specific things that were built and checked, each one traceable on its own.',
    detail: [
      'verified stories, each with its own commit',
      'unverified stories still shown as unverified',
      'nothing rolled up into a single percentage',
    ],
  },
  {
    n: 7,
    label: 'The sponsor view',
    screen: 'The report a sponsor receives.',
    meaning: 'The shape of what a sponsor gets. We do not have a customer cohort to show '
      + 'you, and we would rather say that than dress our own data up as yours.',
    detail: [
      'per-person record of what was built',
      'each line traceable to its commit',
      'no aggregate score standing in for the detail',
    ],
  },
  {
    n: 8,
    label: 'What you saw',
    screen: 'Back to the verified story.',
    meaning: 'A person said they built something, the system went and checked, and the '
      + 'checking left a record. That is the whole claim, and it is the one thing here you '
      + 'can verify for yourself afterwards rather than taking from us.',
    detail: [
      `${DEMO_RECORD.storyRef} · verified`,
      `commit ${DEMO_RECORD.commitSha}`,
      'the record outlives the demo',
    ],
  },
];

/**
 * The standing notice. Rendered at the top of the page AND repeated per step.
 *
 * The acceptance criterion is "sample data labelled on every screen, not just once",
 * because a single banner scrolls away and a screenshot of one step then looks like a
 * customer's real data. That is the exact defect the Sample data badge was written for.
 */
export const DEMO_NOTICE = 'Every screen below is sample data. No customer information '
  + 'appears on this page, and this page reads nothing from our systems.';

/** Shown where a visitor would otherwise assume the walkthrough is a live product view. */
export const DEMO_LIMITS: readonly string[] = [
  'These are illustrations of the flow, not screenshots of a running tenant.',
  'The story, the commit and the criteria counts are invented for this walkthrough.',
  'Our first cohort has not finished, so there is no customer outcome to show yet.',
];
