import type { BuildPlan, PlanStory } from './planContract';
import { DemoSpecSchema, type DemoSpec } from './demoSpec/contract';

/**
 * connectedDemoSpec - build a demo spec from a plan and the Command Center's data model. PURE.
 *
 * ## What this produces, and what it deliberately does not
 *
 * It produces the trust timeline: one action per story, with the actor, the accountable human,
 * the lifecycle state, the autonomy tier, the approval and the evidence. It does NOT produce
 * screens or entities. The engine supplies the trust screen itself when a spec carries events,
 * so this is a complete, renderable demo - and the richer screen-by-screen demo is the one the
 * student's own agent builds in their repository with the kit's scaffold, where they can shape it
 * against their actual data model. One generator producing a weaker copy of the other is how the
 * two drift.
 *
 * ## Why the app name is not `plan.project_name`
 *
 * `project_name` is derived from the student's intake, which is derived from the organization's
 * name and their business problem. `demoSpec/contentPolicy.ts` lists both as unpublishable, so a
 * spec naming the app after the project would be REFUSED at the write boundary - correctly, but
 * after the work. The name is taken from the data model's own `app_name`, or built from its
 * primary table, both of which are structural rather than identifying.
 *
 * ## Why this function never receives the project row
 *
 * The strongest version of "no restricted project data reaches the demo" is not a scan of the
 * output, it is an input that could not contain it. This takes a plan, a data model and three
 * strings. The projects row is not in scope here, so there is no path by which a column of it
 * could reach a spec, and the sentinel test proves that end to end rather than by inspection.
 */

export class ConnectedDemoDataModelMissing extends Error {
  readonly name = 'ConnectedDemoDataModelMissing';

  readonly error_class = 'ConnectedDemoDataModelMissing';
}

/** The shape STORY-000 writes to `command-center/data-model.json`. Only what is read here. */
export interface DemoDataModel {
  app_name?: string;
  tables?: Array<{ name?: string; columns?: Array<{ name?: string }> }>;
}

export interface ConnectedDemoSpecInput {
  plan: BuildPlan;
  dataModel: unknown;
  /** The plan's sha, used as the seed so the same plan always yields the same demo. */
  planSha: string;
  planVersion: string;
  /** The demo's "today": a fact from the manifest, never a clock read. */
  generatedAt: string;
}

/** Fixture people. Invented, and they must stay invented: never a name from the project. */
const ACTORS = [
  { id: 'agent.intake', label: 'Intake agent' },
  { id: 'agent.router', label: 'Routing agent' },
  { id: 'agent.reviewer', label: 'Review agent' },
] as const;

const OWNERS = ['owner.operations', 'owner.delivery', 'owner.quality'] as const;

/**
 * A seeded pseudo-random sequence.
 *
 * The same plan must always produce the same demo: a demo whose contents change on every
 * regeneration cannot be screenshotted, cited in a review, or compared with itself. The seed is
 * the plan's own sha, so "the same plan" is a precise claim rather than a hopeful one.
 */
function seededSequence(seedHex: string): () => number {
  let state = parseInt(seedHex.slice(0, 8), 16) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function titleCase(value: string): string {
  const t = String(value).replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * Read the data model, refusing when it is not there.
 *
 * STORY-900 hard-depends on STORY-000: the sample data takes its shape from the data model, and a
 * demo invented without one would show tables the student's system does not have. Refusing is the
 * decision recorded on 2026-11-20; it is not a default that can be relaxed quietly.
 */
function requireDataModel(dataModel: unknown): DemoDataModel {
  if (!dataModel || typeof dataModel !== 'object' || Array.isArray(dataModel)) {
    throw new ConnectedDemoDataModelMissing(
      'command-center/data-model.json is absent or not an object; STORY-000 has not finished',
    );
  }
  const model = dataModel as DemoDataModel;
  const tables = Array.isArray(model.tables) ? model.tables : [];
  if (!tables.length) {
    throw new ConnectedDemoDataModelMissing(
      'command-center/data-model.json names no tables; STORY-000 has not finished',
    );
  }
  return model;
}

/** The app's display name: structural, never identifying. See the header. */
function appNameFor(model: DemoDataModel): string {
  if (typeof model.app_name === 'string' && model.app_name.trim()) return model.app_name.trim();
  const first = (model.tables || []).map((t) => t?.name).find((n) => typeof n === 'string' && n.trim());
  return first ? `${titleCase(first)} console` : 'Connected demo';
}

/**
 * One timeline event per story.
 *
 * The lifecycle states are spread on purpose. A timeline where every action succeeded is the
 * demo the trust standard exists to prevent: it teaches a viewer that the system always works,
 * which is the one thing no system does. Every third story fails and every fifth is reverted, so
 * a generated demo always shows at least one action that did not complete, and shows what the
 * system did about it.
 */
function eventForStory(
  story: PlanStory,
  index: number,
  rnd: () => number,
  baseIso: string,
): DemoSpec['events'][number] {
  const failed = index > 0 && index % 3 === 0;
  const reverted = index > 0 && index % 5 === 0;
  const status = reverted ? 'reverted' : failed ? 'failed' : index === 1 ? 'executing' : 'succeeded';

  const actor = ACTORS[Math.floor(rnd() * ACTORS.length)];
  const owner = OWNERS[Math.floor(rnd() * OWNERS.length)];
  const highRisk = failed || reverted;

  const base = new Date(baseIso);
  const occurred = new Date(base.getTime() + index * 37 * 60 * 1000);

  return {
    event_id: `${story.id}-E1`,
    occurred_at: occurred.toISOString(),
    work_id: story.id,
    trace_id: `trace-${story.id.toLowerCase()}`,
    parent_event_id: index === 0 ? null : `${story.id}-E0`,

    actor: {
      type: 'agent',
      id: actor.id,
      label: actor.label,
      // A demo can verify nothing, so it says so rather than implying a guarantee it lacks.
      verified: false,
    },
    human_owner_id: owner,

    action: story.title,
    status,
    risk_level: highRisk ? 'high' : index % 2 === 0 ? 'low' : 'medium',
    autonomy_tier: highRisk ? 'A2' : index % 2 === 0 ? 'A1' : 'A3',

    reason_summary: story.narrative,
    evidence_refs: [`${story.id}/acceptance`],
    policy_refs: story.fulfills.slice(0, 2),

    approval: highRisk
      ? { required: true, status: 'granted' as const, assigned_to: owner }
      : { required: false, status: 'not_required' as const, assigned_to: null },

    side_effects: failed ? [] : ['demo-fixtures'],
    reversible: !reverted,
    recovery_ref: reverted ? `${story.id}/recovery` : null,
    environment: 'demo',
  };
}

/**
 * Build the spec. Throws `ConnectedDemoDataModelMissing` when STORY-000 has not run.
 *
 * The result is parsed through `DemoSpecSchema` before it is returned, so this function cannot
 * hand back something the renderer would refuse. A generator that can emit an invalid spec just
 * moves the failure to a worse place.
 */
export function buildConnectedDemoSpec(input: ConnectedDemoSpecInput): DemoSpec {
  const model = requireDataModel(input.dataModel);
  const rnd = seededSequence(input.planSha || '00000000');

  const stories = (input.plan.stories || []).filter((s) => s && s.id && s.title);
  const events = stories.map((story, i) => eventForStory(story, i, rnd, input.generatedAt));

  const spec = {
    schema_version: 2 as const,
    environment: 'demo' as const,
    app: {
      name: appNameFor(model),
      descriptor: 'a simulated walk through the actions this build performs',
      persona: { name: 'Sam Rivera', role: 'Operations lead' },
    },
    // Provenance. A demo that cannot say which plan produced it asks to be taken on faith.
    // `project` is deliberately absent: it is the one field here that could identify anyone.
    source: {
      plan_version: input.planVersion,
      plan_sha256: input.planSha,
      seed: input.planSha.slice(0, 8),
      generated_at: input.generatedAt,
    },
    events,
    screens: {},
    entities: {},
    nav: [],
  };

  // Parse, not cast. If the generator ever emits something off-contract, it fails here rather
  // than at the write boundary or, worse, in a viewer's browser.
  return DemoSpecSchema.parse(spec);
}
