import { Request, Response, NextFunction } from 'express';
import { startDiagnostic, submitDiagnosticAttempt } from '../services/cape/capeDiagnosticService';
import { diagnosticSubmitSchema, diagnosticTriggerSchema } from '../schemas/capeSchema';

const eid = (req: Request) => req.participant!.sub;

function fail(res: Response, e: any, next: NextFunction) {
  if (e?.status) { res.status(e.status).json({ error: e.message || 'error' }); return; }
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'cape_diagnostic_controller_error', error_class: e?.name || 'Error', outcome: 'failure',
    context: { message: e?.message },
  }));
  next(e);
}

/**
 * GET /api/portal/cape/diagnostic/:skillId — starts a diagnostic / "test out"
 * attempt for one skill (design doc §5 "Adaptive confirmation", §11 "Test
 * out"). No DB write — items are deterministic given skillId. `trigger` query
 * param distinguishes a system-prompted diagnostic from a learner-initiated
 * "test out" (same underlying scoring path, see capeDiagnosticService.ts).
 */
export async function handleStartDiagnostic(req: Request, res: Response, next: NextFunction) {
  try {
    const triggerParsed = diagnosticTriggerSchema.safeParse(req.query.trigger ?? 'diagnostic_prompt');
    if (!triggerParsed.success) {
      return res.status(400).json({ error: 'invalid trigger' });
    }
    const result = startDiagnostic(String(req.params.skillId), triggerParsed.data);
    res.json(result);
  } catch (e) { fail(res, e, next); }
}

/**
 * POST /api/portal/cape/diagnostic/:skillId/submit — scores the attempt and
 * records ONE append-only outcome. Recomputes the submitted skill's derived
 * state afterward so the radar reflects the outcome immediately (same
 * "record then recompute" pattern as capeTimelineEvidenceBridge.ts).
 */
export async function handleSubmitDiagnostic(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = diagnosticSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join('; ') });
    }
    const { attempt_id, answers, trigger } = parsed.data;
    const skillId = String(req.params.skillId);

    const result = await submitDiagnosticAttempt(eid(req), skillId, attempt_id, answers, trigger ?? 'diagnostic_prompt');

    const { recomputeStudentArchitectureSkill } = await import('../services/cape/capeProficiencyService');
    await recomputeStudentArchitectureSkill(eid(req), skillId);

    res.json(result);
  } catch (e) { fail(res, e, next); }
}
