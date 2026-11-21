/**
 * Multer config for a client's own research on the Enterprise intake (v2, 2026-11-21):
 * POST /api/enterprise/intake/:token/files.
 *
 * Ali: "if they have done research themselves, they can upload that as well."
 *
 * PDF, Word (.docx), PowerPoint (.pptx) and plain text. 25 MB each (Ali chose 25 MB; nginx
 * raises only this exact path to 26m), ONE file per request, at most five per intake (counted
 * by the service). The filter here is by extension only; the service then checks the bytes
 * (magic numbers), because a public upload must not trust a name.
 *
 * Disk storage into the OS temp directory, so a 25 MB file is never held in the heap. The
 * service moves an accepted file to the uploads volume and always deletes the temp copy.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';

export const CLIENT_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const CLIENT_FILE_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.txt'] as const;
export type ClientFileExt = (typeof CLIENT_FILE_EXTENSIONS)[number];
export const CLIENT_FILE_TMP_DIR = path.join(os.tmpdir(), 'enterprise-intake-uploads');

export class UnsupportedClientFileError extends Error {
  error_class = 'ValidationError';
  constructor(name: string) {
    super(`"${String(name).slice(0, 120)}" is not a PDF, Word, PowerPoint or text file.`);
    this.name = 'UnsupportedClientFileError';
  }
}

export function clientFileExt(name: string): ClientFileExt | null {
  const ext = path.extname(String(name || '')).toLowerCase();
  return (CLIENT_FILE_EXTENSIONS as readonly string[]).includes(ext) ? (ext as ClientFileExt) : null;
}

interface TrackedRequest { enterpriseTempPaths?: string[] }
/** Every temp path multer was told to write, even when it aborted (too large), so none is left behind. */
export const enterpriseTempPaths = (req: unknown): string[] => [...((req as TrackedRequest).enterpriseTempPaths ?? [])];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(CLIENT_FILE_TMP_DIR, { recursive: true }, (err) => cb(err ?? null, CLIENT_FILE_TMP_DIR));
  },
  filename: (req, file, cb) => {
    const name = `${crypto.randomUUID()}${clientFileExt(file.originalname) ?? ''}`;
    ((req as unknown as TrackedRequest).enterpriseTempPaths ??= []).push(path.join(CLIENT_FILE_TMP_DIR, name));
    cb(null, name);
  },
});

export const enterpriseIntakeUpload = multer({
  storage,
  limits: { fileSize: CLIENT_FILE_MAX_BYTES, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (clientFileExt(file.originalname)) cb(null, true);
    else cb(new UnsupportedClientFileError(file.originalname || 'file'));
  },
});
