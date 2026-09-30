/**
 * certPrepRoutes — the student-facing Cert Prep API.
 *
 *   GET  /api/portal/cert-prep                      — availability + readiness summary
 *   GET  /api/portal/cert-prep/domains              — blueprint domains with per-domain state
 *   GET  /api/portal/cert-prep/evidence             — objectives vs verified build evidence
 *   POST /api/portal/cert-prep/evidence/refresh     — re-scan artifacts for candidates
 *   GET  /api/portal/cert-prep/sessions             — this student's sitting history
 *   POST /api/portal/cert-prep/sessions             — start a diagnostic / practice / mock
 *   GET  /api/portal/cert-prep/sessions/:id         — resume (safe items only)
 *   POST /api/portal/cert-prep/sessions/:id/responses — submit one answer, get the rationale
 *   POST /api/portal/cert-prep/sessions/:id/complete  — finish and score
 *
 * TWO INDEPENDENT GATES, deliberately. `env.certPrepEnabled` decides whether the
 * feature exists (404 when off, so deploying is inert). The Week 7 fence inside
 * certAvailabilityService decides who may use it once it does, and is always on.
 * Turning the flag on does not open the fence.
 *
 * EVERY route is scoped to `req.participant.sub` — the authenticated enrollment.
 * No endpoint accepts an enrollment id, a program week, a score, a correctness
 * flag, or a question revision from the caller. The client sends only which
 * options it selected; everything else is resolved or computed server-side.
 *
 * The availability endpoint is the ONE place that answers honestly for a
 * pre-Week-7 student rather than 404ing: the UI has to be able to say "Cert Prep
 * begins in Week 7" without pretending the feature is missing.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { env } from '../config/env';
import { getCertAvailability } from '../services/certPrep/certAvailabilityService';
import { getCurrentBlueprint } from '../services/certPrep/certBlueprintService';
import {
  startSession,
  resumeSession,
  submitResponse,
  completeSession,
  listSessions,
  CertSessionError,
} from '../services/certPrep/certSessionService';
import { computeReadiness, recordReadinessSnapshot } from '../services/certPrep/certReadinessService';
import { awardForCompletedSession } from '../services/certPrep/certPointsService';
import { getEvidenceMap, proposeCandidates } from '../services/certPrep/certEvidenceService';

const router = Router();
const eid = (req: Request) => req.participant!.sub;

/** Feature flag + no-store. Returns false when the route must not proceed. */
function gate(res: Response): boolean {
  if (!env.certPrepEnabled) {
    res.status(404).json({ error: 'Cert Prep is not enabled' });
    return false;
  }
  res.set('Cache-Control', 'no-store');
  return true;
}

/**
 * Map a service error onto a response. CertSessionError carries its own status
 * and code; anything else is unexpected and goes to the error handler rather than
 * being flattened into a misleading 400.
 */
function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof CertSessionError || (err?.status && err?.code)) {
    res.status(err.status).json({ error: err.message, code: err.code, availability: err.availability });
    return;
  }
  next(err);
}

/**
 * Availability + readiness. Answers for every student, including one before the
 * fence opens — `available:false` with a reason the UI can render, never a 404.
 */
router.get('/api/portal/cert-prep', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  if (!gate(res)) return;
  try {
    const availability = await getCertAvailability(eid(req));
    if (!availability.available) {
      res.json({ availability, readiness: null });
      return;
    }
    const readiness = await computeReadiness(eid(req), availability.trackId ?? undefined);
    res.json({ availability, readiness });
  } catch (err) {
    fail(res, err, next);
  }
});

/** Blueprint domains, with this student's per-domain knowledge and evidence. */
router.get('/api/portal/cert-prep/domains', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  if (!gate(res)) return;
  try {
    const availability = await getCertAvailability(eid(req));
    if (!availability.available) {
      res.status(403).json({ error: 'Cert Prep is not available yet', code: 'CERT_PREP_NOT_AVAILABLE', availability });
      return;
    }
    const blueprint = await getCurrentBlueprint(availability.trackId ?? undefined);
    if (!blueprint) {
      res.status(409).json({ error: 'No certification blueprint is configured', code: 'CERT_NO_BLUEPRINT' });
      return;
    }
    const readiness = await computeReadiness(eid(req), availability.trackId ?? undefined);
    res.json({
      track: {
        track_id: blueprint.track.track_id,
        display_name: blueprint.track.display_name,
        issuer: blueprint.track.issuer,
        blueprint_version: blueprint.track.blueprint_version,
        blueprint_source: blueprint.track.blueprint_source,
        exam_item_count: blueprint.track.exam_item_count,
        exam_duration_minutes: blueprint.track.exam_duration_minutes,
        passing_scaled_score: blueprint.track.passing_scaled_score,
      },
      domains: blueprint.domains.map((d) => ({
        domain_id: d.domain_id,
        label: d.label,
        description: d.description,
        weight_pct: d.weight_pct,
        weight_source: d.weight_source,
        display_order: d.display_order,
        objectives: d.objectives,
        state: readiness?.domain_breakdown.find((b) => b.domain_id === d.domain_id) ?? null,
      })),
    });
  } catch (err) {
    fail(res, err, next);
  }
});

/**
 * The evidence map: every blueprint objective with its state and, where it is not
 * yet verified, the build that would close it.
 */
router.get('/api/portal/cert-prep/evidence', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  if (!gate(res)) return;
  try {
    const availability = await getCertAvailability(eid(req));
    if (!availability.available) {
      res.status(403).json({ error: 'Cert Prep is not available yet', code: 'CERT_PREP_NOT_AVAILABLE', availability });
      return;
    }
    const map = await getEvidenceMap(eid(req), availability.trackId ?? undefined);
    if (!map) {
      res.status(409).json({ error: 'No certification blueprint is configured', code: 'CERT_NO_BLUEPRINT' });
      return;
    }
    res.json(map);
  } catch (err) {
    fail(res, err, next);
  }
});

/**
 * Re-scan this student's artifacts for candidate evidence.
 *
 * Safe for a student to trigger: it can only ever create PENDING candidates, and
 * the unique index means it cannot duplicate one or resurrect a rejected one.
 * Verification remains an instructor action on a separate surface.
 */
router.post('/api/portal/cert-prep/evidence/refresh', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  if (!gate(res)) return;
  try {
    const availability = await getCertAvailability(eid(req));
    if (!availability.available) {
      res.status(403).json({ error: 'Cert Prep is not available yet', code: 'CERT_PREP_NOT_AVAILABLE', availability });
      return;
    }
    const result = await proposeCandidates(eid(req), availability.trackId ?? undefined);
    const map = await getEvidenceMap(eid(req), availability.trackId ?? undefined);
    res.json({ ...result, map });
  } catch (err) {
    fail(res, err, next);
  }
});

/** This student's sittings, newest first. */
router.get('/api/portal/cert-prep/sessions', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  if (!gate(res)) return;
  try {
    const sessions = await listSessions(eid(req));
    res.json({ sessions });
  } catch (err) {
    fail(res, err, next);
  }
});

const startSchema = z.object({
  mode: z.enum(['diagnostic', 'practice', 'mock']),
  domain_ids: z.array(z.string().max(40)).max(10).optional(),
  item_count: z.number().int().min(1).max(120).optional(),
  idempotency_key: z.string().max(160).optional(),
});

/**
 * Start a sitting. Note what is NOT in the schema: no enrollment id, no week, no
 * track override that could sidestep the fence, and no question list.
 */
router.post('/api/portal/cert-prep/sessions', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  if (!gate(res)) return;
  const parsed = startSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', code: 'CERT_BAD_REQUEST', issues: parsed.error.issues });
    return;
  }
  try {
    const view = await startSession({
      enrollmentId: eid(req),
      mode: parsed.data.mode,
      domainIds: parsed.data.domain_ids,
      itemCount: parsed.data.item_count,
      idempotencyKey: parsed.data.idempotency_key,
    });
    res.status(201).json(view);
  } catch (err) {
    fail(res, err, next);
  }
});

/** Resume. Returns safe items plus what has already been answered. */
router.get('/api/portal/cert-prep/sessions/:sessionId', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  if (!gate(res)) return;
  try {
    res.json(await resumeSession(String(req.params.sessionId), eid(req)));
  } catch (err) {
    fail(res, err, next);
  }
});

const responseSchema = z.object({
  question_key: z.string().min(1).max(60),
  selected_keys: z.array(z.string().max(8)).max(10),
  time_ms: z.number().int().min(0).max(3_600_000).optional(),
});

/**
 * Submit one answer. The response body carries the selection ONLY — correctness
 * is computed server-side against the revision the session recorded as served.
 */
router.post('/api/portal/cert-prep/sessions/:sessionId/responses', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  if (!gate(res)) return;
  const parsed = responseSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', code: 'CERT_BAD_REQUEST', issues: parsed.error.issues });
    return;
  }
  try {
    const revealed = await submitResponse(
      String(req.params.sessionId),
      eid(req),
      parsed.data.question_key,
      parsed.data.selected_keys,
      { timeMs: parsed.data.time_ms },
    );
    res.json(revealed);
  } catch (err) {
    fail(res, err, next);
  }
});

/**
 * Complete and score. Points and a readiness snapshot follow, both idempotent, so
 * a retried complete cannot pay twice or fabricate a second snapshot of record.
 */
router.post('/api/portal/cert-prep/sessions/:sessionId/complete', requireParticipant, async (req: Request, res: Response, next: NextFunction) => {
  if (!gate(res)) return;
  try {
    const session = await completeSession(String(req.params.sessionId), eid(req));
    const points = await awardForCompletedSession(eid(req), {
      id: session.id,
      mode: session.mode,
      domain_results: session.domain_results,
    });
    const readiness = await recordReadinessSnapshot(eid(req), session.track_id);
    res.json({ session, points, readiness: readiness?.computation ?? null });
  } catch (err) {
    fail(res, err, next);
  }
});

export default router;
