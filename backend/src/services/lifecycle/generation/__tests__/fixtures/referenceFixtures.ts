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

/** Shell: START → draft → DECISION(review) → approved/rejected END. Shared by A, B and C. */
function shell(over: {
  draft: Partial<FactoryTask>;
  review: Partial<FactoryTask>;
  assignments: Assignment[];
  blocks?: string[];
}): FactoryProject {
  const blocks = over.blocks ?? ['blk-1'];
  return {
    delivery_project_id: 'dp',
    tracks: [],
    source_blocks: blocks.map((id, n) => ({ id, locator: `${n + 1}.0`, text: 'stated', kind: 'requirement' as const })),
    requirements: [],
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
  }),
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
