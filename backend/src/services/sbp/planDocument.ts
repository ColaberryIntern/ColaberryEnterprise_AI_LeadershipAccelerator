/**
 * planDocument — `.colaberry/plan.json`, the file a student's Command Center
 * reads to render itself.
 *
 * WHY THIS FILE EXISTS AT ALL. The Command Center is a static page served by
 * GitHub Pages out of the student's own repo. A static page cannot hold a
 * secret, so it cannot call an authenticated API, so the data has to ship WITH
 * the page. This module is the plan half of that payload; the build-progress
 * half is `.colaberry/progress.json`. See docs/COMMAND_CENTER_DATA_CONTRACT.md.
 *
 * OWNERSHIP: platform, rewritten wholesale on every publish and sync. A student
 * editing this file will have their edit overwritten, and the managed block in
 * CLAUDE.md says so. Anything a student is meant to own goes in
 * `.colaberry/profile.json` (theirs) or `.colaberry/progress.json` (co-owned).
 *
 * TWO INVARIANTS THIS MODULE MUST NOT BREAK:
 *
 *   1. ADDITIVE ONLY. v1 of this file was a bare `JSON.stringify(plan)` — so
 *      `project_name`, `descriptor`, `requirements`, `releases` and `stories`
 *      sit at the top level, and a page a student wrote against v1 reads them
 *      there. Every field added since is a NEW key beside them, never a
 *      restructure. A v1 page must keep working against a v2 file.
 *
 *   2. NOTHING VOLATILE. No wall clock, no run id, no counter that moves when
 *      the build does not. This file is committed to the student's repo, and
 *      `changedFiles` compares content hashes to decide whether to commit at
 *      all — one moving timestamp in here turns every sync into a commit that
 *      changes nothing. Freshness lives in `.colaberry/manifest.json`, which is
 *      excluded from that comparison precisely because it carries the stamp.
 *
 * PURE. No I/O, no clock, no randomness — same inputs, byte-identical output.
 */
import {
  BuildPlan, PlanAgent, PlanRelease, PlanRequirement, PlanStory,
} from './planContract';
import type { Schedule } from './buildSchedule';

/**
 * Bumped only for a BREAKING change. Additive fields do not bump it.
 *
 * v1 = the raw BuildPlan spread (implicit — v1 files carry no `schema_version`,
 * so a reader that finds the key absent should assume 1).
 * v2 = adds `schema_version`, `project`, `schedule`, `derived`, per-story dates,
 * per-release dates and story ids, per-requirement `fulfilled_by`.
 */
export const PLAN_DOC_SCHEMA_VERSION = 2;

export const PLAN_FILE_PATH = '.colaberry/plan.json';

/** `YYYY-MM-DD`. Date-only on purpose: a due date has no meaningful time zone. */
export type DateOnly = string;

export interface PlanDocRequirement extends PlanRequirement {
  /** Story ids that fulfil this. Empty for a constraint, and for a real gap. */
  fulfilled_by: string[];
}

export interface PlanDocRelease extends PlanRelease {
  story_ids: string[];
  /** Earliest and latest due date across this release's stories. Null without a schedule. */
  starts_on: DateOnly | null;
  ends_on: DateOnly | null;
  /** True for the release this term actually demos. Later releases are roadmap. */
  is_demo_target: boolean;
}

export interface PlanDocStory extends PlanStory {
  /** Current due date, which moves if the plan is rescheduled. */
  due_on: DateOnly | null;
  /**
   * The due date this story was FIRST given. Write-once server-side, so a
   * student can see slippage against the original commitment rather than
   * against a target that quietly followed them.
   */
  due_baseline_on: DateOnly | null;
}

export interface PlanDocSchedule {
  build_start: DateOnly;
  build_end: DateOnly;
  demo_day: DateOnly;
  build_weeks: number;
  /** The release this term demos; later ones are roadmap, not this term's work. */
  demo_release_key: string | null;
  roadmap_release_keys: string[];
  prep: Array<{ key: string; title: string; due_on: DateOnly }>;
}

/**
 * Facts a page would otherwise have to re-derive with its own regexes.
 *
 * These are extractions, not judgements: every entry traces to a requirement id
 * or a story field. Putting them here keeps ONE implementation of "which of my
 * requirements are measures" — the alternative is every student's page guessing
 * at it separately and each guessing differently.
 */
export interface PlanDocDerived {
  /** Numeric NFRs — the numbers the student said they would move. */
  measures: Array<{ id: string; statement: string }>;
  /** SAFE requirements — the promises the system must not break. */
  guardrails: Array<{ id: string; statement: string }>;
  /** Systems of record named by CONSTRAINT requirements. */
  systems: string[];
  /** Roles the student's own stories are written for. */
  roles: string[];
  counts: {
    requirements_total: number;
    requirements_by_kind: Record<string, number>;
    stories_total: number;
    releases_total: number;
    agents_total: number;
    /** Distinct failure modes the plan commits to handling. Evidence of rigour. */
    failure_paths_total: number;
    /** Agents by how much they are allowed to decide alone. */
    agents_by_autonomy: Record<string, number>;
  };
}

export interface PlanDocument {
  schema_version: number;
  /** v1 top-level keys, kept exactly where a v1 page looks for them. */
  project_name: string;
  descriptor: string;
  requirements: PlanDocRequirement[];
  releases: PlanDocRelease[];
  stories: PlanDocStory[];
  agents: PlanAgent[];
  /** v2 additions below. */
  project: {
    name: string;
    descriptor: string;
    /** Web URL of the repo this ships in. Null when there is no repo yet. */
    repo_url: string | null;
    plan_version: number | null;
    plan_sha256: string | null;
  };
  schedule: PlanDocSchedule | null;
  derived: PlanDocDerived;
}

export interface PlanDocInput {
  repoUrl?: string | null;
  planVersion?: number | null;
  planSha256?: string | null;
  schedule?: Schedule | null;
  /** story_id ⇒ `YYYY-MM-DD`, read from `student_tasks.due_baseline_on`. */
  baselineByStory?: Record<string, string | null> | null;
}

const byKey = <T>(items: T[], key: (t: T) => string): T[] =>
  [...items].sort((a, b) => key(a).localeCompare(key(b)));

/** A Date to `YYYY-MM-DD`, or null. Never a locale-dependent format. */
export function dateOnly(d: Date | string | null | undefined): DateOnly | null {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10) || null;
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Capitalised words that open a sentence or name an actor rather than a system. */
const NOT_A_SYSTEM = new Set([
  'The', 'This', 'That', 'It', 'A', 'An', 'System', 'Nothing', 'No', 'Every', 'Each',
  'All', 'Any', 'When', 'If', 'Only', 'Never', 'Always', 'Must', 'Should',
]);

/**
 * Systems of record, from CONSTRAINT requirements.
 *
 * Proper nouns are the signal, not verbs: students write "read the signed
 * agreement FROM HelloSign", which puts the system at the end of the clause
 * with lowercase words in between. CamelCase (HelloSign) and two-word names
 * (Google Calendar) both have to survive.
 */
export function systemsOfRecord(requirements: PlanRequirement[]): string[] {
  const names: string[] = [];
  for (const r of requirements.filter((x) => x.kind === 'CONSTRAINT')) {
    for (const m of r.statement.matchAll(/\b([A-Z][A-Za-z0-9.]*(?:\s+[A-Z][A-Za-z0-9.]*)?)\b/g)) {
      const name = m[1].trim();
      if (!NOT_A_SYSTEM.has(name) && name.length > 2) names.push(name);
    }
  }
  return [...new Set(names)];
}

/** Roles the student's own stories are written for ("As a <role>, I want …"). */
export function rolesFrom(stories: PlanStory[]): string[] {
  const roles = stories
    .map((s) => s.narrative.match(/^\s*As an?\s+([^,]{2,40}),/i)?.[1]?.trim())
    .filter((x): x is string => Boolean(x))
    .filter((r) => !/^system$/i.test(r));
  return [...new Set(roles)].slice(0, 12);
}

/** A number-bearing NFR is a measure the student committed to moving. */
export function measures(requirements: PlanRequirement[]): PlanRequirement[] {
  return requirements.filter((r) => r.kind === 'NFR' && /\d/.test(r.statement));
}

/** SAFE requirements are the promises the system must not break. */
export function guardrails(requirements: PlanRequirement[]): PlanRequirement[] {
  return requirements.filter((r) => r.kind === 'SAFE');
}

/**
 * A tally whose KEY ORDER is canonical.
 *
 * `JSON.stringify` emits object keys in insertion order, so a tally built by
 * walking an unsorted array serialises differently depending on which kind
 * happened to appear first. That is a real diff in a real file: `changedFiles`
 * hashes the bytes, so it would commit to the student's repo because two
 * semantically identical plans counted their requirements in a different order.
 */
function tally(values: string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/**
 * Everything here is computed from CANONICALLY SORTED inputs, never from the
 * arrays as handed in. The renderer's determinism test shuffles the plan and
 * demands byte-identical output, and it is right to: the whole no-churn
 * guarantee rests on two structurally identical plans producing identical bytes.
 */
function buildDerived(plan: BuildPlan): PlanDocDerived {
  const requirements = byKey(plan.requirements, (r) => r.id);
  const stories = byKey(plan.stories, (s) => s.id);
  const agents = byKey(plan.agents ?? [], (a) => a.id);

  const failurePaths = new Set<string>();
  for (const s of stories) for (const f of s.failure_paths ?? []) failurePaths.add(f.trim().toLowerCase());

  return {
    measures: measures(requirements).map((r) => ({ id: r.id, statement: r.statement })),
    guardrails: guardrails(requirements).map((r) => ({ id: r.id, statement: r.statement })),
    systems: systemsOfRecord(requirements),
    roles: rolesFrom(stories),
    counts: {
      requirements_total: requirements.length,
      requirements_by_kind: tally(requirements.map((r) => r.kind)),
      stories_total: stories.length,
      releases_total: plan.releases.length,
      agents_total: agents.length,
      failure_paths_total: failurePaths.size,
      agents_by_autonomy: tally(agents.map((a) => a.autonomy_level)),
    },
  };
}

/**
 * Build the plan document. PURE — the caller supplies the schedule and the
 * baselines, so this stays testable from a literal.
 */
export function buildPlanDocument(plan: BuildPlan, input: PlanDocInput = {}): PlanDocument {
  const dueByStory = new Map(
    (input.schedule?.tasks ?? []).map((t) => [t.storyId, dateOnly(t.dueOn)]),
  );
  const baselines = input.baselineByStory ?? {};

  const stories: PlanDocStory[] = byKey(plan.stories, (s) => s.id).map((s) => {
    const due = dueByStory.get(s.id) ?? null;
    return {
      ...s,
      due_on: due,
      // No recorded baseline means this story has never been materialized, so
      // today's date IS the original commitment. Falling back to `due` rather
      // than null keeps a first-publish Command Center from rendering every
      // baseline as blank.
      due_baseline_on: dateOnly(baselines[s.id]) ?? due,
    };
  });

  const releases: PlanDocRelease[] = byKey(plan.releases, (r) => r.key).map((r) => {
    const inRel = stories.filter((s) => s.release === r.key);
    const dates = inRel.map((s) => s.due_on).filter((d): d is DateOnly => Boolean(d)).sort();
    return {
      ...r,
      story_ids: inRel.map((s) => s.id),
      starts_on: dates[0] ?? null,
      ends_on: dates[dates.length - 1] ?? null,
      is_demo_target: Boolean(input.schedule?.demoReleaseKey && input.schedule.demoReleaseKey === r.key),
    };
  });

  const requirements: PlanDocRequirement[] = byKey(plan.requirements, (r) => r.id).map((r) => ({
    ...r,
    fulfilled_by: byKey(plan.stories.filter((s) => (s.fulfills ?? []).includes(r.id)), (s) => s.id)
      .map((s) => s.id),
  }));

  const schedule: PlanDocSchedule | null = input.schedule
    ? {
      build_start: dateOnly(input.schedule.buildStart)!,
      build_end: dateOnly(input.schedule.buildEnd)!,
      demo_day: dateOnly(input.schedule.demoDay)!,
      build_weeks: input.schedule.buildWeeks,
      demo_release_key: input.schedule.demoReleaseKey ?? null,
      roadmap_release_keys: input.schedule.roadmapReleaseKeys ?? [],
      prep: (input.schedule.prep ?? []).map((p) => ({
        key: p.key, title: p.title, due_on: dateOnly(p.dueOn)!,
      })),
    }
    : null;

  return {
    schema_version: PLAN_DOC_SCHEMA_VERSION,
    project_name: plan.project_name,
    descriptor: plan.descriptor,
    requirements,
    releases,
    stories,
    agents: byKey(plan.agents ?? [], (a) => a.id),
    project: {
      name: plan.project_name,
      descriptor: plan.descriptor,
      repo_url: input.repoUrl ?? null,
      plan_version: input.planVersion ?? null,
      plan_sha256: input.planSha256 ?? null,
    },
    schedule,
    derived: buildDerived(plan),
  };
}

/** Serialise for the repo: stable key order, trailing newline. */
export function serialisePlanDocument(doc: PlanDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
