import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { resolveContentPageAccess } from '../services/access/contentEntitlement';

/**
 * requireContentEntitlement — the page-level content paywall gate (Classroom,
 * Projects). Mirrors requireBuildEntitlement.ts's shape (flag check ->
 * participant check -> try/catch fail-open -> structured error log -> 402), but
 * reuses `resolveContentPageAccess` (services/access/contentEntitlement) for the
 * actual enrollment/cohort/staff/comp lookup so there is exactly ONE
 * implementation of "is this enrollment entitled," not a second copy here.
 *
 * FLAG-GATED, DEFAULT OFF (`env.contentPageGateEnabled` <- CONTENT_PAGE_GATE_ENABLED).
 * MUST run AFTER `requireParticipant` (reads `req.participant.sub`).
 *
 * Defense in depth: <PageGate> already blocks the frontend route before this
 * ever fires in the common case, so a genuinely-gated user's click never even
 * reaches this middleware — but a stale client cache, a direct API call, or a
 * client-side bug must not be able to see real curriculum/project data, so this
 * is the actual security boundary, not decoration on top of the frontend gate.
 */

type GatedFeature = 'classroom' | 'projects';

const NOT_ENTITLED_BODY = (feature: GatedFeature) => ({
  error: 'content_requires_paid',
  message: 'This is part of the paid Accelerator. Enroll and pay to unlock it.',
  upgrade: { reason: 'content_gated', cta: 'unlock_content', feature },
}) as const;

export function requireContentEntitlement(feature: GatedFeature) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    // Flag OFF → inert. Ships dark; nothing changes until CONTENT_PAGE_GATE_ENABLED=true.
    if (!env.contentPageGateEnabled) {
      next();
      return;
    }

    const enrollmentId = req.participant?.sub;
    // Enforcing auth is requireParticipant's job, not this gate's — fail open if
    // it somehow ran without a participant.
    if (!enrollmentId) {
      next();
      return;
    }

    try {
      const { isStaff, hasFullAccess } = await resolveContentPageAccess(enrollmentId);
      if (isStaff || hasFullAccess) {
        next();
        return;
      }
      res.status(402).json(NOT_ENTITLED_BODY(feature));
    } catch (err: any) {
      // Failure-first: an infra/DB error must NEVER block a possibly-paying user.
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'content_entitlement_check_failed',
        error_class: 'EntitlementLookupError',
        outcome: 'fail_open',
        context: { enrollment_id: enrollmentId, feature, message: err?.message },
      }));
      next();
    }
  };
}
