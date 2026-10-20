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
import { generateBuildSpec } from './govBuildSpec';
import { selectsSolutionBuild } from './govDeliveryProject';
import { govShipByDate, rescaleScheduleToDeadline } from './govScheduleWindow';

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
 * PURE: place a decomposed BuildPlan on real dates and map it to the GovDatedPlan read-model. When a
 * submission `deadline` is known, the plan is back-scheduled to FINISH THE DAY BEFORE IT (the owner's rule:
 * "day before the deadline; it's already last minute") — the natural-week layout is rescaled onto
 * [today → day-before-deadline] so dates never spread years out. With no deadline, it falls back to the
 * plan's natural forward weeks and is flagged `unscheduled`. Deterministic (now is injected).
 */
export function assembleGovDatedPlan(plan: BuildPlan, now: Date, deadline?: Date | null): { plan: GovDatedPlan; verdict: string } {
  const now0 = startOfUtcDay(now);
  // Lay out over the plan's own weeks first; rescaleScheduleToDeadline then compresses onto the deadline window.
  const maxWeek = Math.max(1, ...plan.releases.map((r) => r.week_end || r.week_start || 1));
  const window: CohortWindow = { cohortStart: now0, asOf: now0, startWeek: 1, prepWeek: maxWeek + 1, demoWeek: maxWeek + 2 };

  const releasesIn = plan.releases.map((r) => ({ key: r.key, name: r.name, week_start: r.week_start, week_end: r.week_end }));
  const storiesByRelease = new Map<string, string[]>();
  for (const s of plan.stories) {
    const arr = storiesByRelease.get(s.release) ?? [];
    arr.push(s.id);
    storiesByRelease.set(s.release, arr);
  }
  const schedule = rescaleScheduleToDeadline(buildSchedule({ window, releases: releasesIn, storiesByRelease }), now0, deadline ?? null);

  const dueByStory = new Map<string, Date>();
  for (const t of schedule.tasks) dueByStory.set(t.storyId, startOfUtcDay(t.dueOn));

  const stories: GovDatedStory[] = plan.stories.map((s) => ({
    id: s.id, release: s.release, title: s.title, narrative: s.narrative,
    fulfills: s.fulfills ?? [], acceptance: s.acceptance ?? [], taskGuidance: s.task_guidance,
    failurePaths: s.failure_paths ?? [], blockedBy: s.blocked_by ?? [], ownerAgent: s.owner_agent,
    dueDate: iso(dueByStory.get(s.id) ?? now0),
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

  const shipBy = govShipByDate(deadline ?? null, now0);
  const verdict = shipBy
    ? `Scheduled to finish by ${iso(shipBy)} — the day before the deadline. ${schedule.verdict}`
    : schedule.verdict;

  return {
    plan: { projectName: plan.project_name, descriptor: plan.descriptor, releases, stories: allStories, unscheduled: !deadline },
    verdict,
  };
}

export interface GovRawPlanRequest { requirements: { id: string; text: string }[]; title?: string | null; buyer?: string | null; buildSpec?: string | null; }
export interface GovRawPlanResult { plan: BuildPlan | null; cached: boolean; error?: string; }

/**
 * The raw SBP `BuildPlan` for a gov pursuit — produced the SAME way the student pipeline produces one:
 * decompose → gate + up-to-3-pass model REPAIR → fail closed on blocking violations. Cached (on the brief) so
 * the Build-step Gantt (P2.2) and the project materialization (P2.3) consume the IDENTICAL, gate-clean plan.
 *
 * GROUNDING: the plan decomposes OUR SOLUTION — the service/product we would build to deliver this and win the
 * bid (the AI build SPEC) — NOT a restatement of the buyer's requirements. The spec is the `brief` (what we
 * build, the ground truth for the release structure), and the solicitation requirements are the `document`
 * (what the product must satisfy, cited for traceability in the stories that fulfil them). That is what makes
 * r0 a walking skeleton of OUR system rather than a reshaping of the buyer's functional areas. If no spec is
 * passed in, one is generated first, so the plan is always a product build.
 */
export async function decomposeGovBuildPlanRaw(req: GovRawPlanRequest): Promise<GovRawPlanResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { plan: null, cached: false, error: 'AI build plan is unavailable (no API key configured).' };
  }
  const established = (Array.isArray(req.requirements) ? req.requirements : []).slice(0, 200);
  if (established.length === 0) {
    return { plan: null, cached: false, error: 'No established requirements to plan a build from yet.' };
  }
  // Plan ONLY the solution — the "what they're buying" requirements. Bid-submission and administrative obligations
  // belong in the proposal responses, not in a build story (feeding them here is what produced "Submit Proposal" as
  // a build step). Same classifier the deterministic projection and the coverage cross-check use.
  const reqs = established.filter(selectsSolutionBuild);
  if (reqs.length === 0) {
    return { plan: null, cached: false, error: 'No requirement carries a build signal — there is no software to plan; this pursuit is delivered through the proposal responses.' };
  }

  // Our solution/product to build. Use the spec the operator already generated; otherwise generate one now so
  // the plan is always a decomposition of what WE'd build, not of the raw requirements.
  let specText = (req.buildSpec ?? '').trim();
  if (!specText) {
    const s = await generateBuildSpec({ requirements: reqs, title: req.title ?? null, buyer: req.buyer ?? null });
    if (s.error || !s.spec) {
      return { plan: null, cached: false, error: s.error ?? 'Could not generate the solution spec to plan the build from.' };
    }
    specText = s.spec;
  }

  const brief = [
    req.title ? `Opportunity: ${req.title}${req.buyer ? ` (buyer: ${req.buyer})` : ''}` : '',
    'OUR SOLUTION — the service/product we would build to deliver this and win the bid. Plan the build of THIS system:',
    specText,
  ].filter(Boolean).join('\n');
  const document = [
    'Solicitation requirements the product must satisfy (cite their ids in the stories that fulfil them):',
    reqs.map((r) => `- ${r.id}: ${r.text}`).join('\n'),
  ].join('\n');

  const key = 'rawplan:v4:' + hash({ brief, document }); // v4: plan only solution_build requirements — invalidates pre-filter cached plans
  const hit = cacheGet<BuildPlan>(key);
  if (hit) return { plan: hit, cached: true };

  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'gov_build_plan_ai' }, { timeout: 240_000, maxRetries: 1 }).chat.completions;
    const model = process.env.SBP_DECOMPOSE_MODEL || 'gpt-4o';
    const { plan } = await decomposeBuild({ brief, document, model, correlationId: 'gov_build_plan_ai', client });
    // Mirror the student pipeline: gate + up-to-3 model repair passes, then fail closed on blocking violations.
    const repaired = await gateAndRepair(plan, `${brief}\n${document}`, { client, model, correlationId: 'gov_build_plan_ai' });
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
  const assembled = assembleGovDatedPlan(raw.plan, now, toDate(req.deadline));
  return { plan: assembled.plan, verdict: assembled.verdict, cached: raw.cached, generatedAt: nowIso() };
}

/** Test seam: clear the in-memory advisory cache. */
export function __clearGovBuildPlanAICache(): void { cache.clear(); }
