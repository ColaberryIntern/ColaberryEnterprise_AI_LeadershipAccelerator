/**
 * Fixture D — the MANUAL-ONLY case the Phase 3 exit condition names, and which did not exist.
 *
 * `reference-fixtures.md` had three: A (proposal, two tracks), B (admissions, human-heavy and
 * below-target) and C (service business). The P3 plan auditor caught that B is *human-heavy*,
 * which is not the same as *manual-only* — B still has AI-assisted tasks and exists to prove the
 * AI share is not inflated. D exists to prove the opposite thing: that a blueprint where **every
 * task is explicitly `human`** reaches approval, with a rationale on every row.
 *
 * Why that matters: "all human" has to be a RECORDED DECISION, not an empty allocation that
 * happens to look the same. An unallocated project and a deliberately-manual one are
 * indistinguishable unless the second one says so, and the whole allocation design turns on
 * keeping them apart.
 *
 * A legal-review process: intake, a human decision, and either an approved or a rejected end. Two
 * occurrences a month, measured effort, nothing automated and nothing pretending to be.
 */

import type {
  FactoryProject, FactoryTask, Assignment, AllocationRow,
} from '../../../../factory/contracts/factoryContract';
import type { EffortAssessment } from '../../effortMeasures';
import type { ScopedAgent } from '../../agentScoping';
import type { CapabilityDeclaration } from '../../capabilityRegistry';
import type { UnderstandingItem } from '../../../../delivery/projectUnderstanding';

const task = (over: Partial<FactoryTask> & Pick<FactoryTask, 'id' | 'kind'>): FactoryTask => ({
  process_id: 'proc-legal', title: 't', description: 'd', stage_id: 's', source_evidence: [],
  required_skills: [], judgment_level: 'low', decision_authority: 'none',
  data_sensitivity: 'internal', interaction_pattern: null, frequency: null,
  effort_minutes: null, effort_basis: 'UNKNOWN', confidence: null, method: 'EXPLICIT', ...over,
});

const asg = (over: Partial<Assignment> & Pick<Assignment, 'id' | 'task_id' | 'role_id' | 'responsibility'>): Assignment => ({
  executor: { type: 'person', id: 'counsel-1' }, minutes: null, basis: 'UNKNOWN',
  evidence_note: null, ...over,
});

/** The understanding D is generated from. Three stated requirements, all verbatim. */
export function manualOnlyUnderstanding(): UnderstandingItem[] {
  return [
    {
      dimension: 'requirements', classification: 'FACT', provenance: 'source_document',
      value: 'Every contract over £50k must be read by a qualified solicitor before signature.',
      source_quote: 'anything over fifty thousand has to be read by a real solicitor',
    },
    {
      dimension: 'requirements', classification: 'FACT', provenance: 'source_document',
      value: 'The reviewing solicitor records the reason for approval or rejection.',
      source_quote: 'they write down why they said yes or no',
    },
    {
      dimension: 'human_only_decisions', classification: 'DECISION', provenance: 'client_confirmed',
      value: 'The approve/reject decision is never delegated to software of any kind.',
      source_quote: 'a machine does not decide this, ever',
    },
  ];
}

/** START → intake → DECISION → approved END / rejected END. No rework, so no bound is needed. */
export function manualOnlyProject(): FactoryProject {
  return {
    delivery_project_id: 'dp-legal',
    tracks: [],
    source_blocks: [
      { id: 'blk-50k', locator: '1.1', text: 'contracts over £50k need a solicitor', kind: 'requirement' },
      { id: 'blk-reason', locator: '1.2', text: 'the reason is recorded', kind: 'requirement' },
    ],
    requirements: [],
    processes: [{
      id: 'proc-legal', business_outcome: 'contracts are reviewed by a qualified human',
      success_criterion: 'no contract over threshold is signed unread', trigger: 'contract submitted',
      inputs: [], outputs: [], decision_branches: [], future_owner_role_id: 'role-counsel',
      exceptions: [],
    }],
    tasks: [
      task({ id: 't-start', kind: 'START', stage_id: 's0' }),
      task({
        id: 't-intake', kind: 'TASK', stage_id: 's1', source_evidence: ['blk-50k'],
        title: 'Receive and log the contract',
        effort_minutes: 15, effort_basis: 'MEASURED', frequency: 'per contract',
      }),
      task({
        id: 't-review', kind: 'DECISION', stage_id: 's2', source_evidence: ['blk-reason'],
        title: 'Solicitor reads the contract and decides',
        // The two fields that make an autonomous allocation refusable, set honestly.
        data_sensitivity: 'confidential', decision_authority: 'decide_full', judgment_level: 'high',
        effort_minutes: 90, effort_basis: 'MEASURED', frequency: 'per contract',
      }),
      task({ id: 't-approved', kind: 'END', stage_id: 's3' }),
      task({ id: 't-rejected', kind: 'END', stage_id: 's3' }),
    ],
    roles: [{ id: 'role-counsel', name: 'Reviewing solicitor', definition: 'reads and decides' }],
    assignments: [
      asg({ id: 'a-intake', task_id: 't-intake', role_id: 'role-counsel', responsibility: 'PERFORMER' }),
      asg({ id: 'a-review', task_id: 't-review', role_id: 'role-counsel', responsibility: 'PERFORMER' }),
      asg({ id: 'a-acct', task_id: 't-review', role_id: 'role-counsel', responsibility: 'ACCOUNTABLE' }),
    ],
    transitions: [
      { id: 'e-1', from_task_id: 't-start', to_task_id: 't-intake', condition: null, is_rework: false },
      { id: 'e-2', from_task_id: 't-intake', to_task_id: 't-review', condition: null, is_rework: false },
      { id: 'e-3', from_task_id: 't-review', to_task_id: 't-approved', condition: 'approved', is_rework: false },
      { id: 'e-4', from_task_id: 't-review', to_task_id: 't-rejected', condition: 'rejected', is_rework: false },
    ],
    allocation: [], role_map: [],
  };
}

/**
 * Every task explicitly `human`, each with a rationale that is a REASON rather than a restatement.
 *
 * Note what these rationales are not: "derived from the human PERFORMER assignment" would satisfy
 * the non-empty check and say nothing. These say why.
 */
export function manualOnlyAllocation(): AllocationRow[] {
  return [
    {
      task_id: 't-intake', execution_class: 'human', accountable_role_id: 'role-counsel',
      rationale: 'Logging is trivial to automate but sits inside privileged correspondence; the '
        + 'client asked that no system hold the contract before a solicitor has seen it.',
    },
    {
      task_id: 't-review', execution_class: 'human', accountable_role_id: 'role-counsel',
      rationale: 'A qualified solicitor must form the professional judgement personally. The client '
        + 'stated this as never delegable to software, and the decision authority is full.',
    },
  ];
}

/** One agent would be wrong here. The roster is empty on purpose, and that is the point. */
export function manualOnlyAgents(): ScopedAgent[] {
  return [];
}

/** Nothing is needed, and saying so is a real statement rather than an omission. */
export function manualOnlyDeclaration(): CapabilityDeclaration {
  return { permitted: [] };
}

/** Measured effort, twice a month. The AI share should come out 0 — honestly, not by default. */
export function manualOnlyEffort(): EffortAssessment[] {
  return [
    {
      taskId: 't-intake', executionClass: 'human',
      minutesPerOccurrence: 15, basis: 'MEASURED', occurrencesPerMonth: 2,
    },
    {
      taskId: 't-review', executionClass: 'human',
      minutesPerOccurrence: 90, basis: 'MEASURED', occurrencesPerMonth: 2,
    },
  ];
}

/**
 * Below-target acceptance, because a manual-only blueprint is 0% automated by design.
 *
 * It is below the 85% target and that is the correct answer, so it needs a rationale and a named
 * acceptor — not a waiver, and not a reclassification to lift the number.
 */
export function manualOnlyAcceptance() {
  return {
    rationale: 'Legal review is deliberately manual: the client stated the approve/reject decision '
      + 'is never delegated to software. 0% automation is the requirement, not a shortfall.',
    acceptedBy: 'owner@example.test',
  };
}
