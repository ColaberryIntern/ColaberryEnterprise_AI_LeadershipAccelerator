import { Request, Response } from 'express';
import { logActivity } from '../services/activityService';
import { verifyHmacSignature } from '../utils/hmac';

const ADVISORY_WEBHOOK_SECRET = process.env.ADVISORY_WEBHOOK_SECRET || '';

export async function handleAdvisoryWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = req.headers['x-webhook-signature'] as string || '';
    const eventType = req.headers['x-webhook-event'] as string || '';
    const rawBody = JSON.stringify(req.body);

    if (ADVISORY_WEBHOOK_SECRET && !verifyHmacSignature(rawBody, signature, ADVISORY_WEBHOOK_SECRET)) {
      console.warn('[AdvisorySync] Invalid webhook signature');
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }

    const { event, data } = req.body;
    const resolvedEvent = eventType || event || '';

    console.log(`[AdvisorySync] Received: ${resolvedEvent}`);

    // Lazy-load services that may not exist yet (Phases 2-4)
    let mapAdvisoryToLead: any;
    let classifyAndRouteLead: any;
    try {
      mapAdvisoryToLead = require('../services/advisoryLeadMapperService').mapAdvisoryToLead;
    } catch {
      console.warn('[AdvisorySync] advisoryLeadMapperService not available yet');
    }
    try {
      classifyAndRouteLead = require('../services/offerRouterService').classifyAndRouteLead;
    } catch {
      console.warn('[AdvisorySync] offerRouterService not available yet');
    }

    switch (resolvedEvent) {
      case 'recommendation.created':
      case 'advisory.session.completed': {
        if (!mapAdvisoryToLead) {
          console.warn('[AdvisorySync] Cannot process event - advisoryLeadMapperService not available');
          res.status(503).json({ error: 'Advisory lead mapper service not available' });
          return;
        }

        const { lead, created } = await mapAdvisoryToLead(data);
        let score: any = null;

        if (classifyAndRouteLead) {
          score = await classifyAndRouteLead(lead.id);
        }

        // Log full advisory journey as activities
        const ideaInput = data.recommendation?.description || '';
        const maturity = data.recommendation?.confidence ? Math.round(data.recommendation.confidence * 100) : 0;
        const companyName = data.metadata?.company || lead.company || '';
        const qAndA = data.recommendation?.metadata?.questions_and_answers || [];

        await logActivity({
          lead_id: lead.id, type: 'system',
          subject: `Advisory session ${created ? 'started' : 'resumed'} via AI Workforce Designer (advisor.colaberry.ai)`,
          metadata: { event: resolvedEvent, advisory_session_id: data.id },
        });

        if (ideaInput) {
          await logActivity({
            lead_id: lead.id, type: 'system',
            subject: `Business idea: ${ideaInput.substring(0, 200)}`,
            metadata: { idea_input: ideaInput },
          });
        }

        if (qAndA.length > 0) {
          await logActivity({
            lead_id: lead.id, type: 'system',
            subject: `Advisory Q&A completed (${qAndA.length} questions)`,
            metadata: { questions_and_answers: qAndA },
          });
        }

        await logActivity({
          lead_id: lead.id, type: 'system',
          subject: `Advisory assessment: maturity ${maturity}/100, classified as ${score?.recommended_offer || 'unclassified'} (score ${score?.lead_score || 0}/100)`,
          metadata: { maturity_score: maturity, score: score?.lead_score, offer: score?.recommended_offer, reasoning: score?.reasoning },
        });

        // Link visitor fingerprint to lead if provided in metadata
        if (data.metadata?.visitor_fingerprint) {
          try {
            const { findOrCreateVisitor, resolveIdentity: resolveId } = require('../services/visitorTrackingService');
            const visitorId = await findOrCreateVisitor(data.metadata.visitor_fingerprint, {
              ip_address: '', user_agent: '',
            });
            await resolveId(visitorId, lead.id);
            console.log(`[AdvisorySync] Linked visitor ${data.metadata.visitor_fingerprint.substring(0, 12)} to lead ${lead.id}`);
          } catch (linkErr: any) {
            console.warn(`[AdvisorySync] Visitor link failed: ${linkErr.message}`);
          }
        }

        console.log(`[AdvisorySync] Lead ${lead.id} (${lead.name}): ${created ? 'created' : 'updated'}, offer: ${score?.recommended_offer}`);
        res.json({ success: true, lead_id: lead.id, offer: score?.recommended_offer });
        return;
      }

      case 'recommendation.accepted': {
        if (!mapAdvisoryToLead) {
          console.warn('[AdvisorySync] Cannot process event - advisoryLeadMapperService not available');
          res.status(503).json({ error: 'Advisory lead mapper service not available' });
          return;
        }

        const { lead } = await mapAdvisoryToLead(data);
        await lead.update({ advisory_status: 'qualified' } as any);
        console.log(`[AdvisorySync] Lead ${lead.id} advisory status: qualified`);
        res.json({ success: true, lead_id: lead.id });
        return;
      }

      case 'strategy_call.booked': {
        // Booking from advisory — create strategy call and update lead
        if (!mapAdvisoryToLead) {
          res.status(503).json({ error: 'Advisory lead mapper not available' });
          return;
        }
        const { lead: bookedLead, created: bookCreated } = await mapAdvisoryToLead(data);

        // Build notes from advisory session data
        const qAndA = data.recommendation?.metadata?.questions_and_answers || [];
        const sessionSummary = data.recommendation?.metadata?.session_summary || '';
        const ideaInput = data.recommendation?.description || '';
        const maturity = data.recommendation?.confidence ? Math.round(data.recommendation.confidence * 100) : 0;
        const recOffer = bookedLead.recommended_offer || 'unclassified';

        const prepNotes = [
          `Advisory Session: ${data.id || 'unknown'}`,
          `Recommended Offer: ${recOffer}`,
          `Maturity Score: ${maturity}/100`,
          ideaInput ? `Business Idea: ${ideaInput}` : '',
          sessionSummary ? `Summary: ${sessionSummary}` : '',
          data.metadata?.company ? `Company: ${data.metadata.company}` : '',
          data.metadata?.industry ? `Industry: ${data.metadata.industry}` : '',
          data.metadata?.departments?.length ? `Departments: ${data.metadata.departments.join(', ')}` : '',
          data.metadata?.estimated_roi ? `Estimated ROI: $${Number(data.metadata.estimated_roi).toLocaleString()}` : '',
          qAndA.length > 0 ? '\n--- Advisory Q&A ---' : '',
          ...qAndA.map((qa: any, i: number) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`),
        ].filter(Boolean).join('\n');

        // Store Q&A and session data on lead
        await bookedLead.update({
          advisory_status: 'booked',
          pipeline_stage: 'meeting_scheduled',
          ...(ideaInput ? { idea_input: ideaInput } : {}),
          ...(maturity ? { maturity_score: maturity } : {}),
        } as any);

        // Create strategy call if booking data present
        if (data.booking?.scheduled_at) {
          try {
            const StrategyCall = require('../models/StrategyCall').default;
            await StrategyCall.create({
              name: bookedLead.name,
              email: bookedLead.email,
              company: bookedLead.company || '',
              phone: bookedLead.phone || '',
              scheduled_at: new Date(data.booking.scheduled_at),
              timezone: 'America/Chicago',
              google_event_id: data.booking.event_id || '',
              meet_link: data.booking.meet_link || '',
              status: 'scheduled',
              notes: prepNotes,
              lead_id: bookedLead.id,
            });
            console.log(`[AdvisorySync] Strategy call created for ${bookedLead.name} (lead ${bookedLead.id})`);
          } catch (bookErr: any) {
            console.warn(`[AdvisorySync] Strategy call creation failed: ${bookErr.message}`);
          }
        }

        // Update Google Calendar event with advisory context
        if (data.booking?.event_id && prepNotes) {
          try {
            const { updateCalendarEvent } = require('../services/calendarService');
            await updateCalendarEvent(data.booking.event_id, prepNotes);
          } catch { /* non-blocking */ }
        }

        await logActivity({
          lead_id: bookedLead.id,
          type: 'system',
          subject: `Advisory booking: ${bookedLead.name} booked strategy call via advisor`,
          metadata: { event: resolvedEvent, offer: recOffer, maturity },
        });

        // Auto-enroll in strategy call prep sequence
        try {
          const { enrollInPrepNudge } = require('../services/strategyPrepService');
          await enrollInPrepNudge(bookedLead.id);
          console.log(`[AdvisorySync] Enrolled lead ${bookedLead.id} in strategy call prep`);
        } catch (prepErr: any) {
          console.warn(`[AdvisorySync] Prep enrollment failed: ${prepErr.message}`);
        }

        // Link visitor if fingerprint provided
        if (data.metadata?.visitor_fingerprint) {
          try {
            const { findOrCreateVisitor, resolveIdentity: resolveId } = require('../services/visitorTrackingService');
            const vid = await findOrCreateVisitor(data.metadata.visitor_fingerprint, { ip_address: '', user_agent: '' });
            await resolveId(vid, bookedLead.id);
          } catch { /* non-blocking */ }
        }

        console.log(`[AdvisorySync] Booking synced for lead ${bookedLead.id}: ${bookedLead.name}`);
        res.json({ success: true, lead_id: bookedLead.id });
        return;
      }

      case 'report.completed': {
        // Store PDF link if available
        if (data.downloadUrl && data.id) {
          const { Lead: LeadModel } = require('../models');
          const lead = await LeadModel.findOne({ where: { advisory_session_id: data.id } });
          if (lead) {
            await lead.update({ advisory_report_url: data.downloadUrl } as any);
            console.log(`[AdvisorySync] Report linked to lead ${lead.id}`);
          }
        }
        res.json({ success: true });
        return;
      }

      default:
        console.log(`[AdvisorySync] Unknown event: ${resolvedEvent}`);
        res.json({ success: true, message: 'Event not handled' });
    }
  } catch (error: any) {
    console.error('[AdvisorySync] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

export async function handleAdvisoryWebhookHead(_req: Request, res: Response): Promise<void> {
  res.status(200).send('OK');
}
