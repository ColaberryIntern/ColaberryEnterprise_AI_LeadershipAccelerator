/**
 * The gate, tested the way NuOrg tests its parser: one test per failure mode, each tripping
 * exactly the right code, plus a clean sample that yields zero errors. This is the BREAK phase
 * written down — if the gate survives these, it is a gate; otherwise it is a suggestion.
 */
import { factoryValidate, factoryErrors } from '../factoryValidate';
import type { FactoryProject, FactoryTask, Assignment } from '../contracts/factoryContract';

const task = (over: Partial<FactoryTask> & Pick<FactoryTask, 'id' | 'kind'>): FactoryTask => ({
  process_id: 'proc-1', title: 't', description: 'd', stage_id: 's', source_evidence: [],
  required_skills: [], judgment_level: 'low', decision_authority: 'none', data_sensitivity: 'internal',
  interaction_pattern: null, frequency: null, effort_minutes: null, effort_basis: 'UNKNOWN',
  confidence: null, method: 'EXPLICIT', ...over,
});

const asg = (over: Partial<Assignment> & Pick<Assignment, 'id' | 'task_id' | 'role_id' | 'responsibility'>): Assignment => ({
  executor: { type: 'person', id: 'p-1' }, minutes: null, basis: 'UNKNOWN', evidence_note: null, ...over,
});

/** A minimal, valid project: START → TASK → END, one cited requirement block, a human performer. */
function base(): FactoryProject {
  return {
    delivery_project_id: 'dp-1',
    tracks: [{ id: 'tr-1', delivery_project_id: 'dp-1', track_type: 'solution_build', status: 'active', owner_identity_id: null, solution_student_project_id: 'sp-1' }],
    source_blocks: [{ id: 'blk-1', locator: 'L.1', text: 'the requirement', kind: 'requirement' }],
    requirements: [{ id: 'req-1', statement: 'x', kind: 'technical', priority: 'must', tracks: ['solution_build'], source_document: 'RFP', amendment_version: '0', section: 'L.1', extracted_text: 'x', interpretation: 'y', human_confirmed: true, evidence_state: 'planned', source_evidence: ['blk-1'] }],
    processes: [{ id: 'proc-1', business_outcome: 'o', success_criterion: 'c', trigger: 't', inputs: [], outputs: [], decision_branches: [], future_owner_role_id: 'r-1', exceptions: [] }],
    tasks: [
      task({ id: 't-start', kind: 'START', stage_id: 's0' }),
      task({ id: 't-1', kind: 'TASK', stage_id: 's1', source_evidence: ['blk-1'] }),
      task({ id: 't-end', kind: 'END', stage_id: 's2' }),
    ],
    roles: [{ id: 'r-1', name: 'Analyst', definition: 'reviews' }],
    assignments: [asg({ id: 'a-1', task_id: 't-1', role_id: 'r-1', responsibility: 'PERFORMER' })],
    transitions: [
      { id: 'e-1', from_task_id: 't-start', to_task_id: 't-1', condition: null, is_rework: false },
      { id: 'e-2', from_task_id: 't-1', to_task_id: 't-end', condition: null, is_rework: false },
    ],
    allocation: [], role_map: [],
  };
}

const codes = (p: FactoryProject) => factoryValidate(p).map((i) => i.code);

describe('factoryValidate — the clean case', () => {
  it('a valid sample yields zero errors', () => {
    expect(factoryErrors(base())).toEqual([]);
  });
});

describe('factoryValidate — one failure mode per rule', () => {
  it('test_source_block_cited_by_nothing → SOURCE_COVERAGE', () => {
    const p = base();
    p.tasks.find((t) => t.id === 't-1')!.source_evidence = []; // nothing cites blk-1 now
    expect(codes(p)).toContain('SOURCE_COVERAGE');
  });

  it('test_unresolved_block → SOURCE_CLASSIFICATION', () => {
    const p = base();
    p.source_blocks.push({ id: 'blk-2', locator: 'L.2', text: '?', kind: 'unresolved' });
    expect(codes(p)).toContain('SOURCE_CLASSIFICATION');
  });

  it('test_task_without_performer → PERFORMER', () => {
    const p = base();
    p.assignments = []; // t-1 now has no performer
    expect(codes(p)).toContain('PERFORMER');
  });

  it('test_agent_on_approval_step_is_OVERSIGHT_error → OVERSIGHT', () => {
    const p = base();
    p.assignments.push(asg({ id: 'a-2', task_id: 't-1', role_id: 'r-1', responsibility: 'APPROVER', executor: { type: 'agent', id: 'bot' } }));
    expect(codes(p)).toContain('OVERSIGHT');
  });

  it('test_agent_performer_without_human_accountable → OVERSIGHT', () => {
    const p = base();
    p.assignments[0].executor = { type: 'agent', id: 'bot' }; // agent performer, no human oversight
    expect(codes(p)).toContain('OVERSIGHT');
  });

  it('and adding a human ACCOUNTABLE clears that OVERSIGHT error', () => {
    const p = base();
    p.assignments[0].executor = { type: 'agent', id: 'bot' };
    p.assignments.push(asg({ id: 'a-h', task_id: 't-1', role_id: 'r-1', responsibility: 'ACCOUNTABLE', executor: { type: 'person', id: 'human' } }));
    expect(factoryErrors(p).map((i) => i.code)).not.toContain('OVERSIGHT');
  });

  it('test_number_without_basis → EFFORT_EVIDENCE', () => {
    const p = base();
    p.tasks.find((t) => t.id === 't-1')!.effort_minutes = 30; // minutes but basis stays UNKNOWN
    expect(codes(p)).toContain('EFFORT_EVIDENCE');
  });

  it('test_duplicate_role_responsibility → DUPLICATE_ASSIGNMENT', () => {
    const p = base();
    p.assignments.push(asg({ id: 'a-dup', task_id: 't-1', role_id: 'r-1', responsibility: 'PERFORMER' }));
    expect(codes(p)).toContain('DUPLICATE_ASSIGNMENT');
  });

  it('test_two_outgoing_edges_not_decision → BRANCH_KIND', () => {
    const p = base();
    p.tasks.push(task({ id: 't-2', kind: 'END', stage_id: 's3' }));
    p.transitions.push({ id: 'e-3', from_task_id: 't-1', to_task_id: 't-2', condition: 'other', is_rework: false });
    expect(codes(p)).toContain('BRANCH_KIND'); // t-1 has 2 outgoing but is a TASK
  });

  it('test_unlabeled_cycle_is_LOOP_error, and is_rework clears it', () => {
    const p = base();
    p.transitions.push({ id: 'e-loop', from_task_id: 't-1', to_task_id: 't-start', condition: null, is_rework: false });
    expect(codes(p)).toContain('LOOP');
    // Marking the back-edge as rework removes the LOOP error (the branch/START errors remain).
    p.transitions.find((e) => e.id === 'e-loop')!.is_rework = true;
    expect(factoryErrors(p).map((i) => i.code)).not.toContain('LOOP');
  });
});
