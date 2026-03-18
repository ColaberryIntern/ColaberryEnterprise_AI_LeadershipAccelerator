import { Request, Response, NextFunction } from 'express';
import { leadSchema, createLead } from '../services/leadService';
import { ZodError } from 'zod';

export async function submitLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = leadSchema.parse(req.body);
    const { lead } = await createLead(data);

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

    // All automation (email, voice calls, CRM sync, campaigns) is deferred to
    // post-payment via PaySimple webhook. No pre-payment communication.
    console.log(`[LeadController] Lead ${lead.id} created (${data.email}). Automation deferred to payment.`);
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
