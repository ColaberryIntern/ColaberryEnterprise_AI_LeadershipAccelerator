/**
 * Fixtures A, B and C as CODE, so the orchestrator actually runs them.
 *
 * They existed as prose in `reference-fixtures.md` and as no code anywhere in `backend/src` — the
 * P3-T6 verifier confirmed that with a whole-tree search. A task titled "orchestrate the fixtures"
 * was orchestrating one of four.
 *
 * One file rather than three, because three would triplicate the same `task`/`asg` helpers and
 * CLAUDE.md's rule is to lift logic at the third occurrence. Fixture D stays in its own file: it is
 * the manual-only case and shares none of these AI-assisted shapes.
 *
 * Each fixture is built to exercise the property its doc entry claims, and each has a deliberate
 * break available so the suite can show the orchestrator refusing rather than only accepting.
 */

import type {
  FactoryProject, FactoryTask, Assignment, AllocationRow,
} from '../../../../factory/contracts/factoryContract';
import type { EffortAssessment } from '../../effortMeasures';
import type { ScopedAgent } from '../../agentScoping';
import type { CapabilityDeclaration } from '../../capabilityRegistry';
import type { UnderstandingItem } from '../../../../delivery/projectUnderstanding';

const task = (over: Partial<FactoryTask> & Pick<FactoryTask, 'id' | 'kind'>): FactoryTask => ({
  process_id: 'proc', title: 't', description: 'd', stage_id: 's', source_evidence: [],
  required_skills: [], judgment_level: 'low', decision_authority: 'none',
  data_sensitivity: 'internal', interaction_pattern: null, frequency: null,
  effort_minutes: null, effort_basis: 'UNKNOWN', confidence: null, method: 'EXPLICIT', ...over,
});

const asg = (over: Partial<Assignment> & Pick<Assignment, 'id' | 'task_id' | 'role_id' | 'responsibility'>): Assignment => ({
  executor: { type: 'person', id: 'p-1' }, minutes: null, basis: 'UNKNOWN',
  evidence_note: null, ...over,
});

const req = (value: string): UnderstandingItem => ({
  dimension: 'requirements', classification: 'FACT', provenance: 'source_document', value,
});

/**
 * Shell: START -> draft -> DECISION(review) -> approved/rejected END. Shared by A, B and C.
 *
 * `rework` adds the send-it-back edge, review -> draft, flagged `is_rework`. Before P7-T1.2
 * `is_rework: true` appeared ZERO times across the eight transitions in this file and
 * `manualOnly.ts`, so two shipped rules had no fixture that could reach them:
 * `processValidation.cyclingReworkEdges` and its `REWORK_BOUND` error. A rule nothing exercises
 * is a rule nobody knows is broken.
 *
 * It is OPT IN rather than on by default, because an unbounded rework edge is itself the
 * violation: turning it on everywhere would make every fixture refuse. Fixture B takes it, since
 * "the officer sends the application back for more information" is what that workflow actually
 * does, and `fixtureB.reworkBounds()` carries the bound that makes it legal.
 */
function shell(over: {
  draft: Partial<FactoryTask>;
  review: Partial<FactoryTask>;
  assignments: Assignment[];
  blocks?: string[];
  rework?: boolean;
  /**
   * Opt-in two-track shape: a `proposal` track, a `solution_build` track, and ONE canonical
   * requirement whose `tracks` array spans both.
   *
   * OPT IN for the same reason `rework` is. `shell()` is shared by A, B and C, and B and C are
   * not government contracts -- giving them tracks would make three fixtures claim a shape only
   * one of them has.
   *
   * It exists because a verifier found that §103 case 2 was LABELLED "track-bearing
   * requirements survive composition" while `tracks` and `requirements` were both `[]`. Nothing
   * in the corpus asserted a track. The claim was true of nothing, which is the defect class this
   * phase refuses and which cost a helper its life earlier in the same build.
   */
  twoTrack?: boolean;
}): FactoryProject {
  const blocks = over.blocks ?? ['blk-1'];
  return {
    delivery_project_id: 'dp',
    tracks: over.twoTrack ? [
      { id: 'trk-prop', delivery_project_id: 'dp', track_type: 'proposal', status: 'open', owner_identity_id: null, solution_student_project_id: null },
      { id: 'trk-sol', delivery_project_id: 'dp', track_type: 'solution_build', status: 'open', owner_identity_id: null, solution_student_project_id: 'sp-1' },
    ] : [],
    source_blocks: blocks.map((id, n) => ({ id, locator: `${n + 1}.0`, text: 'stated', kind: 'requirement' as const })),
    // ONE canonical id spanning BOTH tracks. That is the whole property the government case
    // exists to protect: the same requirement seen from the proposal side and the build side has
    // to be the SAME id, or a compliance matrix cannot join them.
    requirements: over.twoTrack ? [{
      id: 'REQ-CANON-1',
      statement: 'The system must notify the applicant within one business day.',
      kind: 'technical', priority: 'must', tracks: ['proposal', 'solution_build'],
      source_document: 'solicitation-A', amendment_version: '1', section: 'M.2',
      extracted_text: 'stated', interpretation: null, human_confirmed: true,
      evidence_state: 'tested', source_evidence: blocks,
    }, {
      // TRACK-EXCLUSIVE, and it exists to kill a mutant that survived attempt 3.
      //
      // With only the canonical requirement, deleting the track filter in
      // `factoryProjectView` -- so every requirement lands under every track -- left all 31
      // tests green and all 1,682 in the tree green. One requirement cannot show the
      // OVER-inclusion direction: a dump and a join look identical when there is nothing to
      // exclude. This one belongs to `proposal` ONLY, so a dump puts it in `solution_build`
      // and the assertion below catches it.
      //
      // I had recorded that closing this needed production code and was therefore out of this
      // packet's scope. That was asserted, not tested, and it was wrong: a fixture row and an
      // assertion do it, both inside scope.
      id: 'REQ-PROP-ONLY',
      statement: 'The proposal must include a past-performance reference.',
      kind: 'administrative', priority: 'must', tracks: ['proposal'],
      source_document: 'solicitation-A', amendment_version: '1', section: 'L.4',
      extracted_text: 'stated', interpretation: null, human_confirmed: true,
      evidence_state: 'tested', source_evidence: blocks,
    }] : [],
    processes: [{
      id: 'proc', business_outcome: 'o', success_criterion: 'c', trigger: 't',
      inputs: [], outputs: [], decision_branches: [], future_owner_role_id: 'r-1', exceptions: [],
    }],
    tasks: [
      task({ id: 't-start', kind: 'START', stage_id: 's0' }),
      task({ id: 't-draft', kind: 'TASK', stage_id: 's1', source_evidence: blocks, ...over.draft }),
      task({ id: 't-review', kind: 'DECISION', stage_id: 's2', ...over.review }),
      task({ id: 't-yes', kind: 'END', stage_id: 's3' }),
      task({ id: 't-no', kind: 'END', stage_id: 's3' }),
    ],
    roles: [{ id: 'r-1', name: 'Owner', definition: 'owns it' }],
    assignments: over.assignments,
    transitions: [
      { id: 'e-1', from_task_id: 't-start', to_task_id: 't-draft', condition: null, is_rework: false },
      { id: 'e-2', from_task_id: 't-draft', to_task_id: 't-review', condition: null, is_rework: false },
      { id: 'e-3', from_task_id: 't-review', to_task_id: 't-yes', condition: 'approved', is_rework: false },
      { id: 'e-4', from_task_id: 't-review', to_task_id: 't-no', condition: 'rejected', is_rework: false },
      // CLOSES A CYCLE on purpose. `cyclingReworkEdges` only asks for a bound when the edge's
      // destination can reach its origin again, so an edge that merely LOOKS like rework would
      // prove nothing: review -> draft -> review is what makes this reachable.
      ...(over.rework
        ? [{ id: 'e-rework', from_task_id: 't-review', to_task_id: 't-draft', condition: 'more_information_needed', is_rework: true }]
        : []),
    ],
    allocation: [], role_map: [],
  };
}

// ───────────────────────────────── Fixture A — proposal workflow (government)

/** Two tracks share requirement ids, so a canonical id must survive into both. */
export const fixtureA = {
  understanding: (): UnderstandingItem[] => [
    req('The proposal must address every evaluation factor in Section M.'),
    req('A compliance matrix maps each requirement to the section answering it.'),
    {
      dimension: 'approval_points', classification: 'DECISION', provenance: 'pm_confirmed',
      value: 'A capture manager signs off before submission.',
    },
  ],
  project: (): FactoryProject => shell({
    blocks: ['blk-sec-m', 'blk-matrix'],
    twoTrack: true,
    draft: {
      title: 'Draft the section responses',
      effort_minutes: 240, effort_basis: 'ESTIMATED', frequency: 'per solicitation',
    },
    review: {
      title: 'Capture manager approves for submission',
      decision_authority: 'decide_full', data_sensitivity: 'confidential', judgment_level: 'high',
      effort_minutes: 60, effort_basis: 'ESTIMATED', frequency: 'per solicitation',
    },
    assignments: [
      // AI drafts under a named human approver: the ai_with_approval shape.
      asg({ id: 'a-1', task_id: 't-draft', role_id: 'r-1', responsibility: 'PERFORMER', executor: { type: 'agent', id: 'ag-draft' } }),
      asg({ id: 'a-2', task_id: 't-draft', role_id: 'r-1', responsibility: 'APPROVER' }),
      asg({ id: 'a-3', task_id: 't-review', role_id: 'r-1', responsibility: 'PERFORMER' }),
    ],
  }),
  allocation: (): AllocationRow[] => [
    {
      task_id: 't-draft', execution_class: 'ai_with_approval', accountable_role_id: 'r-1',
      rationale: 'Drafting against a known evaluation factor is pattern work, but a capture manager '
        + 'is answerable for what is submitted, so every section is read before it goes.',
    },
    {
      task_id: 't-review', execution_class: 'human', accountable_role_id: 'r-1',
      rationale: 'Submitting a non-compliant proposal forfeits the bid; the judgement is the '
        + 'capture manager\'s and the authority is full.',
    },
  ],
  agents: (): ScopedAgent[] => [
    { id: 'ag-draft', owns: ['t-draft'], capability: 'section_drafting', requires: ['read_repository'] },
  ],
  declaration: (): CapabilityDeclaration => ({ permitted: ['read_repository', 'section_drafting'] }),
  // 240 AI + 60 approval human + 60 human review = 360. AI share 240/360 = 2/3.
  effort: (): EffortAssessment[] => [
    { taskId: 't-draft', executionClass: 'ai_with_approval', minutesPerOccurrence: 240, basis: 'ESTIMATED', occurrencesPerMonth: 1, approvalMinutesPerOccurrence: 60 },
    { taskId: 't-review', executionClass: 'human', minutesPerOccurrence: 60, basis: 'ESTIMATED', occurrencesPerMonth: 1 },
  ],
  acceptance: () => ({
    rationale: 'Submission approval is a professional judgement with bid-forfeiting consequences.',
    acceptedBy: 'owner@example.test',
  }),
};

// ───────────────────────────────── Fixture B — admissions (human-heavy, below target)

/**
 * Human-heavy, which is NOT manual-only: B has an AI-assisted task and exists to prove the AI
 * share is not inflated. Fixture D is the all-human case.
 */
export const fixtureB = {
  understanding: (): UnderstandingItem[] => [
    req('Every application is read by an admissions officer before a decision.'),
    {
      dimension: 'human_only_decisions', classification: 'DECISION', provenance: 'client_confirmed',
      value: 'Admit/decline is never made by software.',
    },
  ],
  project: (): FactoryProject => shell({
    draft: {
      title: 'Summarise the application for the reviewer',
      effort_minutes: 5, effort_basis: 'MEASURED', frequency: 'per application',
    },
    review: {
      title: 'Admissions officer decides',
      decision_authority: 'decide_full', data_sensitivity: 'confidential', judgment_level: 'high',
      effort_minutes: 25, effort_basis: 'MEASURED', frequency: 'per application',
    },
    assignments: [
      asg({ id: 'a-1', task_id: 't-draft', role_id: 'r-1', responsibility: 'PERFORMER', executor: { type: 'agent', id: 'ag-sum' } }),
      asg({ id: 'a-2', task_id: 't-draft', role_id: 'r-1', responsibility: 'APPROVER' }),
      asg({ id: 'a-3', task_id: 't-review', role_id: 'r-1', responsibility: 'PERFORMER' }),
    ],
    rework: true,
  }),
  /**
   * The declared iteration bound for the rework edge.
   *
   * SEPARATE from `project()` because the bound is composition input, not process shape, and
   * because the corpus needs to run this fixture BOTH ways: with the bound, which composes
   * cleanly, and without it, which must refuse `REWORK_BOUND`. A bound baked into the project
   * could not be withheld.
   *
   * Three, not a round number chosen to look decisive: `processValidation` treats a MISSING entry
   * as the violation rather than defaulting one, precisely so nobody writes a meaningless figure.
   * Three is "two revisions then decide", which is a rule an admissions office can actually hold.
   */
  reworkBounds: (): Readonly<Record<string, number>> => ({ 'e-rework': 3 }),
  allocation: (): AllocationRow[] => [
    {
      task_id: 't-draft', execution_class: 'ai_with_approval', accountable_role_id: 'r-1',
      rationale: 'A summary saves reading time but must not replace reading; the officer confirms '
        + 'it against the application before relying on it.',
    },
    {
      task_id: 't-review', execution_class: 'human', accountable_role_id: 'r-1',
      rationale: 'The client stated admit/decline is never made by software, and the decision '
        + 'changes a person\'s year.',
    },
  ],
  agents: (): ScopedAgent[] => [
    { id: 'ag-sum', owns: ['t-draft'], capability: 'application_summary', requires: ['read_repository'] },
  ],
  declaration: (): CapabilityDeclaration => ({ permitted: ['read_repository', 'application_summary'] }),
  // 5x40 = 200 AI; approval 2x40 = 80 human; review 25x40 = 1000 human. 200/1280 ≈ 15.6%.
  effort: (): EffortAssessment[] => [
    { taskId: 't-draft', executionClass: 'ai_with_approval', minutesPerOccurrence: 5, basis: 'MEASURED', occurrencesPerMonth: 40, approvalMinutesPerOccurrence: 2 },
    { taskId: 't-review', executionClass: 'human', minutesPerOccurrence: 25, basis: 'MEASURED', occurrencesPerMonth: 40 },
  ],
  acceptance: () => ({
    rationale: 'Admissions is legitimately human-decision-heavy. A low AI share is the honest '
      + 'figure, not a shortfall to be closed by reclassifying the decision.',
    acceptedBy: 'owner@example.test',
  }),
};

// ───────────────────────────────── Fixture C — service business

/** The common case, and the one where an autonomous allocation is legitimately available. */
export const fixtureC = {
  understanding: (): UnderstandingItem[] => [
    req('Every inbound service request gets an acknowledgement within one hour.'),
    req('Scope exceptions are priced by a human.'),
  ],
  project: (): FactoryProject => shell({
    draft: {
      title: 'Acknowledge and classify the request',
      // Public data, no decision authority: ai_autonomous is permitted here.
      data_sensitivity: 'public', decision_authority: 'none',
      effort_minutes: 2, effort_basis: 'MEASURED', frequency: 'per request',
    },
    review: {
      title: 'Price a scope exception',
      decision_authority: 'decide_bounded', judgment_level: 'medium',
      effort_minutes: 20, effort_basis: 'ESTIMATED', frequency: 'per exception',
    },
    assignments: [
      asg({ id: 'a-1', task_id: 't-draft', role_id: 'r-1', responsibility: 'PERFORMER', executor: { type: 'agent', id: 'ag-ack' } }),
      asg({ id: 'a-2', task_id: 't-draft', role_id: 'r-1', responsibility: 'ACCOUNTABLE' }),
      asg({ id: 'a-3', task_id: 't-review', role_id: 'r-1', responsibility: 'PERFORMER' }),
    ],
  }),
  allocation: (): AllocationRow[] => [
    {
      task_id: 't-draft', execution_class: 'ai_autonomous', accountable_role_id: 'r-1',
      rationale: 'Acknowledgement is a template over public data with no decision in it; the hour '
        + 'commitment is unmeetable by hand overnight.',
    },
    {
      task_id: 't-review', execution_class: 'human', accountable_role_id: 'r-1',
      rationale: 'Pricing an exception is a commercial judgement with bounded authority, so it '
        + 'stays with the account owner.',
    },
  ],
  agents: (): ScopedAgent[] => [
    { id: 'ag-ack', owns: ['t-draft'], capability: 'request_triage', requires: ['read_repository'] },
  ],
  declaration: (): CapabilityDeclaration => ({ permitted: ['read_repository', 'request_triage'] }),
  // 2x400 = 800 AI; 20x20 = 400 human. 800/1200 = 2/3.
  effort: (): EffortAssessment[] => [
    { taskId: 't-draft', executionClass: 'ai_autonomous', minutesPerOccurrence: 2, basis: 'MEASURED', occurrencesPerMonth: 400 },
    { taskId: 't-review', executionClass: 'human', minutesPerOccurrence: 20, basis: 'ESTIMATED', occurrencesPerMonth: 20 },
  ],
  acceptance: () => ({
    rationale: 'Exception pricing is a commercial judgement held deliberately by a person.',
    acceptedBy: 'owner@example.test',
  }),
};
