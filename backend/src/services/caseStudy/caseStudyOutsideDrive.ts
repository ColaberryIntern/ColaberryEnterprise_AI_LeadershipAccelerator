/**
 * caseStudyOutsideDrive - read files from the Drive case-study library for a MANUAL import (Ali, 2026-11-13:
 * manual only, no scheduled sync).
 *
 * Three calls, each bounded: metadata (30 s), folder listing (30 s, at most 50 supported files), download (60 s and a
 * 50 MB byte cap enforced WHILE streaming, so an oversized file is cut off rather than buffered whole into a heap
 * that has OOM'd on uploads before). googleapis' own retry is switched off (`retry: false`): the import is idempotent,
 * so the recovery for a transient failure is the admin re-running it, which is visible, rather than a hidden retry.
 *
 * Every failure is a typed `DriveImportError` with a stable `errorClass`, so one file's failure becomes one line in
 * the per-file results and the batch continues.
 *
 * Google-native Docs/Slides are NOT exported here: only real PDF/DOCX/PPTX files are listed or accepted. A native
 * Slides deck must be exported to PDF in Drive first (stated in the directive).
 */
import type { drive_v3 } from 'googleapis';
import { getDriveClient } from '../driveService';
import { OUTSIDE_MIME_TO_EXT } from './caseStudyOutsideExtract';

export const DRIVE_META_TIMEOUT_MS = 30_000;
export const DRIVE_DOWNLOAD_TIMEOUT_MS = 60_000;
export const DRIVE_MAX_BYTES = 50 * 1024 * 1024;
export const DRIVE_FOLDER_MAX_FILES = 50;

export type DriveErrorClass = 'DriveInvalidId' | 'DriveNotConfigured' | 'DriveNotFound' | 'DriveForbidden' | 'DriveTimeout'
  | 'DriveTooLarge' | 'DriveUnsupportedType' | 'DriveUpstreamError';

export class DriveImportError extends Error {
  constructor(public errorClass: DriveErrorClass, message: string) { super(message); this.name = 'DriveImportError'; }
}

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  sizeBytes: number | null;
}

const SUPPORTED_MIMES = Object.keys(OUTSIDE_MIME_TO_EXT);

/** Map any googleapis / network error to a typed DriveImportError. */
export function toDriveError(err: unknown): DriveImportError {
  if (err instanceof DriveImportError) return err;
  const e = err as { message?: string; code?: number | string; response?: { status?: number } };
  const status = Number(e?.response?.status ?? e?.code);
  const msg = String(e?.message ?? err);
  if (/not configured/i.test(msg)) return new DriveImportError('DriveNotConfigured', 'Google Drive is not configured on this server.');
  if (status === 404) return new DriveImportError('DriveNotFound', 'That Drive file or folder was not found (check the id and that it is shared with the service account).');
  if (status === 401 || status === 403) return new DriveImportError('DriveForbidden', 'The service account cannot read that Drive item.');
  if (/timeout|ETIMEDOUT|ECONNABORTED|aborted/i.test(msg)) return new DriveImportError('DriveTimeout', 'Google Drive did not answer in time.');
  return new DriveImportError('DriveUpstreamError', 'Google Drive returned an error.');
}

function logDrive(event: string, err: DriveImportError, id: string): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'case_study_outside_drive_failed',
    outcome: 'failure', error_class: err.errorClass, context: { step: event, drive_id: id.slice(0, 80) },
  }));
}

function toMeta(f: drive_v3.Schema$File): DriveFileMeta {
  return {
    id: String(f.id), name: f.name || 'drive-file', mimeType: f.mimeType || '',
    modifiedTime: f.modifiedTime ?? null, sizeBytes: f.size ? Number(f.size) : null,
  };
}

const FILE_FIELDS = 'id, name, mimeType, modifiedTime, size';

/** Metadata for one file. Refuses unsupported types and anything already known to exceed the cap. */
export async function getDriveFileMeta(fileId: string, client?: drive_v3.Drive): Promise<DriveFileMeta> {
  try {
    // Resolved INSIDE the try, so a missing configuration becomes a typed DriveNotConfigured, not a raw throw.
    const res = await (client ?? getDriveClient()).files.get(
      { fileId, fields: FILE_FIELDS, supportsAllDrives: true },
      { timeout: DRIVE_META_TIMEOUT_MS, retry: false },
    );
    const meta = toMeta(res.data);
    if (!SUPPORTED_MIMES.includes(meta.mimeType)) {
      throw new DriveImportError('DriveUnsupportedType', `"${meta.name}" is ${meta.mimeType || 'an unknown type'}; only PDF, DOCX and PPTX can be imported.`);
    }
    if (meta.sizeBytes !== null && meta.sizeBytes > DRIVE_MAX_BYTES) {
      throw new DriveImportError('DriveTooLarge', `"${meta.name}" is larger than 50 MB.`);
    }
    return meta;
  } catch (err) {
    const e = toDriveError(err);
    logDrive('meta', e, fileId);
    throw e;
  }
}

/** A Drive file/folder id: what Drive mints, and nothing that can break out of a `q` string. The route uses it too. */
export const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

/** The supported files directly inside a folder, newest first, at most DRIVE_FOLDER_MAX_FILES. `truncated` says if more existed. */
export async function listDriveFolderFiles(
  folderId: string, client?: drive_v3.Drive,
): Promise<{ files: DriveFileMeta[]; truncated: boolean }> {
  const typeClause = SUPPORTED_MIMES.map((m) => `mimeType = '${m}'`).join(' or ');
  try {
    // Checked HERE as well as at the route, because this is the line that builds the query string: defence in depth.
    if (!DRIVE_ID_PATTERN.test(folderId)) throw new DriveImportError('DriveInvalidId', 'That is not a valid Drive folder id.');
    // Resolved INSIDE the try, so a missing configuration becomes a typed DriveNotConfigured, not a raw throw.
    const res = await (client ?? getDriveClient()).files.list(
      {
        q: `'${folderId}' in parents and trashed = false and (${typeClause})`,
        fields: `files(${FILE_FIELDS})`, orderBy: 'modifiedTime desc', pageSize: DRIVE_FOLDER_MAX_FILES + 1,
        supportsAllDrives: true, includeItemsFromAllDrives: true,
      },
      { timeout: DRIVE_META_TIMEOUT_MS, retry: false },
    );
    const all = (res.data.files || []).map(toMeta);
    return { files: all.slice(0, DRIVE_FOLDER_MAX_FILES), truncated: all.length > DRIVE_FOLDER_MAX_FILES };
  } catch (err) {
    const e = toDriveError(err);
    logDrive('list', e, folderId);
    throw e;
  }
}

/** Read a stream into memory, aborting once it passes `maxBytes`. */
export async function readCapped(stream: NodeJS.ReadableStream, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    const b = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += b.length;
    if (total > maxBytes) {
      const destroyable = stream as unknown as { destroy?: () => void };
      if (typeof destroyable.destroy === 'function') destroyable.destroy();
      throw new DriveImportError('DriveTooLarge', 'The Drive file is larger than 50 MB.');
    }
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

/** Download one file's bytes (timeout + byte cap). */
export async function downloadDriveFile(fileId: string, client?: drive_v3.Drive): Promise<Buffer> {
  try {
    // Resolved INSIDE the try, so a missing configuration becomes a typed DriveNotConfigured, not a raw throw.
    const res = await (client ?? getDriveClient()).files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream', timeout: DRIVE_DOWNLOAD_TIMEOUT_MS, retry: false },
    );
    return await readCapped(res.data as unknown as NodeJS.ReadableStream, DRIVE_MAX_BYTES);
  } catch (err) {
    const e = toDriveError(err);
    logDrive('download', e, fileId);
    throw e;
  }
}
