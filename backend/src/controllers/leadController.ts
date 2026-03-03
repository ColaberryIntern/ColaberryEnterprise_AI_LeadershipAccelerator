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

    // Always trigger automation — even for returning visitors, they expect the email.
    // Use submitted form data (not lead record) so the correct email template is sent.
    runLeadAutomation({
      id: lead.id,
      name: data.name,
      email: data.email,
      phone: data.phone || undefined,
      title: data.title || undefined,
      company: data.company || undefined,
      company_size: data.company_size || undefined,
      lead_score: lead.lead_score || undefined,
      source: data.source || undefined,
      form_type: data.form_type || undefined,
    }).catch((err) => console.error('[LeadController] Automation error:', err));
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
