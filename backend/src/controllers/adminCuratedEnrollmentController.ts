import { NextFunction, Request, Response } from 'express';
import { curatedEnrollmentRequestSchema } from '../schemas/curatedEnrollmentSchema';
import {
  CuratedEnrollmentError,
  executeCuratedEnrollment,
  planCuratedEnrollment,
} from '../services/curatedEnrollmentService';

/**
 * POST /api/admin/campaigns/curated-enrollment  (C6.6)
 *
 * One route, two modes, and the safe one is the default: `dry_run` is true unless the body
 * says otherwise, so a request that forgets the flag returns a plan and writes nothing.
 *
 * A dry run returns the plan and its `planHash`. To actually enroll, send the SAME contacts
 * back with `dry_run: false` and an `approval` carrying that hash. The service refuses a
 * missing or mismatched approval, so this handler does not need to re-check it - and
 * deliberately does not, because a gate enforced in two places drifts in one of them.
 *
 * `approvedBy` is taken from the authenticated admin session rather than the body. A body
 * that can name its own approver is not an approval.
 */
export async function handleCuratedEnrollment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = curatedEnrollmentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    return;
  }
  const { contacts, dry_run: dryRun, approval } = parsed.data;

  try {
    if (dryRun) {
      const plan = await planCuratedEnrollment(contacts);
      res.json({ dry_run: true, plan });
      return;
    }

    const adminId = (req as any).admin?.id || (req as any).user?.id;
    if (!adminId) {
      res.status(403).json({ error: 'no_admin_identity' });
      return;
    }
    if (!approval) {
      res.status(400).json({ error: 'approval_required' });
      return;
    }

    const result = await executeCuratedEnrollment(contacts, {
      ...approval,
      approvedBy: String(adminId),
    });
    res.json({ dry_run: false, ...result });
  } catch (error: any) {
    if (error instanceof CuratedEnrollmentError) {
      res.status(400).json({ error: error.code, message: error.message });
      return;
    }
    next(error);
  }
}
