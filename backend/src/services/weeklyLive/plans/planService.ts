import { WeeklyLiveSignal, WeeklyLiveTopic, type PlanInputs } from '../../../models/WeeklyLive';
import { classifyError } from '../../../utils/errorClassifier';
import { resolveBatch, type BatchResult } from '../batchResolver';
import { batchSessions, centralDate, curriculumMap, type BatchSession, type CurriculumMap } from '../curriculumMap';
import { latestDemand, runDemand } from '../demand/demandJob';
import { MIN_VIRAL_FACTORS, TOPIC_GATE } from '../scoring';
import { runSignals } from '../signals/signalsJob';
import { runTopics } from '../topics/topicsJob';
import * as store from './planStore';

/**
 * Plan runs (WL3.4): research, demand, then topics, in the background with a stage the page can poll.
 *
 * Failure modes: demand failing never stops a run (a week without a measurement scores 1 and is warned);
 * signals or topics failing ends the run as failed with a message a person can act on, and the earlier
 * topics stay. Nothing retries by itself: pressing the button again is the recovery path.
 */
export class PlanError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) { super(message); this.name = 'PlanError'; }
}

export interface PlanDeps { signals: typeof runSignals; demand: typeof runDemand; topics: typeof runTopics; }
const REAL: PlanDeps = { signals: runSignals, demand: runDemand, topics: runTopics };

/** Messages written for people. Anything else could carry internals, so it becomes a plain sentence. */
const SHOWABLE = new Set(['BudgetExceeded', 'ContractViolation', 'UpstreamUnavailable']);
const explain = (e: unknown) => (e instanceof Error && SHOWABLE.has(e.name) ? e.message : 'Something went wrong while planning. Run it again.');

function log(event: string, planId: string, outcome: 'success' | 'failure' | 'partial', startedAt: number, errorClass?: string) {
  console[outcome === 'failure' ? 'error' : 'log'](JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'backend', event, correlation_id: planId, duration_ms: Date.now() - startedAt, outcome, error_class: errorClass, context: { plan_id: planId } }));
}

/** Run a claimed plan to the end. Never throws: the outcome is on the plan. */
export async function executePlan(planId: string, runId: string, topicsOnly: boolean, deps: PlanDeps = REAL): Promise<void> {
  const t0 = Date.now();
  try {
    const plan = await store.getPlan(planId);
    if (!plan) return;
    const stage = async (name: store.Stage, note: string | null = null) => {
      if (!(await store.setStage(planId, runId, name, note))) throw Object.assign(new Error('replaced'), { name: 'RunReplaced' });
    };
    if (!topicsOnly) {
      await stage('signals');
      const s = await deps.signals({ planId, airDate: plan.air_date, forceNews: plan.inputs.forceNews, avoid: plan.inputs.avoid });
      await stage('demand', s.short ? `Only ${s.kept} news stories could be confirmed this time.` : null);
    } else await stage('demand');
    try { await deps.demand(); } catch (e) { log('weekly_live.plan_demand', planId, 'partial', t0, classifyError(e)); }
    await stage('topics');
    await deps.topics({ planId, airDate: plan.air_date, inputs: plan.inputs });
    await store.finish(planId, runId, true);
    log('weekly_live.plan_run', planId, 'success', t0);
  } catch (e) {
    if (e instanceof Error && e.name === 'RunReplaced') { log('weekly_live.plan_run', planId, 'partial', t0, 'RunReplaced'); return; }
    log('weekly_live.plan_run', planId, 'failure', t0, e instanceof Error && SHOWABLE.has(e.name) ? e.name : classifyError(e));
    await store.finish(planId, runId, false, explain(e)).catch((err: unknown) => log('weekly_live.plan_finish', planId, 'failure', t0, classifyError(err)));
  }
}

export interface StartInput { airDate: string; inputs: PlanInputs; createdBy: string | null; }
type Background = (planId: string, runId: string, topicsOnly: boolean) => void;
const inBackground: Background = (planId, runId, topicsOnly) => { void executePlan(planId, runId, topicsOnly); };

function batchOr(b: BatchResult): { cohortId: string; cohortName: string } {
  if (b.ok) return b;
  throw new PlanError(b.status, b.error, b.status === 409 ? 'no_batch' : 'bad_date');
}

export async function startPlan(input: StartInput, run: Background = inBackground): Promise<{ planId: string; started: boolean }> {
  if (input.airDate < centralDate()) throw new PlanError(400, 'The air date is in the past.', 'past_date');
  const { cohortId } = batchOr(await resolveBatch(input.airDate));
  const { id, created, runId } = await store.createOrJoin({ airDate: input.airDate, cohortId, inputs: input.inputs, createdBy: input.createdBy });
  if (created && runId) run(id, runId, false);
  return { planId: id, started: created };
}

/** New topics from the same research, or the whole run again when there is no research to reuse. */
export async function regenerate(planId: string, run: Background = inBackground): Promise<void> {
  const plan = await store.getPlan(planId);
  if (!plan) throw new PlanError(404, 'Not found', 'not_found');
  if (plan.status === 'chosen') throw new PlanError(409, 'A topic is already chosen for this plan. Start a new plan to get different topics.', 'already_chosen');
  const haveResearch = (await WeeklyLiveSignal.count({ where: { plan_id: planId, dropped_reason: null } })) > 0; // before claiming, so a failed read leaves the plan as it was
  const runId = await store.claimForRun(planId);
  if (!runId) throw new PlanError(409, 'A run for this air date is still going.', 'running');
  run(planId, runId, haveResearch);
}

export async function choose(planId: string, topicId: string, override: boolean): Promise<void> {
  const plan = await store.getPlan(planId);
  if (!plan) throw new PlanError(404, 'Not found', 'not_found');
  const topic = await WeeklyLiveTopic.findOne({ where: { id: topicId, plan_id: planId } });
  if (!topic) throw new PlanError(404, 'That topic is not in this plan.', 'topic_not_found');
  if (plan.status === 'researching' || plan.status === 'draft') throw new PlanError(409, 'The plan is not finished yet.', 'not_ready');
  const few = topic.factors.length < MIN_VIRAL_FACTORS;
  if (!override && (few || Number(topic.topic_score) < TOPIC_GATE)) {
    throw new PlanError(409, few ? `This topic uses ${topic.factors.length} viral factors and needs ${MIN_VIRAL_FACTORS}.` : `This topic scores ${topic.topic_score}, under the ${TOPIC_GATE} needed.`, 'needs_override');
  }
  if (!(await store.setChosen(planId, topicId))) throw new PlanError(409, 'The plan changed while you were choosing. Reload it.', 'changed');
}

export interface DemandView { week: number; video_url: string | null; video_title: string | null; channel: string | null; views: number | null; multiple: number | null; score: number | null; thin_median: boolean; measured_at: string; failed: boolean; }
const demandView = async (): Promise<DemandView[]> => (await latestDemand()).map((d) => ({
  week: d.week, video_url: d.video_url, video_title: d.video_title, channel: d.channel, views: d.views, multiple: d.multiple === null ? null : Number(d.multiple),
  score: d.score, thin_median: d.thin_median, measured_at: d.measured_at, failed: d.error !== null,
}));

/** Everything the page shows for one plan. */
export async function planView(planId: string) {
  const plan = await store.getPlan(planId);
  if (!plan) throw new PlanError(404, 'Not found', 'not_found');
  const [signals, topics, demand] = await Promise.all([
    WeeklyLiveSignal.findAll({ where: { plan_id: planId }, order: [['published_at', 'DESC NULLS LAST'], ['url', 'ASC']] }),
    WeeklyLiveTopic.findAll({ where: { plan_id: planId }, order: [['rank', 'ASC']] }),
    demandView(),
  ]);
  const ready = topics.find((t) => t.factors.length >= MIN_VIRAL_FACTORS && Number(t.topic_score) >= TOPIC_GATE && (t.teach_lines.proof?.score ?? 0) >= 4);
  return {
    plan, demand,
    signals: signals.map((s) => ({ id: s.id, headline: s.headline, publisher: s.publisher, url: s.url, published_at: s.published_at, date_confirmed: s.date_confirmed, factors: s.factors, fits_weeks: s.fits_weeks, idea: s.idea, dropped_reason: s.dropped_reason })),
    topics: topics.map((t) => ({
      id: t.id, rank: t.rank, week: t.week, title: t.title, spin: t.spin, parody: t.parody, hooks: t.hooks, package: t.package, marketing: t.marketing, signals_used: t.signals_used,
      teach_lines: t.teach_lines, teach: Number(t.teach), viral: Number(t.viral), convert: Number(t.convert), topic_score: Number(t.topic_score), factors: t.factors, warnings: t.warnings, recommended: t.id === ready?.id,
    })),
  };
}
export type PlanView = Awaited<ReturnType<typeof planView>>;

/** What the picker needs before a run: the batch for the date, the curriculum map, demand, and any plan already made. */
export interface PlanSetup { batch: BatchResult; map: CurriculumMap; demand: DemandView[]; latestPlanId: string | null; sessions: BatchSession[]; }
export async function planSetup(airDate: string): Promise<PlanSetup> {
  const [batch, map, demand, latest] = await Promise.all([resolveBatch(airDate), curriculumMap(), demandView(), store.latestPlanFor(airDate)]);
  return { batch, map, demand, latestPlanId: latest?.id ?? null, sessions: batch.ok ? await batchSessions(batch.cohortId) : [] };
}
