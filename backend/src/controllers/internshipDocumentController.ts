import { Request, Response } from 'express';
import { z } from 'zod';
import { findOpenApplication, getStatus } from '../services/internship/internshipApplicationService';
import {
  generatePackage, outstandingRequirements, readGeneratedDocument, recordSignedUpload,
} from '../services/internship/internshipDocumentService';
import { isTemplateKey } from '../services/internship/internshipDocumentTemplates';
import { InvalidInternshipTransitionError } from '../services/internship/internshipStateMachine';
import { isInternshipEnabled } from '../services/portalFlagsService';

/**
 * Participant document endpoints.
 *
 * Same authorization shape as the rest of the participant surface: nothing accepts
 * an application id. The document id IS accepted on download — and is scoped by
 * `application_id` in the query, so an id belonging to someone else simply does not
 * match and returns 404. There is no route by which one applicant reads another's
 * offer letter.
 */

function callerEnrollmentId(req: Request): string | null {
  const sub = req.participant?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

async function requireOpenApplication(req: Request, res: Response) {
  const enrollmentId = callerEnrollmentId(req);
  if (!enrollmentId) { res.status(401).json({ error: 'Authentication required' }); return null; }
  if (!isInternshipEnabled()) { res.status(404).json({ error: 'Not available' }); return null; }
  const application = await findOpenApplication(enrollmentId);
  if (!application) { res.status(404).json({ error: 'No open application' }); return null; }
  return { enrollmentId, application };
}

function fail(res: Response, err: unknown, event: string): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  if (err instanceof InvalidInternshipTransitionError) {
    res.status(409).json({ error: 'That step is not available yet.' });
    return;
  }
  const e = err as any;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: e?.constructor?.name ?? 'Error', context: { message: e?.message },
  }));
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

/**
 * GET /api/portal/internship/documents
 *
 * Generates the package on first read for an approved applicant, then lists it.
 * Generating here rather than at approval time means the letter is produced with
 * the conditions the reviewer actually recorded, and a failed generation is
 * retried by the applicant simply reloading the page.
 */
export async function handleGetInternshipDocuments(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    let generated: Awaited<ReturnType<typeof generatePackage>> | null = null;
    if (['approved', 'offer_letter_ready', 'signed_documents_uploaded'].includes(ctx.application.state)) {
      generated = await generatePackage({
        application: ctx.application,
        actor: 'system',
        actorId: 'internship_document_service',
      });
    }

    const { requirements, all_verified } = await outstandingRequirements(ctx.application.id);
    await ctx.application.reload();

    res.json({
      state: ctx.application.state,
      documents: generated?.documents ?? [],
      requirements,
      all_verified,
    });
  } catch (err) {
    fail(res, err, 'internship_documents_list_failed');
  }
}

/** GET /api/portal/internship/documents/:documentId/download */
export async function handleDownloadInternshipDocument(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    const result = await readGeneratedDocument({
      applicationId: ctx.application.id,
      documentId: String(req.params.documentId),
    });

    if (!result.ok) {
      // A checksum mismatch is NOT a 404. It means the file on disk is not the one
      // we issued, and saying so plainly is what gets it looked at rather than
      // silently handing over an altered document.
      const status = result.reason === 'checksum_mismatch' ? 500 : 404;
      res.status(status).json({
        error: result.reason === 'checksum_mismatch'
          ? 'This document failed its integrity check and was not sent. We have been alerted.'
          : 'Document not found.',
      });
      return;
    }

    res.setHeader('Content-Type', result.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    // Never cached by a shared proxy: it is a named individual's signed paperwork.
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(result.buffer);
  } catch (err) {
    fail(res, err, 'internship_document_download_failed');
  }
}

/** POST /api/portal/internship/documents/:documentType/signed  (multipart) */
export async function handleUploadSignedDocument(req: Request, res: Response): Promise<void> {
  try {
    const ctx = await requireOpenApplication(req, res);
    if (!ctx) return;

    const documentType = String(req.params.documentType);
    if (!isTemplateKey(documentType)) {
      res.status(400).json({ error: 'Unknown document type.' });
      return;
    }

    const file = (req as any).file as { filename?: string; originalname?: string; mimetype?: string; size?: number } | undefined;
    if (!file?.filename) {
      res.status(400).json({ error: 'Attach your signed document.' });
      return;
    }

    const result = await recordSignedUpload({
      application: ctx.application,
      enrollmentId: ctx.enrollmentId,
      documentType,
      storageKey: file.filename,
      originalFilename: file.originalname ?? 'upload',
      mimeType: file.mimetype ?? 'application/octet-stream',
      byteSize: file.size ?? 0,
    });

    const status = await getStatus({ enrollmentId: ctx.enrollmentId, flagEnabled: true });
    res.status(201).json({ ...result, card: status });
  } catch (err) {
    fail(res, err, 'internship_document_upload_failed');
  }
}
