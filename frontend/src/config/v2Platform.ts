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

/**
 * Who a surface is for.
 *
 * The showroom listed every surface in one undifferentiated row, so a visitor
 * could not tell which screens their executives would live in and which their
 * workforce would. Those are two different buying questions — "what will I see?"
 * and "what will my people do all day?" — and answering them in one flat list
 * answered neither.
 */
export type SurfaceAudience = 'management' | 'team';

export const AUDIENCE_LABEL: Record<SurfaceAudience, string> = {
  management: 'What management sees',
  team: 'What your team works in',
};

export const AUDIENCE_BLURB: Record<SurfaceAudience, string> = {
  management:
    'The rollups, the roster and the evidence behind every number — for the people accountable ' +
    'for whether this is working.',
  team: 'The screens your people are actually in, where the evidence gets produced.',
};

export interface ShowroomSurface {
  readonly key: string;
  readonly label: string;
  readonly audience: SurfaceAudience;
  /** Registry claim key gating whether this may be shown at all. */
  readonly claimKey: string;
  readonly blurb: string;
  /** Where this actually lives in the product today. */
  readonly livesAt: string;
  /**
   * A real capture of this surface, if one has been taken and vetted.
   * Optional on purpose: a surface with no verified capture shows its figures
   * alone rather than borrowing a picture of a different screen.
   */
  readonly shot?: { readonly src: string; readonly alt: string };
  readonly stats: readonly { readonly value: string; readonly label: string }[];
  readonly rows: readonly { readonly label: string; readonly pct: number }[];
}

export const SHOWROOM_SURFACES: readonly ShowroomSurface[] = [
  {
    key: 'readiness',
    label: 'Executive AI readiness',
    audience: 'management',
    claimKey: 'surface.readiness.rollup',
    blurb:
      'What a CIO or Chief People Officer sees: where the organization stands, how fast it ' +
      'is moving, and the evidence each number rests on.',
    livesAt: 'Portal, company view',
    shot: {
      src: '/site-v2/shot-readiness.png',
      alt:
        'The architect readiness trajectory panel: 63 percent average readiness, a rising ' +
        'eight-week trend line, and tiles for builder XP, evidence shipped, projects shipped ' +
        'and attendance.',
    },
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
    audience: 'management',
    claimKey: 'surface.readiness.rollup',
    blurb:
      'Every person on the roster, their level on the nine-rank ladder, readiness, weekly ' +
      'builder XP and streak. Click through to the evidence for any individual.',
    livesAt: 'Portal, company roster and member drilldown',
    shot: {
      src: '/site-v2/shot-roster.png',
      alt:
        'Team accomplishments beside the roster: promotions, validated evidence, evaluations ' +
        'passed and streaks on the left; on the right each person with their ladder rank, ' +
        'readiness percentage and weekly builder XP.',
    },
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
    /*
     * The screen a team member actually opens every day. Added because the
     * showroom described the MANAGER's views three times over and never showed
     * the one the workforce lives in -- "the platform your team logs into" had
     * no picture of the platform your team logs into.
     *
     * Captured from a real account well into the July cohort, because the
     * skills radar is a flat dot on a new account and says nothing. Identity
     * masked before capture; the numbers are real.
     */
    key: 'today',
    label: 'The daily learner view',
    audience: 'team',
    claimKey: 'surface.readiness.rollup',
    blurb:
      'What each person on your team opens: the next step waiting for them, the skills they ' +
      'have actually verified, their streak, and the next live class.',
    livesAt: 'Portal, Today',
    shot: {
      src: '/site-v2/shot-today.png',
      alt:
        'The daily view: a command centre with points and readiness dials, an AI architecture ' +
        'skills radar at 52 percent verified across ten competencies, a seventeen-day streak, ' +
        'the live community schedule and the next class.',
    },
    stats: [
      { value: '10', label: 'Architecture competencies tracked' },
      { value: '52%', label: 'Verified on this example account' },
      { value: '17', label: 'Day streak' },
      { value: '1', label: 'Next step, always named' },
    ],
    rows: [
      { label: 'Prompting', pct: 60 },
      { label: 'RAG', pct: 60 },
      { label: 'Agents and MCP', pct: 60 },
      { label: 'LLM core', pct: 36 },
    ],
  },
  {
    /*
     * The drill-through Ali asked for: what a manager sees after clicking a
     * person in Team Accomplishments or "Where your team sits". It was reachable
     * in the product and invisible on the marketing site, which made the roster
     * look like a leaderboard rather than something you can interrogate.
     */
    key: 'individual',
    label: 'Team, individual view',
    audience: 'management',
    claimKey: 'surface.readiness.rollup',
    blurb:
      'Click any person and the evidence opens: what they scored, what is left before they ' +
      'promote, the competencies they have built, and everything they have shipped.',
    livesAt: 'Portal, company roster, member drilldown',
    shot: {
      src: '/site-v2/shot-individual.png',
      alt:
        'One person’s detail: knowledge growth with an entry check score, architect ' +
        'readiness with the exact promotion gaps listed, competency confidence across five ' +
        'streams, counts of projects, deliverables and instructor reviews, and skill XP by stream.',
    },
    stats: [
      { value: '5', label: 'Competency streams scored' },
      { value: '0/8', label: 'Ladder rank, shown honestly' },
      { value: '3', label: 'Deliverables on this example' },
      { value: '1', label: 'Instructor review' },
    ],
    rows: [
      { label: 'Learning XP', pct: 39 },
      { label: 'Builder XP', pct: 61 },
      { label: 'Entry knowledge check', pct: 80 },
    ],
  },
  {
    /*
     * The story-build system: idea -> gated plan -> the student builds it with
     * Claude Code -> the platform VERIFIES against their repo.
     *
     * EVERY WORD HERE IS BOUNDED BY WHAT THE PIPELINE ACTUALLY DOES. There is no
     * code generation anywhere in it: renderDocs.ts emits markdown and JSON, and
     * repoWriter.ts is path-allowlisted to docs/**, CLAUDE.md and .colaberry/**
     * and throws on anything else. So this must never say the platform builds the
     * project, writes the code, or that agents build it. It plans, prompts and
     * verifies; the human builds.
     *
     * Also barred, for the same evidence reasons: "connect your GitHub account",
     * "one-click" or any OAuth/GitHub-App wording (it is a proof-of-push
     * challenge on a repo the student brings), and any claim that tests verify
     * the work (CI passing is explicitly not the bar).
     */
    key: 'storybuild',
    label: 'Idea to shipped build',
    audience: 'team',
    claimKey: 'surface.storybuild',
    blurb:
      'Your people describe what they want to build. The platform interviews them, turns it ' +
      'into a traceable plan, and writes it into their own repo as requirements, stories and ' +
      'acceptance criteria — each with a Claude Code prompt built from those requirements. ' +
      'Then it reads the repo and confirms each criterion against a real commit before a story ' +
      'counts as done.',
    livesAt: 'Portal, Projects and the story workspace',
    shot: {
      src: '/site-v2/shot-story-build.png',
      alt:
        'A story workspace: the user story with the requirement it fulfils, three acceptance ' +
        'criteria showing nought of three confirmed, the generated Claude Code prompt, and the ' +
        'repo connection explaining that the repository stays under the builder’s own ' +
        'account and the platform never writes their code.',
    },
    stats: [
      { value: 'REQ → story', label: 'Every story traces to a requirement' },
      { value: '1 prompt', label: 'Per story, from your own requirements' },
      { value: 'Your repo', label: 'The plan is written into it, not ours' },
      { value: 'Confirmed', label: 'Against a real commit, not self-reported' },
    ],
    rows: [
      { label: 'Requirements and stories generated', pct: 100 },
      { label: 'Acceptance criteria per story', pct: 100 },
      { label: 'Code written by the platform', pct: 0 },
    ],
  },
  {
    key: 'workspace',
    label: 'Free company workspace',
    audience: 'management',
    claimKey: 'surface.free.workspace',
    blurb:
      'One free account gives a manager both perspectives at once: the learner experience and ' +
      'their own organization view, with sample data until their team fills it.',
    livesAt: 'The free workspace at /try',
    // Was shot-nav.png -- a crop of the side navigation, which showed a menu
    // and told you nothing about what a workspace IS. Replaced with the actual
    // company view: readiness trajectory, live member count, and the metric
    // tiles a manager opens this for.
    shot: {
      src: '/site-v2/shot-workspace.png',
      alt:
        'The company workspace on sample data: 63 percent average architect readiness across ' +
        '19 members with a projected trend line, tiles for 1,640 builder XP per week, 12 ' +
        'evidence records, 86 percent attendance, 9 evaluations passed and 7 level-ups, and ' +
        'the nine-rank ladder showing the team spread from Builder toward Architect.',
    },
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
