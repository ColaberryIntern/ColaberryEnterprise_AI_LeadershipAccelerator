import { Request, Response, NextFunction } from 'express';
import { leadSchema, createLead } from '../services/leadService';
import { ZodError } from 'zod';

export async function submitLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = leadSchema.parse(req.body);
    const lead = await createLead(data);
    res.status(201).json({
      message: 'Thank you for your interest',
      leadId: lead.id,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    next(error);
  }
}
