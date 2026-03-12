// ─── Alert Intelligence Service ─────────────────────────────────────────────
// Core service for the Alert Intelligence Engine. Any agent, Cory, or system
// component can emit alerts. Alerts are matched against subscriptions and
// delivered via configured channels.

import { Op, fn, col, literal } from 'sequelize';
import Alert from '../models/Alert';
import AlertEvent from '../models/AlertEvent';
import AlertSubscription from '../models/AlertSubscription';
import AlertResolution from '../models/AlertResolution';
import { deliverAlert } from './alertDeliveryService';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AlertInput {
  type: 'info' | 'insight' | 'opportunity' | 'warning' | 'critical';
  severity: number;
  title: string;
  description?: string;
  sourceAgentId?: string | null;
  sourceType: 'agent' | 'cory' | 'coo' | 'system';
  impactArea?: string;
  departmentId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  confidence?: number | null;
  urgency?: 'low' | 'medium' | 'high' | 'immediate';
  metadata?: Record<string, any>;
}

export interface ResolutionInput {
  resolutionType: 'auto_resolved' | 'manual' | 'dismissed' | 'superseded';
  resolutionNotes?: string;
  actionsTaken?: Record<string, any>[];
  resolvedByType: 'human' | 'agent' | 'cory';
  resolvedById: string;
}

// ─── Emit Alert ─────────────────────────────────────────────────────────────

export async function emitAlert(data: AlertInput): Promise<Alert> {
  // Dedup: skip if same title + source_agent_id + type exists in last hour
  const recentDuplicate = await Alert.findOne({
    where: {
      title: data.title,
      source_agent_id: data.sourceAgentId || null,
      type: data.type,
      created_at: { [Op.gte]: new Date(Date.now() - 60 * 60 * 1000) },
      status: { [Op.notIn]: ['resolved', 'dismissed'] },
    },
  });

  if (recentDuplicate) {
    return recentDuplicate;
  }

  const alert = await Alert.create({
    type: data.type,
    severity: data.severity,
    title: data.title,
    description: data.description,
    source_agent_id: data.sourceAgentId || null,
    source_type: data.sourceType,
    impact_area: data.impactArea,
    department_id: data.departmentId || null,
    entity_type: data.entityType || null,
    entity_id: data.entityId || null,
    confidence: data.confidence ?? null,
    urgency: data.urgency || 'medium',
    status: 'new',
    metadata: data.metadata || {},
  });

  await AlertEvent.create({
    alert_id: alert.id,
    event_type: 'created',
    actor_type: data.sourceType,
    actor_id: data.sourceAgentId || 'system',
    details: { title: data.title, type: data.type, severity: data.severity },
  });

  // Match subscriptions and deliver
  try {
    const subscriptions = await matchSubscriptions(alert);
    for (const sub of subscriptions) {
      await deliverAlert(alert, sub.channels).catch(() => {});
    }
  } catch {
    // Delivery is non-critical
  }

  return alert;
}

// ─── Status Transitions ─────────────────────────────────────────────────────

export async function acknowledgeAlert(
  alertId: string,
  actorType: string,
  actorId: string,
): Promise<Alert | null> {
  const alert = await Alert.findByPk(alertId);
  if (!alert || alert.status === 'resolved' || alert.status === 'dismissed') return null;

  await alert.update({ status: 'acknowledged' });
  await AlertEvent.create({
    alert_id: alertId,
    event_type: 'acknowledged',
    actor_type: actorType,
    actor_id: actorId,
  });

  return alert;
}

export async function resolveAlert(
  alertId: string,
  resolution: ResolutionInput,
): Promise<Alert | null> {
  const alert = await Alert.findByPk(alertId);
  if (!alert || alert.status === 'resolved') return null;

  const timeToResolve = Date.now() - new Date(alert.created_at).getTime();

  await alert.update({
    status: 'resolved',
    resolved_by: resolution.resolvedById,
    resolved_at: new Date(),
  });

  await AlertResolution.create({
    alert_id: alertId,
    resolution_type: resolution.resolutionType,
    resolution_notes: resolution.resolutionNotes || null,
    actions_taken: resolution.actionsTaken || null,
    resolved_by_type: resolution.resolvedByType,
    resolved_by_id: resolution.resolvedById,
    time_to_resolve_ms: timeToResolve,
  });

  await AlertEvent.create({
    alert_id: alertId,
    event_type: 'resolved',
    actor_type: resolution.resolvedByType,
    actor_id: resolution.resolvedById,
    details: { resolution_type: resolution.resolutionType },
  });

  return alert;
}

export async function dismissAlert(
  alertId: string,
  reason: string,
  actorType: string,
  actorId: string,
): Promise<Alert | null> {
  const alert = await Alert.findByPk(alertId);
  if (!alert || alert.status === 'resolved' || alert.status === 'dismissed') return null;

  await alert.update({ status: 'dismissed' });

  await AlertResolution.create({
    alert_id: alertId,
    resolution_type: 'dismissed',
    resolution_notes: reason,
    resolved_by_type: actorType,
    resolved_by_id: actorId,
    time_to_resolve_ms: Date.now() - new Date(alert.created_at).getTime(),
  });

  await AlertEvent.create({
    alert_id: alertId,
    event_type: 'dismissed',
    actor_type: actorType,
    actor_id: actorId,
    details: { reason },
  });

  return alert;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getAlerts(filters: {
  status?: string;
  type?: string;
  severity?: number;
  department?: string;
  impactArea?: string;
  limit?: number;
  offset?: number;
}): Promise<{ alerts: Alert[]; total: number }> {
  const where: Record<string, any> = {};
  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.severity) where.severity = { [Op.gte]: filters.severity };
  if (filters.department) where.department_id = filters.department;
  if (filters.impactArea) where.impact_area = filters.impactArea;

  const { rows: alerts, count: total } = await Alert.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: filters.limit || 50,
    offset: filters.offset || 0,
  });

  return { alerts, total };
}

export async function getAlertById(alertId: string): Promise<{
  alert: Alert;
  events: AlertEvent[];
  resolution: AlertResolution | null;
} | null> {
  const alert = await Alert.findByPk(alertId);
  if (!alert) return null;

  const events = await AlertEvent.findAll({
    where: { alert_id: alertId },
    order: [['created_at', 'ASC']],
  });

  const resolution = await AlertResolution.findOne({
    where: { alert_id: alertId },
  });

  return { alert, events, resolution };
}

export async function getAlertStats(): Promise<{
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  last24h: number;
  openCount: number;
  criticalOpen: number;
}> {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [byType, bySeverity, byStatus, last24h, openCount, criticalOpen] = await Promise.all([
    Alert.findAll({
      attributes: ['type', [fn('COUNT', col('id')), 'count']],
      group: ['type'],
      raw: true,
    }),
    Alert.findAll({
      attributes: ['severity', [fn('COUNT', col('id')), 'count']],
      group: ['severity'],
      raw: true,
    }),
    Alert.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true,
    }),
    Alert.count({ where: { created_at: { [Op.gte]: cutoff24h } } }),
    Alert.count({ where: { status: { [Op.in]: ['new', 'acknowledged', 'investigating'] } } }),
    Alert.count({ where: { type: 'critical', status: { [Op.in]: ['new', 'acknowledged', 'investigating'] } } }),
  ]);

  const toMap = (rows: any[], key: string) => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r[key]] = parseInt(r.count, 10);
    return map;
  };

  return {
    byType: toMap(byType, 'type'),
    bySeverity: toMap(bySeverity, 'severity'),
    byStatus: toMap(byStatus, 'status'),
    last24h,
    openCount,
    criticalOpen,
  };
}

export async function getAlertTrends(period: '24h' | '7d' | '30d'): Promise<
  Array<{ date: string; info: number; insight: number; opportunity: number; warning: number; critical: number }>
> {
  const hours = period === '24h' ? 24 : period === '7d' ? 168 : 720;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const groupBy = period === '24h' ? 'hour' : 'day';

  const dateExpr = groupBy === 'hour'
    ? literal("to_char(created_at, 'YYYY-MM-DD HH24:00')")
    : literal("to_char(created_at, 'YYYY-MM-DD')");

  const rows: any[] = await Alert.findAll({
    attributes: [
      [dateExpr, 'date'],
      'type',
      [fn('COUNT', col('id')), 'count'],
    ],
    where: { created_at: { [Op.gte]: cutoff } },
    group: [dateExpr as any, 'type'],
    order: [[dateExpr as any, 'ASC']],
    raw: true,
  });

  // Pivot rows into date → type counts
  const dateMap: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!dateMap[r.date]) dateMap[r.date] = { info: 0, insight: 0, opportunity: 0, warning: 0, critical: 0 };
    dateMap[r.date][r.type] = parseInt(r.count, 10);
  }

  return Object.entries(dateMap).map(([date, counts]) => ({ date, info: 0, insight: 0, opportunity: 0, warning: 0, critical: 0, ...counts }));
}

export async function getTopAlerts(limit = 5): Promise<Alert[]> {
  return Alert.findAll({
    where: {
      status: { [Op.in]: ['new', 'acknowledged', 'investigating'] },
      type: { [Op.in]: ['warning', 'critical'] },
    },
    order: [['severity', 'DESC'], ['created_at', 'DESC']],
    limit,
  });
}

export async function getTopOpportunities(limit = 5): Promise<Alert[]> {
  return Alert.findAll({
    where: {
      status: { [Op.in]: ['new', 'acknowledged'] },
      type: 'opportunity',
    },
    order: [['confidence', 'DESC'], ['created_at', 'DESC']],
    limit,
  });
}

export async function getActiveAlertsByDepartment(): Promise<Record<string, number>> {
  const rows: any[] = await Alert.findAll({
    attributes: ['department_id', [fn('COUNT', col('id')), 'count']],
    where: { status: { [Op.in]: ['new', 'acknowledged', 'investigating'] } },
    group: ['department_id'],
    raw: true,
  });

  const map: Record<string, number> = {};
  for (const r of rows) {
    map[r.department_id || 'unassigned'] = parseInt(r.count, 10);
  }
  return map;
}

// ─── Subscriptions ──────────────────────────────────────────────────────────

async function matchSubscriptions(alert: Alert): Promise<AlertSubscription[]> {
  const subs = await AlertSubscription.findAll({ where: { enabled: true } });

  return subs.filter((sub) => {
    if (sub.alert_type !== '*' && sub.alert_type !== alert.type) return false;
    if (sub.impact_area !== '*' && sub.impact_area !== alert.impact_area) return false;
    if (alert.severity < sub.min_severity) return false;
    return true;
  });
}

export async function getSubscriptions(): Promise<AlertSubscription[]> {
  return AlertSubscription.findAll({ order: [['created_at', 'DESC']] });
}

export async function upsertSubscription(data: {
  id?: string;
  alertType: string;
  impactArea: string;
  minSeverity: number;
  channels: string[];
  enabled: boolean;
}): Promise<AlertSubscription> {
  if (data.id) {
    const sub = await AlertSubscription.findByPk(data.id);
    if (sub) {
      await sub.update({
        alert_type: data.alertType,
        impact_area: data.impactArea,
        min_severity: data.minSeverity,
        channels: data.channels,
        enabled: data.enabled,
      });
      return sub;
    }
  }

  return AlertSubscription.create({
    alert_type: data.alertType,
    impact_area: data.impactArea,
    min_severity: data.minSeverity,
    channels: data.channels,
    enabled: data.enabled,
  });
}

export async function deleteSubscription(id: string): Promise<boolean> {
  const deleted = await AlertSubscription.destroy({ where: { id } });
  return deleted > 0;
}
