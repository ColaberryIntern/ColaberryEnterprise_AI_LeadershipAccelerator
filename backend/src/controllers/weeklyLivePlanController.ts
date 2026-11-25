import type { Request, Response } from 'express';
import { z } from 'zod';
import { batchNameFor } from '../services/weeklyLive/batchResolver';
import { choose, PlanError, planSetup, planView, regenerate, startPlan, type PlanSetup, type PlanView } from '../services/weeklyLive/plans/planService';
import { STAGES } from '../services/weeklyLive/plans/planStore';

/** Plan API (WL3.4). Full administrators only (in the router). Every body and id is validated; responses are checked against the declared shape. */
const Id = z.string().uuid();
const AirDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => batchNameFor(d) !== null, 'not a real date');
const note = (n: number) => z.string().trim().max(n).optional();
const StartBody = z.object({
  airDate: AirDate,
  inputs: z.object({ week: z.union([z.literal('auto'), z.number().int().min(1).max(12)]), proof: note(1000), forceNews: note(500), audience: note(200), avoid: note(500), notes: note(1000) }).strict(),
}).strict();
const ChooseBody = z.object({ topicId: Id, override: z.boolean().optional() }).strict();
const Empty = z.object({}).strict();

const num = z.number(); const str = z.string(); const strOrNull = z.string().nullable(); const ints = z.array(z.number().int());
const week = z.number().int().min(1).max(12);
const words = z.record(str, str);
const DemandSchema = z.array(z.object({
  week, video_url: strOrNull, video_title: strOrNull, channel: strOrNull, views: num.nullable(), multiple: num.nullable(), score: num.nullable(), thin_median: z.boolean(), measured_at: str, failed: z.boolean(),
}).strict());
const PlanViewSchema = z.object({
  plan: z.object({
    id: Id, air_date: str, cohort_id: strOrNull, status: z.enum(['draft', 'researching', 'ready', 'chosen', 'failed']), stage: z.enum(STAGES), error: strOrNull, note: strOrNull, cost_usd: num, chosen_topic_id: strOrNull,
    inputs: z.object({ week: z.union([z.literal('auto'), week]), proof: str.optional(), forceNews: str.optional(), audience: str.optional(), avoid: str.optional(), notes: str.optional() }).strict(),
  }).strict(),
  demand: DemandSchema,
  signals: z.array(z.object({
    id: str, headline: str, publisher: strOrNull, url: str, published_at: strOrNull, date_confirmed: z.boolean(), factors: ints, fits_weeks: ints, idea: strOrNull, dropped_reason: strOrNull,
  }).strict()),
  topics: z.array(z.object({
    id: str, rank: num, week, title: str, spin: strOrNull, parody: strOrNull, hooks: z.array(z.object({ text: str, viral: num })), package: words, marketing: words, signals_used: z.array(str),
    teach_lines: z.record(str, z.object({ score: num, why: str })), teach: num, viral: num, convert: num, topic_score: num, factors: ints, warnings: z.array(z.object({ code: str, message: str })), recommended: z.boolean(),
  }).strict()),
}).strict();
const PlanSetupSchema = z.object({
  batch: z.union([
    z.object({ ok: z.literal(true), cohortId: str, cohortName: str }), z.object({ ok: z.literal(false), status: z.literal(409), error: str, cohortName: str }), z.object({ ok: z.literal(false), status: z.literal(400), error: str }),
  ]),
  map: z.object({
    asOf: str, recentWeeks: z.array(num),
    weeks: z.array(z.object({ week, theme: str, intensive: str, timesCovered: num, lastCovered: strOrNull, lastTitle: strOrNull, daysAgo: num.nullable(), coveredInLast4: z.boolean(), planned: z.object({ date: str, title: str }).nullable() })),
  }),
  demand: DemandSchema, latestPlanId: strOrNull,
  sessions: z.array(z.object({ id: str, date: strOrNull, title: str, week: week.nullable(), status: strOrNull }).strict()),
}).strict();

/** The compiler refuses a service change the schemas do not follow, in either direction. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const inStep: [Same<z.infer<typeof PlanViewSchema>, PlanView>, Same<z.infer<typeof PlanSetupSchema>, PlanSetup>] = [true, true];
void inStep;

/** Development fails loud on a wrong shape; production logs it and still answers. */
function checked<T>(schema: z.ZodType, value: T): T {
  const p = schema.safeParse(value);
  if (!p.success) {
    const where = p.error.issues[0].path.join('.');
    if (process.env.NODE_ENV !== 'production') throw Object.assign(new Error(`Plan response does not match its type at ${where}`), { name: 'ContractViolation' });
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'weekly_live.plan_response', outcome: 'failure', error_class: 'ContractViolation', context: { path: where } }));
  }
  return value;
}

function fail(res: Response, e: unknown) {
  if (e instanceof PlanError) return res.status(e.status).json({ error: e.message, code: e.code });
  console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'weekly_live.plan', outcome: 'failure', error_class: e instanceof Error ? e.name : 'Unknown' }));
  return res.status(500).json({ error: 'Something went wrong' });
}
const invalid = (res: Response, e: z.ZodError) => res.status(400).json({ error: 'Invalid request', issues: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });

export async function handlePlanSetup(req: Request, res: Response) {
  const d = AirDate.safeParse(req.query.airDate);
  if (!d.success) return invalid(res, d.error);
  try { return res.json(checked(PlanSetupSchema, await planSetup(d.data))); } catch (e) { return fail(res, e); }
}

export async function handleStartPlan(req: Request, res: Response) {
  const body = StartBody.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const r = await startPlan({ ...body.data, createdBy: req.admin?.email ?? null });
    return res.status(r.started ? 202 : 200).json(r);
  } catch (e) { return fail(res, e); }
}

export async function handleGetPlan(req: Request, res: Response) {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: 'Not found' });
  try { return res.json(checked(PlanViewSchema, await planView(id.data))); } catch (e) { return fail(res, e); }
}

export async function handleRegenerate(req: Request, res: Response) {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: 'Not found' });
  const body = Empty.safeParse(req.body ?? {});
  if (!body.success) return invalid(res, body.error);
  try { await regenerate(id.data); return res.status(202).json({ planId: id.data, started: true }); } catch (e) { return fail(res, e); }
}

export async function handleChoose(req: Request, res: Response) {
  const id = Id.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: 'Not found' });
  const body = ChooseBody.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try { await choose(id.data, body.data.topicId, body.data.override === true); return res.json({ ok: true, chosenTopicId: body.data.topicId }); } catch (e) { return fail(res, e); }
}
