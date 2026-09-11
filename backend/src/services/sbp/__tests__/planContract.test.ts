/**
 * planContract — the schema↔type round-trip test.
 *
 * `planContract.ts` claims the JSON schema and the TypeScript types "cannot
 * drift". That claim needs a test, or it is just a comment: the first version of
 * this contract declared `PlanStory.blocked_by` while the schema set
 * `additionalProperties: false` and never listed it — so a model generating
 * against the schema could never emit the field, and two of the gate's ten rules
 * (`dangling_blocked_by`, `r0_not_ungated`) were unreachable on real output.
 *
 * This test makes that class of drift impossible to reintroduce silently.
 */
import { DECOMPOSE_SYSTEM_PROMPT } from '../decomposePrompt';
import {
  BUILD_PLAN_JSON_SCHEMA,
  BuildPlan,
  PlanRelease,
  PlanRequirement,
  PlanStory,
  REQUIREMENT_KINDS,
  PRIORITIES,
  isConstraint,
  requiresStoryCoverage,
} from '../planContract';

/**
 * The TypeScript interfaces, restated as the field lists the schema must be able
 * to carry. Kept explicit rather than reflected, because TS types are erased at
 * runtime — this list IS the assertion, and adding a field to an interface
 * without adding it here will surface in review as an untested change.
 */
const TYPE_FIELDS = {
  requirement: ['id', 'statement', 'kind', 'priority', 'cluster', 'from_dimensions',] as (keyof PlanRequirement)[],
  release: ['key', 'name', 'goal', 'demo', 'week_start', 'week_end'] as (keyof PlanRelease)[],
  story: [
    'id', 'release', 'title', 'narrative', 'fulfills', 'owner_agent',
    'acceptance', 'task_guidance', 'failure_paths', 'blocked_by',
  ] as (keyof PlanStory)[],
  plan: ['project_name', 'descriptor', 'requirements', 'releases', 'stories'] as (keyof BuildPlan)[],
};

const schema = BUILD_PLAN_JSON_SCHEMA as any;
const itemSchema = (k: 'requirements' | 'releases' | 'stories') => schema.properties[k].items;

describe('schema ↔ type round trip', () => {
  it('the top-level plan declares every BuildPlan field', () => {
    expect(Object.keys(schema.properties).sort()).toEqual([...TYPE_FIELDS.plan].sort());
    expect([...schema.required].sort()).toEqual([...TYPE_FIELDS.plan].sort());
  });

  it.each([
    ['requirements', TYPE_FIELDS.requirement],
    ['releases', TYPE_FIELDS.release],
    ['stories', TYPE_FIELDS.story],
  ] as const)('%s declares every field its TypeScript interface has', (key, fields) => {
    const props = Object.keys(itemSchema(key).properties);
    expect(props.sort()).toEqual([...fields].sort());
  });

  /**
   * The specific regression. `additionalProperties: false` means anything not in
   * `properties` is unrepresentable — a field the type declares but the schema
   * omits can never arrive from the model.
   */
  it.each(['requirements', 'releases', 'stories'] as const)(
    '%s: no declared field is unrepresentable under additionalProperties:false',
    (key) => {
      const item = itemSchema(key);
      expect(item.additionalProperties).toBe(false);
      const declared = new Set(Object.keys(item.properties));
      const missing = TYPE_FIELDS[key === 'requirements' ? 'requirement' : key === 'releases' ? 'release' : 'story']
        .filter((f) => !declared.has(f as string));
      expect(missing).toEqual([]);
    },
  );

  it('stories can carry blocked_by, or the gate rules that read it are dead code', () => {
    const story = itemSchema('stories');
    expect(story.properties.blocked_by).toBeDefined();
    expect(story.properties.blocked_by.type).toBe('array');
    expect(story.properties.blocked_by.items.type).toBe('string');
  });

  /**
   * OpenAI strict structured output requires every key in `properties` to also
   * appear in `required`. A field that is optional in TypeScript is still
   * required here; the model emits an empty array instead of omitting it.
   */
  it.each(['requirements', 'releases', 'stories'] as const)(
    '%s: every property is also required (OpenAI strict mode)',
    (key) => {
      const item = itemSchema(key);
      expect([...item.required].sort()).toEqual(Object.keys(item.properties).sort());
    },
  );

  it('the kind and priority enums match their exported const tuples', () => {
    expect(itemSchema('requirements').properties.kind.enum).toEqual([...REQUIREMENT_KINDS]);
    expect(itemSchema('requirements').properties.priority.enum).toEqual([...PRIORITIES]);
  });

  it('CONSTRAINT is offered to the model, or it can never type one', () => {
    expect(itemSchema('requirements').properties.kind.enum).toContain('CONSTRAINT');
  });
});

describe('coverage predicates', () => {
  const r = (over: Partial<PlanRequirement>): PlanRequirement => ({
    id: 'REQ-001', statement: 's', kind: 'FUNC', priority: 'must', cluster: 'c', ...over,
  });

  it('identifies constraints', () => {
    expect(isConstraint(r({ kind: 'CONSTRAINT' }))).toBe(true);
    expect(isConstraint(r({ kind: 'FUNC' }))).toBe(false);
  });

  it('exempts constraints from story coverage even at must priority', () => {
    expect(requiresStoryCoverage(r({ kind: 'CONSTRAINT', priority: 'must' }))).toBe(false);
  });

  it('requires coverage for a non-constraint must, and not for a should', () => {
    expect(requiresStoryCoverage(r({ kind: 'FUNC', priority: 'must' }))).toBe(true);
    expect(requiresStoryCoverage(r({ kind: 'FUNC', priority: 'should' }))).toBe(false);
  });
});

/**
 * Traceability, and the two ways it can be a lie.
 *
 * A requirement citing a dimension nobody uses is unusable downstream; a
 * requirement citing something plausible it cannot point at is worse, because
 * it reads as evidence. The prompt asks for an empty array in that case and
 * these pin both halves of the contract that makes that answer safe.
 */
describe('requirement traceability', () => {
  const requirementSchema = (BUILD_PLAN_JSON_SCHEMA as any).properties.requirements.items;

  it('is required in the schema so the model must answer, even with nothing', () => {
    // Optional in TypeScript, required on the wire: strict structured output
    // demands every property appear in `required`, so the model emits [] rather
    // than omitting the key and leaving us unable to tell "none" from "not asked".
    expect(requirementSchema.required).toContain('from_dimensions');
    expect(requirementSchema.properties.from_dimensions.type).toBe('array');
  });

  it('names the canonical dimensions in the prompt, so a citation is checkable', () => {
    for (const dimension of ['approval_points', 'systems', 'current_workflow', 'unknowns']) {
      expect(DECOMPOSE_SYSTEM_PROMPT).toContain(dimension);
    }
  });

  it('tells the model that citing nothing is a correct answer', () => {
    // Without this the model invents a citation for every requirement, and a
    // plausible-looking citation is worse than none: it reads as evidence.
    // Whitespace-tolerant: the prompt is hard-wrapped, so a phrase that reads as
    // one sentence spans a newline and an indent. Asserting the literal string
    // would fail on a reflow that changed nothing about the instruction.
    const flat = DECOMPOSE_SYSTEM_PROMPT.replace(/\s+/g, ' ');
    expect(flat).toMatch(/empty array is the correct and expected answer/i);
    expect(flat).toMatch(/would not be able to point at the sentence, cite nothing/i);
  });

  it('survives a round trip through JSON, which is how it reaches the repo docs', () => {
    const requirement = {
      id: 'REQ-001',
      statement: 'The system flags an invoice that disagrees with its purchase order.',
      kind: 'FUNC' as const,
      priority: 'must' as const,
      cluster: 'Reconciliation',
      from_dimensions: ['approval_points', 'systems'],
    };
    expect(JSON.parse(JSON.stringify(requirement)).from_dimensions)
      .toEqual(['approval_points', 'systems']);
  });

  it('a plan with no citations still parses, because old plans have none', () => {
    const legacy = {
      id: 'REQ-001', statement: 'A statement.', kind: 'FUNC' as const,
      priority: 'must' as const, cluster: 'Some cluster',
    };
    expect(legacy).not.toHaveProperty('from_dimensions');
    expect(JSON.parse(JSON.stringify(legacy)).from_dimensions).toBeUndefined();
  });
});
