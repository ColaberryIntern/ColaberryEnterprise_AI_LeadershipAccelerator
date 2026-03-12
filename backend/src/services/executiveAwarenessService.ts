// ─── Executive Awareness Service ──────────────────────────────────────────────
// Single entry point for all executive-level events. Aggregates, clusters,
// enforces quiet hours & rate limits, and escalates through configured channels.
// Built ON TOP of the existing Alert system — no duplication.

import { Op } from 'sequelize';
import Alert from '../models/Alert';
import ExecutiveNotificationPolicy from '../models/ExecutiveNotificationPolicy';
import { emitAlert } from './alertService';
import { deliverAlert } from './alertDeliveryService';
import { logAiEvent } from './aiEventService';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExecutiveEventInput {
  category: string;        // revenue, enrollment, system, agent_fleet, lead, compliance, governance, campaign
  severity: 'info' | 'important' | 'high' | 'critical';
  title: string;
  description?: string;
  clusterKey?: string;     // optional override, defaults to category:title_slug
  entityType?: string;
  entityId?: string;
  impactArea?: string;
  sourceAgentId?: string;
  metadata?: Record<string, any>;
}

interface ClusterEntry {
  count: number;
  firstSeen: number;
  alertId: string;
}

// ─── In-Memory Cluster Map ──────────────────────────────────────────────────

const clusterMap = new Map<string, ClusterEntry>();

// Rate limit tracking: channel → timestamps of recent deliveries
const rateLimitMap = new Map<string, number[]>();

// Policy cache
let cachedPolicy: ExecutiveNotificationPolicy | null = null;
let policyCacheTime = 0;
const POLICY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
}

function severityToAlertType(severity: string): 'info' | 'warning' | 'critical' {
  switch (severity) {
    case 'info': return 'info';
    case 'important': return 'warning';
    case 'high': return 'warning';
    case 'critical': return 'critical';
    default: return 'info';
  }
}

function severityToNumeric(severity: string): number {
  switch (severity) {
    case 'info': return 1;
    case 'important': return 2;
    case 'high': return 4;
    case 'critical': return 5;
    default: return 1;
  }
}

function severityToUrgency(severity: string): 'low' | 'medium' | 'high' | 'immediate' {
  switch (severity) {
    case 'info': return 'low';
    case 'important': return 'medium';
    case 'high': return 'high';
    case 'critical': return 'immediate';
    default: return 'low';
  }
}

async function loadPolicy(): Promise<ExecutiveNotificationPolicy | null> {
  if (cachedPolicy && Date.now() - policyCacheTime < POLICY_CACHE_TTL) {
    return cachedPolicy;
  }
  try {
    cachedPolicy = await ExecutiveNotificationPolicy.findOne({ where: { scope: 'global' } });
    policyCacheTime = Date.now();
  } catch (err: any) {
    console.error('[ExecutiveAwareness] Failed to load policy:', err.message);
  }
  return cachedPolicy;
}

function isInQuietHours(policy: ExecutiveNotificationPolicy): boolean {
  try {
    // Get current time in the configured timezone
    const now = new Date();
    const tzTime = new Date(now.toLocaleString('en-US', { timeZone: policy.quiet_hours_timezone }));
    const currentMinutes = tzTime.getHours() * 60 + tzTime.getMinutes();

    const [startH, startM] = policy.quiet_hours_start.split(':').map(Number);
    const [endH, endM] = policy.quiet_hours_end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Handle overnight quiet hours (e.g. 22:00 - 07:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return false;
  }
}

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function checkRateLimit(channel: string, maxPerHour: number): boolean {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const timestamps = rateLimitMap.get(channel) || [];

  // Purge old entries
  const recent = timestamps.filter((t) => t > oneHourAgo);
  rateLimitMap.set(channel, recent);

  return recent.length < maxPerHour;
}

function recordDelivery(channel: string): void {
  const timestamps = rateLimitMap.get(channel) || [];
  timestamps.push(Date.now());
  rateLimitMap.set(channel, timestamps);
}

function purgeExpiredClusters(windowMs: number): void {
  const now = Date.now();
  for (const [key, entry] of clusterMap.entries()) {
    if (now - entry.firstSeen > windowMs) {
      clusterMap.delete(key);
    }
  }
}

// ─── Core: emitExecutiveEvent ───────────────────────────────────────────────

export async function emitExecutiveEvent(input: ExecutiveEventInput): Promise<Alert | null> {
  try {
    const policy = await loadPolicy();
    if (!policy || !policy.enabled) return null;

    const clusterKey = input.clusterKey || `exec:${input.category}:${slugify(input.title)}`;
    const windowMs = policy.cluster_window_minutes * 60 * 1000;

    // Purge expired clusters
    purgeExpiredClusters(windowMs);

    // Check cluster: if same key within window, increment count and skip
    const existing = clusterMap.get(clusterKey);
    if (existing && Date.now() - existing.firstSeen < windowMs) {
      existing.count++;
      // Update the existing alert's cluster count in metadata
      try {
        const existingAlert = await Alert.findByPk(existing.alertId);
        if (existingAlert) {
          const meta = (existingAlert as any).metadata || {};
          meta.cluster_count = existing.count;
          await existingAlert.update({ metadata: meta });
        }
      } catch { /* non-critical */ }
      return null; // Suppressed by clustering
    }

    // Map severity to alert fields
    const alertType = severityToAlertType(input.severity);
    const numericSeverity = severityToNumeric(input.severity);
    const urgency = severityToUrgency(input.severity);

    // Create alert via existing system
    const alert = await emitAlert({
      type: alertType,
      severity: numericSeverity,
      title: input.title,
      description: input.description,
      sourceAgentId: input.sourceAgentId || null,
      sourceType: 'system',
      impactArea: input.impactArea || input.category,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
      urgency,
      metadata: {
        ...input.metadata,
        executive_awareness: true,
        executive_category: input.category,
        executive_severity: input.severity,
        cluster_key: clusterKey,
        cluster_count: 1,
      },
    });

    // Track in cluster map
    clusterMap.set(clusterKey, { count: 1, firstSeen: Date.now(), alertId: alert.id });

    // Determine channels from policy
    const channelMap = policy.severity_channel_map || {};
    const channels: string[] = channelMap[input.severity] || ['dashboard'];

    // Filter channels based on quiet hours, weekend, rate limits
    const quiet = isInQuietHours(policy);
    const weekend = isWeekend();
    const weekendSilent = weekend && policy.weekend_policy === 'silent';

    const deliverableChannels = channels.filter((ch) => {
      // Dashboard always delivers
      if (ch === 'dashboard') return true;

      // Critical events bypass quiet hours for SMS and voice
      if (input.severity === 'critical') {
        // Even critical respects rate limits
        const limit = (policy.rate_limits || {})[ch];
        if (limit && !checkRateLimit(ch, limit.max_per_hour)) {
          console.log(`[ExecutiveAwareness] Rate limit reached for ${ch}. Skipping.`);
          return false;
        }
        return !weekendSilent; // Only weekend silent blocks critical
      }

      // Non-critical: respect quiet hours and weekend policy
      if (quiet || weekendSilent) return false;
      if (weekend && policy.weekend_policy === 'quiet_hours_only' && quiet) return false;

      // Check rate limits
      const limit = (policy.rate_limits || {})[ch];
      if (limit && !checkRateLimit(ch, limit.max_per_hour)) {
        console.log(`[ExecutiveAwareness] Rate limit reached for ${ch}. Skipping.`);
        return false;
      }

      return true;
    });

    // Deliver through filtered channels (skip dashboard — implicit)
    const nonDashboard = deliverableChannels.filter((ch) => ch !== 'dashboard');
    if (nonDashboard.length > 0) {
      deliverAlert(alert, nonDashboard).catch((err: any) => {
        console.error('[ExecutiveAwareness] Delivery error:', err.message);
      });
      // Record rate limit usage
      for (const ch of nonDashboard) {
        recordDelivery(ch);
      }
    }

    // Audit log
    logAiEvent('executive_awareness', 'executive_event_emitted', input.category, alert.id, {
      severity: input.severity,
      title: input.title,
      channels: deliverableChannels,
      clustered: false,
      quiet_hours_active: quiet,
    }).catch(() => {});

    return alert;
  } catch (err: any) {
    console.error('[ExecutiveAwareness] emitExecutiveEvent error:', err.message);
    return null;
  }
}

// ─── Query Helpers ──────────────────────────────────────────────────────────

export async function getExecutiveEvents(filters: {
  severity?: string;
  category?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ events: Alert[]; total: number }> {
  const where: Record<string, any> = {
    metadata: { executive_awareness: true },
  };

  // Use Sequelize JSONB query for metadata fields
  const conditions: any[] = [
    { 'metadata.executive_awareness': true },
  ];

  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.severity) {
    where.severity = { [Op.gte]: severityToNumeric(filters.severity) };
  }

  // Build where clause with JSONB conditions
  const finalWhere: any = {
    ...where,
    [Op.and]: conditions,
  };

  // Remove the metadata key used for typing — we use Op.and for JSONB
  delete finalWhere.metadata;

  const { rows: events, count: total } = await Alert.findAndCountAll({
    where: finalWhere,
    order: [['severity', 'DESC'], ['created_at', 'DESC']],
    limit: filters.limit || 50,
    offset: filters.offset || 0,
  });

  return { events, total };
}

export async function getUnreadBadge(): Promise<{ count: number; maxSeverity: string }> {
  const events = await Alert.findAll({
    where: {
      status: { [Op.in]: ['new'] },
      [Op.and]: [{ 'metadata.executive_awareness': true }],
    },
    attributes: ['severity'],
  });

  if (events.length === 0) {
    return { count: 0, maxSeverity: 'none' };
  }

  const maxSev = Math.max(...events.map((e: any) => e.severity || 0));
  const severityLabel =
    maxSev >= 5 ? 'critical' :
    maxSev >= 4 ? 'high' :
    maxSev >= 2 ? 'important' : 'info';

  return { count: events.length, maxSeverity: severityLabel };
}

export async function acknowledgeExecutiveEvent(
  alertId: string,
  adminId: string,
): Promise<Alert | null> {
  const { acknowledgeAlert } = await import('./alertService');
  return acknowledgeAlert(alertId, 'human', adminId);
}

export async function acknowledgeAllExecutiveEvents(adminId: string): Promise<number> {
  const { acknowledgeAlert } = await import('./alertService');
  const unread = await Alert.findAll({
    where: {
      status: 'new',
      [Op.and]: [{ 'metadata.executive_awareness': true }],
    },
  });

  let count = 0;
  for (const alert of unread) {
    await acknowledgeAlert(alert.id, 'human', adminId).catch(() => {});
    count++;
  }
  return count;
}

// ─── Policy Management ──────────────────────────────────────────────────────

export async function getPolicy(): Promise<ExecutiveNotificationPolicy | null> {
  return ExecutiveNotificationPolicy.findOne({ where: { scope: 'global' } });
}

export async function updatePolicy(
  updates: Partial<ExecutiveNotificationPolicyAttributes>,
  updatedBy: string,
): Promise<ExecutiveNotificationPolicy | null> {
  const policy = await ExecutiveNotificationPolicy.findOne({ where: { scope: 'global' } });
  if (!policy) return null;

  const allowedFields = [
    'quiet_hours_start', 'quiet_hours_end', 'quiet_hours_timezone',
    'weekend_policy', 'severity_channel_map', 'rate_limits',
    'cluster_window_minutes', 'digest_morning_cron', 'digest_evening_cron',
    'digest_enabled', 'acknowledgment_suppresses', 'severity_rules', 'enabled',
  ];

  const filtered: Record<string, any> = {};
  for (const key of allowedFields) {
    if (key in updates) {
      filtered[key] = (updates as any)[key];
    }
  }

  filtered.updated_by = updatedBy;
  filtered.updated_at = new Date();

  await policy.update(filtered);

  // Invalidate cache
  cachedPolicy = null;
  policyCacheTime = 0;

  // Audit log
  logAiEvent('executive_awareness', 'policy_updated', 'executive_notification_policy', policy.id, {
    updated_by: updatedBy,
    fields_changed: Object.keys(filtered),
  }).catch(() => {});

  return policy;
}

type ExecutiveNotificationPolicyAttributes = InstanceType<typeof ExecutiveNotificationPolicy>;

export function invalidatePolicyCache(): void {
  cachedPolicy = null;
  policyCacheTime = 0;
}
