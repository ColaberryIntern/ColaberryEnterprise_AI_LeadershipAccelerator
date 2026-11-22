/**
 * THE SHIPPED SCAFFOLD'S OUTPUT MUST PASS THE SHIPPED CONTRACT.
 *
 * ## The defect this closes, which this change itself introduced
 *
 * `demoKit.ts` ships four files to every student: the engine, the scaffold, the standalone
 * builder, and the contract document. The spec contract moved to v2 when the trust standard
 * landed, and `demoRender.ts` now REFUSES anything that is not `schema_version: 2` with an
 * `events` array. The generator was updated. **The scaffold was not**, and neither was the
 * contract document the student reads: both still said version 1, and the scaffold emitted no
 * events at all.
 *
 * So a student following this kit's own instructions produced a file the kit's own engine
 * rendered without a timeline and the platform's public route rejected outright. Nothing caught
 * it, because `demoKit.drift.test.ts` compares the generated bundle against the readable files
 * byte for byte and both copies were equally wrong.
 *
 * ## Why this test is the right shape
 *
 * Asserting that the scaffold's source contains the string `schema_version: 2` would have passed
 * while the events array was missing, malformed, or absent on the branch where a plan has no
 * agents. So this RUNS the shipped bytes, in a temporary directory, over a real plan fixture,
 * and parses the result through the same `validateDemoSpecShape` the renderer uses. The two can
 * no longer disagree without this failing.
 *
 * It runs the bytes from `demoKitFiles()`, not the readable file on disk, because the bundle is
 * what ships. `demoKit.drift.test.ts` already proves the two are identical; this proves the one
 * that reaches a student is valid.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { demoKitFiles } from '../demoKit';
// The path constants live with the STORY, not with the bundle: `connectedDemoStory.ts` owns the
// repo layout the student receives, and `demoKit.ts` imports them from there rather than
// declaring a second copy.
import { DEMO_KIT_SCAFFOLD_PATH, DEMO_KIT_CONTRACT_PATH } from '../connectedDemoStory';
import { validateDemoSpecShape, DemoSpecSchema } from '../demoSpec/contract';

/* eslint-disable @typescript-eslint/no-var-requires */
const PLAN = require('./fixtures/shiftfill-e2e-plan.json');

/** A data model in the shape STORY-000 writes: tables, each with typed fields. */
const DATA_MODEL = {
  tables: [
    {
      name: 'gap',
      purpose: 'one unfilled shift',
      fields: [
        { name: 'id', type: 'id' },
        { name: 'office', type: 'text' },
        { name: 'shift', type: 'text' },
        { name: 'starts_at', type: 'timestamp' },
        { name: 'status', type: 'enum', note: 'open, offered, filled' },
        { name: 'urgent', type: 'boolean' },
      ],
    },
    {
      name: 'hygienist',
      purpose: 'a person who can take a shift',
      fields: [
        { name: 'id', type: 'id' },
        { name: 'name', type: 'text' },
        { name: 'mobile', type: 'text' },
      ],
    },
    {
      name: 'offer_event',
      purpose: 'the activity log',
      fields: [
        { name: 'id', type: 'id' },
        { name: 'gap_id', type: 'ref', note: 'gap' },
        { name: 'hygienist_id', type: 'ref', note: 'hygienist' },
        { name: 'occurred_at', type: 'timestamp' },
        { name: 'actor_kind', type: 'enum', note: 'agent, human' },
        { name: 'text', type: 'text' },
      ],
    },
  ],
};

/** Lay out a repo the scaffold can read, write the shipped scaffold into it, and run it. */
function runScaffold(plan: unknown): { spec: unknown; stdout: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-kit-scaffold-'));
  try {
    fs.mkdirSync(path.join(root, '.colaberry'), { recursive: true });
    fs.mkdirSync(path.join(root, 'command-center'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tools'), { recursive: true });

    fs.writeFileSync(path.join(root, '.colaberry/plan.json'), JSON.stringify(plan), 'utf8');
    fs.writeFileSync(
      path.join(root, '.colaberry/manifest.json'),
      JSON.stringify({
        plan_version: '3',
        // A fixed hash and a fixed sync time: the scaffold seeds its sample from these, so the
        // same plan gives the same demo. A clock read here would make this test flaky by design.
        plan_sha256: '4f3c21aa9b0e7d5612348899aabbccddeeff00112233445566778899aabbccdd',
        generated_at: '2026-01-05T12:00:00Z',
      }),
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'command-center/data-model.json'),
      JSON.stringify(DATA_MODEL),
      'utf8',
    );

    // THE SHIPPED BYTES, not the readable file. This is what a student receives.
    const scaffold = demoKitFiles().find((f) => f.path === DEMO_KIT_SCAFFOLD_PATH);
    expect(scaffold).toBeDefined();
    const scriptPath = path.join(root, 'tools/scaffold-demo-spec.mjs');
    fs.writeFileSync(scriptPath, scaffold!.content, 'utf8');

    const stdout = execFileSync(process.execPath, [scriptPath, '--repo', root], {
      encoding: 'utf8',
      cwd: root,
    });
    const spec = JSON.parse(fs.readFileSync(path.join(root, 'demo/demo-spec.json'), 'utf8'));
    return { spec, stdout };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('the shipped scaffold writes a spec the shipped renderer accepts', () => {
  let spec: unknown;
  let stdout = '';

  beforeAll(() => {
    const r = runScaffold(PLAN);
    spec = r.spec;
    stdout = r.stdout;
  });

  it('produces ZERO contract problems, which is the whole claim', () => {
    // Printed on failure rather than asserted as a count, so a regression names the fields.
    const problems = validateDemoSpecShape(spec);
    expect(problems).toEqual([]);
  });

  it('is at schema_version 2, the only version the renderer accepts', () => {
    expect((spec as { schema_version: number }).schema_version).toBe(2);
    // And the renderer's own parse succeeds, which is a stronger statement than the shape check
    // because it is the exact call `demoRender.ts` makes.
    expect(() => DemoSpecSchema.parse(spec)).not.toThrow();
  });

  it('carries one timeline event per story, not an empty array that passes vacuously', () => {
    const parsed = DemoSpecSchema.parse(spec);
    const stories = (PLAN.stories as Array<{ id: string }>).filter((s) => s && s.id);
    expect(stories.length).toBeGreaterThan(3);
    expect(parsed.events).toHaveLength(stories.length);
    expect(parsed.events.map((e) => e.work_id)).toEqual(stories.map((s) => s.id));
  });

  it('shows at least one action that did NOT succeed, which is the point of a trust demo', () => {
    /*
     * A timeline where everything succeeded teaches a viewer that the system always works. The
     * scaffold fails every third action and reverts every fifth for exactly that reason, so this
     * asserts the spread rather than the happy path.
     */
    const parsed = DemoSpecSchema.parse(spec);
    const statuses = new Set(parsed.events.map((e) => e.status));
    expect(statuses.size).toBeGreaterThan(1);
    expect([...statuses].some((s) => s === 'failed' || s === 'reverted')).toBe(true);
    // And something did succeed, so the demo is not uniformly broken either.
    expect(statuses.has('succeeded')).toBe(true);
  });

  it('never claims a verified identity or a production environment', () => {
    const parsed = DemoSpecSchema.parse(spec);
    expect(parsed.environment).toBe('demo');
    for (const e of parsed.events) {
      // A demo can verify no identity, so it must say so rather than implying a guarantee.
      expect(e.actor.verified).toBe(false);
      expect(e.environment).toBe('demo');
      // Accountability is never ambiguous: required even when the actor is a human.
      expect(e.human_owner_id.length).toBeGreaterThan(0);
    }
  });

  it('a reverted action names where to recover, and an irreversible one is not called reversible', () => {
    const parsed = DemoSpecSchema.parse(spec);
    const reverted = parsed.events.filter((e) => e.status === 'reverted');
    expect(reverted.length).toBeGreaterThan(0);
    for (const e of reverted) {
      expect(e.recovery_ref).not.toBeNull();
      expect(e.reversible).toBe(false);
    }
  });

  it('is DETERMINISTIC: the same plan and hash give byte-identical output', () => {
    // The kit's own promise, and the reason the sample is seeded from the plan hash: a reviewer
    // can tell "the plan changed" from "the dice changed".
    const a = JSON.stringify(runScaffold(PLAN).spec);
    const b = JSON.stringify(runScaffold(PLAN).spec);
    expect(a).toBe(b);
  });

  it('reports the event count to the builder, so a missing timeline is visible', () => {
    expect(stdout).toMatch(/\d+ timeline events/);
  });

  it('still produces a valid spec for a plan that declares NO agents', () => {
    /*
     * The branch an `events` array built from agents would break on. A plan with no agents must
     * still name an actor, because something performed the action; the scaffold names the
     * system. Without this case the happy path would be the only one covered, and the system
     * actor is the arm a student with a human-only plan actually hits.
     */
    const agentless = { ...PLAN, agents: [] };
    const { spec: s } = runScaffold(agentless);
    expect(validateDemoSpecShape(s)).toEqual([]);
    const parsed = DemoSpecSchema.parse(s);
    expect(parsed.events.length).toBeGreaterThan(0);
    expect(parsed.events.every((e) => e.actor.type === 'system')).toBe(true);
  });

  it('and for a plan with no stories, where an EMPTY timeline is the honest answer', () => {
    // Valid and empty, which the contract document says explicitly. The distinction that matters
    // is between an empty array (this build performs no actions yet) and a missing key.
    const storyless = { ...PLAN, stories: [] };
    const { spec: s } = runScaffold(storyless);
    expect(validateDemoSpecShape(s)).toEqual([]);
    expect(DemoSpecSchema.parse(s).events).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(s as object, 'events')).toBe(true);
  });
});

describe('the contract document the student reads matches the contract the code enforces', () => {
  const doc = (): string => {
    const f = demoKitFiles().find((x) => x.path === DEMO_KIT_CONTRACT_PATH);
    expect(f).toBeDefined();
    return f!.content;
  };

  it('documents version 2, and does not still document version 1', () => {
    const d = doc();
    // Scoped to the top-level key table row, because "1" appears all over a document like this.
    const row = d.split('\n').find((l) => l.startsWith('| `schema_version` |'));
    expect(row).toBeDefined();
    expect(row as string).toContain('`2`');
    expect(row as string).not.toMatch(/\| `1`\./);
  });

  it('documents the events array and every required event field', () => {
    const d = doc();
    expect(d).toContain('## Events');
    for (const field of [
      'event_id', 'occurred_at', 'work_id', 'trace_id', 'parent_event_id', 'actor',
      'human_owner_id', 'action', 'status', 'risk_level', 'autonomy_tier', 'reason_summary',
      'evidence_refs', 'policy_refs', 'approval', 'side_effects', 'reversible', 'recovery_ref',
      'environment',
    ]) {
      expect(d).toContain(`\`${field}\``);
    }
  });

  it('and that field list is the contract\'s own, not a copy that can drift', () => {
    /*
     * The list above is pinned to the schema rather than maintained by hand. If a field is added
     * to `DemoEventSchema` and not to the document, this fails and names it.
     */
    const shape = Object.keys(DemoSpecSchema.shape.events.element.shape);
    const d = doc();
    const undocumented = shape.filter((k) => !d.includes(`\`${k}\``));
    expect(undocumented).toEqual([]);
  });

  it('says plainly that production is not a permitted environment', () => {
    expect(doc()).toContain('`production` is not a permitted value');
  });
});
