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
import fs from 'fs';
import path from 'path';
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
  StoryReferences,
} from '../planContract';

/**
 * The TypeScript interfaces, restated as the field lists the schema must be able
 * to carry. Kept explicit rather than reflected, because TS types are erased at
 * runtime — this list IS the assertion.
 *
 * SPLIT IN TWO ON 2026-10-09 (P6-T3), because one list could not express the
 * truth. `BuildPlan.agents` has never been in the schema — it is "populated by
 * scopeAgents, never by the model" — so it was simply left out of the list
 * below, and nothing recorded that the omission was deliberate. An omission
 * that looks identical to the drift this file exists to catch is not a test.
 *
 * So fields now belong to exactly one of two sets: MODEL_EMITTED, which the
 * schema must declare, and SERVER_POPULATED, which it must NOT. The exhaustiveness
 * check below reads the interfaces out of the SOURCE and fails the suite, by
 * name, when a field lands in neither — rather than something that "will surface
 * in review". It is a runtime check for a measured reason; see its own comment.
 */
const MODEL_EMITTED = {
  requirement: ['id', 'statement', 'kind', 'priority', 'cluster', 'from_dimensions',] as const,
  release: ['key', 'name', 'goal', 'demo', 'week_start', 'week_end'] as const,
  story: [
    'id', 'release', 'title', 'narrative', 'fulfills', 'owner_agent',
    'acceptance', 'task_guidance', 'failure_paths', 'blocked_by',
    // MOVED HERE from SERVER_POPULATED on 2026-10-10. `workspace` is a classification of
    // the story's own content, not a pointer to an existing row, so the model can emit it
    // without fabricating anything - and as a server-populated field it was unfeedable on
    // the student side, which is the only side `release_review` was built for.
    'workspace',
  ] as const,
  plan: ['project_name', 'descriptor', 'requirements', 'releases', 'stories'] as const,
};

/**
 * Fields the SERVER fills in after generation, which the schema must never declare.
 *
 * `agents` is scoped from the requirements once the plan is gate-clean. `references` pins a
 * blueprint revision and hash and business-task ids — identifiers of rows that
 * exist, which a model asked to produce would invent.
 */
const SERVER_POPULATED = {
  requirement: [] as const,
  release: [] as const,
  story: ['references'] as const,
  plan: ['agents'] as const,
};

/**
 * EXHAUSTIVENESS, read out of the SOURCE at runtime.
 *
 * The first version of this was a type-level assertion — `Unaccounted<T, …> extends never ? true :
 * never`, assigned `true`, so a forgotten field would make the file fail to compile. It was
 * DECORATIVE, and I only know that because I tested it: adding an unaccounted field to `PlanStory`
 * and re-running the suite returned 27/27 green.
 *
 * Two things in this repository make any type-level assertion in a backend test unenforceable, and
 * together they close the door completely:
 *
 *   - `backend/tsconfig.json` excludes `**\/*.test.ts`, so `tsc --noEmit` never sees this file;
 *   - `jest.config.ts:30` sets ts-jest's `isolatedModules: true`, which TRANSPILES instead of
 *     type-checking. That is why a stray `*` + `/` inside a block comment in a sibling suite DID
 *     fail (a syntax error survives transpilation) while `Type 'true' is not assignable to type
 *     'never'` does not.
 *
 * So the check reads the interface declarations out of `planContract.ts` and asserts every field
 * lands in exactly one list. TS types are erased at runtime; the source text is not.
 */
const CONTRACT_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'planContract.ts'), 'utf8',
).replace(/\r\n/g, '\n');

/**
 * Top-level field names declared by one interface.
 *
 * Deliberately simple: these four interfaces have no nested object literals at the top level, and
 * doc-comment lines are indented three spaces plus `*` so they cannot match a two-space field
 * pattern. The guard against this parser silently matching nothing is the test below, which
 * asserts a known field is found.
 */
function declaredFields(iface: string): string[] {
  const start = CONTRACT_SOURCE.indexOf(`export interface ${iface} {`);
  if (start < 0) return [];
  const body = CONTRACT_SOURCE.slice(start, CONTRACT_SOURCE.indexOf('\n}', start));
  return [...body.matchAll(/^ {2}([a-z_][a-zA-Z0-9_]*)\??:/gm)].map((m) => m[1]).sort();
}

/** Kept so the existing assertions below read unchanged. */
const TYPE_FIELDS = {
  requirement: [...MODEL_EMITTED.requirement] as (keyof PlanRequirement)[],
  release: [...MODEL_EMITTED.release] as (keyof PlanRelease)[],
  story: [...MODEL_EMITTED.story] as (keyof PlanStory)[],
  plan: [...MODEL_EMITTED.plan] as (keyof BuildPlan)[],
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

/**
 * P6-T3 — the server-populated references.
 *
 * `request.md:245` requires every story to carry requirement ids, business-task ids, a
 * runtime-agent reference, a workspace/action or headless reference, a blueprint revision/hash,
 * design/policy references, failure paths, dependency links and acceptance evidence. Four of those
 * already existed (`fulfills`, `owner_agent`, `failure_paths`, `blocked_by`); `StoryReferences`
 * carries the rest.
 */
describe('P6-T3 — StoryReferences is server-populated, and the schema must not declare it', () => {
  it('the story schema does NOT declare `references`, so the model can never emit one', () => {
    // The point of the design, asserted rather than described. A blueprint content hash emitted by
    // a language model would be a plausible hex string with nothing behind it.
    expect(Object.keys(itemSchema('stories').properties)).not.toContain('references');
  });

  it('the two field sets are disjoint, so nothing is claimed by both', () => {
    for (const kind of ['requirement', 'release', 'story', 'plan'] as const) {
      const overlap = (MODEL_EMITTED[kind] as readonly string[])
        .filter((f) => (SERVER_POPULATED[kind] as readonly string[]).includes(f));
      expect(overlap).toEqual([]);
    }
  });

  it('every server-populated field is one the schema genuinely omits', () => {
    // Guards the inverse mistake: listing a field as server-populated while the schema also
    // declares it, which would let the model emit a value the server then silently overwrites.
    expect(Object.keys(schema.properties)).not.toContain('agents');
    expect(Object.keys(itemSchema('stories').properties)).not.toContain('references');
  });

  it('a fully-populated references block survives a JSON round trip', () => {
    // How it actually travels: `plan_json` in Postgres, then into the repo documents.
    const refs: StoryReferences = {
      business_task_ids: ['BT-004', 'BT-011'],
      blueprint: { revision: 3, content_sha256: 'a'.repeat(64) },
      design_refs: ['DD-002'],
      builder_agent: 'claude-code',
      acceptance_evidence: ['the approval row exists with the approver identity'],
    };
    expect(JSON.parse(JSON.stringify(refs))).toEqual(refs);
  });

  it('headless is a real answer, and it lives on the STORY not in references', () => {
    // Background work that no page shows must be expressible, or whoever fills this in will
    // either invent a workspace or leave the field absent — and absence means "not established".
    //
    // REWRITTEN 2026-10-11. This test used to build `workspace` INSIDE `StoryReferences`, which
    // stopped being true when the field moved to `PlanStory`. It kept passing, because nothing
    // type-checks a backend test file (tsconfig excludes `__tests__`, ts-jest transpiles) and it
    // asserted a property of a literal it had just written. A test that cannot fail, asserting
    // the opposite of what shipped - which is why it is now written against the real type.
    const story: PlanStory = {
      id: 'STORY-001', release: 'r0', title: 't', narrative: 'n', fulfills: [],
      owner_agent: 'AGENT-001', acceptance: [], task_guidance: 'g', failure_paths: [],
      workspace: { kind: 'headless', ref: 'nightly-reconciliation', action: null },
    };
    expect(story.workspace!.kind).toBe('headless');

    // And the source confirms the move rather than the literal confirming itself: the model-
    // emitted field is declared on PlanStory, and StoryReferences no longer carries one.
    expect(declaredFields('PlanStory')).toContain('workspace');
    expect(declaredFields('StoryReferences')).not.toContain('workspace');

    const refs: StoryReferences = {
      business_task_ids: [],
      blueprint: { revision: 1, content_sha256: 'b'.repeat(64) },
      design_refs: [],
      acceptance_evidence: [],
    };
    // `builder_agent` is optional; omitting it must not make the object invalid.
    expect('builder_agent' in refs).toBe(false);
  });

  it('builder_agent is a DIFFERENT field from owner_agent', () => {
    // `request.md:245`: "Do not overload `owner_agent` with both the coding agent and the runtime
    // employee." `owner_agent` names a PlanAgent — a unit of autonomous work inside the system the
    // student is building. The thing that writes the code is a different actor.
    const story: PlanStory = {
      id: 'STORY-001', release: 'r0', title: 't', narrative: 'n', fulfills: [],
      owner_agent: 'AGENT-001', acceptance: [], task_guidance: 'g', failure_paths: [],
      references: {
        business_task_ids: [],
        blueprint: { revision: 1, content_sha256: 'c'.repeat(64) },
        design_refs: [], builder_agent: 'claude-code', acceptance_evidence: [],
      },
    };
    expect(story.owner_agent).not.toBe(story.references!.builder_agent);
  });
});

describe('every contract field is accounted for as model-emitted or server-populated', () => {
  const CASES = [
    ['PlanRequirement', 'requirement', 'statement'] as const,
    ['PlanRelease', 'release', 'demo'] as const,
    ['PlanStory', 'story', 'owner_agent'] as const,
    ['BuildPlan', 'plan', 'descriptor'] as const,
  ];

  it.each(CASES)('%s: the parser finds real fields, so a miss cannot pass vacuously', (iface, _k, known) => {
    // The apparatus guard. A regex that matches nothing makes every assertion below trivially
    // true, which is how the type-level version of this check passed while doing nothing.
    const found = declaredFields(iface);
    expect(found.length).toBeGreaterThan(3);
    expect(found).toContain(known);
  });

  it.each(CASES)('%s: every declared field is in exactly one list', (iface, key) => {
    const model = MODEL_EMITTED[key] as readonly string[];
    const server = SERVER_POPULATED[key] as readonly string[];
    const unaccounted = declaredFields(iface).filter((f) => !model.includes(f) && !server.includes(f));
    // Named, not counted: the failure tells you which field you forgot.
    expect(unaccounted).toEqual([]);
  });

  it.each(CASES)('%s: neither list names a field the interface does not declare', (iface, key) => {
    // The opposite drift: a list entry left behind after a field was renamed or removed, which
    // would quietly excuse a real field from the check.
    const declared = declaredFields(iface);
    const listed = [...(MODEL_EMITTED[key] as readonly string[]), ...(SERVER_POPULATED[key] as readonly string[])];
    expect(listed.filter((f) => !declared.includes(f))).toEqual([]);
  });
});
