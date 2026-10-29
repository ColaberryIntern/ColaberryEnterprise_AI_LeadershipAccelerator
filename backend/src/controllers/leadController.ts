import { Request, Response, NextFunction } from 'express';
import { leadSchema, createLead } from '../services/leadService';
import { ZodError } from 'zod';
import { redactForLogs } from '../utils/piiRedaction';
import { capturePhoneConsent } from '../services/consent/capturePhoneConsent';

export async function submitLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = leadSchema.parse(req.body);
    const { lead } = await createLead(data);

    // Phone permission, BEFORE the response and not after it.
    //
    // The visitor-identity block below runs post-response because losing it costs
    // some attribution. Losing this costs the authorisation for a number we have
    // just stored — the lead would exist with a phone and no grant behind it, which
    // is the precise state this capture exists to prevent. Two inserts of latency
    // on a public form is the right price for not letting those two come apart.
    //
    // Run for a duplicate lead too. `createLead` returns the existing row when the
    // email or number is already known, and a returning person who ticks the box is
    // granting permission NOW; the ledger should carry that act.
    await capturePhoneConsent({
      phone: data.phone,
      email: data.email,
      phoneConsent: data.phone_consent,
      source: `lead_form:${data.form_type || 'contact'}`,
      ipAddress: req.ip ?? null,
      // `req.get` is an Express helper, not part of the bare request shape. Calling
      // it unguarded threw on a hand-rolled req in an existing test and the catch
      // below turned it into a silent failure to respond.
      userAgent: typeof (req as any).get === 'function' ? req.get('user-agent') ?? null : null,
    });

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
    console.log(`[LeadController] Lead ${lead.id} created (${redactForLogs(data.email)}). Automation deferred to payment.`);
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
