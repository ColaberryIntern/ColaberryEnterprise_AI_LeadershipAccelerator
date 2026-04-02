import { Request, Response, NextFunction } from 'express';
import {
  findOrCreateVisitor,
  getOrCreateSession,
  recordPageEvent,
  categorizePagePath,
  updateHeartbeat,
  resolveIdentity,
} from '../services/visitorTrackingService';
import { detectSessionSignals } from '../services/behavioralSignalService';
import { computeIntentScore } from '../services/intentScoringService';
import { evaluateVisitorForTriggers } from '../services/behavioralTriggerService';
import { env } from '../config/env';
import { logAgentExecution } from '../services/governanceService';

/** Fire-and-forget signal detection + intent scoring + behavioral triggers for high-value events */
function triggerSignalAnalysis(sessionId: string, visitorId: string): void {
  detectSessionSignals(sessionId)
    .then((signals) => {
      if (signals.length > 0) {
        return computeIntentScore(visitorId).then(() => {
          // Evaluate behavioral trigger campaigns for this visitor
          return evaluateVisitorForTriggers(visitorId);
        });
      }
    })
    .catch((err) => console.error('[Tracking] Signal analysis error:', err.message));
}

const VALID_EVENT_TYPES = [
  'pageview',
  'scroll',
  'click',
  'cta_click',
  'form_start',
  'form_submit',
  'time_on_page',
  'heartbeat',
  'media_play',
  'embed_click',
  'booking_modal_opened',
  'booking_date_selected',
  'booking_time_selected',
  'book_strategy_call_click',
  'demo_start',
  'demo_complete',
  'demo_skip',
  'demo_to_input_focus',
  'demo_watch_click',
  'demo_industry_click',
] as const;

function extractReferrerDomain(referrerUrl?: string): string | undefined {
  if (!referrerUrl) return undefined;
  try {
    return new URL(referrerUrl).hostname;
  } catch {
    return undefined;
  }
}

function validateTrackEvent(body: Record<string, unknown>): string | null {
  const { fingerprint, event_type, page_url, page_path } = body;

  if (!fingerprint || typeof fingerprint !== 'string' || fingerprint.length > 64) {
    return 'fingerprint is required (string, max 64 chars)';
  }
  if (!event_type || typeof event_type !== 'string' || !VALID_EVENT_TYPES.includes(event_type as any)) {
    return `event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}`;
  }
  if (!page_url || typeof page_url !== 'string' || page_url.length > 500) {
    return 'page_url is required (string, max 500 chars)';
  }
  if (!page_path || typeof page_path !== 'string' || page_path.length > 255) {
    return 'page_path is required (string, max 255 chars)';
  }

  return null;
}

export async function handleTrackEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
  const trackStart = Date.now();
  try {
    if (!env.enableVisitorTracking) {
      res.status(204).end();
      return;
    }

    const {
      fingerprint,
      event_type,
      page_url,
      page_path,
      page_title,
      event_data,
      user_agent,
      device_type,
      browser,
      os,
      referrer_url,
      utm_source,
      utm_campaign,
      utm_medium,
      campaign_id,
      email,
      lid,
      timestamp,
    } = req.body;

    const validationError = validateTrackEvent(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const referrer_domain = extractReferrerDomain(referrer_url);

    const visitorId = await findOrCreateVisitor(fingerprint, {
      ip_address: req.ip,
      user_agent,
      device_type,
      browser,
      os,
      utm_source,
      utm_campaign,
      utm_medium,
      referrer_domain,
      campaign_id,
    });

    // Identity resolution: link visitor to existing lead via email or lead ID
    if (email && typeof email === 'string') {
      try {
        const { Visitor, Lead } = require('../models');
        const visitor = await Visitor.findByPk(visitorId);
        if (visitor && !visitor.lead_id) {
          const lead = await Lead.findOne({ where: { email: email.toLowerCase().trim() } });
          if (lead) {
            await resolveIdentity(visitorId, lead.id);
            console.log(`[Tracking] Identity resolved: visitor ${visitorId} → lead ${lead.id} (${email})`);
          }
        }
      } catch (err: any) {
        console.warn('[Tracking] Identity resolution failed (non-blocking):', err.message);
      }
    } else if (lid && !isNaN(Number(lid))) {
      // Lead ID from email click tracking (lid param in URL)
      try {
        const { Visitor } = require('../models');
        const visitor = await Visitor.findByPk(visitorId);
        if (visitor && !visitor.lead_id) {
          await resolveIdentity(visitorId, Number(lid));
          console.log(`[Tracking] Identity resolved via lid: visitor ${visitorId} → lead ${lid}`);
        }
      } catch (err: any) {
        console.warn('[Tracking] lid resolution failed (non-blocking):', err.message);
      }
    }

    const sessionId = await getOrCreateSession(visitorId, {
      page_url,
      referrer_url,
      utm_source,
      utm_campaign,
      utm_medium,
      ip_address: req.ip,
      device_type,
    });

    const page_category = categorizePagePath(page_path);

    await recordPageEvent({
      session_id: sessionId,
      visitor_id: visitorId,
      event_type,
      page_url,
      page_path,
      page_title,
      page_category,
      event_data,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    // Trigger real-time signal analysis for high-value events
    const HIGH_VALUE_EVENTS = ['cta_click', 'form_start', 'form_submit'];
    if (HIGH_VALUE_EVENTS.includes(event_type)) {
      triggerSignalAnalysis(sessionId, visitorId);
    }

    logAgentExecution('visitor_tracker', 'success', Date.now() - trackStart).catch(() => {});
    res.status(200).json({ visitor_id: visitorId, session_id: sessionId });
  } catch (err) {
    logAgentExecution('visitor_tracker', 'failed', Date.now() - trackStart, (err as Error).message).catch(() => {});
    console.error('[Tracking]', err);
    res.status(204).end();
  }
}

export async function handleTrackBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.enableVisitorTracking) {
      res.status(204).end();
      return;
    }

    const {
      fingerprint,
      events,
      user_agent,
      device_type,
      browser,
      os,
      referrer_url,
      utm_source,
      utm_campaign,
      utm_medium,
      campaign_id,
      lead_id,
    } = req.body;

    if (!fingerprint || typeof fingerprint !== 'string' || fingerprint.length > 64) {
      res.status(400).json({ error: 'fingerprint is required (string, max 64 chars)' });
      return;
    }
    if (!Array.isArray(events) || events.length === 0 || events.length > 50) {
      res.status(400).json({ error: 'events must be an array with 1-50 items' });
      return;
    }

    const referrer_domain = extractReferrerDomain(referrer_url);

    const visitorId = await findOrCreateVisitor(fingerprint, {
      ip_address: req.ip,
      user_agent,
      device_type,
      browser,
      os,
      utm_source,
      utm_campaign,
      utm_medium,
      referrer_domain,
      campaign_id,
    });

    // Identity resolution via lead_id (from lid= URL param in email links)
    if (lead_id && !isNaN(Number(lead_id))) {
      try {
        const { Visitor } = require('../models');
        const visitor = await Visitor.findByPk(visitorId);
        if (visitor && !visitor.lead_id) {
          await resolveIdentity(visitorId, Number(lead_id));
          console.log(`[Tracking] Batch identity resolved via lead_id: visitor ${visitorId} → lead ${lead_id}`);
        }
      } catch (err: any) {
        console.warn('[Tracking] Batch lid resolution failed (non-blocking):', err.message);
      }
    }

    const firstEvent = events[0];
    const sessionId = await getOrCreateSession(visitorId, {
      page_url: firstEvent.page_url,
      referrer_url,
      utm_source,
      utm_campaign,
      utm_medium,
      ip_address: req.ip,
      device_type,
    });

    let eventsRecorded = 0;
    for (const event of events) {
      const page_category = categorizePagePath(event.page_path);
      await recordPageEvent({
        session_id: sessionId,
        visitor_id: visitorId,
        event_type: event.event_type,
        page_url: event.page_url,
        page_path: event.page_path,
        page_title: event.page_title,
        page_category,
        event_data: event.event_data,
        timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      });
      eventsRecorded++;
    }

    // Trigger real-time signal analysis if batch contains high-value events
    const hasHighValue = events.some((e: any) =>
      ['cta_click', 'form_start', 'form_submit'].includes(e.event_type)
    );
    if (hasHighValue) {
      triggerSignalAnalysis(sessionId, visitorId);
    }

    res.status(200).json({
      visitor_id: visitorId,
      session_id: sessionId,
      events_recorded: eventsRecorded,
    });
  } catch (err) {
    console.error('[Tracking]', err);
    res.status(204).end();
  }
}

/**
 * POST /api/t/identify — link anonymous visitor to a known lead.
 * Called when the visitor provides their email (booking form, gate form, etc.)
 * Creates or finds the lead, links the visitor fingerprint, backfills sessions.
 */
export async function handleIdentify(req: Request, res: Response): Promise<void> {
  try {
    if (!env.enableVisitorTracking) {
      res.status(204).end();
      return;
    }

    const { fingerprint, email, name, company, phone, metadata } = req.body;

    if (!fingerprint || typeof fingerprint !== 'string') {
      res.status(400).json({ error: 'fingerprint is required' });
      return;
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'valid email is required' });
      return;
    }

    const { Lead, Visitor } = require('../models');
    const emailLower = email.trim().toLowerCase();

    // Find or create visitor by fingerprint
    const visitorId = await findOrCreateVisitor(fingerprint, {
      ip_address: (req.headers['x-forwarded-for'] as string || req.ip || '').split(',')[0].trim(),
      user_agent: req.headers['user-agent'] || '',
    });

    // Find or create lead by email
    const [lead, created] = await Lead.findOrCreate({
      where: { email: emailLower },
      defaults: {
        name: name || emailLower.split('@')[0],
        email: emailLower,
        company: company || null,
        phone: phone || null,
        source: 'advisory',
        lead_source_type: 'warm',
        lead_temperature: 'warm',
        pipeline_stage: 'new_lead',
        status: 'active',
      },
    });

    // Update lead with any new info provided
    const updates: Record<string, any> = {};
    if (name && !lead.name) updates.name = name;
    if (company && !lead.company) updates.company = company;
    if (phone && !lead.phone) updates.phone = phone;
    if (metadata) {
      if (metadata.title && !lead.title) updates.title = metadata.title;
      if (metadata.industry && !lead.industry) updates.industry = metadata.industry;
      if (metadata.idea_input) updates.idea_input = metadata.idea_input;
      if (metadata.maturity_score) updates.maturity_score = metadata.maturity_score;
      if (metadata.advisory_session_id) updates.advisory_session_id = metadata.advisory_session_id;
    }
    if (Object.keys(updates).length > 0) {
      await lead.update(updates);
    }

    // Link visitor to lead (backfills all sessions + page events)
    await resolveIdentity(visitorId, lead.id);

    // Backfill campaign attribution from visitor session
    try {
      const { VisitorSession } = require('../models');
      const latestSession = await VisitorSession.findOne({
        where: { visitor_id: visitorId },
        order: [['created_at', 'DESC']],
      });
      if (latestSession) {
        const utmUpdates: Record<string, any> = {};
        if ((latestSession as any).utm_source && !lead.utm_source) utmUpdates.utm_source = (latestSession as any).utm_source;
        if ((latestSession as any).utm_campaign && !lead.utm_campaign) utmUpdates.utm_campaign = (latestSession as any).utm_campaign;
        if ((latestSession as any).utm_medium && !lead.utm_medium) utmUpdates.utm_medium = (latestSession as any).utm_medium;
        if (Object.keys(utmUpdates).length > 0) {
          await lead.update(utmUpdates);
          console.log(`[Tracking] Backfilled UTM for lead ${lead.id}: ${JSON.stringify(utmUpdates)}`);
        }
      }
    } catch { /* non-blocking */ }

    console.log(`[Tracking] Identified visitor ${fingerprint.substring(0, 12)} as lead ${lead.id} (${lead.name}, ${emailLower})${created ? ' [NEW]' : ''}`);

    res.json({
      lead_id: lead.id,
      visitor_id: visitorId,
      created,
    });
  } catch (err: any) {
    console.error('[Tracking] Identify error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function handleHeartbeat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.enableVisitorTracking) {
      res.status(204).end();
      return;
    }

    const { session_id, visitor_id, time_on_page_seconds } = req.body;

    if (!session_id || typeof session_id !== 'string') {
      res.status(400).json({ error: 'session_id is required' });
      return;
    }
    if (!visitor_id || typeof visitor_id !== 'string') {
      res.status(400).json({ error: 'visitor_id is required' });
      return;
    }
    if (typeof time_on_page_seconds !== 'number' || time_on_page_seconds < 0) {
      res.status(400).json({ error: 'time_on_page_seconds must be a non-negative number' });
      return;
    }

    await updateHeartbeat(session_id, visitor_id, time_on_page_seconds);

    res.status(204).end();
  } catch (err) {
    console.error('[Tracking]', err);
    res.status(204).end();
  }
}
