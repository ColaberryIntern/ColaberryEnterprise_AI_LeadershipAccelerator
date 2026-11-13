/**
 * Multer config for the candidate's intro video (POST /api/portal/career/portfolio-page/hire-video).
 *
 * One file, at most 100 MB: a 90-second browser recording is ~20-30 MB, and 100 MB is also what
 * the Cloudflare edge in front of the platform accepts, so a bigger cap here would only move the
 * refusal to an HTML 413 from the edge. The container nginx raises its 1 MB default for this one
 * path to match (nginx/nginx.conf).
 *
 * DISK storage in the OS temp dir: the transcode reads it once, and the controller deletes it
 * whether the transcode succeeded or not. The path is recorded on the request BEFORE multer writes,
 * so an aborted upload (too large) is cleaned up too.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';

export const HIRE_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const HIRE_VIDEO_TMP_DIR = path.join(os.tmpdir(), 'hire-video-uploads');

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i;

export class UnsupportedVideoError extends Error {
  readonly status = 400;
  readonly error_class = 'ValidationError';
  constructor() { super('That file is not a video. Try an MP4, MOV or WebM.'); this.name = 'UnsupportedVideoError'; }
}

interface TempTracked { hireVideoTempPaths?: string[] }
export const hireVideoTempPaths = (req: unknown): string[] => [...((req as TempTracked).hireVideoTempPaths ?? [])];

export const isVideoUpload = (name: string, mime: string): boolean =>
  /^video\//i.test(mime) || VIDEO_EXT.test(name);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(HIRE_VIDEO_TMP_DIR, { recursive: true }, (err) => cb(err ?? null, HIRE_VIDEO_TMP_DIR));
  },
  filename: (req, _file, cb) => {
    const name = `${crypto.randomUUID()}.upload`;
    ((req as unknown as TempTracked).hireVideoTempPaths ??= []).push(path.join(HIRE_VIDEO_TMP_DIR, name));
    cb(null, name);
  },
});

export const hireVideoUpload = multer({
  storage,
  limits: { fileSize: HIRE_VIDEO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (isVideoUpload(file.originalname || '', file.mimetype || '')) cb(null, true);
    else cb(new UnsupportedVideoError());
  },
}).single('video');
