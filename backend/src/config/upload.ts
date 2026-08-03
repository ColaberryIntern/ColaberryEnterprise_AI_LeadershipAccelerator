import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve('/app/uploads/strategy-prep');

const ALLOWED_MIMES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'application/rtf': '.rtf',
  'text/rtf': '.rtf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ALLOWED_MIMES[file.mimetype] || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  if (ALLOWED_MIMES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error('Accepted file types: PDF, Word, PowerPoint, Excel, RTF, Text, Markdown, CSV'));
  }
}

export const strategyPrepUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

export { UPLOAD_DIR };

// ── Certificate uploads (Anthropic Skills Course) — images + PDF only ─────────
const CERT_DIR = process.env.CERT_UPLOAD_DIR || path.resolve('/app/uploads/certificates');
try { fs.mkdirSync(CERT_DIR, { recursive: true }); } catch { /* created lazily on first write otherwise */ }

const CERT_MIMES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};
const MAX_CERT_SIZE = 15 * 1024 * 1024; // 15MB

const certStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { cb(null, CERT_DIR); },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || CERT_MIMES[file.mimetype] || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
function certFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  if (CERT_MIMES[file.mimetype]) cb(null, true);
  else cb(new Error('Upload your certificate as a PDF or an image (PNG, JPG, or WEBP).'));
}
export const certificateUpload = multer({
  storage: certStorage,
  fileFilter: certFilter,
  limits: { fileSize: MAX_CERT_SIZE },
});

export { CERT_DIR };

// ── Deep Dive "Field Guide" uploads — a single self-contained .html artifact ──
// The student builds it in their own Claude Code and uploads it. It is stored in
// the DB (PortfolioArtifact), NOT on disk, so it survives container restarts and
// can be rendered back — so we use MEMORY storage and read the buffer in the
// service. Accept text/html by mime OR extension (some browsers send
// application/octet-stream for a local .html).
const MAX_FIELD_GUIDE_SIZE = 5 * 1024 * 1024; // 5MB
function fieldGuideFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  const name = (file.originalname || '').toLowerCase();
  const ok = file.mimetype === 'text/html' || /\.html?$/.test(name);
  if (ok) cb(null, true);
  else cb(new Error('Upload the .html Field Guide that Claude Code built for you.'));
}
export const fieldGuideUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fieldGuideFilter,
  limits: { fileSize: MAX_FIELD_GUIDE_SIZE },
});
export { MAX_FIELD_GUIDE_SIZE };

// ── Community media uploads — small images from a student's local computer ────
// Disk storage on the persistent `uploads` volume (survives deploys); served
// back by a public GET route keyed on the opaque UUID filename.
const COMMUNITY_MEDIA_DIR = process.env.COMMUNITY_MEDIA_DIR || path.resolve('/app/uploads/community');
try { fs.mkdirSync(COMMUNITY_MEDIA_DIR, { recursive: true }); } catch { /* created lazily on first write */ }

const COMMUNITY_MEDIA_MIMES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_COMMUNITY_MEDIA_SIZE = 8 * 1024 * 1024; // 8MB — "not so big" images

const communityMediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { cb(null, COMMUNITY_MEDIA_DIR); },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || COMMUNITY_MEDIA_MIMES[file.mimetype] || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
function communityMediaFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  if (COMMUNITY_MEDIA_MIMES[file.mimetype]) cb(null, true);
  else cb(new Error('Upload an image — PNG, JPG, WEBP, or GIF.'));
}
export const communityMediaUpload = multer({
  storage: communityMediaStorage,
  fileFilter: communityMediaFilter,
  limits: { fileSize: MAX_COMMUNITY_MEDIA_SIZE },
});
export { COMMUNITY_MEDIA_DIR, MAX_COMMUNITY_MEDIA_SIZE };

// ── Room Resource uploads (Docs & Files) — documents attached to a Community
// Room, one of its bookings, or the Global Library ──────────────────────────
// Disk storage on the persistent `uploads` volume (survives deploys), same as
// communityMediaUpload. Video is deliberately NOT supported here — it's
// link-only (paste a Vimeo/YouTube/Drive/Meet URL via resource_type:
// 'recording'), matching the org's existing ColaberryTV pattern.
const ROOM_RESOURCE_DIR = process.env.ROOM_RESOURCE_DIR || path.resolve('/app/uploads/room-resources');
try { fs.mkdirSync(ROOM_RESOURCE_DIR, { recursive: true }); } catch { /* created lazily on first write */ }

const ROOM_RESOURCE_MIMES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'application/rtf': '.rtf',
  'text/rtf': '.rtf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};
// Browsers frequently report application/octet-stream for .md/.txt (and
// sometimes .csv) on Windows, so accept by extension too — a bare MIME check
// would reject a plain CLAUDE.md upload, which is exactly what this feature
// needs to support (see fieldGuideUpload's identical dual-check precedent).
const ROOM_RESOURCE_EXT_FALLBACK = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.rtf', '.txt', '.md', '.csv', '.png', '.jpg', '.jpeg', '.webp',
]);
const MAX_ROOM_RESOURCE_SIZE = 50 * 1024 * 1024; // 50MB — matches strategyPrepUpload

const roomResourceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { cb(null, ROOM_RESOURCE_DIR); },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ROOM_RESOURCE_MIMES[file.mimetype] || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
function roomResourceFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ROOM_RESOURCE_MIMES[file.mimetype] || ROOM_RESOURCE_EXT_FALLBACK.has(ext)) cb(null, true);
  else cb(new Error('Accepted file types: PDF, Word, PowerPoint, Excel, RTF, Text, Markdown, CSV, PNG, JPG, WEBP'));
}
export const roomResourceUpload = multer({
  storage: roomResourceStorage,
  fileFilter: roomResourceFilter,
  limits: { fileSize: MAX_ROOM_RESOURCE_SIZE },
});
export { ROOM_RESOURCE_DIR, MAX_ROOM_RESOURCE_SIZE };
