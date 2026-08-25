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
import { redactForLogs } from '../utils/piiRedaction';
import {
  resolvePublicContext,
  ResolvedTenantContext,
  ResolutionPath,
} from '../modules/tenancy/tenantResolver';
import {
  validateEventShape,
  validateFingerprint,
  validateTrackEvent,
} from './tracking/trackingEventValidation';

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

function extractReferrerDomain(referrerUrl?: string): string | undefined {
  if (!referrerUrl) return undefined;
  try {
    return new URL(referrerUrl).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Site slug normalization.
 *
 * Prefer the `site_slug` explicitly sent by the standalone tracker.js
 * (read from <script data-site="...">). Fall back to deriving from the
 * page URL hostname so events still get attributed when the snippet was
 * installed without data-site, or for traffic from the main React app.
 *
 * Map matches lead_sources.slug values; anything else returns `'unknown'`
 * so the row is still queryable.
 */
const HOST_TO_SITE_SLUG: Record<string, string> = {
  'enterprise.colaberry.ai': 'enterprise',
  'colaberry.ai': 'colaberry',
  'www.colaberry.ai': 'colaberry',
  'advisor.colaberry.ai': 'advisor',
  'trustbeforeintelligence.ai': 'trustbeforeintelligence',
  'www.trustbeforeintelligence.ai': 'trustbeforeintelligence',
  'worldoftaxonomy.com': 'worldoftaxonomy',
  'www.worldoftaxonomy.com': 'worldoftaxonomy',
};

function normalizeSiteSlug(raw: unknown, pageUrl?: string): string | undefined {
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toLowerCase();
    if (/^[a-z0-9-]{1,64}$/.test(trimmed)) return trimmed;
  }
  if (!pageUrl) return undefined;
  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    return HOST_TO_SITE_SLUG[host] || 'unknown';
  } catch {
    return undefined;
  }
}

/**
 * Resolve the ecosystem tenant/brand for an inbound tracking hit.
 *
 * SECURITY: resolution is driven ONLY by `site_slug` (which the server maps through
 * `lead_sources`) and by the hostname in the page URL (mapped through `brand_domains`).
 * A request body may never name its own tenant — if it could, any visitor could write
 * into any tenant's data by editing one field.
 *
 * FAIL-SOFT: an unresolved site yields null context and the event is still recorded.
 * A metric is emitted so unregistered sites and legacy-host-map usage are measurable
 * rather than invisible. Dropping the event instead would lose real traffic to fix a
 * bookkeeping problem.
 */
async function resolveTrackingContext(
  siteSlug: string | undefined,
  pageUrl: string | undefined,
): Promise<ResolvedTenantContext | null> {
  try {
    const { context, path } = await resolvePublicContext({
      sourceSlug: siteSlug,
      pageUrl,
    });
    if (!context) emitUnresolvedContext(siteSlug, pageUrl, path);
    return context;
  } catch (err) {
    // Resolution must never take the tracking endpoint down.
    emitUnresolvedContext(siteSlug, pageUrl, 'unresolved');
    return null;
  }
}

function emitUnresolvedContext(
  siteSlug: string | undefined,
  pageUrl: string | undefined,
  path: ResolutionPath,
): void {
  let hostname: string | null = null;
  try {
    hostname = pageUrl ? new URL(pageUrl).hostname : null;
  } catch {
    hostname = null;
  }
  console.warn(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'tenant_context_unresolved',
      outcome: 'partial',
      context: { site_slug: siteSlug ?? null, hostname, resolution_path: path },
    }),
  );
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
      site_slug: rawSiteSlug,
    } = req.body;

    const validationError = validateTrackEvent(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const referrer_domain = extractReferrerDomain(referrer_url);
    const site_slug = normalizeSiteSlug(rawSiteSlug, page_url);

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
      site_slug,
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

    // Server-resolved, never taken from the request body.
    const ecosystem = await resolveTrackingContext(site_slug, page_url);

    const sessionId = await getOrCreateSession(visitorId, {
      page_url,
      referrer_url,
      utm_source,
      utm_campaign,
      utm_medium,
      ip_address: req.ip,
      device_type,
      site_slug,
      tenant_id: ecosystem?.tenantId ?? null,
      brand_id: ecosystem?.brandId ?? null,
      source_id: ecosystem?.sourceId ?? null,
      campaign_id: campaign_id ?? null,
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
      tenant_id: ecosystem?.tenantId ?? null,
      brand_id: ecosystem?.brandId ?? null,
      source_id: ecosystem?.sourceId ?? null,
      campaign_id: campaign_id ?? null,
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
      site_slug: rawSiteSlug,
    } = req.body;

    const fingerprintError = validateFingerprint(fingerprint);
    if (fingerprintError) {
      res.status(400).json({ error: fingerprintError });
      return;
    }
    if (!Array.isArray(events) || events.length === 0 || events.length > 50) {
      res.status(400).json({ error: 'events must be an array with 1-50 items' });
      return;
    }

    // Endpoint parity (D-3). `/api/t/event` rejects an event this endpoint used
    // to accept without inspection, and the tracker chooses between the two by
    // buffer size - so the same event survived or died depending on timing. The
    // same per-event rules now run here.
    //
    // Rejection is per element, not per request, and deliberately so. A batch
    // holds up to 50 events from one page load; failing the whole request over
    // one bad element would discard up to 49 good ones and turn a validation
    // fix into data loss. The invariant that matters - and the one AC4 states -
    // is that an event's SURVIVAL cannot depend on which endpoint carried it.
    //
    // The one case where a batch is exactly equivalent to a single-event call is
    // a batch of one: there, rejecting the only element rejects the request, and
    // the status code and message are byte-identical to `/api/t/event`.
    const acceptedEvents: any[] = [];
    const rejections: string[] = [];
    for (const candidate of events) {
      const eventError =
        candidate && typeof candidate === 'object'
          ? validateEventShape(candidate)
          : 'event must be an object';
      if (eventError) rejections.push(eventError);
      else acceptedEvents.push(candidate);
    }
    if (acceptedEvents.length === 0) {
      res.status(400).json({ error: rejections[0] });
      return;
    }
    if (rejections.length > 0) {
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'backend',
          event: 'track_batch_events_rejected',
          outcome: 'partial',
          context: { rejected: rejections.length, accepted: acceptedEvents.length, first_error: rejections[0] },
        }),
      );
    }

    const referrer_domain = extractReferrerDomain(referrer_url);
    const firstPageUrl = acceptedEvents[0] && acceptedEvents[0].page_url;
    const site_slug = normalizeSiteSlug(rawSiteSlug, firstPageUrl);

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
      site_slug,
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

    const firstEvent = acceptedEvents[0];
    // Resolved once per batch, not per event: every event in a batch comes from the
    // same page load on the same site, so re-resolving would be pure overhead on the
    // highest-write path in the system.
    const ecosystem = await resolveTrackingContext(site_slug, firstEvent.page_url);

    const sessionId = await getOrCreateSession(visitorId, {
      page_url: firstEvent.page_url,
      referrer_url,
      utm_source,
      utm_campaign,
      utm_medium,
      ip_address: req.ip,
      device_type,
      site_slug,
      tenant_id: ecosystem?.tenantId ?? null,
      brand_id: ecosystem?.brandId ?? null,
      source_id: ecosystem?.sourceId ?? null,
      campaign_id: campaign_id ?? null,
    });

    let eventsRecorded = 0;
    for (const event of acceptedEvents) {
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
        tenant_id: ecosystem?.tenantId ?? null,
        brand_id: ecosystem?.brandId ?? null,
        source_id: ecosystem?.sourceId ?? null,
        campaign_id: campaign_id ?? null,
      });
      eventsRecorded++;
    }

    // Trigger real-time signal analysis if batch contains high-value events
    const hasHighValue = acceptedEvents.some((e: any) =>
      ['cta_click', 'form_start', 'form_submit'].includes(e.event_type)
    );
    if (hasHighValue) {
      triggerSignalAnalysis(sessionId, visitorId);
    }

    res.status(200).json({
      visitor_id: visitorId,
      session_id: sessionId,
      events_recorded: eventsRecorded,
      events_rejected: rejections.length,
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

    console.log(`[Tracking] Identified visitor ${fingerprint.substring(0, 12)} as lead ${lead.id} (${redactForLogs(lead.name)}, ${redactForLogs(emailLower)})${created ? ' [NEW]' : ''}`);

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
