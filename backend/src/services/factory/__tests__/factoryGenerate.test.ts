/**
 * factoryGenerate is the orchestration, and its one invariant is the whole point of Phase 2:
 * `accepted === true` IFF factoryErrors(project) is empty. These tests mock the model (NO network)
 * and drive the real gate through it: a valid decomposition is accepted; a fixable one is repaired
 * then accepted; an unfixable one is REFUSED (accepted:false, capped, never thrown); an empty request
 * is refused without a model call; an unrecoverable model failure propagates.
 *
 * The fixtures deliberately cite the block ids T3 GENERATES from the requirements (`blk-<reqId>`),
 * so this also exercises the real T3→T5 SOURCE_COVERAGE handshake end to end.
 */
import { factoryGenerate, type FactoryGenerateInput } from '../factoryGenerate';
import { factoryErrors } from '../factoryValidate';
import { FactoryDecomposeError, type FactoryDecomposition } from '../factoryDecompose';
import type { ContractRequirement, ContractTrack } from '../contracts/factoryContract';

const DPID = 'dp-1';

function req(id: string): ContractRequirement {
  return {
    id, statement: `do ${id}`, kind: 'technical', priority: 'must', tracks: ['solution_build'],
    source_document: 'RFP-1', amendment_version: '0', section: 'L.1', extracted_text: `shall ${id}`,
    interpretation: null, human_confirmed: false, evidence_state: 'planned', source_evidence: [`blk-${id}`],
  };
}
function track(): ContractTrack {
  return {
    id: 'track-1', delivery_project_id: DPID, track_type: 'solution_build', status: 'in_progress',
    owner_identity_id: 'person.analyst', solution_student_project_id: null,
  };
}

/** A minimal gate-valid decomposition whose one task cites the block T3 makes for REQ-1 (blk-REQ-1). */
function goldenDecomp(): FactoryDecomposition {
  return {
    processes: [{ id: 'PROC-1', business_outcome: 'REQ-1 delivered', success_criterion: 'REQ-1 met', trigger: 'input', inputs: [], outputs: [], decision_branches: [], future_owner_role_id: 'role-1', exceptions: [] }],
    tasks: [
      { id: 't-start', process_id: 'PROC-1', title: 'start', description: 'start', kind: 'START', stage_id: 's0', source_evidence: [], required_skills: [], judgment_level: 'none', decision_authority: 'none', data_sensitivity: 'internal', interaction_pattern: null, frequency: null, effort_minutes: null, effort_basis: 'UNKNOWN', confidence: null, method: 'EXPLICIT' },
      { id: 't-1', process_id: 'PROC-1', title: 'Do REQ-1', description: 'Do REQ-1', kind: 'TASK', stage_id: 's1', source_evidence: ['blk-REQ-1'], required_skills: [], judgment_level: 'low', decision_authority: 'none', data_sensitivity: 'internal', interaction_pattern: null, frequency: null, effort_minutes: null, effort_basis: 'UNKNOWN', confidence: null, method: 'LLM' },
      { id: 't-end', process_id: 'PROC-1', title: 'end', description: 'end', kind: 'END', stage_id: 's2', source_evidence: [], required_skills: [], judgment_level: 'none', decision_authority: 'none', data_sensitivity: 'internal', interaction_pattern: null, frequency: null, effort_minutes: null, effort_basis: 'UNKNOWN', confidence: null, method: 'EXPLICIT' },
    ],
    assignments: [{ id: 'a1', task_id: 't-1', role_id: 'role-1', responsibility: 'PERFORMER', executor: { type: 'person', id: 'p1' }, minutes: null, basis: 'UNKNOWN', evidence_note: null }],
    transitions: [
      { id: 'e1', from_task_id: 't-start', to_task_id: 't-1', condition: null, is_rework: false },
      { id: 'e2', from_task_id: 't-1', to_task_id: 't-end', condition: null, is_rework: false },
    ],
    roles: [{ id: 'role-1', name: 'Analyst', definition: 'owns REQ-1' }],
  };
}
/** The same, minus t-1's PERFORMER → one PERFORMER gate error. */
function brokenDecomp(): FactoryDecomposition {
  return { ...goldenDecomp(), assignments: [] };
}

function clientInOrder(contents: string[]) {
  const q = [...contents];
  const create = jest.fn(async () => ({ choices: [{ message: { content: q.shift() ?? '{}' } }] }));
  return { client: { create } as any, create };
}
const input = (): FactoryGenerateInput => ({ deliveryProjectId: DPID, requirements: [req('REQ-1')], tracks: [track()] });

describe('factoryGenerate — accepted IFF the gate is clean', () => {
  it('accepts a valid decomposition (no repair) and the project has zero gate errors', async () => {
    const { client, create } = clientInOrder([JSON.stringify(goldenDecomp())]);
    const res = await factoryGenerate(input(), { client, model: 'test' });
    expect(res.accepted).toBe(true);
    expect(res.issues).toEqual([]);
    expect(factoryErrors(res.project)).toEqual([]);  // the invariant, checked against the real gate
    expect(res.decomposeAttempts).toBe(1);
    expect(res.repairAttempts).toBe(0);
    expect(create).toHaveBeenCalledTimes(1); // decompose only, no repair
  });

  it('repairs a fixable decomposition, then accepts it', async () => {
    const { client, create } = clientInOrder([JSON.stringify(brokenDecomp()), JSON.stringify(goldenDecomp())]);
    const res = await factoryGenerate(input(), { client, model: 'test' });
    expect(res.accepted).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.repairAttempts).toBe(1);
    expect(create).toHaveBeenCalledTimes(2); // decompose + 1 repair
  });

  it('REFUSES an unfixable decomposition (accepted:false, capped, never thrown)', async () => {
    const broken = JSON.stringify(brokenDecomp());
    const { client, create } = clientInOrder([broken, broken, broken, broken]); // decompose + 3 repairs, all broken
    const res = await factoryGenerate(input(), { client, model: 'test' });
    expect(res.accepted).toBe(false);
    expect(res.issues.some((i) => i.code === 'PERFORMER')).toBe(true);
    expect(res.repairRejected).toBe(3);
    expect(create).toHaveBeenCalledTimes(4);
    // even a refused result carries a real project object, just not an accepted one
    expect(factoryErrors(res.project).length).toBeGreaterThan(0);
  });
});

describe('factoryGenerate — boundaries and failure propagation', () => {
  it('refuses an empty request cleanly, with NO model call', async () => {
    const { client, create } = clientInOrder([]);
    const res = await factoryGenerate({ deliveryProjectId: DPID, requirements: [], tracks: [track()] }, { client });
    expect(res.accepted).toBe(false);
    expect(res.issues[0].code).toBe('NO_INPUT');
    expect(create).not.toHaveBeenCalled();
  });

  it('propagates an unrecoverable model failure as a FactoryDecomposeError', async () => {
    const create = jest.fn(async () => { throw new Error('500 upstream'); });
    await expect(factoryGenerate(input(), { client: { create } as any, model: 'test' }))
      .rejects.toBeInstanceOf(FactoryDecomposeError);
  });
});
