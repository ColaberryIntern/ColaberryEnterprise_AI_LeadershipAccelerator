/**
 * The JSON-schema mirror and the TypeScript contract must agree on the key set, or the
 * Phase-2 LLM will be asked to fill a shape that no longer matches the code. This is the same
 * guarantee planContract.test.ts gives BuildPlan ↔ BUILD_PLAN_JSON_SCHEMA: a typed sample and
 * the schema are compared key-for-key so a field added to one and not the other fails here.
 */
import type { FactoryTask, Assignment } from '../factoryContract';
import { FACTORY_TASK_JSON_SCHEMA, FACTORY_ASSIGNMENT_JSON_SCHEMA } from '../factoryContractSchema';

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

  it('enum values in the schema match the values the typed sample uses', () => {
    expect((FACTORY_TASK_JSON_SCHEMA.properties.kind as any).enum).toContain(sampleTask.kind);
    expect((FACTORY_TASK_JSON_SCHEMA.properties.method as any).enum).toContain(sampleTask.method);
    expect((FACTORY_ASSIGNMENT_JSON_SCHEMA.properties.responsibility as any).enum).toContain(sampleAssignment.responsibility);
  });

  it('an agent executor is representable (the shape the OVERSIGHT rule later guards)', () => {
    expect(sampleAssignment.executor).toEqual({ type: 'agent', id: 'agent.compliance' });
  });
});
