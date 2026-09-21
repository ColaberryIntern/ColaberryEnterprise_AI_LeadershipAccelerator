/**
 * The dark switch: with ENABLE_FACTORY_GENERATION off (the default), the entry must be INERT — no
 * model call, a clean refusal — so deploying Phase 2 changes nothing until the flag is flipped. With
 * it on, the entry delegates to the real pipeline. The feature-flags module is mocked with a
 * toggleable object so both states are exercised deterministically.
 */
const FLAGS = { factoryGeneration: false };
jest.mock('../../../config/featureFlags', () => ({ FLAGS }));

import {
  factoryGenerateIfEnabled, isFactoryGenerationEnabled, FACTORY_GENERATION_DISABLED,
} from '../factoryGenerationEntry';
import type { FactoryGenerateInput } from '../factoryGenerate';
import type { FactoryDecomposition } from '../factoryDecompose';
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
  return { id: 'track-1', delivery_project_id: DPID, track_type: 'solution_build', status: 'in_progress', owner_identity_id: 'p.analyst', solution_student_project_id: null };
}
const input = (): FactoryGenerateInput => ({ deliveryProjectId: DPID, requirements: [req('REQ-1')], tracks: [track()] });

/** A minimal gate-valid decomposition citing the block T3 makes for REQ-1. */
function goldenDecomp(): FactoryDecomposition {
  return {
    processes: [{ id: 'PROC-1', business_outcome: 'REQ-1 delivered', success_criterion: 'met', trigger: 'in', inputs: [], outputs: [], decision_branches: [], future_owner_role_id: 'role-1', exceptions: [] }],
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
function goldenClient() {
  const create = jest.fn(async () => ({ choices: [{ message: { content: JSON.stringify(goldenDecomp()) } }] }));
  return { client: { create } as any, create };
}

beforeEach(() => { FLAGS.factoryGeneration = false; });

describe('factoryGenerateIfEnabled — ship dark', () => {
  it('is INERT when the flag is off: no model call, refuses with FACTORY_GENERATION_DISABLED', async () => {
    const { client, create } = goldenClient();
    expect(isFactoryGenerationEnabled()).toBe(false);
    const res = await factoryGenerateIfEnabled(input(), { client });
    expect(res.accepted).toBe(false);
    expect(res.issues).toEqual([FACTORY_GENERATION_DISABLED]);
    expect(res.decomposeAttempts).toBe(0);
    expect(create).not.toHaveBeenCalled(); // the dark switch made no call
  });

  it('delegates to the real pipeline when the flag is on', async () => {
    FLAGS.factoryGeneration = true;
    const { client, create } = goldenClient();
    expect(isFactoryGenerationEnabled()).toBe(true);
    const res = await factoryGenerateIfEnabled(input(), { client, model: 'test' });
    expect(res.accepted).toBe(true);       // delegated → real gate ran and passed
    expect(res.issues).toEqual([]);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
