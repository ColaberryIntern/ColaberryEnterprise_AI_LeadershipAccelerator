import { Request, Response, NextFunction } from 'express';
import {
  findOrCreateVisitor,
  getOrCreateSession,
  recordPageEvent,
  categorizePagePath,
  updateHeartbeat,
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
