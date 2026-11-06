/**
 * L10.2 and L10.3 — the measured facts, and nothing else.
 *
 * ONE DATA MODULE FOR TWO TICKETS, because both are claims about the SAME stored document:
 * L10.2 is "the AI tasks are grouped into named subject-bounded teams" and L10.3 is "the human
 * tasks all land on one console". Splitting them into two modules would let the two artifacts
 * quote different numbers for the same row, which is the failure this arrangement exists to make
 * impossible.
 *
 * EVERY NUMBER HERE WAS READ OUT OF PRODUCTION on 2026-11-06, by running the SHIPPED detectors
 * inside the backend container against the stored row - not computed from the model's output and
 * not retyped from a chat message. The probe required `/app/dist/services/factory/*` so it could
 * not drift from the gate it reported on.
 *
 * `selfCheck()` DERIVES the consistency claims rather than restating them: team task counts must
 * sum to the AI allocation count, the console must hold exactly the human allocation count, and
 * the blocking count must be zero. Change any single figure below and the check fails, which is
 * the only reason a reader should believe the figures agree.
 */

/** Where the numbers came from, so a reader can re-run the measurement rather than trust it. */
const META = {
  built: '6 November 2026',
  project: 'Herriman City Work Order RFP',
  deliveryProjectId: '80b35be2-a0e9-4068-945b-328e9438bbc7',
  track: 'solution_build',
  version: 1,
  status: 'draft',
  docUpdated: '2026-11-06T02:45:57.642Z',
  deployedSha: '46b0a869',
  containerStarted: '2026-11-06T10:05:05Z',
  measuredBy: 'the shipped detectors, required out of /app/dist inside the backend container',
};

/** The ten keys actually present in the stored JSONB. Two of them had to be taught to persist. */
const STORED_KEYS = [
  'agent_teams', 'allocation', 'assignments', 'processes', 'role_map',
  'roles', 'source_blocks', 'surfaces', 'tasks', 'transitions',
];

/** Keys that were silently dropped by the write path until 2026-11-06. */
const KEYS_RECOVERED = ['agent_teams', 'surfaces'];

const COUNTS = {
  tasks: 15,
  allocationRows: 14,
  ai: 3,
  human: 11,
  sourceBlocks: 56,
  assignments: 17,
};

/** L10.2. Two teams, two subjects, every AI task in exactly one of them. */
const TEAMS = [
  {
    id: 'agent-team-documentation',
    subject: 'Proposal Documentation',
    taskCount: 2,
    approverRoleId: 'role-proposal_manager',
    executionPolicy: 'agent_with_review',
    autonomyStage: null,
    trustDimensions: 1,
  },
  {
    id: 'agent-team-submission',
    subject: 'Proposal Submission',
    taskCount: 1,
    approverRoleId: 'role-proposal_manager',
    executionPolicy: 'agent_with_review',
    autonomyStage: null,
    trustDimensions: 1,
  },
];

/** L10.3. One console, and it holds all of them. */
const SURFACES = [
  {
    id: 'surface-console',
    kind: 'console',
    name: 'Proposal Management Console',
    taskCount: 11,
  },
];

/** Human tasks sitting on no surface at all. The number that makes "one console" a real claim. */
const ORPHAN_HUMAN_TASKS = 0;

/**
 * 14 allocation rows across 15 tasks. VERIFIED, not assumed: the unallocated task is `t-start`,
 * `kind: 'START'` - the flow's start node, which is not work and correctly carries no execution
 * class. This page nearly shipped "one task has no execution class" as an outstanding item, which
 * would have been a false alarm in a document whose only value is that its numbers can be
 * trusted. Measured in the container, not inferred from the name.
 */
const UNALLOCATED = {
  taskId: 't-start',
  kind: 'START',
  title: 'Initiate Proposal Process',
  isDefect: false,
  why: 'a START node is not work, so it carries no execution class by design',
};

/**
 * What the gate said about the stored document, by severity.
 *
 * ZERO BLOCKING IS THE DONE-WHEN FOR L10.2. The four warnings are real and are named in the
 * artifacts rather than rounded away - two of them are the honest half of a rule this session
 * had to split apart.
 */
const FINDINGS = [
  {
    rule: 'AUTONOMY_STAGE_UNASSESSED',
    severity: 'warning',
    count: 2,
    gap: true,
    detail: 'Both teams carry autonomy_stage = null. The ticket asked for teams that carry an '
      + 'autonomy stage; the generator does not populate it. Unassessed is a gap to close, never '
      + 'a level to assume.',
  },
  {
    rule: 'APPROVER_ROLE_SHARED_WITH_AGENT',
    severity: 'warning',
    count: 2,
    gap: true,
    detail: 'Both teams name role-proposal_manager as approver, and an agent also PERFORMS work '
      + 'under that role. The approval is a person\'s, so no system approved anything - but the '
      + 'role no longer tells a reader the worker from the reviewer.',
  },
];

/**
 * The assignment rows that decide whether an agent holds the approval. This is the evidence that
 * L10.2's third condition - a human approver - actually holds, and the reason the finding above
 * is a warning rather than a refusal.
 */
const APPROVER_EVIDENCE = {
  roleId: 'role-proposal_manager',
  agentPerformerTasks: 2,
  personApproverTasks: 3,
  agentsHoldingApproval: 0,
};

/** The gate's full rule vocabulary, measured off the source rather than remembered. */
const GATE = {
  ruleCodes: [
    'AI_TASK_WITHOUT_TEAM', 'APPROVER_IS_AGENT', 'APPROVER_MISSING',
    'APPROVER_ROLE_SHARED_WITH_AGENT', 'AUTONOMY_STAGE_UNASSESSED', 'AUTONOMY_STAGE_UNKNOWN',
    'HUMAN_TASK_WITHOUT_SURFACE', 'NO_CONSOLE', 'ONE_CONSOLE', 'STRUCTURE_ABSENT',
    'SUBJECT_REQUIRED', 'SUBJECT_UNIQUE', 'TASK_ONE_TEAM', 'TEAM_CLAIMS_HUMAN_TASK',
    'TRUST_DIMENSION_UNKNOWN', 'TRUST_INCOMPLETE_FOR_AUTONOMOUS',
  ],
  tests: 26,
  testFile: 'backend/src/services/factory/__tests__/humanAiStructure.test.ts',
};

/**
 * The controls. A gate that reports "no problem" is worthless until it has been shown reporting a
 * problem, so each of these is a case the suite proves it DOES catch.
 */
const CONTROLS = [
  { claim: 'A second console is reported', evidence: 'humanAiStructure.test.ts:253 — consoleCount 2' },
  {
    claim: 'An external surface alongside the console is allowed, and is not counted as a console',
    evidence: 'humanAiStructure.test.ts:257 — kind "external", consoleCount stays 1',
  },
  {
    claim: 'A human task on no surface is BLOCKING, not advisory',
    evidence: 'HUMAN_TASK_WITHOUT_SURFACE is emitted at severity blocking',
  },
  {
    claim: 'The structure gate distinguishes "never declared" from "declared and empty"',
    evidence: 'STRUCTURE_ABSENT fires on undefined; AI_TASK_WITHOUT_TEAM fires on []',
  },
];

/** What each ticket asked for, verbatim enough to check the artifact against. */
const DONE_WHEN = {
  'L10.2': 'humanAiStructure reports no blocking finding on a real decomposition: every AI task '
    + 'belongs to exactly one team, no two teams share a subject, and every team names a human '
    + 'approver that an agent does not fill.',
  'L10.3': 'Exactly one surface of kind console exists, every human task lands on exactly one '
    + 'surface, and external surfaces are labeled as external rather than counted as consoles.',
};

/** The world before each change, from the ticket's own Why. Needed for the pre-AI baseline rule. */
const BASELINE = {
  'L10.2': 'An AI executor was an arbitrary string id and nothing more, so one unnamed agent '
    + 'could absorb every AI task in a project. Nobody owns an unnamed agent and no subject '
    + 'bounds it.',
  'L10.3': 'Human tasks had an owner and no destination, so the only grouping primitive '
    + 'downstream was the role, and a generated app grew one screen and one login per role with a '
    + 'handoff between each. The first cohort shipped that app.',
};

/**
 * Stated rather than left to be found. Both artifacts carry this section; a close note that omits
 * it is the failure mode this program keeps hitting.
 */
const NOT_CLAIMED = [
  'The stored document is a v1 DRAFT and was not approved. Approval forks a version and is '
    + 'Ali\'s action, not this ticket\'s.',
  'Both teams have autonomy_stage = null, so no team has been placed on the R0-R9 ladder. The '
    + 'type carries the field and the gate warns about it; the generator does not fill it.',
  'The approver role is shared with an agent performer on both teams. The approval is a '
    + 'person\'s, but the role name does not distinguish worker from reviewer.',
  'One sample. These figures describe one decomposition of one solicitation, measured once.',
];

/** The totals the renderers read, so neither of them recomputes anything. */
const TOTALS = {
  blocking: FINDINGS.filter((f) => f.severity === 'blocking').reduce((n, f) => n + f.count, 0),
  warnings: FINDINGS.filter((f) => f.severity === 'warning').reduce((n, f) => n + f.count, 0),
  teams: TEAMS.length,
  subjects: new Set(TEAMS.map((t) => t.subject)).size,
  aiTasksInTeams: TEAMS.reduce((n, t) => n + t.taskCount, 0),
  consoles: SURFACES.filter((s) => s.kind === 'console').length,
  humanTasksOnSurfaces: SURFACES.reduce((n, s) => n + s.taskCount, 0),
  rules: GATE.ruleCodes.length,
  gaps: FINDINGS.filter((f) => f.gap).length,
};

/**
 * DERIVED consistency, not asserted consistency.
 *
 * Each check recomputes a relationship between two independently recorded figures. A typo in any
 * one of them breaks a check, so a clean run is evidence the artifact's numbers agree with each
 * other - which is the most a self-check can honestly prove. It cannot prove they match
 * production; the probe output quoted in META is what does that.
 */
function selfCheck() {
  const fail = (m) => { throw new Error(`l10Data selfCheck: ${m}`); };

  if (TOTALS.aiTasksInTeams !== COUNTS.ai) {
    fail(`team task counts sum to ${TOTALS.aiTasksInTeams}, but allocation reports ${COUNTS.ai} `
      + 'AI tasks. Every AI task must belong to exactly one team (L10.2).');
  }
  if (TOTALS.subjects !== TOTALS.teams) {
    fail(`${TOTALS.teams} teams but only ${TOTALS.subjects} distinct subjects; L10.2 requires `
      + 'that no two teams share a subject.');
  }
  if (TOTALS.consoles !== 1) {
    fail(`${TOTALS.consoles} console surfaces; L10.3 requires exactly one.`);
  }
  if (TOTALS.humanTasksOnSurfaces !== COUNTS.human) {
    fail(`surfaces hold ${TOTALS.humanTasksOnSurfaces} tasks but allocation reports `
      + `${COUNTS.human} human tasks; L10.3 requires every human task to land on one.`);
  }
  if (ORPHAN_HUMAN_TASKS !== 0) {
    fail(`${ORPHAN_HUMAN_TASKS} human task(s) on no surface; that finding is blocking.`);
  }
  if (COUNTS.ai + COUNTS.human !== COUNTS.allocationRows) {
    fail(`allocation classes sum to ${COUNTS.ai + COUNTS.human} but there are `
      + `${COUNTS.allocationRows} rows.`);
  }
  // The gap between tasks and allocation rows must be fully explained, or the artifact is
  // reporting a count it cannot account for.
  if (COUNTS.tasks - COUNTS.allocationRows !== 1) {
    fail(`${COUNTS.tasks - COUNTS.allocationRows} tasks lack an allocation row, but only `
      + `${UNALLOCATED.taskId} is accounted for.`);
  }
  if (UNALLOCATED.kind !== 'START') {
    fail(`the unallocated task is kind=${UNALLOCATED.kind}, not START, so "not work" does not `
      + 'explain it and it is an unexplained gap rather than a design property.');
  }
  if (TOTALS.blocking !== 0) {
    fail(`${TOTALS.blocking} blocking finding(s); L10.2's done-when is zero.`);
  }
  if (APPROVER_EVIDENCE.agentsHoldingApproval !== 0) {
    fail('an agent holds an approval; a system may never be the approver.');
  }
  if (APPROVER_EVIDENCE.personApproverTasks < 1) {
    fail('no person holds any approval, so "a human approver" is unevidenced.');
  }
  if (!KEYS_RECOVERED.every((k) => STORED_KEYS.includes(k))) {
    fail('a key this session had to teach the write path to keep is absent from the stored keys.');
  }
  if (TOTALS.gaps < 1) {
    fail('no gap recorded. An artifact with nothing outstanding is almost always an artifact '
      + 'that stopped looking.');
  }
  return true;
}

module.exports = {
  META,
  STORED_KEYS,
  KEYS_RECOVERED,
  UNALLOCATED,
  COUNTS,
  TEAMS,
  SURFACES,
  ORPHAN_HUMAN_TASKS,
  FINDINGS,
  APPROVER_EVIDENCE,
  GATE,
  CONTROLS,
  DONE_WHEN,
  BASELINE,
  NOT_CLAIMED,
  TOTALS,
  selfCheck,
};
