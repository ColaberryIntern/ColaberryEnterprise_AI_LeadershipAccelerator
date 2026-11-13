/**
 * caseStudyOutsideIntakeRoutes - the admin surface for OUTSIDE case studies (package spec 1B) and the Intake queue (1C).
 *
 *   POST /api/admin/factory/case-studies/external   multipart `files` (PDF/DOCX/PPTX, <= 4 x 50 MB)
 *                                                   OR JSON { driveFileId } | { driveFolderId }  (manual import only)
 *   GET  /api/admin/factory/case-studies/intake     case studies with ZERO confirmed links into this tenant's services
 *
 * Every route is `requireSection('program')` and tenant-scoped through `lookupGovContractsContainer()`, matching
 * `caseStudyServiceLinkRoutes.ts`: an unresolvable workspace is a 503, never a read or suggestion across tenants.
 *
 * THE IMPORT ANSWERS 200 WITH PER-FILE RESULTS even when some files failed: one bad file must not hide what happened
 * to the others (spec: "never 500 the whole batch because one file failed"). 400 is reserved for a request that
 * names no file, names both kinds of input, or carries a malformed Drive id / unsupported type; 413 for a file over
 * the cap. Error bodies are fixed sentences - never an upstream (Drive/OpenAI) response.
 */
import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import multer from 'multer';
import { z } from 'zod';
import { requireSection } from '../../middlewares/authMiddleware';
import { lookupGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
import { ensureTraceId } from '../../utils/requestContext';
import { caseStudyExternalUpload, CASE_STUDY_EXTERNAL_MAX_FILES, UnsupportedOutsideFileError, trackedTempPaths } from '../../config/caseStudyExternalUpload';
import { importDriveFile, importDriveFolder, importUploadedFiles, BatchOutcome } from '../../services/caseStudy/caseStudyOutsideIntakeBatch';
import { DRIVE_ID_PATTERN } from '../../services/caseStudy/caseStudyOutsideDrive';
import { listIntakeCaseStudies } from '../../services/caseStudy/caseStudyIntakeQueue';

const router = Router();

type AdminRequest = Request & { admin?: { email?: string; sub?: string } };

function logFail(event: string, err: unknown, context: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: (err as Error)?.name ?? 'Error', context: { ...context, message: String((err as Error)?.message ?? err).slice(0, 200) },
  }));
}

const actorIdentity = (req: AdminRequest): string => String(req.admin?.email ?? req.admin?.sub ?? 'unknown-admin');
const driveId = z.string().trim().regex(DRIVE_ID_PATTERN, 'not a Drive id');
export const externalImportBody = z.object({ driveFileId: driveId.optional(), driveFolderId: driveId.optional() })
  .strict()
  .refine((b) => Boolean(b.driveFileId) !== Boolean(b.driveFolderId), 'Send exactly one of driveFileId or driveFolderId.');

type UploadedFile = { path: string; originalname: string; mimetype: string; size: number };

const uploadedFiles = (req: Request): UploadedFile[] => {
  const files = (req as Request & { files?: unknown }).files;
  return Array.isArray(files) ? (files as UploadedFile[]) : [];
};

async function discardPaths(paths: string[]): Promise<void> {
  for (const p of new Set(paths)) await fs.unlink(p).catch((err: NodeJS.ErrnoException) => {
    if (err?.code !== 'ENOENT') logFail('case_study_outside_temp_cleanup_failed', err, {});
  });
}
const discard = (files: UploadedFile[]): Promise<void> => discardPaths(files.map((f) => f.path));

/** Run multer, turning its errors into 400/413 JSON instead of the default HTML error page. */
function acceptUploads(req: Request, res: Response, next: NextFunction): void {
  caseStudyExternalUpload.array('files', CASE_STUDY_EXTERNAL_MAX_FILES)(req, res, async (err: unknown) => {
    if (!err) { next(); return; }
    // An aborted upload leaves req.files empty, so delete every path multer was told to write (see the config).
    // Awaited, so nothing is left behind by the time the client reads the error.
    await discardPaths([...trackedTempPaths(req), ...uploadedFiles(req).map((f) => f.path)]);
    if (err instanceof UnsupportedOutsideFileError) { res.status(400).json({ error: err.message }); return; }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') { res.status(413).json({ error: 'Each file must be 50 MB or smaller.' }); return; }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({ error: `Upload at most ${CASE_STUDY_EXTERNAL_MAX_FILES} files, in the "files" field.` }); return;
      }
    }
    logFail('case_study_outside_upload_failed', err, {});
    res.status(400).json({ error: 'The upload could not be read.' });
  });
}

const summarize = (o: BatchOutcome) => ({
  created: o.results.filter((r) => r.status === 'created').length,
  alreadyImported: o.results.filter((r) => r.status === 'already_imported').length,
  failed: o.results.filter((r) => r.status === 'failed').length,
  needsManualDetails: o.results.filter((r) => r.status === 'created' && r.analysisError).length,
});

/** POST /api/admin/factory/case-studies/external - import outside case studies (upload or Drive). */
router.post(
  '/api/admin/factory/case-studies/external',
  requireSection('program'),
  acceptUploads,
  async (req: AdminRequest, res: Response) => {
    const files = uploadedFiles(req);
    const hasDriveKeys = Boolean(req.body && (req.body.driveFileId !== undefined || req.body.driveFolderId !== undefined));
    if (files.length && hasDriveKeys) {
      await discard(files);
      res.status(400).json({ error: 'Send either uploaded files or a Drive id, not both.' });
      return;
    }
    const body = files.length ? null : externalImportBody.safeParse(req.body ?? {});
    if (body && !body.success) {
      res.status(400).json({ error: 'Upload PDF, DOCX or PPTX files, or send exactly one valid driveFileId or driveFolderId.', issues: body.error.issues });
      return;
    }
    const container = await lookupGovContractsContainer().catch((err: unknown) => { logFail('case_study_outside_scope_failed', err, {}); return null; });
    if (!container) {
      await discard(files);
      res.status(503).json({ error: 'The government contracts workspace is not configured.' });
      return;
    }
    const ctx = { tenantId: container.tenant.id, actor: actorIdentity(req), correlationId: ensureTraceId(req.header('x-correlation-id')) };
    try {
      let outcome: BatchOutcome;
      if (files.length) {
        outcome = await importUploadedFiles(files.map((f) => ({ path: f.path, originalName: f.originalname, mimeType: f.mimetype, size: f.size })), ctx);
      } else if (body?.success && body.data.driveFileId) {
        outcome = await importDriveFile(body.data.driveFileId, ctx);
      } else {
        outcome = await importDriveFolder(String(body?.success ? body.data.driveFolderId : ''), ctx);
      }
      res.json({ results: outcome.results, note: outcome.note, summary: summarize(outcome) });
    } catch (err) {
      // The batch functions do not throw by contract; this is the backstop, and it still answers in JSON.
      await discard(files);
      logFail('case_study_outside_import_failed', err, { correlation_id: ctx.correlationId });
      res.status(500).json({ error: 'The import could not be completed.' });
    }
  },
);

/** GET /api/admin/factory/case-studies/intake - every non-archived case study with no confirmed service link here. */
router.get(
  '/api/admin/factory/case-studies/intake',
  requireSection('program'),
  async (_req: Request, res: Response) => {
    const container = await lookupGovContractsContainer().catch((err: unknown) => { logFail('case_study_intake_scope_failed', err, {}); return null; });
    if (!container) {
      res.status(503).json({ error: 'The government contracts workspace is not configured.' });
      return;
    }
    try {
      res.json({ intake: await listIntakeCaseStudies({ tenantId: container.tenant.id }) });
    } catch (err) {
      logFail('case_study_intake_failed', err, {});
      res.status(500).json({ error: 'Could not load the intake queue.' });
    }
  },
);

export default router;
