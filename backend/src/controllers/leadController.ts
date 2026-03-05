import { Request, Response, NextFunction } from 'express';
import { leadSchema, createLead } from '../services/leadService';
import { runLeadAutomation } from '../services/automationService';
import { syncNewLeadToGhl } from '../services/ghlService';
import { ZodError } from 'zod';

export async function submitLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = leadSchema.parse(req.body);
    const { lead, isDuplicate } = await createLead(data);

    // Auto-sync new lead to GHL (fire-and-forget)
    if (!isDuplicate) {
      syncNewLeadToGhl(lead).catch((err) =>
        console.error('[LeadController] GHL sync error:', err)
      );
    }

    res.status(201).json({
      message: 'Thank you for your interest',
      leadId: lead.id,
    });

    // Resolve visitor identity if fingerprint provided
    if (req.body.visitor_fingerprint) {
      try {
        const { Visitor } = require('../models');
        const { resolveIdentity } = require('../services/visitorTrackingService');
        const visitor = await Visitor.findOne({ where: { fingerprint: req.body.visitor_fingerprint } });
        if (visitor && !visitor.lead_id) {
          await resolveIdentity(visitor.id, lead.id);
        }
      } catch (err) {
        console.error('[Lead] Visitor identity resolution failed (non-blocking):', err);
      }
    }

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
