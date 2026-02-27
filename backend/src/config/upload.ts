import crypto from 'crypto';
import multer from 'multer';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve('/app/uploads/strategy-prep');

const ALLOWED_MIMES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

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
    cb(new Error('Only PDF and PowerPoint files are accepted'));
  }
}

export const strategyPrepUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

export { UPLOAD_DIR };
