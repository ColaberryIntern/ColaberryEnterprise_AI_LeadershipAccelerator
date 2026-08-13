/**
 * v2Roadmap.ts -- the 12-week path, carried over from the live site.
 *
 * Shown where the class itself is discussed, per Ali. It is a description of how
 * the programme is structured, not a claim about anyone's outcome, so it needs
 * no registry gating -- with one exception: the credential at the end is named
 * through `credential.cca.safe` (certification PREPARATION, credential issued by
 * the certifying body) rather than the blocked designation the live site prints.
 *
 * Two lanes run alongside the weeks because that is the point of the diagram:
 * the project starts before the teaching finishes, and the certification track
 * starts later still, so they converge rather than running end to end.
 */

export interface RoadmapPhase {
  readonly n: number;
  readonly title: string;
  /** Inclusive week range this phase covers. */
  readonly from: number;
  readonly to: number;
}

export const ROADMAP_PHASES: readonly RoadmapPhase[] = [
  { n: 1, title: 'Build your AI foundation', from: 1, to: 3 },
  { n: 2, title: 'Create your AI team', from: 4, to: 6 },
  { n: 3, title: 'Connect AI to the real world', from: 7, to: 9 },
  { n: 4, title: 'Design AI that scales', from: 10, to: 12 },
];

export interface RoadmapLane {
  readonly key: string;
  readonly label: string;
  /** Week the lane opens. */
  readonly startsWeek: number;
  readonly detail: string;
}

export const ROADMAP_LANES: readonly RoadmapLane[] = [
  {
    key: 'project',
    label: 'Project lane',
    startsWeek: 3,
    detail:
      'A real build on your own workflow, started while the teaching is still running rather ' +
      'than bolted on at the end.',
  },
  {
    key: 'certification',
    label: 'Certification lane',
    startsWeek: 7,
    detail:
      'Preparation for the architect credential runs alongside the last six weeks, so the ' +
      'exam is not a separate project afterwards.',
  },
];

export const ROADMAP_WEEKS = 12;

/** What a learner has at the end. Deliberately about artifacts, not status. */
export const ROADMAP_OUTCOME = {
  title: 'What you finish with',
  items: [
    'A deployed build running on one of your own workflows',
    'Evidence records, evaluations and reviewed artifacts attached to your name',
    'Readiness measured from that evidence rather than from attendance',
  ],
} as const;
