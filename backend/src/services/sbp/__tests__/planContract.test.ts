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
  requirement: ['id', 'statement', 'kind', 'priority', 'cluster'] as (keyof PlanRequirement)[],
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
