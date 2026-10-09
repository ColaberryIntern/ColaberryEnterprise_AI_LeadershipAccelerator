/**
 * govBuildPlanAI — ADVISORY, DATED build-plan preview for the gov Build step.
 *
 * Reuses the in-repo Student Build Pipeline (SBP) engine UNCHANGED: `decomposeBuild` turns the gov
 * established requirements (the ground-truth brief) + the AI build spec (the expansion document) into a
 * rich `BuildPlan` (releases with goal/demo, stories with narrative, Gherkin acceptance, task guidance,
 * failure paths and dependencies); `buildSchedule` (PURE) places those releases on REAL calendar dates
 * against a synthetic `[today → submission deadline]` window. The result is assembled into a read-model
 * (`GovDatedPlan`) the Build step renders as a Gantt with expandable per-story detail.
 *
 * STRICTLY ADVISORY: this sets no gate, creates/runs no build, and does NOT touch the deterministic
 * requirement-cited `deriveGovBuildPlan` spine (shown alongside). It FAILS SOFT — no key / empty
 * requirements / any decomposition error returns an `error` string, never throws — and is content-hash
 * cached (the completion is a big, regenerable gpt-4o call). The model call goes through the instrumented
 * OpenAI client (auto-redaction + cost/observability), injected into the SBP decomposer.
 */
import crypto from 'crypto';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { decomposeBuild, DecomposeError } from '../sbp/decomposeService';
import { gateAndRepair } from '../sbp/planRepair';
import { isPublishable } from '../sbp/planGate';
import { buildSchedule, type CohortWindow } from '../sbp/buildSchedule';
import type { BuildPlan } from '../sbp/planContract';
import { COMMAND_CENTER_STORY_ID, COMMAND_CENTER_TITLE, COMMAND_CENTER_NARRATIVE, COMMAND_CENTER_ACCEPTANCE } from '../sbp/commandCenterStory';

interface CacheEntry<T> { value: T; at: number; }
const TTL_MS = 60 * 60 * 1000; // 1h — advisory, regenerable
const MAX_ENTRIES = 100;
const cache = new Map<string, CacheEntry<unknown>>();
function cacheGet<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) { cache.delete(key); return null; }
  return e.value as T;
}
function cacheSet<T>(key: string, value: T): void {
  if (cache.size >= MAX_ENTRIES) { const first = cache.keys().next().value; if (first !== undefined) cache.delete(first); }
  cache.set(key, { value, at: Date.now() });
}
const hash = (o: unknown): string => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');

function logFail(event: string, err: unknown): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: (err as { error_class?: string })?.error_class ?? (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error',
    context: { message: (err as { message?: string })?.message },
  }));
}

const DAY_MS = 24 * 60 * 60 * 1000;
function toDate(d: string | Date | null | undefined): Date | null {
  if (d == null) return null;
  const p = d instanceof Date ? d : new Date(d);
  return Number.isNaN(p.getTime()) ? null : p;
}
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const iso = (d: Date): string => d.toISOString().slice(0, 10);

export interface GovDatedStory {
  id: string;
  release: string;
  title: string;
  narrative: string;
  fulfills: string[];
  acceptance: string[];
  taskGuidance: string;
  failurePaths: string[];
  blockedBy: string[];
  ownerAgent: string;
  dueDate: string; // ISO date, clamped on/before the deadline when one is known
}
export interface GovDatedRelease {
  key: string;
  name: string;
  goal: string;
  demo: string;
  startDate: string; // ISO date
  endDate: string;   // ISO date
  isDemoRelease: boolean;
  isRoadmap: boolean;
}
export interface GovDatedPlan {
  projectName: string;
  descriptor: string;
  releases: GovDatedRelease[];
  stories: GovDatedStory[];
  /** True when no deadline was known — dates are a default forward window, not back-scheduled to a deadline. */
  unscheduled: boolean;
}
export interface GovBuildPlanAIResult {
  plan: GovDatedPlan | null;
  /** The schedule's honest capacity one-liner (demo vs roadmap). */
  verdict: string;
  cached: boolean;
  generatedAt: string;
  error?: string;
}

export interface GovBuildPlanAIRequest {
  requirements: { id: string; text: string }[];
  title?: string | null;
  buyer?: string | null;
  buildSpec?: string | null;
  deadline?: string | null;
  now?: string | null;
}

/**
 * PURE: place a decomposed BuildPlan on real dates against a synthetic [now → deadline] window, and map it
 * to the GovDatedPlan read-model. Deterministic (now is injected). Each due date is CLAMPED on/before the
 * deadline when one is known, so the plan can never read as finishing after the submission cutoff.
 */
export function assembleGovDatedPlan(plan: BuildPlan, deadline: Date | null, now: Date): { plan: GovDatedPlan; verdict: string } {
  const now0 = startOfUtcDay(now);
  const deadline0 = deadline ? startOfUtcDay(deadline) : null;
  // Synthetic cohort window: week 1 = today; prep week ≈ the week the deadline falls in (so the build window
  // ends on/before the deadline), at least 2 (one real build week). demoWeek is the week after prep.
  const daysToDeadline = deadline0 ? Math.round((deadline0.getTime() - now0.getTime()) / DAY_MS) : null;
  const prepWeek = daysToDeadline != null ? Math.max(2, Math.floor(daysToDeadline / 7) + 1) : 9; // null → ~8-week default
  const window: CohortWindow = { cohortStart: now0, asOf: now0, startWeek: 1, prepWeek, demoWeek: prepWeek + 1 };

  const releasesIn = plan.releases.map((r) => ({ key: r.key, name: r.name, week_start: r.week_start, week_end: r.week_end }));
  const storiesByRelease = new Map<string, string[]>();
  for (const s of plan.stories) {
    const arr = storiesByRelease.get(s.release) ?? [];
    arr.push(s.id);
    storiesByRelease.set(s.release, arr);
  }
  const schedule = buildSchedule({ window, releases: releasesIn, storiesByRelease });

  const clamp = (d: Date): Date => (deadline0 && d.getTime() > deadline0.getTime() ? deadline0 : d);
  const dueByStory = new Map<string, Date>();
  for (const t of schedule.tasks) dueByStory.set(t.storyId, clamp(startOfUtcDay(t.dueOn)));

  const stories: GovDatedStory[] = plan.stories.map((s) => ({
    id: s.id, release: s.release, title: s.title, narrative: s.narrative,
    fulfills: s.fulfills ?? [], acceptance: s.acceptance ?? [], taskGuidance: s.task_guidance,
    failurePaths: s.failure_paths ?? [], blockedBy: s.blocked_by ?? [], ownerAgent: s.owner_agent,
    dueDate: iso(dueByStory.get(s.id) ?? clamp(now0)),
  }));

  const roadmap = new Set(schedule.roadmapReleaseKeys);
  const releases: GovDatedRelease[] = plan.releases.map((r) => {
    const due = (storiesByRelease.get(r.key) ?? []).map((id) => dueByStory.get(id)).filter((d): d is Date => !!d);
    const start = due.length ? new Date(Math.min(...due.map((d) => d.getTime()))) : now0;
    const end = due.length ? new Date(Math.max(...due.map((d) => d.getTime()))) : now0;
    return {
      key: r.key, name: r.name, goal: r.goal, demo: r.demo,
      startDate: iso(start), endDate: iso(end),
      isDemoRelease: schedule.demoReleaseKey === r.key, isRoadmap: roadmap.has(r.key),
    };
  });

  // STORY-000 — the Command Center. It is kept OUT of the gate/decomposition (by design) and injected as the
  // first task at materialization; here it is shown (display-only) as the first story of the first release so the
  // preview matches what the builder will actually see.
  const firstReleaseKey = plan.releases[0]?.key ?? 'r0';
  const commandCenter: GovDatedStory = {
    id: COMMAND_CENTER_STORY_ID, release: firstReleaseKey, title: COMMAND_CENTER_TITLE, narrative: COMMAND_CENTER_NARRATIVE,
    fulfills: [], acceptance: [...COMMAND_CENTER_ACCEPTANCE], taskGuidance: 'One page that shows what you are building and how far along it is — stood up first, and what you demo from.',
    failurePaths: [], blockedBy: [], ownerAgent: 'builder',
    dueDate: releases.find((r) => r.key === firstReleaseKey)?.startDate ?? iso(now0),
  };
  const allStories = stories.length ? [commandCenter, ...stories] : stories;

  return {
    plan: { projectName: plan.project_name, descriptor: plan.descriptor, releases, stories: allStories, unscheduled: deadline0 === null },
    verdict: schedule.verdict,
  };
}

export interface GovRawPlanRequest { requirements: { id: string; text: string }[]; title?: string | null; buyer?: string | null; buildSpec?: string | null; }
export interface GovRawPlanResult { plan: BuildPlan | null; cached: boolean; error?: string; }

/**
 * The raw SBP `BuildPlan` for a gov pursuit — produced the SAME way the student pipeline produces one:
 * decompose → gate + up-to-3-pass model REPAIR → fail closed on blocking violations. Cached (on the brief) so
 * the Build-step Gantt (P2.2) and the project materialization (P2.3) consume the IDENTICAL, gate-clean plan.
 *
 * GROUNDING: the plan is grounded ONLY in the established requirements (the author's real intent). The
 * capability-heavy AI build SPEC is deliberately NOT fed as the decomposer's "document" — doing so pushed r0
 * toward premature integration (integrating with the buyer's systems before the system itself exists); the
 * walking-skeleton sequencing comes from the engine's system prompt, grounded on the requirements.
 */
export async function decomposeGovBuildPlanRaw(req: GovRawPlanRequest): Promise<GovRawPlanResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { plan: null, cached: false, error: 'AI build plan is unavailable (no API key configured).' };
  }
  const reqs = (Array.isArray(req.requirements) ? req.requirements : []).slice(0, 200);
  if (reqs.length === 0) {
    return { plan: null, cached: false, error: 'No established requirements to plan a build from yet.' };
  }
  const brief = [
    req.title ? `Opportunity: ${req.title}${req.buyer ? ` (buyer: ${req.buyer})` : ''}` : '',
    'Established requirements (ground truth — build to exactly these):',
    reqs.map((r) => `- ${r.id}: ${r.text}`).join('\n'),
  ].filter(Boolean).join('\n');

  const key = 'rawplan:v2:' + hash({ brief }); // v2: re-grounded + gate/repair (invalidates older cached plans)
  const hit = cacheGet<BuildPlan>(key);
  if (hit) return { plan: hit, cached: true };

  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_build_plan_ai' }, { timeout: 240_000, maxRetries: 1 }).chat.completions;
    const model = process.env.SBP_DECOMPOSE_MODEL || 'gpt-4o';
    const { plan } = await decomposeBuild({ brief, document: '', model, correlationId: 'gov_build_plan_ai', client });
    // Mirror the student pipeline: gate + up-to-3 model repair passes, then fail closed on blocking violations.
    const repaired = await gateAndRepair(plan, brief, { client, model, correlationId: 'gov_build_plan_ai' });
    if (!isPublishable(repaired.gate.violations)) {
      return { plan: null, cached: false, error: 'The generated build plan did not pass the quality gate — regenerate to try again.' };
    }
    cacheSet(key, repaired.plan);
    return { plan: repaired.plan, cached: false };
  } catch (err) {
    logFail('gov_build_plan_ai', err);
    const msg = err instanceof DecomposeError && err.error_class === 'ConfigError'
      ? 'AI build plan is unavailable (no API key configured).'
      : 'The AI build plan could not be generated right now.';
    return { plan: null, cached: false, error: msg };
  }
}

export async function generateGovBuildPlanAI(req: GovBuildPlanAIRequest): Promise<GovBuildPlanAIResult> {
  const nowIso = () => new Date().toISOString();
  const raw = await decomposeGovBuildPlanRaw({ requirements: req.requirements, title: req.title, buyer: req.buyer, buildSpec: req.buildSpec });
  if (raw.error || !raw.plan) {
    return { plan: null, verdict: '', cached: raw.cached, generatedAt: nowIso(), error: raw.error ?? 'The AI build plan could not be generated right now.' };
  }
  const now = toDate(req.now) ?? new Date();
  const deadline = toDate(req.deadline ?? null);
  const assembled = assembleGovDatedPlan(raw.plan, deadline, now);
  return { plan: assembled.plan, verdict: assembled.verdict, cached: raw.cached, generatedAt: nowIso() };
}

/** Test seam: clear the in-memory advisory cache. */
export function __clearGovBuildPlanAICache(): void { cache.clear(); }
