/**
 * Multer config for a Career Prep "Try" answer (POST /api/portal/career-prep/sessions/:id/attempts).
 * The same limits as the Hire intro video (hireVideoUpload.ts): one video file, at most 100 MB, which is
 * also the Cloudflare edge limit; nginx raises its 1 MB default for this path to match (nginx/nginx.conf;
 * nginxUploadLimits.contract.test.ts enforces it). DISK storage in the OS temp dir: the scoring queue reads
 * the file once and deletes it whether scoring worked or not.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { isVideoUpload, UnsupportedVideoError } from './hireVideoUpload';

export const PREP_ATTEMPT_MAX_BYTES = 100 * 1024 * 1024;
export const PREP_ATTEMPT_TMP_DIR = path.join(os.tmpdir(), 'prep-attempt-uploads');

export const prepAttemptUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { fs.mkdir(PREP_ATTEMPT_TMP_DIR, { recursive: true }, (err) => cb(err ?? null, PREP_ATTEMPT_TMP_DIR)); },
    filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.upload`),
  }),
  limits: { fileSize: PREP_ATTEMPT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => (isVideoUpload(file.originalname, file.mimetype) ? cb(null, true) : cb(new UnsupportedVideoError())),
});
