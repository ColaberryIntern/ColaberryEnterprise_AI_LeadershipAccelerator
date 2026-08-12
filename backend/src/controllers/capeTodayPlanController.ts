import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { getTodayPlan } from '../services/cape/capeTodayPlanService';
import { recordFeedback, startTestOut, CapeTodayPlanFeedbackError } from '../services/cape/capeTodayPlanFeedbackService';
import { todayPlanFeedbackInputSchema, todayPlanTestOutInputSchema, todayPlanResponseSchema } from '../schemas/capeSchema';

const eid = (req: Request) => req.participant!.sub;

function fail(res: Response, e: any, next: NextFunction) {
  if (e?.status) { res.status(e.status).json({ ok: false, error: e.message || 'error' }); return; }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'cape_today_plan_controller_error', error_class: e?.name || 'Error', outcome: 'failure',
    context: { message: e?.message },
  }));
  next(e);
}

/**
 * GET /api/portal/cape/today-plan — CAPE Phase 5 (design doc §10, §16 Phase 5).
 * Flag-gated: returns 404 when `CAPE_TODAY_PLAN_ENABLED` is off (the default
 * everywhere including production) — belt-and-suspenders alongside the
 * frontend simply not calling this endpoint when its own copy of the flag
 * (via GET /api/portal/flags) is off.
 */
export async function handleGetTodayPlan(req: Request, res: Response, next: NextFunction) {
  if (!env.capeTodayPlanEnabled) {
    res.status(404).json({ ok: false, error: 'disabled' });
    return;
  }
  try {
    const plan = await getTodayPlan(eid(req));
    if (process.env.NODE_ENV !== 'production') {
      const parsed = todayPlanResponseSchema.safeParse(plan);
      if (!parsed.success) {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
          event: 'cape_today_plan_contract_violation', outcome: 'partial',
          context: { issues: parsed.error.issues.map((i) => i.message) },
        }));
      }
    }
    res.json(plan);
  } catch (e) { fail(res, e, next); }
}

/** POST /api/portal/cape/today-plan/feedback — the 6 non-diagnostic learner
 * feedback controls (design doc §11). Flag-gated the same as the GET route. */
export async function handlePostTodayPlanFeedback(req: Request, res: Response, next: NextFunction) {
  if (!env.capeTodayPlanEnabled) {
    res.status(404).json({ ok: false, error: 'disabled' });
    return;
  }
  const parsed = todayPlanFeedbackInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') });
    return;
  }
  try {
    const result = await recordFeedback({ enrollment_id: eid(req), ref: parsed.data.ref, action: parsed.data.action });
    res.json({ ok: true, created: result.created });
  } catch (e) { fail(res, e, next); }
}

/** POST /api/portal/cape/today-plan/test-out — reuses the existing Phase 2
 * diagnostic start flow directly (design doc §11). Flag-gated the same way. */
export async function handlePostTodayPlanTestOut(req: Request, res: Response, next: NextFunction) {
  if (!env.capeTodayPlanEnabled) {
    res.status(404).json({ ok: false, error: 'disabled' });
    return;
  }
  const parsed = todayPlanTestOutInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') });
    return;
  }
  try {
    const result = await startTestOut(eid(req), parsed.data.ref);
    res.json(result);
  } catch (e) {
    if (e instanceof CapeTodayPlanFeedbackError) { res.status(e.status).json({ ok: false, error: e.message }); return; }
    fail(res, e, next);
  }
}
