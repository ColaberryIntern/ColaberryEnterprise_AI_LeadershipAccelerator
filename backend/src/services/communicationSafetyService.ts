/**
 * Communication Safety Service
 *
 * Centralized chokepoint for ALL outbound communication.
 * Enforces: test mode (fail-closed), unsubscribe checks, rate limiting, campaign status.
 *
 * Accepts a generic SendRequest — not coupled to ScheduledEmail model.
 */
import { Op } from 'sequelize';
import { Lead, Campaign, CommunicationLog, UnsubscribeEvent } from '../models';
import { getTestOverrides, getSetting } from './settingsService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SendChannel = 'email' | 'sms' | 'voice';
export type SendSource = 'scheduler' | 'simulator' | 'webhook_reply' | 'manual';

export interface SendRequest {
  leadId: number;
  campaignId?: string | null;
  channel: SendChannel;
  toEmail?: string;
  toPhone?: string;
  simulationId?: string | null;
  source?: SendSource;
}

export interface SendDecision {
  allowed: boolean;
  redirect: { email?: string; phone?: string } | null;
  testMode: boolean;
  blockedReason?: string;
  deliveryMode: 'live' | 'test_redirect' | 'blocked';
}

interface TestOverridesResult {
  enabled: boolean;
  email: string;
  phone: string;
  dbError: boolean;
}

// ---------------------------------------------------------------------------
// Test override cache (30-second TTL)
// ---------------------------------------------------------------------------

let cachedOverrides: TestOverridesResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000;

/**
 * Fail-closed wrapper around getTestOverrides().
 * If the settings DB is unreachable, assumes test mode is ON and blocks sends
 * rather than allowing real communications through.
 */
export async function getTestOverridesSafe(): Promise<TestOverridesResult> {
  const now = Date.now();
  if (cachedOverrides && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedOverrides;
  }

  try {
    const overrides = await getTestOverrides();
    cachedOverrides = { ...overrides, dbError: false };
    cacheTimestamp = now;
    return cachedOverrides;
  } catch (err: any) {
    console.error('[CommunicationSafety] Settings DB unavailable — fail CLOSED:', err.message);
    // Fail closed: assume test mode is on, block sends (no test addresses available)
    const fallback: TestOverridesResult = { enabled: true, email: '', phone: '', dbError: true };
    cachedOverrides = fallback;
    cacheTimestamp = now;
    return fallback;
  }
}

/** Clear the test override cache (for testing or after settings change). */
export function clearTestOverrideCache(): void {
  cachedOverrides = null;
  cacheTimestamp = 0;
}

// ---------------------------------------------------------------------------
// Safety checks
// ---------------------------------------------------------------------------

/**
 * Check if a lead is allowed to receive communications.
 * Returns sendable=false if lead is unsubscribed, DND, or bounced.
 */
export async function checkLeadSendable(
  leadId: number,
): Promise<{ sendable: boolean; reason?: string }> {
  try {
    const lead = await Lead.findByPk(leadId, {
      attributes: ['id', 'status', 'source'],
    });

    if (!lead) {
      return { sendable: false, reason: 'lead_not_found' };
    }

    const blockedStatuses = ['unsubscribed', 'dnd', 'bounced'];
    if (blockedStatuses.includes(lead.status)) {
      return { sendable: false, reason: `lead_${lead.status}` };
    }

    // Check for recent unsubscribe events (belt-and-suspenders with lead.status)
    const recentUnsub = await UnsubscribeEvent.findOne({
      where: { lead_id: leadId },
      order: [['created_at', 'DESC']],
    });
    if (recentUnsub) {
      return { sendable: false, reason: 'unsubscribe_event_exists' };
    }

    return { sendable: true };
  } catch (err: any) {
    console.error('[CommunicationSafety] Lead sendable check failed:', err.message);
    // Fail closed — if we can't verify, don't send
    return { sendable: false, reason: 'lead_check_failed' };
  }
}

/**
 * Check if a campaign is in a sendable state.
 * Passes through if no campaignId (e.g. webhook auto-replies with no campaign context).
 */
export async function checkCampaignSendable(
  campaignId?: string | null,
): Promise<{ sendable: boolean; reason?: string }> {
  if (!campaignId) return { sendable: true };

  try {
    const campaign = await Campaign.findByPk(campaignId, {
      attributes: ['id', 'status'],
    });

    if (!campaign) {
      return { sendable: false, reason: 'campaign_not_found' };
    }

    if (campaign.status !== 'active') {
      return { sendable: false, reason: `campaign_${campaign.status}` };
    }

    return { sendable: true };
  } catch (err: any) {
    console.error('[CommunicationSafety] Campaign sendable check failed:', err.message);
    return { sendable: false, reason: 'campaign_check_failed' };
  }
}

/**
 * Enforce a system-wide rate limit on outbound sends.
 * Reads max_sends_per_minute from system settings (default: 20).
 */
export async function enforceGlobalRateLimit(): Promise<{
  allowed: boolean;
  retryAfterMs?: number;
}> {
  try {
    const maxPerMinute = (await getSetting('max_sends_per_minute')) || 20;
    const oneMinuteAgo = new Date(Date.now() - 60_000);

    const recentSends = await CommunicationLog.count({
      where: {
        direction: 'outbound',
        status: 'sent',
        created_at: { [Op.gte]: oneMinuteAgo },
      },
    });

    if (recentSends >= maxPerMinute) {
      return { allowed: false, retryAfterMs: 60_000 };
    }

    return { allowed: true };
  } catch (err: any) {
    console.error('[CommunicationSafety] Rate limit check failed:', err.message);
    // Fail open for rate limiting — a DB error shouldn't block all sends
    return { allowed: true };
  }
}

/**
 * Resolve the final recipient addresses, applying test mode redirects.
 * Fail-closed: if test mode is on but no test address for the channel, BLOCK.
 */
export async function resolveRecipient(req: SendRequest): Promise<SendDecision> {
  const test = await getTestOverridesSafe();

  // DB error → fail closed
  if (test.dbError) {
    return {
      allowed: false,
      redirect: null,
      testMode: true,
      blockedReason: 'settings_db_unavailable',
      deliveryMode: 'blocked',
    };
  }

  // Test mode enabled → redirect or block
  if (test.enabled) {
    if (req.channel === 'email' && !test.email) {
      return {
        allowed: false,
        redirect: null,
        testMode: true,
        blockedReason: 'test_mode_no_test_email',
        deliveryMode: 'blocked',
      };
    }

    if ((req.channel === 'voice' || req.channel === 'sms') && !test.phone) {
      return {
        allowed: false,
        redirect: null,
        testMode: true,
        blockedReason: 'test_mode_no_test_phone',
        deliveryMode: 'blocked',
      };
    }

    return {
      allowed: true,
      redirect: { email: test.email || undefined, phone: test.phone || undefined },
      testMode: true,
      deliveryMode: 'test_redirect',
    };
  }

  // Production mode — no redirect
  return {
    allowed: true,
    redirect: null,
    testMode: false,
    deliveryMode: 'live',
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a send request should proceed.
 * Runs the full safety pipeline:
 *   1. Global rate limit
 *   2. Campaign sendable check
 *   3. Lead sendable check (skip for simulations)
 *   4. Test mode / recipient resolution
 */
export async function evaluateSend(req: SendRequest): Promise<SendDecision> {
  // 0. Global scheduler pause check
  try {
    const paused = await getSetting('scheduler_paused');
    if (paused === true || paused === 'true') {
      return {
        allowed: false,
        redirect: null,
        testMode: false,
        blockedReason: 'scheduler_paused',
        deliveryMode: 'blocked',
      };
    }
  } catch {
    // Fail open for pause check — if DB is down, other checks will catch it
  }

  // 1. Global rate limit
  const rateCheck = await enforceGlobalRateLimit();
  if (!rateCheck.allowed) {
    return {
      allowed: false,
      redirect: null,
      testMode: false,
      blockedReason: 'global_rate_limit_exceeded',
      deliveryMode: 'blocked',
    };
  }

  // 2. Campaign sendable check
  const campaignCheck = await checkCampaignSendable(req.campaignId);
  if (!campaignCheck.sendable) {
    return {
      allowed: false,
      redirect: null,
      testMode: false,
      blockedReason: campaignCheck.reason,
      deliveryMode: 'blocked',
    };
  }

  // 3. Lead sendable check — skip for simulation sends (test leads)
  if (!req.simulationId) {
    const leadCheck = await checkLeadSendable(req.leadId);
    if (!leadCheck.sendable) {
      return {
        allowed: false,
        redirect: null,
        testMode: false,
        blockedReason: leadCheck.reason,
        deliveryMode: 'blocked',
      };
    }
  }

  // 4. Test mode / recipient resolution
  return resolveRecipient(req);
}
