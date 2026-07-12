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
