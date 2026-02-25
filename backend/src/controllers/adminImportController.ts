import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { importLeadsFromCsv, getExpectedColumns } from '../services/csvImportService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

export const uploadMiddleware = upload.single('file');

export async function handleImportLeads(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No CSV file provided' });
      return;
    }

    const result = await importLeadsFromCsv(req.file.buffer);
    res.json({ result });
  } catch (error: any) {
    if (error.message.includes('CSV')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function handleGetImportTemplate(
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const columns = getExpectedColumns();
  res.json({ columns });
}
