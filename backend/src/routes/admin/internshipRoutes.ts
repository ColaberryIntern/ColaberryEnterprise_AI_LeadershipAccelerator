import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import InternshipApplication from '../../models/InternshipApplication';
import { applicationDetail, queue, queueCounts, type QueueBucket } from '../../services/internship/internshipReviewQueue';
import { decide } from '../../services/internship/internshipDecisionService';
import { InvalidInternshipTransitionError } from '../../services/internship/internshipStateMachine';
import { REASON_CODES } from '../../services/internship/internshipReasonCodes';

/**
 * Admin — AI Internship applications.
 *
 * ── THE GATE ───────────────────────────────────────────────────────────────
 *
 * Every route is `requireSection('internship')`, which admits owner, mgmt-admin
 * and **admissions** — the role Dhee holds, so she manages this without needing
 * `admin`. Two things must agree for that to work, and both are in this change:
 *
 *   1. `mgmtSectionGate`'s PATH_SECTION maps `/api/admin/internship` → 'internship'.
 *      Without that row the gate is deny-by-default and every scoped mgmt token
 *      403s here while a legacy full admin passes — the exact latent failure the
 *      case-studies and cert-prep rows in that file were added to fix.
 *   2. The frontend nav declares the same section, so the page and the API cannot
 *      disagree about who may see it.
 *
 * ── AND WHY THE DECISION ROUTE IS NOT "PATCH state" ────────────────────────
 *
 * A generic state-setting endpoint would let a reviewer (or a bug) move an
 * application anywhere the state machine happens to allow, without a reason code,
 * without a decision row, and without an email. The verbs here are the decisions
 * a reviewer actually makes, and each one goes through `decide()`, which cannot
 * record a rejection without a student-safe reason.
 */
const router = Router();

const BUCKETS: QueueBucket[] = [
  'awaiting_review', 'information_requested', 'waitlisted',
  'interview_incomplete', 'calls_failed', 'approved_awaiting_documents', 'all_open',
];

const queueQuerySchema = z.object({
  bucket: z.enum(BUCKETS as [QueueBucket, ...QueueBucket[]]).default('awaiting_review'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const decideSchema = z.object({
  decision: z.enum([
    'approve', 'approve_with_conditions', 'reject',
    'waitlist', 'request_information', 'schedule_human_follow_up',
  ]),
  reason_code: z.enum(REASON_CODES as [string, ...string[]]),
  student_message: z.string().max(4000).nullish(),
  reviewer_notes: z.string().max(4000).nullish(),
  conditions: z.string().max(2000).nullish(),
}).strict();

/** GET /api/admin/internship/queue */
router.get('/api/admin/internship/queue', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = queueQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid filters.', issues: parsed.error.issues });
    return;
  }
  try {
    const [counts, page] = await Promise.all([
      queueCounts(),
      queue(parsed.data),
    ]);
    res.json({ counts, ...page, bucket: parsed.data.bucket });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_queue_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load the queue.' });
  }
});

/** GET /api/admin/internship/applications/:id */
router.get('/api/admin/internship/applications/:id', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const detail = await applicationDetail(String(req.params.id));
    if (!detail) { res.status(404).json({ error: 'Application not found.' }); return; }
    res.json(detail);
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_detail_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load the application.' });
  }
});

/** POST /api/admin/internship/applications/:id/decide */
router.post('/api/admin/internship/applications/:id/decide', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = decideSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid decision.', issues: parsed.error.issues });
    return;
  }

  // The reviewer's identity comes from the TOKEN, never the body. A `decided_by`
  // field in the request would let one admin record a decision under another's
  // name, in a table whose whole purpose is saying who decided.
  const decidedBy = (req.admin as any)?.email
    ?? (req.admin as any)?.sub
    ?? 'unknown-admin';

  try {
    const application = await InternshipApplication.findByPk(String(req.params.id));
    if (!application) { res.status(404).json({ error: 'Application not found.' }); return; }

    const result = await decide({
      application,
      decision: parsed.data.decision,
      reasonCode: parsed.data.reason_code,
      studentMessage: parsed.data.student_message,
      reviewerNotes: parsed.data.reviewer_notes,
      conditions: parsed.data.conditions,
      decidedBy: String(decidedBy),
    });

    if (!result.ok) {
      res.status(400).json({ error: result.error, field: result.field });
      return;
    }
    res.json(result);
  } catch (err: any) {
    if (err instanceof InvalidInternshipTransitionError) {
      res.status(409).json({
        error: 'That decision is not available from this application\'s current status.',
        error_class: err.error_class,
      });
      return;
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_decide_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message, application_id: String(req.params.id) },
    }));
    res.status(500).json({ error: 'Could not record that decision.' });
  }
});

export default router;
