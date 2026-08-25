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
    // The canonical Case Study route is `/stories`; `/case-studies` is only a
    // redirect to it (frontend/src/routes/publicRoutes.tsx). Because the browser
    // reports the RESOLVED path, every real visit was tracked as `/stories`,
    // which matched nothing here and fell through to 'other' below - so the
    // `case_studies` category has never once been produced in production, and
    // the six consumers that branch on it were dead code. Both keys are kept:
    // a direct hit on the legacy URL, logged before the redirect resolves, must
    // categorise identically or the same visit changes category mid-session.
    '/stories': 'case_studies',
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
    // Vertical landing pages: commercial intent, treat as pricing for signal-strength purposes
    '/utility-iou': 'pricing',
    '/utility-ai': 'pricing',
    '/freight-ai': 'pricing',
    // Cohort and pilot offer pages
    '/aixcelerator': 'pricing',
    '/pilot-zero-risk': 'pricing',
    '/pilot-ai-team': 'pricing',
    '/pilot-exclusive': 'pricing',
  };

  // Prefix-based matching
  if (cleaned.startsWith('/referrals')) return 'referrals';
  if (cleaned.startsWith('/portal')) return 'portal';
  if (cleaned.startsWith('/admin')) return 'admin';
  // Case Study detail pages: `/stories/:slug`. The trailing slash in the prefix
  // is load-bearing - a bare `startsWith('/stories')` would also swallow any
  // future sibling route such as `/stories-of-x` or `/storiesboard`, silently
  // mislabelling an unrelated page as a Case Study view and inflating the
  // strength-20 `deep_scroll_case_study` lead signal. The index route itself is
  // matched by the exact `/stories` key in the map above.
  if (cleaned.startsWith('/stories/')) return 'case_studies';

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
    site_slug?: string;
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
      site_slug: data.site_slug || null,
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
    // First-touch site attribution: only set site_slug if not already set
    if (data.site_slug && !visitor.site_slug) {
      updates.site_slug = data.site_slug;
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
    site_slug?: string;
    // Multi-tenant ecosystem context, resolved server-side by the caller from
    // site_slug or hostname. All optional: an unregistered site still tracks, with
    // null context and an emitted metric. Tracking is fail-soft by design — see
    // tenantResolver.ts. NEVER accept these from a request body.
    tenant_id?: string | null;
    brand_id?: string | null;
    source_id?: string | null;
    entry_point_id?: string | null;
    campaign_id?: string | null;
    campaign_lead_id?: string | null;
    organization_id?: string | null;
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
    pagePath = (data.page_url || '/').split('?')[0] || '/';
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
    site_slug: data.site_slug || null,
    // The session is the container that answers "which brand was this browsing on?".
    // Visitors stay global because one browser legitimately moves between ecosystem
    // brands; the brand relationship belongs to the session, not the browser.
    tenant_id: data.tenant_id || null,
    brand_id: data.brand_id || null,
    source_id: data.source_id || null,
    entry_point_id: data.entry_point_id || null,
    campaign_id: data.campaign_id || null,
    campaign_lead_id: data.campaign_lead_id || null,
    organization_id: data.organization_id || null,
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
  // Multi-tenant ecosystem context. Denormalised onto the event rather than reached
  // through a join to the session because page_events is the highest-row-count table
  // in the database and the journey/analytics queries that need brand filtering are
  // exactly the ones that cannot afford the join. Optional and never trusted from a
  // request body; the caller resolves them server-side.
  tenant_id?: string | null;
  brand_id?: string | null;
  source_id?: string | null;
  entry_point_id?: string | null;
  campaign_id?: string | null;
  campaign_lead_id?: string | null;
  organization_id?: string | null;
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
    tenant_id: params.tenant_id || null,
    brand_id: params.brand_id || null,
    source_id: params.source_id || null,
    entry_point_id: params.entry_point_id || null,
    campaign_id: params.campaign_id || null,
    campaign_lead_id: params.campaign_lead_id || null,
    organization_id: params.organization_id || null,
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

  // Backfill page events the same way (D1). Without this, page_events.lead_id
  // would only ever be populated by the historical backfill script and would go
  // stale the moment a new visitor is identified — and contextGraphService's
  // booking-attempt query reads exactly this column.
  //
  // Guarded separately and swallowed on failure: identity resolution is the
  // caller's actual job, and it must still link the visitor, write the Activity
  // row, and emit the ledger event even if this analytics backfill fails. The
  // `lead_id IS NULL` predicate keeps it idempotent and stops an already-
  // attributed event from being reassigned to a different lead.
  try {
    await PageEvent.update(
      { lead_id: leadId } as any,
      {
        where: {
          visitor_id: visitorId,
          lead_id: { [Op.is]: null as any },
        },
      }
    );
  } catch (err: any) {
    console.warn(
      '[VisitorTracking] page_events lead_id backfill failed (non-fatal):',
      err?.message
    );
  }

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
