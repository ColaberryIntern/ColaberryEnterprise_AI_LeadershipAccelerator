import { Request, Response, NextFunction } from 'express';
import { leadSchema, createLead } from '../services/leadService';
import { runLeadAutomation } from '../services/automationService';
import { ZodError } from 'zod';

export async function submitLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = leadSchema.parse(req.body);
    const { lead, isDuplicate } = await createLead(data);

    res.status(201).json({
      message: 'Thank you for your interest',
      leadId: lead.id,
    });

    // Trigger automation in background (don't block response)
    if (!isDuplicate) {
      runLeadAutomation({
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone || undefined,
        title: lead.title || undefined,
        company: lead.company || undefined,
        company_size: lead.company_size || undefined,
        lead_score: lead.lead_score || undefined,
        source: lead.source || undefined,
        form_type: lead.form_type || undefined,
      }).catch((err) => console.error('[LeadController] Automation error:', err));
    }
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
