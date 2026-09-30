import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Op } from 'sequelize';
import Enrollment from '../../models/Enrollment';
import InternshipApplication from '../../models/InternshipApplication';
import InternshipAdministrativeIntake from '../../models/InternshipAdministrativeIntake';
import InternshipDecision from '../../models/InternshipDecision';
import InternshipDocument from '../../models/InternshipDocument';
import { SIGNED_DOC_DIR } from '../../config/upload';
import { transition } from './internshipApplicationService';
import { emitInternshipEvent } from './internshipAnalytics';
import { generatePdf, newDocumentPublicId } from './internshipPdf';
import {
  documentTemplate, requiredTemplatesFor,
  type DocumentFacts, type TemplateKey,
} from './internshipDocumentTemplates';
import { PLANS } from '../subscriptionService';

/**
 * The offer-letter package: generate, download, upload signed, verify.
 *
 * ── THE GENERATED FILES LIVE ON DISK, NOT IN THE DATABASE ──────────────────
 *
 * Same volume and same opaque-UUID convention as every other upload surface
 * (config/upload.ts), so a generated letter and its signed counterpart are stored
 * the same way and neither is a special case at backup time.
 *
 * ── ACTIVATION IS BLOCKED BY THE DOCUMENTS, NOT BY A FLAG ──────────────────
 *
 * "Do not activate cohort membership until all documents marked required for that
 * applicant have been verified." `outstandingRequirements()` computes that from the
 * rows, so there is no "documents_ok" boolean anywhere that could drift from what
 * is actually on file. Phase 6's activation reads the same function.
 */

/** The rolling Monday after a date — the internship's start convention. */
export function nextMonday(fromMs: number): string {
  const d = new Date(fromMs);
  const day = d.getUTCDay();                 // 0 Sun … 6 Sat
  const add = day === 1 ? 7 : (8 - day) % 7 || 7;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add));
  return target.toISOString().slice(0, 10);
}

async function factsFor(params: {
  application: InternshipApplication;
  documentPublicId: string;
  templateVersion: number;
  nowMs: number;
  conditions: string | null;
}): Promise<DocumentFacts> {
  const [enrollment, intake] = await Promise.all([
    Enrollment.findByPk(params.application.enrollment_id, { attributes: ['full_name'] }),
    InternshipAdministrativeIntake.findOne({ where: { application_id: params.application.id } }),
  ]);

  // Legal name is what goes on a signed document, so the intake's legal_name wins
  // over the account's display name. Falling back to the account name is better
  // than a blank line, and a blank line is better than a guess.
  const legalName = (intake?.legal_name || (enrollment as any)?.full_name || '').trim()
    || 'the applicant';

  return {
    legal_name: legalName,
    document_public_id: params.documentPublicId,
    generated_on: new Date(params.nowMs).toISOString().slice(0, 10),
    template_version: params.templateVersion,
    start_on: params.application.desired_start_on || nextMonday(params.nowMs),
    weekly_hours: 25,
    max_active_projects: 2,
    // Read from subscriptionService rather than restated, so a price change in one
    // place cannot leave a signed letter quoting a different number than checkout.
    membership_monthly_annual: `$${PLANS.annual.per_month}`,
    membership_monthly_monthly: `$${PLANS.monthly.per_month}`,
    tooling_monthly_estimate: '$30',
    conditions: params.conditions,
  };
}

export interface GeneratedDocumentRow {
  id: string;
  document_type: TemplateKey;
  title: string;
  document_public_id: string;
  revision: number;
  byte_size: number;
  requires_signature: boolean;
  why: string;
}

/**
 * Generate the whole package for an approved application.
 *
 * IDEMPOTENT. Re-calling it does NOT regenerate: if a generated revision already
 * exists for a template, it is returned as-is. Regenerating would hand the
 * applicant a second document with a different id while the first is possibly
 * already printed and signed — and then neither we nor they could say which one
 * counts.
 */
export async function generatePackage(params: {
  application: InternshipApplication;
  actor: 'system' | 'reviewer';
  actorId: string;
  nowMs?: number;
}): Promise<{ documents: GeneratedDocumentRow[]; created: number }> {
  const nowMs = params.nowMs ?? Date.now();
  const { application } = params;

  const [intake, latestDecision] = await Promise.all([
    InternshipAdministrativeIntake.findOne({ where: { application_id: application.id } }),
    InternshipDecision.findOne({
      where: { application_id: application.id },
      order: [['decided_at', 'DESC']],
    }),
  ]);

  const conditions = latestDecision?.conditions?.trim() || null;

  const keys = requiredTemplatesFor({
    workAuthCategory: intake?.work_auth_category ?? null,
    hasConditions: !!conditions,
    needsWrittenRecordingConsent: false,
  });

  const out: GeneratedDocumentRow[] = [];
  let created = 0;

  for (const key of keys) {
    const template = documentTemplate(key);

    const existing = await InternshipDocument.findOne({
      where: { application_id: application.id, document_type: key, kind: 'generated' },
      order: [['revision', 'DESC']],
    });

    if (existing) {
      out.push({
        id: existing.id,
        document_type: key,
        title: template.title,
        document_public_id: existing.document_public_id ?? '',
        revision: existing.revision,
        byte_size: existing.byte_size ?? 0,
        requires_signature: template.requires_signature,
        why: template.why,
      });
      continue;
    }

    const documentPublicId = newDocumentPublicId();
    const facts = await factsFor({
      application,
      documentPublicId,
      templateVersion: template.version,
      nowMs,
      conditions,
    });

    const pdf = await generatePdf({ templateKey: key, facts });

    const storageKey = `${crypto.randomUUID()}.pdf`;
    await fs.mkdir(SIGNED_DOC_DIR, { recursive: true });
    await fs.writeFile(path.join(SIGNED_DOC_DIR, storageKey), pdf.buffer);

    const row = await InternshipDocument.create({
      application_id: application.id,
      document_type: key,
      kind: 'generated',
      revision: 1,
      template_version: template.version,
      storage_key: storageKey,
      original_filename: `${key}.pdf`,
      mime_type: 'application/pdf',
      byte_size: pdf.byte_size,
      checksum_sha256: pdf.checksum_sha256,
      document_public_id: documentPublicId,
      status: 'pending',
      required: template.requires_signature,
    } as any);

    created += 1;
    out.push({
      id: row.id,
      document_type: key,
      title: template.title,
      document_public_id: documentPublicId,
      revision: 1,
      byte_size: pdf.byte_size,
      requires_signature: template.requires_signature,
      why: template.why,
    });
  }

  // Advance only on the first generation, and only from `approved`.
  if (created > 0 && application.state === 'approved') {
    await transition(application.id, 'offer_letter_ready', {
      actor: params.actor,
      actorId: params.actorId,
      reason: `generated ${created} document(s)`,
      evidenceSource: 'internship_document_service',
    });
    await emitInternshipEvent({
      enrollmentId: application.enrollment_id,
      event: 'internship_offer_letter_generated',
      meta: { application_id: application.id },
    });
  }

  return { documents: out, created };
}

/** Read a generated document's bytes for download, verifying its checksum first. */
export async function readGeneratedDocument(params: {
  applicationId: string;
  documentId: string;
}): Promise<
  | { ok: true; buffer: Buffer; filename: string; mime: string }
  | { ok: false; reason: 'not_found' | 'missing_file' | 'checksum_mismatch' }
> {
  const row = await InternshipDocument.findOne({
    where: { id: params.documentId, application_id: params.applicationId, kind: 'generated' },
  });
  if (!row?.storage_key) return { ok: false, reason: 'not_found' };

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(path.join(SIGNED_DOC_DIR, row.storage_key));
  } catch {
    return { ok: false, reason: 'missing_file' };
  }

  // The checksum earns its keep here. A letter altered on disk — by a bad restore,
  // a partial write, or anything else — must not be handed to an applicant as the
  // document we issued.
  if (row.checksum_sha256) {
    const actual = crypto.createHash('sha256').update(buffer).digest('hex');
    if (actual !== row.checksum_sha256) return { ok: false, reason: 'checksum_mismatch' };
  }

  const template = documentTemplate(row.document_type as TemplateKey);
  const safeTitle = template.title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    ok: true,
    buffer,
    filename: `${safeTitle}-${row.document_public_id ?? row.revision}.pdf`,
    mime: 'application/pdf',
  };
}

/**
 * Record a signed upload.
 *
 * ALLOCATES THE NEXT REVISION rather than replacing. A correction request followed
 * by a re-upload produces revision 2 beside revision 1, both readable — which is
 * the contract's "preserve every revision; never overwrite a previously signed
 * file". The unique index makes reusing a number impossible, so a race loses
 * loudly rather than clobbering.
 */
export async function recordSignedUpload(params: {
  application: InternshipApplication;
  enrollmentId: string;
  documentType: TemplateKey;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
}): Promise<{ document_id: string; revision: number; state: string }> {
  const { application } = params;

  const previous = await InternshipDocument.findOne({
    where: {
      application_id: application.id,
      document_type: params.documentType,
      kind: 'signed_upload',
    },
    order: [['revision', 'DESC']],
  });
  const revision = (previous?.revision ?? 0) + 1;

  // Hash the stored bytes so a signed upload can be checked later against what we
  // received, the same guarantee the generated side has.
  let checksum: string | null = null;
  try {
    const buffer = await fs.readFile(path.join(SIGNED_DOC_DIR, params.storageKey));
    checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  } catch {
    // Non-fatal: the file is on disk and the row must exist either way. A missing
    // checksum is visible as null rather than silently wrong.
    checksum = null;
  }

  const row = await InternshipDocument.create({
    application_id: application.id,
    document_type: params.documentType,
    kind: 'signed_upload',
    revision,
    storage_key: params.storageKey,
    // Kept for display only; never used to build a path.
    original_filename: params.originalFilename.slice(0, 255),
    mime_type: params.mimeType,
    byte_size: params.byteSize,
    checksum_sha256: checksum,
    status: 'uploaded',
    required: true,
  } as any);

  // A previous correction request is superseded by this upload.
  if (previous?.status === 'correction_requested') {
    await previous.update({ status: 'correction_requested' });
  }

  if (application.state === 'offer_letter_ready') {
    await transition(application.id, 'signed_documents_uploaded', {
      actor: 'applicant',
      actorId: params.enrollmentId,
      reason: `${params.documentType} r${revision}`,
      evidenceSource: 'portal',
    });
  }

  await emitInternshipEvent({
    enrollmentId: params.enrollmentId,
    event: 'internship_signed_document_uploaded',
    meta: { application_id: application.id },
  });

  await application.reload();
  return { document_id: row.id, revision, state: application.state };
}

export interface RequirementStatus {
  document_type: TemplateKey;
  title: string;
  requires_signature: boolean;
  generated: boolean;
  latest_upload_revision: number | null;
  verified: boolean;
  correction_requested: boolean;
  rejection_reason: string | null;
}

/**
 * What this applicant still owes us.
 *
 * The single source of truth for whether activation may proceed — computed from the
 * rows every time rather than cached, so it cannot disagree with what is on file.
 */
export async function outstandingRequirements(applicationId: string): Promise<{
  requirements: RequirementStatus[];
  all_verified: boolean;
}> {
  const app = await InternshipApplication.findByPk(applicationId);
  if (!app) return { requirements: [], all_verified: false };

  const [intake, latestDecision, docs] = await Promise.all([
    InternshipAdministrativeIntake.findOne({ where: { application_id: applicationId } }),
    InternshipDecision.findOne({
      where: { application_id: applicationId },
      order: [['decided_at', 'DESC']],
    }),
    InternshipDocument.findAll({ where: { application_id: applicationId } }),
  ]);

  const keys = requiredTemplatesFor({
    workAuthCategory: intake?.work_auth_category ?? null,
    hasConditions: !!latestDecision?.conditions?.trim(),
    needsWrittenRecordingConsent: false,
  });

  const requirements: RequirementStatus[] = keys.map((key) => {
    const template = documentTemplate(key);
    const forType = docs.filter((d) => d.document_type === key);
    const uploads = forType.filter((d) => d.kind === 'signed_upload');
    const latest = uploads.sort((a, b) => b.revision - a.revision)[0] ?? null;

    return {
      document_type: key,
      title: template.title,
      requires_signature: template.requires_signature,
      generated: forType.some((d) => d.kind === 'generated'),
      latest_upload_revision: latest?.revision ?? null,
      verified: latest?.status === 'verified',
      correction_requested: latest?.status === 'correction_requested',
      rejection_reason: latest?.rejection_reason ?? null,
    };
  });

  // A page that needs no signature (the work-authorisation instructions) is not a
  // blocker on its own — what it ASKS FOR is checked by a reviewer when they verify
  // the pack. Only signature documents gate activation.
  const all_verified = requirements
    .filter((r) => r.requires_signature)
    .every((r) => r.verified);

  return { requirements, all_verified: requirements.length > 0 && all_verified };
}

/**
 * A reviewer accepts or rejects an uploaded document.
 *
 * Verification moves the application to `documents_verified` only when EVERY
 * signature document is verified — one accepted page does not open activation.
 */
export async function verifyDocument(params: {
  application: InternshipApplication;
  documentId: string;
  accept: boolean;
  reviewerId: string;
  rejectionReason?: string | null;
}): Promise<
  | { ok: true; all_verified: boolean; state: string }
  | { ok: false; error: string }
> {
  const { application } = params;

  const row = await InternshipDocument.findOne({
    where: {
      id: params.documentId,
      application_id: application.id,
      kind: 'signed_upload',
    },
  });
  if (!row) return { ok: false, error: 'Document not found.' };

  if (!params.accept && !(params.rejectionReason || '').trim()) {
    // A correction request with no reason is an instruction the applicant cannot
    // follow, and they will simply upload the same thing again.
    return { ok: false, error: 'Say what needs correcting — the applicant will be shown it.' };
  }

  await row.update({
    status: params.accept ? 'verified' : 'correction_requested',
    verified_by: params.reviewerId,
    verified_at: new Date(),
    rejection_reason: params.accept ? null : (params.rejectionReason || '').trim(),
  });

  const { all_verified } = await outstandingRequirements(application.id);

  if (params.accept && all_verified && application.state === 'signed_documents_uploaded') {
    await transition(application.id, 'documents_verified', {
      actor: 'reviewer',
      actorId: params.reviewerId,
      reason: 'all required documents verified',
      evidenceSource: 'admin_ui',
    });
    await emitInternshipEvent({
      enrollmentId: application.enrollment_id,
      event: 'internship_documents_verified',
      meta: { application_id: application.id },
    });
  }

  // A correction request sends them back to the letter stage so the portal asks
  // for a re-upload rather than leaving them looking at "under review".
  if (!params.accept && application.state === 'signed_documents_uploaded') {
    await transition(application.id, 'offer_letter_ready', {
      actor: 'reviewer',
      actorId: params.reviewerId,
      reason: 'correction requested',
      evidenceSource: 'admin_ui',
    });
  }

  await application.reload();
  return { ok: true, all_verified, state: application.state };
}

/** Every document row for an application, newest first. For the admin surface. */
export async function documentsFor(applicationId: string): Promise<InternshipDocument[]> {
  return InternshipDocument.findAll({
    where: { application_id: applicationId, storage_key: { [Op.ne]: null } },
    order: [['document_type', 'ASC'], ['kind', 'ASC'], ['revision', 'DESC']],
  });
}
