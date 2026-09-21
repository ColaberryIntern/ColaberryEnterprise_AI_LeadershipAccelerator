/**
 * factoryDecompose is the bounded I/O shell. These tests mock the injected OpenAI client (NO
 * network) and pin the failure-first contract: a clean first pass, a single retry on a shape-invalid
 * response then a classified fail-closed, distinct error classes for timeout vs other upstream
 * failure, and a hard cap on attempts (no unbounded loop). The strict-schema transform and the
 * post-parse shape guard are unit-checked too.
 */
import {
  factoryDecompose,
  toStrictSchema,
  isDecompositionShaped,
  FactoryDecomposeError,
  type FactoryDecomposition,
} from '../factoryDecompose';
import { FACTORY_DECOMPOSITION_JSON_SCHEMA } from '../contracts/factoryContractSchema';
import type { FactoryDecomposeInputs } from '../factoryDecomposePrompt';

const inputs: FactoryDecomposeInputs = {
  sourceBlocks: [{ id: 'blk-1', locator: 'L.1', text: 'shall extract', kind: 'requirement' }],
  requirements: [{ id: 'REQ-1', statement: 'Extract', kind: 'technical', priority: 'must' }],
};

/** A minimally SHAPE-valid decomposition (non-empty processes+tasks, arrays for the rest). */
function validDecomposition(): FactoryDecomposition {
  return {
    processes: [{ id: 'PROC-1', business_outcome: 'o', success_criterion: 's', trigger: 't', inputs: [], outputs: [], decision_branches: [], future_owner_role_id: null, exceptions: [] }],
    tasks: [
      { id: 't-start', process_id: 'PROC-1', title: 'start', description: 'start', kind: 'START', stage_id: 's0', source_evidence: [], required_skills: [], judgment_level: 'none', decision_authority: 'none', data_sensitivity: 'internal', interaction_pattern: null, frequency: null, effort_minutes: null, effort_basis: 'UNKNOWN', confidence: null, method: 'EXPLICIT' },
      { id: 't-1', process_id: 'PROC-1', title: 'Extract', description: 'Extract', kind: 'TASK', stage_id: 's1', source_evidence: ['blk-1'], required_skills: [], judgment_level: 'low', decision_authority: 'none', data_sensitivity: 'internal', interaction_pattern: null, frequency: null, effort_minutes: null, effort_basis: 'UNKNOWN', confidence: null, method: 'LLM' },
    ],
    assignments: [{ id: 'a1', task_id: 't-1', role_id: 'role-1', responsibility: 'PERFORMER', executor: { type: 'person', id: 'p1' }, minutes: null, basis: 'UNKNOWN', evidence_note: null }],
    transitions: [{ id: 'e1', from_task_id: 't-start', to_task_id: 't-1', condition: null, is_rework: false }],
    roles: [{ id: 'role-1', name: 'Analyst', definition: 'x' }],
  };
}

/** A mock chat.completions.create that returns whatever content strings it is queued, in order. */
function mockClient(contents: Array<string | null>) {
  const create = jest.fn(async () => {
    const content = contents.shift();
    return { choices: [{ message: { content: content ?? undefined } }] };
  });
  return { client: { create } as any, create };
}

describe('factoryDecompose — happy path and retry behaviour', () => {
  it('returns the decomposition on a clean first pass (attempts=1)', async () => {
    const { client, create } = mockClient([JSON.stringify(validDecomposition())]);
    const res = await factoryDecompose({ inputs, client, model: 'test-model' });
    expect(res.attempts).toBe(1);
    expect(res.model).toBe('test-model');
    expect(res.decomposition.processes[0].id).toBe('PROC-1');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('retries exactly once on a malformed first response, then succeeds (attempts=2)', async () => {
    const { client, create } = mockClient(['not json{', JSON.stringify(validDecomposition())]);
    const res = await factoryDecompose({ inputs, client });
    expect(res.attempts).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('factoryDecompose — fail-closed and bounded', () => {
  it('throws ContractViolation (not a partial) after malformed JSON twice, and is bounded to 2 calls', async () => {
    const { client, create } = mockClient(['nope', 'still nope']);
    await expect(factoryDecompose({ inputs, client })).rejects.toMatchObject({ error_class: 'ContractViolation' });
    expect(create).toHaveBeenCalledTimes(2); // no unbounded loop
  });

  it('throws EmptyResponse when the model returns no content twice', async () => {
    const { client } = mockClient([null, null]);
    await expect(factoryDecompose({ inputs, client })).rejects.toMatchObject({ error_class: 'EmptyResponse' });
  });

  it('throws ContractViolation when JSON parses but the shape is wrong (empty processes), bounded', async () => {
    const bad = JSON.stringify({ ...validDecomposition(), processes: [] });
    const { client, create } = mockClient([bad, bad]);
    await expect(factoryDecompose({ inputs, client })).rejects.toMatchObject({ error_class: 'ContractViolation' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('classifies a timeout as UpstreamTimeout and a generic failure as UpstreamError (no retry on throw)', async () => {
    const timeoutClient = { create: jest.fn(async () => { const e: any = new Error('request aborted'); e.name = 'APIConnectionTimeoutError'; throw e; }) } as any;
    await expect(factoryDecompose({ inputs, client: timeoutClient })).rejects.toMatchObject({ error_class: 'UpstreamTimeout' });
    expect(timeoutClient.create).toHaveBeenCalledTimes(1); // a thrown upstream error is not shape-retried

    const errClient = { create: jest.fn(async () => { throw new Error('500 boom'); }) } as any;
    await expect(factoryDecompose({ inputs, client: errClient })).rejects.toMatchObject({ error_class: 'UpstreamError' });
  });

  it('throws ConfigError when no client is injected and OPENAI_API_KEY is unset', async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await expect(factoryDecompose({ inputs })).rejects.toMatchObject({ error_class: 'ConfigError' });
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });
});

describe('toStrictSchema makes the frozen schema strict-submittable without mutating it', () => {
  it('rewrites every oneOf to anyOf and leaves no oneOf behind', () => {
    const strict = toStrictSchema(FACTORY_DECOMPOSITION_JSON_SCHEMA);
    const asText = JSON.stringify(strict);
    expect(asText).not.toContain('oneOf');
    expect(asText).toContain('anyOf'); // the executor union is preserved as anyOf
    // the frozen source is untouched (still has its oneOf)
    expect(JSON.stringify(FACTORY_DECOMPOSITION_JSON_SCHEMA)).toContain('oneOf');
  });
  it('preserves the executor null-or-object branches', () => {
    const strict: any = toStrictSchema(FACTORY_DECOMPOSITION_JSON_SCHEMA);
    const executor = strict.properties.assignments.items.properties.executor;
    expect(executor.anyOf).toBeDefined();
    const types = executor.anyOf.map((b: any) => b.type);
    expect(types).toContain('object');
    expect(types).toContain('null');
  });
});

describe('isDecompositionShaped localises a bad response', () => {
  it('accepts a well-shaped decomposition', () => {
    expect(isDecompositionShaped(validDecomposition())).toBe(true);
  });
  it('rejects missing arrays or empty processes/tasks', () => {
    expect(isDecompositionShaped(null)).toBe(false);
    expect(isDecompositionShaped({ ...validDecomposition(), processes: [] })).toBe(false);
    expect(isDecompositionShaped({ ...validDecomposition(), tasks: [] })).toBe(false);
    expect(isDecompositionShaped({ processes: [{}], tasks: [{}] })).toBe(false); // no assignment/transition/role arrays
  });
});

// Referenced so the FactoryDecomposeError class import is exercised as a value, not just a type.
it('FactoryDecomposeError carries its error_class', () => {
  expect(new FactoryDecomposeError('ConfigError', 'x').error_class).toBe('ConfigError');
});
