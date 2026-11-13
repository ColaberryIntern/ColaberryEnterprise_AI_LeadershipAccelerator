/**
 * Multer config for the outside case-study intake (POST /api/admin/factory/case-studies/external).
 *
 * PDF, DOCX and PPTX only: the formats the intake can extract text from (pdf-parse, and the existing officeparser
 * extractor). 50 MB per file - the same cap as `config/upload.ts`'s document uploads - and at most 4 files per
 * request, so one request is at most 200 MB: the size the outer edge proxy allows. (The in-repo nginx keeps its
 * 1 MB default on /api/; raising it for this path is an escalated, separate change - see the directive.)
 *
 * DISK storage into the OS temp directory, not memory: the intake reads each file only while importing it and
 * deletes it afterwards (caseStudyOutsideIntakeBatch.ts), so four large decks are never in the heap together. The
 * permanent copy is written by the intake under CASE_STUDY_EXTERNAL_DIR, named by content hash.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { DOCUMENT_UPLOAD_MAX_BYTES } from './upload';
import { outsideExtension } from '../services/caseStudy/caseStudyOutsideExtract';

export const CASE_STUDY_EXTERNAL_MAX_FILES = 4;
export const CASE_STUDY_EXTERNAL_TMP_DIR = path.join(os.tmpdir(), 'case-study-external-uploads');
try { fs.mkdirSync(CASE_STUDY_EXTERNAL_TMP_DIR, { recursive: true }); } catch { /* created lazily on first write */ }

/** A typed refusal from the file filter, so the route can answer 400 with this exact sentence. */
export class UnsupportedOutsideFileError extends Error {
  constructor(name: string) {
    super(`"${name.slice(0, 120)}" is not a PDF, DOCX or PPTX file.`);
    this.name = 'UnsupportedOutsideFileError';
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(CASE_STUDY_EXTERNAL_TMP_DIR, { recursive: true }, (err) => cb(err ?? null, CASE_STUDY_EXTERNAL_TMP_DIR));
  },
  filename: (req, file, cb) => {
    const name = `${crypto.randomUUID()}${outsideExtension(file.originalname, file.mimetype) ?? ''}`;
    // Recorded on the request BEFORE multer writes, because when multer aborts (file too large, too many files) it
    // does not populate req.files - and the bytes it already wrote would otherwise be left in the temp dir.
    const tracked = req as unknown as TempTrackedRequest;
    (tracked.caseStudyTempPaths ??= []).push(path.join(CASE_STUDY_EXTERNAL_TMP_DIR, name));
    cb(null, name);
  },
});

/** Every temp path multer was told to write for this request, whether or not the upload completed. */
export interface TempTrackedRequest { caseStudyTempPaths?: string[] }
export const trackedTempPaths = (req: unknown): string[] => [...((req as TempTrackedRequest).caseStudyTempPaths ?? [])];

export const caseStudyExternalUpload = multer({
  storage,
  limits: { fileSize: DOCUMENT_UPLOAD_MAX_BYTES, files: CASE_STUDY_EXTERNAL_MAX_FILES },
  fileFilter: (_req, file, cb) => {
    // By extension OR MIME type: browsers often send a .pptx as application/octet-stream.
    if (outsideExtension(file.originalname, file.mimetype)) cb(null, true);
    else cb(new UnsupportedOutsideFileError(file.originalname || 'file'));
  },
});
