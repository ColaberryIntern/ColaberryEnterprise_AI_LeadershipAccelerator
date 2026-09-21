/**
 * The JSON-schema mirror and the TypeScript contract must agree on the key set, or the
 * Phase-2 LLM will be asked to fill a shape that no longer matches the code. This is the same
 * guarantee planContract.test.ts gives BuildPlan ↔ BUILD_PLAN_JSON_SCHEMA: a typed sample and
 * the schema are compared key-for-key so a field added to one and not the other fails here.
 *
 * Phase 2 widens the mirror to the WHOLE decomposition (processes + tasks + assignments +
 * transitions + roles) so the LLM can emit a complete, gate-valid FactoryProject. The lockstep
 * is extended the same way, and — because the point is that the schema describes the REAL data a
 * gate-valid project carries — the known zero-error sample's own records are checked field-for-field
 * against the schemas (additionalProperties:false + all-required means the key sets must be equal).
 */
import type { FactoryTask, Assignment, ProcessRecord, Role, TransitionEdge } from '../factoryContract';
import {
  FACTORY_TASK_JSON_SCHEMA,
  FACTORY_ASSIGNMENT_JSON_SCHEMA,
  FACTORY_PROCESS_JSON_SCHEMA,
  FACTORY_TRANSITION_JSON_SCHEMA,
  FACTORY_ROLE_JSON_SCHEMA,
  FACTORY_DECOMPOSITION_JSON_SCHEMA,
} from '../factoryContractSchema';
import { buildSampleContractProject } from '../../sample/sampleContractProject';

// Typed samples: TS enforces these satisfy the interfaces; the test enforces they satisfy the
// schema. If a field is added to the interface, these stop compiling; if it is added to the
// schema only, the key-set assertions below fail.
const sampleTask: FactoryTask = {
  id: 'task-1', process_id: 'proc-1', title: 'Review the compliance matrix', description: 'x',
  kind: 'TASK', stage_id: 'stage-1', source_evidence: ['blk-1'], required_skills: ['skill.compliance'],
  judgment_level: 'high', decision_authority: 'recommend', data_sensitivity: 'confidential',
  interaction_pattern: 'reviewer, internal', frequency: 'per solicitation', effort_minutes: 45,
  effort_basis: 'ESTIMATED', confidence: 0.7, method: 'LLM',
};

const sampleAssignment: Assignment = {
  id: 'asg-1', task_id: 'task-1', role_id: 'role-1', responsibility: 'PERFORMER',
  executor: { type: 'agent', id: 'agent.compliance' }, minutes: 45, basis: 'ESTIMATED',
  evidence_note: null,
};

const sampleProcess: ProcessRecord = {
  id: 'proc-1', business_outcome: 'A compliance matrix is produced', success_criterion: 'every req mapped',
  trigger: 'a solicitation is uploaded', inputs: ['solicitation'], outputs: ['compliance matrix'],
  decision_branches: ['technical vs administrative'], future_owner_role_id: 'role-1', exceptions: ['ambiguous req flagged'],
};

const sampleRole: Role = { id: 'role-1', name: 'Compliance Analyst', definition: 'owns the matrix' };

const sampleTransition: TransitionEdge = {
  id: 'edge-1', from_task_id: 'task-0', to_task_id: 'task-1', condition: null, is_rework: false,
};

function keysAgree(sample: Record<string, unknown>, schema: { required: readonly string[]; properties: Record<string, unknown> }) {
  const sampleKeys = Object.keys(sample).sort();
  const schemaProps = Object.keys(schema.properties).sort();
  const required = [...schema.required].sort();
  return { sampleKeys, schemaProps, required };
}

describe('factory contract ↔ JSON-schema mirror stay in lockstep', () => {
  it('FactoryTask: schema properties, required, and the typed sample all carry the same keys', () => {
    const { sampleKeys, schemaProps, required } = keysAgree(sampleTask as any, FACTORY_TASK_JSON_SCHEMA as any);
    expect(schemaProps).toEqual(sampleKeys);   // no schema key the type lacks, and vice-versa
    expect(required).toEqual(sampleKeys);       // every field is required (nullable, not optional)
  });

  it('Assignment: schema properties, required, and the typed sample all carry the same keys', () => {
    const { sampleKeys, schemaProps, required } = keysAgree(sampleAssignment as any, FACTORY_ASSIGNMENT_JSON_SCHEMA as any);
    expect(schemaProps).toEqual(sampleKeys);
    expect(required).toEqual(sampleKeys);
  });

  it('ProcessRecord: schema properties, required, and the typed sample all carry the same keys', () => {
    const { sampleKeys, schemaProps, required } = keysAgree(sampleProcess as any, FACTORY_PROCESS_JSON_SCHEMA as any);
    expect(schemaProps).toEqual(sampleKeys);
    expect(required).toEqual(sampleKeys);
  });

  it('Role: schema properties, required, and the typed sample all carry the same keys', () => {
    const { sampleKeys, schemaProps, required } = keysAgree(sampleRole as any, FACTORY_ROLE_JSON_SCHEMA as any);
    expect(schemaProps).toEqual(sampleKeys);
    expect(required).toEqual(sampleKeys);
  });

  it('TransitionEdge: schema properties, required, and the typed sample all carry the same keys', () => {
    const { sampleKeys, schemaProps, required } = keysAgree(sampleTransition as any, FACTORY_TRANSITION_JSON_SCHEMA as any);
    expect(schemaProps).toEqual(sampleKeys);
    expect(required).toEqual(sampleKeys);
  });

  it('enum values in the schema match the values the typed sample uses', () => {
    expect((FACTORY_TASK_JSON_SCHEMA.properties.kind as any).enum).toContain(sampleTask.kind);
    expect((FACTORY_TASK_JSON_SCHEMA.properties.method as any).enum).toContain(sampleTask.method);
    expect((FACTORY_ASSIGNMENT_JSON_SCHEMA.properties.responsibility as any).enum).toContain(sampleAssignment.responsibility);
  });

  it('an agent executor is representable (the shape the OVERSIGHT rule later guards)', () => {
    expect(sampleAssignment.executor).toEqual({ type: 'agent', id: 'agent.compliance' });
  });
});

describe('FACTORY_DECOMPOSITION_JSON_SCHEMA composes the five record schemas', () => {
  it('requires exactly the five decomposition arrays, each keyed to its record schema', () => {
    expect([...FACTORY_DECOMPOSITION_JSON_SCHEMA.required].sort())
      .toEqual(['assignments', 'processes', 'roles', 'tasks', 'transitions']);
    const props = FACTORY_DECOMPOSITION_JSON_SCHEMA.properties;
    expect(Object.keys(props).sort()).toEqual(['assignments', 'processes', 'roles', 'tasks', 'transitions']);
    // every property is an array whose items reference the matching frozen/added record schema
    expect(props.processes.items).toBe(FACTORY_PROCESS_JSON_SCHEMA);
    expect(props.tasks.items).toBe(FACTORY_TASK_JSON_SCHEMA);
    expect(props.assignments.items).toBe(FACTORY_ASSIGNMENT_JSON_SCHEMA);
    expect(props.transitions.items).toBe(FACTORY_TRANSITION_JSON_SCHEMA);
    expect(props.roles.items).toBe(FACTORY_ROLE_JSON_SCHEMA);
    expect((FACTORY_DECOMPOSITION_JSON_SCHEMA as any).additionalProperties).toBe(false);
  });
});

describe('the schemas describe the REAL data a gate-valid project carries (known-good sample)', () => {
  // additionalProperties:false + every field required means a record's key set must EQUAL the
  // schema's property key set — so this catches a schema drifting from the data in either direction.
  const project = buildSampleContractProject();
  const propKeys = (schema: { properties: Record<string, unknown> }) => Object.keys(schema.properties).sort();
  const recordConforms = (record: Record<string, unknown>, schema: { properties: Record<string, unknown> }) =>
    expect(Object.keys(record).sort()).toEqual(propKeys(schema));

  it('every process in the sample matches FACTORY_PROCESS_JSON_SCHEMA', () => {
    expect(project.processes.length).toBeGreaterThan(0);
    project.processes.forEach((p) => recordConforms(p as any, FACTORY_PROCESS_JSON_SCHEMA as any));
  });
  it('every task in the sample matches FACTORY_TASK_JSON_SCHEMA', () => {
    expect(project.tasks.length).toBeGreaterThan(0);
    project.tasks.forEach((t) => recordConforms(t as any, FACTORY_TASK_JSON_SCHEMA as any));
  });
  it('every assignment in the sample matches FACTORY_ASSIGNMENT_JSON_SCHEMA', () => {
    expect(project.assignments.length).toBeGreaterThan(0);
    project.assignments.forEach((a) => recordConforms(a as any, FACTORY_ASSIGNMENT_JSON_SCHEMA as any));
  });
  it('every transition in the sample matches FACTORY_TRANSITION_JSON_SCHEMA', () => {
    expect(project.transitions.length).toBeGreaterThan(0);
    project.transitions.forEach((e) => recordConforms(e as any, FACTORY_TRANSITION_JSON_SCHEMA as any));
  });
  it('every role in the sample matches FACTORY_ROLE_JSON_SCHEMA', () => {
    expect(project.roles.length).toBeGreaterThan(0);
    project.roles.forEach((r) => recordConforms(r as any, FACTORY_ROLE_JSON_SCHEMA as any));
  });
});
