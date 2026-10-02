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
  FACTORY_ALLOCATION_JSON_SCHEMA,
  FACTORY_ROLE_MAP_JSON_SCHEMA,
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

describe('FACTORY_DECOMPOSITION_JSON_SCHEMA composes the seven record schemas', () => {
  it('requires exactly the seven decomposition arrays, each keyed to its record schema', () => {
    // SEVEN now, matching `properties` exactly. Strict structured outputs require that parity
    // at every object level, and the parity test below enforces it structurally; this keeps
    // the exact names pinned too, so adding a key silently is still impossible.
    expect([...FACTORY_DECOMPOSITION_JSON_SCHEMA.required].sort())
      .toEqual(['allocation', 'assignments', 'processes', 'role_map', 'roles', 'tasks', 'transitions']);
    const props = FACTORY_DECOMPOSITION_JSON_SCHEMA.properties;
    // CORRECTED: an earlier version of this comment said allocation and role_map were
    // deliberately absent from `required`. That was wrong and broke strict-mode parity. They
    // are in `required` and NULLABLE instead. Pinned as an exact set, never a subset check.
    expect(Object.keys(props).sort()).toEqual(['allocation', 'assignments', 'processes', 'role_map', 'roles', 'tasks', 'transitions']);
    // every property is an array whose items reference the matching frozen/added record schema
    expect(props.processes.items).toBe(FACTORY_PROCESS_JSON_SCHEMA);
    expect(props.tasks.items).toBe(FACTORY_TASK_JSON_SCHEMA);
    expect(props.assignments.items).toBe(FACTORY_ASSIGNMENT_JSON_SCHEMA);
    expect(props.transitions.items).toBe(FACTORY_TRANSITION_JSON_SCHEMA);
    expect(props.roles.items).toBe(FACTORY_ROLE_JSON_SCHEMA);
    expect(props.allocation.items).toBe(FACTORY_ALLOCATION_JSON_SCHEMA);
    expect(props.role_map.items).toBe(FACTORY_ROLE_MAP_JSON_SCHEMA);
    expect((FACTORY_DECOMPOSITION_JSON_SCHEMA as any).additionalProperties).toBe(false);
  });
});


  /**
   * Walk every object node and assert required/properties parity.
   *
   * THIS IS THE TEST THAT WAS MISSING. OpenAI strict structured outputs require every key in
   * `properties` to appear in `required`, at every level, and this schema is submitted with
   * `strict: true` from factoryDecompose.ts and factoryRepair.ts. P3-T3 broke that parity at the
   * root and NO test noticed, because both of those suites mock the client - so the schema would
   * have become unsubmittable and nothing would have generated at all once the flag flipped.
   *
   * Structural rather than a name list: it covers keys nobody has added yet.
   */
  function parityViolations(root: unknown): string[] {
    const out: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (n.type === 'object' && n.properties) {
        const props = Object.keys(n.properties as object).sort();
        const req = [...((n.required as string[]) ?? [])].sort();
        if (JSON.stringify(props) !== JSON.stringify(req)) {
          out.push(`${path || '$'}: properties=[${props}] required=[${req}]`);
        }
      }
      for (const [k, v] of Object.entries(n)) {
        if (v && typeof v === 'object') walk(v, `${path}.${k}`);
      }
    };
    walk(root, '');
    return out;
  }

  it('satisfies strict-mode required/properties parity at EVERY object level', () => {
    expect(parityViolations(FACTORY_DECOMPOSITION_JSON_SCHEMA)).toEqual([]);
  });

  it('POSITIVE CONTROL: the parity walk reports a violation when one key is dropped', () => {
    // Without this, an always-empty result would read as success forever.
    const broken = {
      ...FACTORY_DECOMPOSITION_JSON_SCHEMA,
      required: FACTORY_DECOMPOSITION_JSON_SCHEMA.required
        .filter((r) => r !== 'allocation'),
    };
    const found = parityViolations(broken);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('allocation');
  });

  it('allocation and role_map are NULLABLE, so required parity costs the model nothing', () => {
    // Strict mode forces them into `required`; `null` is how a model says "nothing to state"
    // without inventing rows. Absence is MEANT to be caught by allocation_unknown downstream,
    // which is not live yet - see the note in factoryContractSchema.ts. T6 wires it.
    const props = FACTORY_DECOMPOSITION_JSON_SCHEMA.properties;
    expect(props.allocation.type).toEqual(['array', 'null']);
    expect(props.role_map.type).toEqual(['array', 'null']);
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
