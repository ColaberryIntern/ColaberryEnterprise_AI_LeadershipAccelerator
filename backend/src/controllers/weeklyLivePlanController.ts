import type { Request, Response } from 'express';
import { z } from 'zod';
import { batchNameFor } from '../services/weeklyLive/batchResolver';
import { choose, PlanError, planSetup, planView, regenerate, startPlan } from '../services/weeklyLive/plans/planService';
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

const num = z.number();
const PlanViewSchema = z.object({
  plan: z.object({ id: Id, air_date: z.string(), status: z.enum(['draft', 'researching', 'ready', 'chosen', 'failed']), stage: z.enum(STAGES), error: z.string().nullable(), note: z.string().nullable(), cost_usd: num, chosen_topic_id: z.string().nullable(), inputs: z.object({ week: z.union([z.literal('auto'), num]) }) }),
  demand: z.array(z.object({ week: num, multiple: num.nullable(), score: num.nullable(), failed: z.boolean() })),
  signals: z.array(z.object({ id: z.string(), headline: z.string(), url: z.string(), factors: z.array(num), dropped_reason: z.string().nullable() })),
  topics: z.array(z.object({ id: z.string(), rank: num, week: num, title: z.string(), teach: num, viral: num, convert: num, topic_score: num, recommended: z.boolean(), hooks: z.array(z.object({ text: z.string(), viral: num })), warnings: z.array(z.object({ code: z.string(), message: z.string() })) })),
});

/** Development fails loud on a wrong shape; production logs it and still answers. */
function checked<T>(value: T): T {
  const p = PlanViewSchema.safeParse(value);
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
  try { return res.json(await planSetup(d.data)); } catch (e) { return fail(res, e); }
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
  try { return res.json(checked(await planView(id.data))); } catch (e) { return fail(res, e); }
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
