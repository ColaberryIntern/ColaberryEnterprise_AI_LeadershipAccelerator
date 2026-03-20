import { Op } from 'sequelize';
import { Visitor, VisitorSession, PageEvent, Lead, Activity, EventLedger } from '../models';
import { env } from '../config/env';

/**
 * Maps a URL path to a known page category.
 * Strips query parameters and trailing slashes before matching.
 */
export function categorizePagePath(path: string): string {
  // Strip query parameters
  let cleaned = path.split('?')[0];
  // Strip trailing slashes (but keep leading slash)
  cleaned = cleaned.replace(/\/+$/, '') || '/';

  const categoryMap: Record<string, string> = {
    '/': 'homepage',
    '': 'homepage',
    '/pricing': 'pricing',
    '/program': 'program',
    '/case-studies': 'case_studies',
    '/contact': 'contact',
    '/enroll': 'enroll',
    '/enroll/success': 'enroll',
    '/enroll/cancel': 'enroll',
    '/advisory': 'advisory',
    '/sponsorship': 'sponsorship',
    '/strategy-call-prep': 'strategy_call_prep',
    '/executive-overview': 'executive_overview',
    '/executive-overview/thank-you': 'executive_overview',
    '/executive-roi-calculator': 'roi_calculator',
    '/champion': 'champion',
    '/alumni-ai-champion': 'alumni',
    '/ai-architect': 'ai_architect',
    '/ai-architect/instructor': 'ai_architect',
    '/about': 'homepage',
    '/referrals/login': 'referrals',
  };

  // Prefix-based matching
  if (cleaned.startsWith('/referrals')) return 'referrals';
  if (cleaned.startsWith('/portal')) return 'portal';
  if (cleaned.startsWith('/admin')) return 'admin';

  return categoryMap[cleaned] || 'other';
}

/**
 * Find or create a visitor by browser fingerprint.
 * On create: sets first_seen_at and last_seen_at.
 * On find: updates last_seen_at and optional fields if provided.
 * Returns the visitor id.
 */
export async function findOrCreateVisitor(
  fingerprint: string,
  data: {
    ip_address?: string;
    user_agent?: string;
    device_type?: string;
    browser?: string;
    os?: string;
    utm_source?: string;
    utm_campaign?: string;
    utm_medium?: string;
    referrer_domain?: string;
    campaign_id?: string;
  }
): Promise<string> {
  const now = new Date();

  const [visitor, created] = await Visitor.findOrCreate({
    where: { fingerprint },
    defaults: {
      fingerprint,
      first_seen_at: now,
      last_seen_at: now,
      total_sessions: 0,
      total_pageviews: 0,
      ip_address: data.ip_address || null,
      user_agent: data.user_agent || null,
      device_type: data.device_type || null,
      browser: data.browser || null,
      os: data.os || null,
      utm_source: data.utm_source || null,
      utm_campaign: data.utm_campaign || null,
      utm_medium: data.utm_medium || null,
      referrer_domain: data.referrer_domain || null,
      campaign_id: data.campaign_id || null,
    } as any,
  });

  if (!created) {
    const updates: Record<string, any> = { last_seen_at: now };
    if (data.ip_address) updates.ip_address = data.ip_address;
    if (data.user_agent) updates.user_agent = data.user_agent;
    // First-touch attribution: only set campaign_id if not already set
    if (data.campaign_id && !visitor.campaign_id) {
      updates.campaign_id = data.campaign_id;
    }
    await visitor.update(updates);
  }

  return visitor.id;
}

/**
 * Get or create a session for a visitor.
 * Looks at the most recent PageEvent for this visitor. If its timestamp
 * is within the configured session timeout, returns that event's session_id.
 * Otherwise creates a new session and increments visitor.total_sessions.
 * Returns the session id.
 */
export async function getOrCreateSession(
  visitorId: string,
  data: {
    page_url: string;
    referrer_url?: string;
    utm_source?: string;
    utm_campaign?: string;
    utm_medium?: string;
    ip_address?: string;
    device_type?: string;
  }
): Promise<string> {
  const timeoutMs = env.visitorSessionTimeoutMinutes * 60 * 1000;
  const now = new Date();
  const cutoff = new Date(now.getTime() - timeoutMs);

  // Find the most recent page event for this visitor
  const lastEvent = await PageEvent.findOne({
    where: { visitor_id: visitorId },
    order: [['timestamp', 'DESC']],
  });

  // If a recent event exists within the timeout window, reuse its session
  if (lastEvent && lastEvent.timestamp >= cutoff) {
    return lastEvent.session_id;
  }

  // Parse the page path from the URL for entry_page and landing_page_category
  let pagePath: string;
  try {
    const urlObj = new URL(data.page_url);
    pagePath = urlObj.pathname;
  } catch {
    pagePath = data.page_url.split('?')[0] || '/';
  }

  const landingCategory = categorizePagePath(pagePath);

  // Create a new session
  const session = await VisitorSession.create({
    visitor_id: visitorId,
    started_at: now,
    duration_seconds: 0,
    pageview_count: 0,
    event_count: 0,
    entry_page: pagePath,
    exit_page: pagePath,
    referrer_url: data.referrer_url || null,
    utm_source: data.utm_source || null,
    utm_campaign: data.utm_campaign || null,
    utm_medium: data.utm_medium || null,
    ip_address: data.ip_address || null,
    device_type: data.device_type || null,
    is_bounce: true,
    landing_page_category: landingCategory,
  } as any);

  // Increment visitor total_sessions
  await Visitor.increment('total_sessions', { where: { id: visitorId } });

  return session.id;
}

/**
 * Record a page event (pageview, click, form_submit, etc.).
 * Updates session aggregates (event_count, pageview_count, exit_page,
 * is_bounce, duration_seconds) and visitor.last_seen_at / total_pageviews.
 */
export async function recordPageEvent(params: {
  session_id: string;
  visitor_id: string;
  event_type: string;
  page_url: string;
  page_path: string;
  page_title?: string;
  page_category?: string;
  event_data?: Record<string, any>;
  timestamp: Date;
}): Promise<void> {
  // Insert the page event
  await PageEvent.create({
    session_id: params.session_id,
    visitor_id: params.visitor_id,
    event_type: params.event_type,
    page_url: params.page_url,
    page_path: params.page_path,
    page_title: params.page_title || null,
    page_category: params.page_category || null,
    event_data: params.event_data || null,
    timestamp: params.timestamp,
  } as any);

  // Fetch the session to update aggregates
  const session = await VisitorSession.findByPk(params.session_id);
  if (!session) return;

  const updates: Record<string, any> = {
    event_count: session.event_count + 1,
    exit_page: params.page_path,
  };

  if (params.event_type === 'pageview') {
    const newPageviewCount = session.pageview_count + 1;
    updates.pageview_count = newPageviewCount;
    updates.is_bounce = newPageviewCount <= 1;

    // Increment visitor total_pageviews
    await Visitor.increment('total_pageviews', {
      where: { id: params.visitor_id },
    });
  } else {
    // Non-pageview events also affect bounce: any interaction means not a bounce
    // But per spec, bounce is based on pageview_count only
    updates.is_bounce = session.pageview_count <= 1;
  }

  // Update session duration from started_at to now
  const startedAt = new Date(session.started_at).getTime();
  const nowMs = params.timestamp.getTime();
  updates.duration_seconds = Math.max(0, Math.round((nowMs - startedAt) / 1000));

  await session.update(updates);

  // Update visitor last_seen_at
  await Visitor.update(
    { last_seen_at: params.timestamp },
    { where: { id: params.visitor_id } }
  );
}

/**
 * Link a visitor to a lead (identity resolution).
 * Sets visitor.lead_id, lead.visitor_id, backfills sessions,
 * logs an Activity, and writes to EventLedger.
 */
export async function resolveIdentity(
  visitorId: string,
  leadId: number
): Promise<void> {
  const visitor = await Visitor.findByPk(visitorId);
  if (!visitor) return;

  // Link visitor to lead
  await visitor.update({ lead_id: leadId });

  // Link lead to visitor
  await Lead.update(
    { visitor_id: visitorId },
    { where: { id: leadId } }
  );

  // Backfill sessions: set lead_id where it is currently null
  await VisitorSession.update(
    { lead_id: leadId } as any,
    {
      where: {
        visitor_id: visitorId,
        lead_id: { [Op.is]: null as any },
      },
    }
  );

  // Log activity on the lead
  await Activity.create({
    lead_id: leadId,
    type: 'system',
    subject: 'Website visitor identified',
    metadata: {
      visitor_id: visitorId,
      total_sessions: visitor.total_sessions,
      total_pageviews: visitor.total_pageviews,
    },
  } as any);

  // Write to EventLedger
  await EventLedger.create({
    event_type: 'visitor.identity_resolved',
    actor: 'system',
    entity_type: 'visitor',
    entity_id: visitorId,
    payload: {
      lead_id: leadId,
      fingerprint: visitor.fingerprint,
    },
  } as any);
}

/**
 * Update session duration and visitor last_seen_at from a client heartbeat.
 * Called every ~60s while a page is open.
 */
export async function updateHeartbeat(
  sessionId: string,
  visitorId: string,
  timeOnPageSeconds: number
): Promise<void> {
  const now = new Date();

  // Update session duration
  const session = await VisitorSession.findByPk(sessionId);
  if (session) {
    const startedAt = new Date(session.started_at).getTime();
    const durationFromStart = Math.max(0, Math.round((now.getTime() - startedAt) / 1000));
    // Use whichever is larger: computed duration from start or the reported time_on_page
    const newDuration = Math.max(durationFromStart, timeOnPageSeconds);
    await session.update({ duration_seconds: newDuration });
  }

  // Update visitor last_seen_at
  await Visitor.update(
    { last_seen_at: now },
    { where: { id: visitorId } }
  );
}
