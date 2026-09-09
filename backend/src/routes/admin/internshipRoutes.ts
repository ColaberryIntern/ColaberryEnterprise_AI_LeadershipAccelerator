import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import InternshipApplication from '../../models/InternshipApplication';
import { applicationDetail, queue, queueCounts, type QueueBucket } from '../../services/internship/internshipReviewQueue';
import { decide } from '../../services/internship/internshipDecisionService';
import { InvalidInternshipTransitionError } from '../../services/internship/internshipStateMachine';
import { REASON_CODES } from '../../services/internship/internshipReasonCodes';
import fs from 'fs';
import path from 'path';
import { SIGNED_DOC_DIR } from '../../config/upload';
import { documentsFor, outstandingRequirements, verifyDocument } from '../../services/internship/internshipDocumentService';
import { activate, activeInternView, buildChecklist } from '../../services/internship/internshipActivationService';

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

const verifySchema = z.object({
  accept: z.boolean(),
  rejection_reason: z.string().max(2000).nullish(),
}).strict();

/** GET /api/admin/internship/applications/:id/documents */
router.get('/api/admin/internship/applications/:id/documents', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const applicationId = String(req.params.id);
    const [rows, outstanding] = await Promise.all([
      documentsFor(applicationId),
      outstandingRequirements(applicationId),
    ]);
    res.json({
      ...outstanding,
      documents: rows.map((d) => ({
        id: d.id,
        document_type: d.document_type,
        kind: d.kind,
        revision: d.revision,
        status: d.status,
        original_filename: d.original_filename,
        mime_type: d.mime_type,
        byte_size: d.byte_size,
        // The hash, not the file. A reviewer comparing two revisions wants to know
        // whether they differ, and the first 12 hex characters answer that on sight.
        checksum_short: d.checksum_sha256 ? d.checksum_sha256.slice(0, 12) : null,
        document_public_id: d.document_public_id,
        verified_by: d.verified_by,
        verified_at: d.verified_at ? new Date(d.verified_at).toISOString() : null,
        rejection_reason: d.rejection_reason,
        created_at: new Date(d.created_at).toISOString(),
      })),
    });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_admin_documents_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load the documents.' });
  }
});

/**
 * GET /api/admin/internship/documents/:documentId/file
 *
 * A reviewer has to actually LOOK at a signed page to verify it, so this streams
 * the stored file. `storage_key` comes from the database and is a UUID filename we
 * generated, never anything the applicant supplied — and `path.basename` is applied
 * anyway, so a corrupted row cannot become a path traversal.
 */
router.get('/api/admin/internship/documents/:documentId/file', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const InternshipDocument = (await import('../../models/InternshipDocument')).default;
    const row = await InternshipDocument.findByPk(String(req.params.documentId));
    if (!row?.storage_key) { res.status(404).json({ error: 'Document not found.' }); return; }

    const safeName = path.basename(row.storage_key);
    const full = path.join(SIGNED_DOC_DIR, safeName);
    if (!fs.existsSync(full)) { res.status(404).json({ error: 'File is missing from storage.' }); return; }

    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(full).pipe(res);
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_admin_file_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not open the file.' });
  }
});

/** POST /api/admin/internship/documents/:documentId/verify */
router.post('/api/admin/internship/documents/:documentId/verify', requireSection('internship'), async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request.', issues: parsed.error.issues });
    return;
  }

  const reviewerId = String((req.admin as any)?.email ?? (req.admin as any)?.sub ?? 'unknown-admin');

  try {
    const InternshipDocument = (await import('../../models/InternshipDocument')).default;
    const doc = await InternshipDocument.findByPk(String(req.params.documentId));
    if (!doc) { res.status(404).json({ error: 'Document not found.' }); return; }

    const application = await InternshipApplication.findByPk(doc.application_id);
    if (!application) { res.status(404).json({ error: 'Application not found.' }); return; }

    const result = await verifyDocument({
      application,
      documentId: doc.id,
      accept: parsed.data.accept,
      reviewerId,
      rejectionReason: parsed.data.rejection_reason,
    });

    if (!result.ok) { res.status(400).json({ error: result.error }); return; }
    res.json(result);
  } catch (err: any) {
    if (err instanceof InvalidInternshipTransitionError) {
      res.status(409).json({ error: "That is not available from this application’s current status." });
      return;
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_verify_document_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not record that.' });
  }
});

/** GET /api/admin/internship/applications/:id/onboarding */
router.get('/api/admin/internship/applications/:id/onboarding', requireSection('internship'), async (req: Request, res: Response) => {
  try {
    const application = await InternshipApplication.findByPk(String(req.params.id));
    if (!application) { res.status(404).json({ error: 'Application not found.' }); return; }
    const view = await activeInternView(application);
    res.json({ state: application.state, ...view });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_admin_onboarding_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
    res.status(500).json({ error: 'Could not load onboarding.' });
  }
});

/**
 * POST /api/admin/internship/applications/:id/activate
 *
 * The ONLY route that puts someone in the internship cohort. Reviewer-gated, and
 * it refuses with the outstanding blockers rather than a bare error, so the
 * reviewer sees WHY — most often an unverified document or an inactive membership.
 */
router.post('/api/admin/internship/applications/:id/activate', requireSection('internship'), async (req: Request, res: Response) => {
  const actorId = String((req.admin as any)?.email ?? (req.admin as any)?.sub ?? 'unknown-admin');
  try {
    const application = await InternshipApplication.findByPk(String(req.params.id));
    if (!application) { res.status(404).json({ error: 'Application not found.' }); return; }

    const result = await activate({ application, actor: 'reviewer', actorId });

    if (!result.ok && result.reason === 'blocked') {
      res.status(409).json({
        error: 'Not ready to activate yet.',
        blockers: result.blockers.map((b) => ({ key: b.key, label: b.label, waiting_on: b.waiting_on })),
      });
      return;
    }
    if (!result.ok) {
      res.status(409).json({ error: `Cannot activate from ${result.state}.` });
      return;
    }

    const checklist = await buildChecklist(application);
    res.json({ ...result, checklist });
  } catch (err: any) {
    if (err instanceof InvalidInternshipTransitionError) {
      res.status(409).json({ error: 'That is not available from this status.' });
      return;
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error', service: 'backend', event: 'internship_activate_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message, application_id: String(req.params.id) },
    }));
    res.status(500).json({ error: 'Could not activate.' });
  }
});

export default router;
