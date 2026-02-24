import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { updateLeadSchema, leadFilterSchema } from '../schemas/leadAdminSchema';
import {
  listLeads,
  getLeadDetail,
  updateLead,
  getLeadStats,
  generateLeadCsv,
} from '../services/leadService';

export async function handleAdminListLeads(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filters = leadFilterSchema.parse(req.query);
    const result = await listLeads(filters);
    res.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'Invalid query parameters' });
      return;
    }
    next(error);
  }
}

export async function handleAdminGetLeadStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getLeadStats();
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}

export async function handleAdminGetLead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }
    const result = await getLeadDetail(id);
    if (!result) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleAdminUpdateLead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }
    const data = updateLeadSchema.parse(req.body);
    const lead = await updateLead(id, data);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.json({ lead });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    next(error);
  }
}

export async function handleAdminExportLeads(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const csv = await generateLeadCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
}
