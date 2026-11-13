/**
 * caseStudyOutsideIntakeBatch - run several outside imports (uploaded files, one Drive file, or a Drive folder) and
 * return ONE RESULT PER FILE. Never 500s the batch because one file failed (package spec 1B).
 *
 * SEQUENTIAL ON PURPOSE. Each file is read into memory only while it is being imported, so a 4 x 50 MB upload never
 * holds 200 MB in the heap at once (this backend has OOM'd on in-memory uploads before; see the NODE_OPTIONS note
 * in docker-compose.production.yml). Sequential also keeps the LLM call rate to one at a time.
 *
 * DRIVE PRE-CHECK. For a Drive file, an existing import with the same file id AND the same modifiedTime is returned
 * as `alreadyImported` BEFORE the download - an unchanged library file is never fetched twice. A changed file (new
 * modifiedTime) is downloaded and then deduped by content hash, so re-saving an identical file still imports nothing.
 *
 * Uploaded temp files are deleted after they are read, whatever happened, so a failed import never leaves an
 * upload behind in the temp directory.
 */
import fs from 'fs/promises';
import { importOutsideFile, OutsideImportContext, OutsideImportResult, OutsideIntakeDeps } from './caseStudyOutsideIntake';
import { findExistingImport } from './caseStudyOutsideRecord';
import {
  DriveFileMeta, DriveImportError, downloadDriveFile, getDriveFileMeta, listDriveFolderFiles,
} from './caseStudyOutsideDrive';

export interface UploadedTempFile { path: string; originalName: string; mimeType: string; size: number }

export interface BatchDeps {
  intake: Partial<OutsideIntakeDeps>;
  getMeta: typeof getDriveFileMeta;
  listFolder: typeof listDriveFolderFiles;
  download: typeof downloadDriveFile;
  findExisting: typeof findExistingImport;
}

const DEFAULT_BATCH: BatchDeps = {
  intake: {}, getMeta: getDriveFileMeta, listFolder: listDriveFolderFiles, download: downloadDriveFile,
  findExisting: findExistingImport,
};

export interface BatchOutcome {
  results: OutsideImportResult[];
  /** Set when a Drive folder held more supported files than one import reads. */
  note: string | null;
}

const driveFailure = (name: string, err: unknown): OutsideImportResult => {
  const e = err instanceof DriveImportError ? err : new DriveImportError('DriveUpstreamError', 'Google Drive returned an error.');
  return {
    fileName: name, status: 'failed', alreadyImported: false, caseStudyId: null, title: null, analysisError: null,
    suggestionsInserted: null, error: e.message, errorClass: e.errorClass,
  };
};

async function removeTemp(p: string): Promise<void> {
  try { await fs.unlink(p); } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return;
    console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'case_study_outside_temp_cleanup_failed',
      outcome: 'partial', error_class: 'TempCleanupFailed', context: { message: String((err as Error)?.message).slice(0, 200) } }));
  }
}

/** Import uploaded files (multer temp files), one at a time. */
export async function importUploadedFiles(
  files: UploadedTempFile[], ctx: OutsideImportContext, deps: Partial<BatchDeps> = {},
): Promise<BatchOutcome> {
  const d = { ...DEFAULT_BATCH, ...deps };
  const results: OutsideImportResult[] = [];
  for (const f of files) {
    try {
      const bytes = await fs.readFile(f.path);
      results.push(await importOutsideFile(
        { bytes, fileName: f.originalName, mimeType: f.mimeType, sourceKind: 'external_document' }, ctx, d.intake,
      ));
    } catch (err) {
      results.push({
        fileName: f.originalName, status: 'failed', alreadyImported: false, caseStudyId: null, title: null,
        analysisError: null, suggestionsInserted: null, error: 'The uploaded file could not be read.', errorClass: 'UploadReadError',
      });
      console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'case_study_outside_import', outcome: 'failure',
        correlation_id: ctx.correlationId, error_class: 'UploadReadError', context: { message: String((err as Error)?.message).slice(0, 200) } }));
    } finally {
      await removeTemp(f.path);
    }
  }
  return { results, note: null };
}

async function importOneDriveFile(meta: DriveFileMeta, ctx: OutsideImportContext, d: BatchDeps): Promise<OutsideImportResult> {
  try {
    if (meta.modifiedTime) {
      const prior = await d.findExisting({ driveFileId: meta.id, driveModifiedTime: meta.modifiedTime });
      if (prior) {
        return {
          fileName: meta.name, status: 'already_imported', alreadyImported: true, caseStudyId: prior.caseStudyId,
          title: null, analysisError: null, suggestionsInserted: null, error: null, errorClass: null,
        };
      }
    }
    const bytes = await d.download(meta.id);
    return await importOutsideFile({
      bytes, fileName: meta.name, mimeType: meta.mimeType, sourceKind: 'external_drive',
      driveFileId: meta.id, driveModifiedTime: meta.modifiedTime,
    }, ctx, d.intake);
  } catch (err) {
    return driveFailure(meta.name, err);
  }
}

/** Import one Drive file by id. */
export async function importDriveFile(fileId: string, ctx: OutsideImportContext, deps: Partial<BatchDeps> = {}): Promise<BatchOutcome> {
  const d = { ...DEFAULT_BATCH, ...deps };
  let meta: DriveFileMeta;
  try { meta = await d.getMeta(fileId); } catch (err) { return { results: [driveFailure(fileId, err)], note: null }; }
  return { results: [await importOneDriveFile(meta, ctx, d)], note: null };
}

/** Import every supported file directly inside a Drive folder (at most the folder cap), one record per file. */
export async function importDriveFolder(folderId: string, ctx: OutsideImportContext, deps: Partial<BatchDeps> = {}): Promise<BatchOutcome> {
  const d = { ...DEFAULT_BATCH, ...deps };
  let listing: { files: DriveFileMeta[]; truncated: boolean };
  try { listing = await d.listFolder(folderId); } catch (err) { return { results: [driveFailure(folderId, err)], note: null }; }
  const results: OutsideImportResult[] = [];
  for (const meta of listing.files) results.push(await importOneDriveFile(meta, ctx, d));
  return {
    results,
    note: listing.truncated ? `The folder holds more files than one import reads; the newest ${listing.files.length} were imported. Run it again for the rest after moving the imported ones.` : (listing.files.length ? null : 'No PDF, DOCX or PPTX files were found directly in that folder.'),
  };
}
