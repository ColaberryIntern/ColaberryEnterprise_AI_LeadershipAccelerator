import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { ZodError } from 'zod';
import { bookCallSchema } from '../schemas/calendarSchema';
import { getAvailableSlots, createBooking } from '../services/calendarService';
import StrategyCall from '../models/StrategyCall';
import Lead from '../models/Lead';
import { sendStrategyCallConfirmation } from '../services/emailService';
import { enrollInPrepNudge } from '../services/strategyPrepService';
import { advancePipelineStage } from '../services/pipelineService';
import { syncNewLeadToGhl } from '../services/ghlService';
import { recordOutcome } from '../services/interactionService';

export async function handleGetAvailability(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const days = parseInt(req.query.days as string, 10) || 21;
    const availability = await getAvailableSlots(Math.min(days, 60));
    res.json(availability);
  } catch (error) {
    next(error);
  }
}

export async function handleBookCall(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = bookCallSchema.parse(req.body);

    // Check for duplicate booking (same email within 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await StrategyCall.findOne({
      where: {
        email: data.email,
        status: 'scheduled',
      },
      order: [['created_at', 'DESC']],
    });

    if (existing && existing.created_at > oneDayAgo) {
      res.status(409).json({
        error: 'You already have a strategy call scheduled. Check your email for details.',
      });
      return;
    }

    // Create Google Calendar event
    const booking = await createBooking({
      name: data.name,
      email: data.email,
      company: data.company || '',
      phone: data.phone || '',
      slotStart: data.slot_start,
      timezone: data.timezone,
    });

    // Save to database
    const call = await StrategyCall.create({
      name: data.name,
      email: data.email,
      company: data.company || '',
      phone: data.phone || null,
      scheduled_at: new Date(booking.startTime),
      timezone: data.timezone,
      google_event_id: booking.eventId,
      meet_link: booking.meetLink,
      status: 'scheduled',
    });

    // Find or create Lead by email
    let leadId: number | null = null;
    try {
      const emailLower = data.email.trim().toLowerCase();
      let lead = await Lead.findOne({
        where: { email: { [Op.iLike]: emailLower } },
      });

      if (!lead) {
        lead = await Lead.create({
          name: data.name,
          email: emailLower,
          company: data.company || '',
          phone: data.phone || '',
          source: 'strategy_call',
          form_type: 'strategy_call',
          pipeline_stage: 'meeting_scheduled',
          lead_temperature: 'warm',
          status: 'new',
        });
        console.log('[Calendar] Created new lead:', lead.id, 'for', emailLower);

        // Auto-sync new lead to GHL (fire-and-forget)
        syncNewLeadToGhl(lead).catch((err) =>
          console.error('[Calendar] GHL sync error:', err)
        );
      } else {
        // Advance pipeline stage for strategy call booking (from new_lead or contacted)
        await advancePipelineStage(lead.id, 'meeting_scheduled', 'strategy_call_booked');
        console.log('[Calendar] Found existing lead:', lead.id, 'for', emailLower);
      }

      leadId = lead.id;
      await call.update({ lead_id: leadId });

      // Record booked_meeting interaction for temperature classification (40 pts → warm)
      recordOutcome({
        lead_id: leadId,
        channel: 'email',
        step_index: 0,
        outcome: 'booked_meeting',
        metadata: { strategy_call_id: call.id, scheduled_at: booking.startTime },
      }).catch((err) => console.error('[Calendar] booked_meeting outcome failed:', err));
    } catch (err) {
      console.error('[Calendar] Lead find-or-create failed (non-blocking):', err);
    }

    // Resolve visitor identity if fingerprint provided
    if (req.body.visitor_fingerprint && leadId) {
      try {
        const { Visitor } = require('../models');
        const { resolveIdentity } = require('../services/visitorTrackingService');
        const visitor = await Visitor.findOne({ where: { fingerprint: req.body.visitor_fingerprint } });
        if (visitor && !visitor.lead_id) {
          await resolveIdentity(visitor.id, leadId);
        }
      } catch (err) {
        console.error('[Calendar] Visitor identity resolution failed (non-blocking):', err);
      }
    }

    // Boost intent score for strategy call booking (score → 90+, very_high)
    if (leadId) {
      (async () => {
        try {
          const { Visitor, IntentScore } = require('../models');
          const visitor = await Visitor.findOne({ where: { lead_id: leadId } });
          if (visitor) {
            const now = new Date();
            const existing = await IntentScore.findOne({ where: { visitor_id: visitor.id } });
            if (existing) {
              if (existing.score < 90) {
                await existing.update({
                  score: 90,
                  intent_level: 'very_high',
                  score_updated_at: now,
                  updated_at: now,
                });
              }
            } else {
              await IntentScore.create({
                visitor_id: visitor.id,
                lead_id: leadId,
                score: 90,
                intent_level: 'very_high',
                signals_count: 0,
                score_updated_at: now,
              });
            }
            console.log('[Calendar] Intent boosted to 90 for visitor:', visitor.id);
          }
        } catch (err) {
          console.error('[Calendar] Intent boost failed (non-blocking):', err);
        }
      })();
    }

    // Send confirmation email and capture HTML for campaign record
    let confirmationHtml = '';
    try {
      confirmationHtml = await sendStrategyCallConfirmation({
        to: data.email,
        name: data.name,
        scheduledAt: new Date(booking.startTime),
        timezone: 'America/Chicago',
        meetLink: booking.meetLink,
        prepToken: call.prep_token,
      });
    } catch (err) {
      console.error('[Email] Strategy call confirmation failed:', err);
    }

    // Enroll in strategy call readiness campaign (non-blocking)
    if (leadId && call.prep_token) {
      enrollInPrepNudge(leadId, call.prep_token, booking.meetLink, new Date(booking.startTime), confirmationHtml).catch((err) =>
        console.error('[Calendar] Readiness campaign enrollment failed (non-blocking):', err)
      );
    }

    res.status(201).json({
      booking: {
        id: call.id,
        scheduled_at: booking.startTime,
        meet_link: booking.meetLink,
        prep_token: call.prep_token,
      },
    });
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
