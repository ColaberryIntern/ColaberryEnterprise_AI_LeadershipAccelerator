import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { v1LeadSchema } from '../schemas/v1LeadSchema';
import { ingestExternalLead } from '../services/externalLeadIngestService';

export async function createExternalLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = v1LeadSchema.parse(req.body);
    const result = await ingestExternalLead(payload);
    // 201 on first create, 200 on idempotent duplicate — lets callers distinguish
    // new records from retries without guessing.
    res.status(result.was_duplicate ? 200 : 201).json({
      id: String(result.id),
      created_at: result.created_at.toISOString(),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    next(err);
  }
}
