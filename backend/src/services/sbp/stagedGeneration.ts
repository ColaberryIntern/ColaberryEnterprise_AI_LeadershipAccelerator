/**
 * stagedGeneration — build a plan whose size follows the source, not one model reply.
 *
 * ## Why
 *
 * Until now the whole plan (requirements, releases and every story) came back in ONE gpt-4o
 * completion, and a completion has a ceiling: about 16k output tokens. Measured on a real plan, a
 * story costs about 270 tokens and a requirement about 70, so the ceiling sits near 45 stories.
 * Above it the JSON is cut off mid-object, fails to parse twice, and the build fails outright. Now
 * that a student can upload a full scope document, a 100-story project is a reasonable thing to
 * ask for, and the old shape could not produce one at any tier.
 *
 * The other half is fidelity. One call that had to do everything compressed: ShiftFill's brief
 * produced 11 requirements and dropped 13 of the 14 facts the student stated. See
 * requirementCoverage.
 *
 * ## The stages
 *
 *   1. extractRequirements    requirements only, with the "what to look for" checklist
 *   2. completeRequirements   an independent audit against the source; every addition must quote it
 *   3. outlineReleases        release names, goals and which requirement lands where (small output)
 *   4. writeReleaseStories    stories for ONE release at a time, a few in parallel
 *   5. assembleStories        PURE: global STORY ids, release-gating `blocked_by`, dangling refs dropped
 *
 * No stage's output grows with the whole project except the requirement list itself, which at
 * ~70 tokens each leaves room for roughly 200 requirements in one extraction reply.
 *
 * The tier the student picked is now a FLOOR on the release count and the "typical size" hint,
 * not a ceiling on anything. More material yields more requirements, more releases and more
 * stories; the same material yields the same plan whatever the tier says.
 *
 * Kill switch: `SBP_STAGED_GENERATION=off` restores the single-call path in decomposeService.
 */
import { BUILD_PLAN_JSON_SCHEMA, BuildPlan, PlanRelease, PlanRequirement, PlanStory } from './planContract';
import {
  DecomposeInputs, DECOMPOSE_SYSTEM_PROMPT, PROMPT_SECTIONS, composeSystemPrompt, sourceBlocks,
} from './decomposePrompt';
import { modelJsonCall, type ChatClient } from './modelJsonCall';
import { extractRequirements } from './requirementExtraction';
import { completeRequirements, contentWords } from './requirementCoverage';
import { alignMeasuresToDemos } from './outlineAlignment';
import { adoptNamedPerson } from './planPeople';
import { RELEASE_STORIES_JSON_SCHEMA, buildReleaseStoriesPrompt, keepStoriesInTheirRelease } from './releaseStories';
import { markUnnamedApis } from './storyTools';

/** Average non-constraint requirements per release before another release is opened. */
export const REQUIREMENTS_PER_RELEASE = 6;
/** A release is a demo; more than this in one term stops being a plan anyone can follow. */
export const MAX_RELEASES = 10;
/** Release story calls in flight at once. Bounded so one big build cannot starve the queue. */
export const STORY_CALL_CONCURRENCY = 3;

/** Is the staged path on? ON unless explicitly switched off, like auto-publish. */
export function stagedGenerationEnabled(): boolean {
  return (process.env.SBP_STAGED_GENERATION ?? 'on').trim().toLowerCase() !== 'off';
}

/** The requirements a story is written for. CONSTRAINTs are context and never get a story. */
function workItems(reqs: PlanRequirement[]): PlanRequirement[] {
  return reqs.filter((r) => r.kind !== 'CONSTRAINT');
}

/** How many releases this material needs. The tier is the floor; the material decides above it. */
export function releaseCountFor(tierReleases: number, requirements: PlanRequirement[]): number {
  const byMaterial = Math.ceil(workItems(requirements).length / REQUIREMENTS_PER_RELEASE);
  return Math.max(1, Math.min(MAX_RELEASES, Math.max(tierReleases, byMaterial)));
}

// ── stage 3: release outline ─────────────────────────────────────────────────

const planProps = (BUILD_PLAN_JSON_SCHEMA as unknown as {
  properties: { releases: { items: unknown }; stories: { items: unknown } };
}).properties;

export interface ReleaseOutline {
  releases: PlanRelease[];
  assignments: Array<{ requirement_id: string; release: string }>;
}

export const OUTLINE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['releases', 'assignments'],
  properties: {
    releases: { type: 'array', items: planProps.releases.items },
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['requirement_id', 'release'],
        properties: {
          requirement_id: { type: 'string' },
          release: { type: 'string', description: 'a release key, r0..rN' },
        },
      },
    },
  },
} as const;

export const OUTLINE_SYSTEM_PROMPT = composeSystemPrompt([
  'You organise an approved requirement set into releases. You do NOT write stories and you do\n'
  + 'NOT change, add or drop requirements.',
  PROMPT_SECTIONS.antiInvention,
  PROMPT_SECTIONS.releasesWalkingSkeleton,
  PROMPT_SECTIONS.dataNotInstruction,
]);

export function buildOutlinePrompt(inputs: DecomposeInputs, requirements: PlanRequirement[], releases: number): string {
  const items = workItems(requirements);
  return [
    `Organise the requirements below into exactly ${releases} releases, r0..r${releases - 1}.`,
    `Assign EVERY requirement that is not a CONSTRAINT to exactly one release (${items.length} assignments).`,
    'CONSTRAINT requirements are context for the stories that use them: do not assign them.',
    `Balance the releases: about ${Math.max(1, Math.round(items.length / releases))} requirements each, and no release with`,
    'more than twice the average. Order them so each release builds on the one before and each one',
    'ends with something a person can open and see working.',
    'r0 is the walking skeleton: the thinnest end-to-end path, including the guardrails and approval',
    'points the owner insisted on, so its demo shows the guarantee holding.',
    // Live (2026-11-20): "never text a hygienist on leave" landed in r3 while offers went out in
    // r1, and the success targets sat alone in the last release as a "performance" story.
    'A SAFE requirement lands in the SAME release as the first behaviour it guards, or earlier, never',
    'after it: a guardrail that arrives two releases after the thing it guards was not a guardrail.',
    'An NFR (a target, a volume, a time limit) lands in the release of the behaviour it constrains.',
    'Give each release a name in the owner\'s own domain language, a goal, a demo line, and week numbers.',
    '',
    '<APPROVED_REQUIREMENTS>',
    ...requirements.map((r) => `- ${r.id} [${r.kind}/${r.priority}] ${r.statement}`),
    '</APPROVED_REQUIREMENTS>',
    '',
    sourceBlocks(inputs),
  ].join('\n');
}

const releaseIndex = (k: string): number => Number(k.slice(1));

/**
 * A guardrail never arrives after the thing it guards. PURE; mutates `byReq` in place.
 *
 * Asked in the prompt and NOT obeyed: live (2026-11-20, ShiftFill) the outline put all four SAFE
 * requirements in the last release, so "never text a hygienist on approved leave" shipped three
 * releases after the story that texts hygienists. So it is enforced here: each SAFE requirement
 * moves to the release of the FUNC requirement it shares the most words with, when that release is
 * EARLIER. Never later: a guardrail the model placed early stays early. One shared word is enough on
 * purpose: "never text a hygienist on leave" shares exactly one with each behaviour it guards, and the
 * only cost of a weak match is a guardrail landing early, which r0 asks for anyway.
 *
 * SAFE ONLY, NOT NFRs. This used to pull NFRs too, and one shared word is exactly wrong for a
 * target: ShiftFill v4 (2026-11-20) moved "fill gaps within 30 minutes of the call-out" into r0 on
 * the word "call-out", two releases before any offer could be sent, while r4's demo, written by the
 * outline for its own placement, still promised it. A guardrail must come early; a target can only
 * be shown once the behaviour it measures exists. NFRs stay where the outline put them, beside the
 * demo it wrote for them, and `alignMeasuresToDemos` moves one only when a demo states its figure.
 */
export function pullGuardsForward(items: PlanRequirement[], byReq: Map<string, string>): void {
  const funcs = items.filter((r) => r.kind === 'FUNC' || r.kind === 'REL' || r.kind === 'OBS');
  const words = new Map(items.map((r) => [r.id, contentWords(r.statement)]));
  for (const g of items.filter((r) => r.kind === 'SAFE')) {
    const gw = words.get(g.id)!;
    let best: { id: string; hit: number } | null = null;
    for (const f of funcs) {
      const hit = [...gw].filter((w) => words.get(f.id)!.has(w)).length;
      if (hit >= 1 && (!best || hit > best.hit
        || (hit === best.hit && releaseIndex(byReq.get(f.id)!) < releaseIndex(byReq.get(best.id)!)))) best = { id: f.id, hit };
    }
    if (!best) continue;
    const target = byReq.get(best.id)!;
    if (releaseIndex(target) < releaseIndex(byReq.get(g.id)!)) byReq.set(g.id, target);
  }
}

/**
 * Make the outline usable whatever the model did. PURE.
 *  - releases re-keyed r0..rN in the order given, assignments re-pointed to match
 *  - an unknown or missing assignment goes to the release with the fewest so far
 *  - a release nothing landed in is dropped (it would only fail `release_empty`)
 */
export function normaliseOutline(outline: ReleaseOutline, requirements: PlanRequirement[]): ReleaseOutline {
  const items = workItems(requirements);
  const rels = outline.releases.length ? outline.releases : [{
    key: 'r0', name: 'First release', goal: 'The thinnest end-to-end path.', demo: 'The core path working end to end.', week_start: 1, week_end: 2,
  }];
  const keyOf = new Map(rels.map((r, i) => [r.key, `r${i}`]));
  const byReq = new Map<string, string>();
  for (const a of outline.assignments ?? []) {
    const k = keyOf.get(a.release);
    if (k && items.some((r) => r.id === a.requirement_id) && !byReq.has(a.requirement_id)) byReq.set(a.requirement_id, k);
  }
  const load = new Map(rels.map((_, i) => [`r${i}`, 0]));
  for (const k of byReq.values()) load.set(k, (load.get(k) ?? 0) + 1);
  for (const r of items) {
    if (byReq.has(r.id)) continue;
    const lightest = [...load.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'en', { numeric: true }))[0][0];
    byReq.set(r.id, lightest);
    load.set(lightest, (load.get(lightest) ?? 0) + 1);
  }
  pullGuardsForward(items, byReq);
  // After the pull, not before: a demo that states the figure is stronger evidence of where a
  // measure is shown than a shared word with some function ("call-out").
  alignMeasuresToDemos(items, byReq, rels);
  for (const k of load.keys()) load.set(k, 0);
  for (const k of byReq.values()) load.set(k, (load.get(k) ?? 0) + 1);
  // Drop empty releases, then re-key densely so r0..rN has no holes.
  const kept = rels.map((r, i) => ({ r, old: `r${i}` })).filter(({ old }) => (load.get(old) ?? 0) > 0);
  const finalKey = new Map(kept.map(({ old }, i) => [old, `r${i}`]));
  return {
    releases: kept.map(({ r }, i) => ({ ...r, key: `r${i}` })),
    assignments: [...byReq.entries()].map(([requirement_id, k]) => ({ requirement_id, release: finalKey.get(k)! })),
  };
}

// ── stage 4: stories for one release ─────────────────────────────────────────
// Lives in `releaseStories.ts`; re-exported so existing imports keep working.
export { RELEASE_STORIES_JSON_SCHEMA, buildReleaseStoriesPrompt };

// ── stage 5: assembly ────────────────────────────────────────────────────────

/**
 * Stitch per-release stories into one plan's story list. PURE.
 *
 * - Global ids STORY-001.. in release order, then the order each release returned them.
 * - `release` forced to the release the story was written for.
 * - `fulfills` filtered to requirement ids that exist.
 * - `blocked_by`: local S-ids resolved within the release, only to EARLIER stories (no cycles);
 *   then the release-gating rule from the prompt, applied in code rather than hoped for: r0 is
 *   ungated, and every story in r(n) waits on the key (last) story of r(n-1).
 */
export function assembleStories(
  perRelease: Array<{ release: PlanRelease; stories: PlanStory[] }>,
  requirements: PlanRequirement[],
): PlanStory[] {
  const known = new Set(requirements.map((r) => r.id));
  const out: PlanStory[] = [];
  let n = 1;
  let previousKey: string | null = null;
  for (const { release, stories } of perRelease) {
    const local = new Map<string, string>();
    const assigned: PlanStory[] = [];
    for (const s of stories) {
      const id = `STORY-${String(n).padStart(3, '0')}`;
      n += 1;
      if (s.id) local.set(String(s.id).trim(), id);
      assigned.push({ ...s, id, release: release.key });
    }
    assigned.forEach((s, idx) => {
      const earlier = new Set(assigned.slice(0, idx).map((x) => x.id));
      const within = (s.blocked_by ?? [])
        .map((b) => local.get(String(b).trim()))
        .filter((b): b is string => !!b && earlier.has(b));
      s.fulfills = (s.fulfills ?? []).filter((f) => known.has(f));
      s.blocked_by = release.key === 'r0'
        ? []
        : [...new Set([...(previousKey ? [previousKey] : []), ...within])];
    });
    out.push(...assigned);
    if (assigned.length) previousKey = assigned[assigned.length - 1].id;
  }
  return out;
}

/**
 * Give each release a share of the weeks in proportion to its stories, end to end.
 *
 * The outline call picks week numbers before any story exists, and it picks
 * them loosely: ShiftFill (2026-11-20) came back r0 wk1, r1 wk2, r2 wk4,
 * r3 wk5-6, so week 3 was empty and the last release's one story landed on the
 * final build day. The schedule spreads the real calendar by these numbers, so
 * a gap here is an idle week on the student's Gantt and a pile-up at the end.
 * Once the stories are known, re-pace: the span the model chose is kept
 * (widened to one week per release if it was narrower), every release gets at
 * least one whole week of its own, and the weeks left over go by story count
 * (largest remainder, earlier release on a tie). Contiguous, no overlap, no
 * week skipped.
 */
export function paceReleases(releases: PlanRelease[], storyCount: ReadonlyMap<string, number>): PlanRelease[] {
  if (!releases.length) return releases;
  const n = releases.length;
  const span = Math.max(n, ...releases.map((r) => r.week_end || 0));
  const counts = releases.map((r) => Math.max(0, storyCount.get(r.key) ?? 0));
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return releases;

  const spare = span - n; // weeks beyond the one each release is guaranteed
  const quota = counts.map((c) => (c / total) * spare);
  const weeks = quota.map((q) => 1 + Math.floor(q));
  let left = span - weeks.reduce((a, b) => a + b, 0);
  const byRemainder = quota.map((q, i) => ({ i, r: q - Math.floor(q) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    weeks[i] += 1;
    left -= 1;
  }

  let next = 1;
  return releases.map((r, i) => {
    const weekStart = next;
    const weekEnd = weekStart + weeks[i] - 1;
    next = weekEnd + 1;
    return { ...r, week_start: weekStart, week_end: weekEnd };
  });
}

// ── the pipeline ─────────────────────────────────────────────────────────────

export interface StagedOptions extends DecomposeInputs {
  model: string;
  client: ChatClient;
  correlationId?: string;
}

export interface StagedResult {
  plan: BuildPlan;
  /** Model calls made, all stages. */
  attempts: number;
  /** What each stage produced, for the build log. */
  stages: {
    extracted: number;
    coverage_added: string[];
    releases: number;
    stories_per_release: number[];
  };
}

function log(event: string, correlationId: string | undefined, outcome: string, ctx: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-staged-generation',
    event,
    correlation_id: correlationId ?? null,
    outcome,
    context: ctx,
  }));
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapBounded<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const isOutline = (v: unknown): v is ReleaseOutline => (
  !!v && Array.isArray((v as ReleaseOutline).releases) && (v as ReleaseOutline).releases.length > 0
  && Array.isArray((v as ReleaseOutline).assignments)
);
const isStories = (v: unknown): v is { stories: PlanStory[] } => (
  !!v && Array.isArray((v as { stories?: unknown }).stories) && (v as { stories: unknown[] }).stories.length > 0
);

/**
 * Generate a plan in stages. Throws the stage's own error on an upstream or contract failure
 * (the caller maps it); never returns a half-built plan.
 */
export async function generateStagedPlan(opts: StagedOptions): Promise<StagedResult> {
  const started = Date.now();
  const { model, client, correlationId } = opts;
  const tierReleases = opts.targets?.releases ?? 5;
  let attempts = 0;

  // 1. Requirements only.
  const extracted = await extractRequirements({ ...opts, model, client, correlationId });
  attempts += extracted.attempts;

  // 2. Completeness audit against the source. Never fails the build.
  const completed = await completeRequirements(extracted.requirements.requirements, { ...opts, model, client, correlationId });
  attempts += completed.rounds;
  const requirements = completed.requirements;

  // 3. Release outline, sized by the material.
  const releaseCount = releaseCountFor(tierReleases, requirements);
  const outlined = await modelJsonCall<ReleaseOutline>({
    schemaName: 'release_outline',
    schema: OUTLINE_JSON_SCHEMA as unknown as Record<string, unknown>,
    systemPrompt: OUTLINE_SYSTEM_PROMPT,
    userPrompt: buildOutlinePrompt(opts, requirements, releaseCount),
    isShaped: isOutline,
    shapeProblem: 'the JSON had no releases or no assignments array',
    model, client,
    eventPrefix: 'sbp_release_outline',
    log: (event, outcome, ctx) => log(event, correlationId, outcome, ctx),
    describe: (v) => ({ releases: v.releases.length, assignments: v.assignments.length }),
  });
  attempts += outlined.attempts;
  const outline = normaliseOutline(outlined.value, requirements);

  // 4. Stories, one release per call. Sequential knowledge of the previous key story is not
  //    needed for the prompt to be right (assembly applies the gating), so these run in parallel.
  const releaseOf = new Map(outline.assignments.map((a) => [a.requirement_id, a.release]));
  const written = await mapBounded(outline.releases, STORY_CALL_CONCURRENCY, async (release, i) => {
    const mineIds = new Set(outline.assignments.filter((a) => a.release === release.key).map((a) => a.requirement_id));
    const mine = requirements.filter((r) => mineIds.has(r.id));
    const res = await modelJsonCall<{ stories: PlanStory[] }>({
      schemaName: 'release_stories',
      schema: RELEASE_STORIES_JSON_SCHEMA as unknown as Record<string, unknown>,
      systemPrompt: DECOMPOSE_SYSTEM_PROMPT,
      userPrompt: buildReleaseStoriesPrompt(opts, release, mine, requirements, i > 0 ? `release r${i - 1}` : null, releaseOf),
      isShaped: isStories,
      shapeProblem: 'the JSON had no stories',
      model, client,
      eventPrefix: 'sbp_release_stories',
      log: (event, outcome, ctx) => log(event, correlationId, outcome, { release: release.key, ...ctx }),
      describe: (v) => ({ stories: v.stories.length }),
    });
    attempts += res.attempts;
    return { release, stories: res.value.stories };
  });
  // ShiftFill v8: a release named for work that moved elsewhere wrote that work again.
  const perRelease = keepStoriesInTheirRelease(written, releaseOf, requirements);

  // 5. Assemble.
  // Named people are judged against the student's own words, never the generated document.
  const stories = markUnnamedApis(adoptNamedPerson(
    assembleStories(perRelease, requirements),
    [opts.brief, ...requirements.map((r) => r.statement)].join('\n'),
  ), requirements);
  const storyCount = new Map<string, number>();
  for (const s of stories) storyCount.set(s.release, (storyCount.get(s.release) ?? 0) + 1);
  const plan: BuildPlan = {
    project_name: extracted.requirements.project_name,
    descriptor: extracted.requirements.descriptor,
    requirements,
    releases: paceReleases(outline.releases, storyCount),
    stories,
  };
  const stages = {
    extracted: extracted.requirements.requirements.length,
    coverage_added: completed.added.map((a) => a.id),
    releases: outline.releases.length,
    stories_per_release: perRelease.map((p) => p.stories.length),
  };
  log('sbp_staged_generation_completed', correlationId, 'success', {
    model, attempts, duration_ms: Date.now() - started,
    requirements: requirements.length, stories: stories.length, ...stages,
  });
  return { plan, attempts, stages };
}
