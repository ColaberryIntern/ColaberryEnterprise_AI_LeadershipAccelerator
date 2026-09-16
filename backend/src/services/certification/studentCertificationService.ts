/**
 * studentCertificationService — the certification claim lifecycle behind
 * AI Architect (decision D4, docs/POINTS_LADDER_DECISIONS.md).
 *
 *   student uploads the certificate  →  pending
 *   staff approves                   →  approved  (latches the milestone, re-ranks)
 *   staff rejects                    →  rejected  (student may submit again)
 *
 * "We are the approvers": nothing here reads Cert Prep readiness or an external
 * verifier. A row becomes approved only because a named staff member said so,
 * and that name is stored on the row.
 *
 * Idempotency: one open (pending|approved) claim per (enrollment, track) is
 * enforced by the partial unique index; a second upload while one is open is
 * refused with `CertificationAlreadyOpen`. Approving an approved row is a
 * no-op that returns the row; any other decision on a non-pending row is
 * refused with `CertificationAlreadyReviewed`. The milestone latch is keyed on
 * the certification id, so a retried approval cannot double-count.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { Op } from 'sequelize';
import StudentCertification, { StudentCertificationStatus } from '../../models/StudentCertification';
import { CERT_DIR } from '../../config/upload';
import { latchCertificationMilestone } from '../progression/milestoneService';
import { evaluateForEnrollment } from '../progression/promotionService';

export const CERTIFICATION_TRACKS = ['cca_f'] as const;
export type CertificationTrack = typeof CERTIFICATION_TRACKS[number];
export const DEFAULT_TRACK: CertificationTrack = 'cca_f';

export class CertificationError extends Error {
  constructor(public readonly code: 'CertificationAlreadyOpen' | 'CertificationNotFound' | 'CertificationAlreadyReviewed' | 'CertificationForbidden', message: string, public readonly status: number) {
    super(message);
    this.name = code;
  }
}

export interface UploadedCertificateFile {
  filename: string;
  mimetype: string;
  originalname?: string;
}

export interface SubmitCertificationInput {
  enrollmentId: string;
  track?: string;
  file: UploadedCertificateFile;
  credentialId?: string | null;
  passedOn?: string | null;
  note?: string | null;
}

export interface CertificationView {
  id: string;
  track: string;
  status: StudentCertificationStatus;
  original_name: string | null;
  credential_id: string | null;
  passed_on: string | null;
  note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
}

export function toView(row: StudentCertification): CertificationView {
  return {
    id: row.id,
    track: row.track,
    status: row.status,
    original_name: row.original_name ?? null,
    credential_id: row.credential_id ?? null,
    passed_on: row.passed_on ?? null,
    note: row.note ?? null,
    submitted_at: new Date(row.submitted_at).toISOString(),
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    reviewed_by: row.reviewed_by ?? null,
    review_note: row.review_note ?? null,
  };
}

/** Student: file a claim. Refused while a pending or approved claim exists for the track. */
export async function submitCertification(input: SubmitCertificationInput): Promise<CertificationView> {
  const track = input.track && (CERTIFICATION_TRACKS as readonly string[]).includes(input.track) ? input.track : DEFAULT_TRACK;
  const open = await StudentCertification.findOne({
    where: { enrollment_id: input.enrollmentId, track, status: { [Op.in]: ['pending', 'approved'] } },
  });
  if (open) {
    throw new CertificationError(
      'CertificationAlreadyOpen',
      open.status === 'approved'
        ? 'This certification is already approved on your account.'
        : 'You already have a certificate waiting for review. Staff will look at it shortly.',
      409,
    );
  }
  const row = await StudentCertification.create({
    enrollment_id: input.enrollmentId,
    track,
    status: 'pending',
    file_name: path.basename(input.file.filename),
    file_mime: input.file.mimetype,
    original_name: input.file.originalname ? input.file.originalname.slice(0, 255) : null,
    credential_id: input.credentialId ? input.credentialId.slice(0, 120) : null,
    passed_on: input.passedOn || null,
    note: input.note || null,
    submitted_at: new Date(),
  });
  return toView(row);
}

/** Student: every claim they have filed, newest first. */
export async function listMyCertifications(enrollmentId: string): Promise<CertificationView[]> {
  const rows = await StudentCertification.findAll({ where: { enrollment_id: enrollmentId }, order: [['submitted_at', 'DESC']] });
  return rows.map(toView);
}

export interface AdminCertificationView extends CertificationView {
  enrollment_id: string;
}

/** Staff: the review queue (default pending), newest first. */
export async function listCertifications(status: StudentCertificationStatus | 'all' = 'pending', limit = 200): Promise<AdminCertificationView[]> {
  const where = status === 'all' ? {} : { status };
  const rows = await StudentCertification.findAll({ where, order: [['submitted_at', 'DESC']], limit });
  return rows.map((r) => ({ ...toView(r), enrollment_id: r.enrollment_id }));
}

export interface ReviewOutcome {
  certification: AdminCertificationView;
  /** True when THIS call latched the milestone (false on a retry or a rejection). */
  milestone_latched: boolean;
  promotion: { level: string; rank: number; promoted: boolean } | null;
}

/**
 * Staff decision. On approval the certification milestone is latched and the
 * student's rank is re-evaluated. The re-evaluation is non-fatal: the approval
 * is the record; a promotion hiccup is logged and picked up by the nightly
 * sweep, never a reason to lose the decision.
 */
export async function reviewCertification(
  id: string,
  decision: 'approved' | 'rejected',
  reviewer: string,
  note?: string | null,
): Promise<ReviewOutcome> {
  const row = await StudentCertification.findByPk(id);
  if (!row) throw new CertificationError('CertificationNotFound', 'Certification not found.', 404);

  if (row.status !== 'pending') {
    if (row.status === 'approved' && decision === 'approved') {
      return { certification: { ...toView(row), enrollment_id: row.enrollment_id }, milestone_latched: false, promotion: null };
    }
    throw new CertificationError('CertificationAlreadyReviewed', `This certification was already ${row.status}.`, 409);
  }

  await row.update({
    status: decision,
    reviewed_at: new Date(),
    reviewed_by: reviewer.slice(0, 255),
    review_note: note ? note.slice(0, 2000) : null,
  });

  let latched = false;
  let promotion: ReviewOutcome['promotion'] = null;
  if (decision === 'approved') {
    latched = await latchCertificationMilestone(row.enrollment_id, row.id, {
      track: row.track,
      credential_id: row.credential_id,
      passed_on: row.passed_on,
      reviewed_by: reviewer,
    });
    try {
      const out = await evaluateForEnrollment(row.enrollment_id);
      promotion = { level: out.level, rank: out.rank, promoted: out.promoted };
    } catch (err: any) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'certification_promotion_failed',
        outcome: 'partial',
        error_class: err?.name || 'Error',
        context: { certification_id: row.id, enrollment_id: row.enrollment_id, message: err?.message },
      }));
    }
  }

  return { certification: { ...toView(row), enrollment_id: row.enrollment_id }, milestone_latched: latched, promotion };
}

/**
 * The file on disk for a claim. `enrollmentId` restricts to the owner; staff
 * pass null. `basename` guards the stored name against traversal even though
 * multer wrote it.
 */
export async function getCertificationFile(
  id: string,
  enrollmentId: string | null,
): Promise<{ path: string; mime: string; download: string }> {
  const row = await StudentCertification.findByPk(id);
  if (!row) throw new CertificationError('CertificationNotFound', 'Certification not found.', 404);
  if (enrollmentId && row.enrollment_id !== enrollmentId) {
    throw new CertificationError('CertificationForbidden', 'Not your certification.', 403);
  }
  const p = path.join(CERT_DIR, path.basename(row.file_name));
  try { await fs.access(p); } catch {
    throw new CertificationError('CertificationNotFound', 'The certificate file is no longer on disk.', 404);
  }
  const ext = path.extname(row.file_name) || '';
  return { path: p, mime: row.file_mime || 'application/octet-stream', download: `certificate-${row.track}${ext}` };
}
