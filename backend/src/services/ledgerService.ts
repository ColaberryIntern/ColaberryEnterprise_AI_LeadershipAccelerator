import EventLedger from '../models/EventLedger';
import { Op } from 'sequelize';

/**
 * The ecosystem context an event belongs to. `event_ledger` has carried these
 * two nullable columns since the multi-tenant DDL added them, and until Phase 4
 * (T401) nothing wrote them: every ledger row was platform-wide. A caller that
 * knows the tenant and brand passes them here; every existing caller passes
 * nothing and writes NULL, exactly as before.
 */
export interface LedgerScope {
  tenant_id?: string | null;
  brand_id?: string | null;
}

export async function logEvent(
  eventType: string,
  actor: string,
  entityType: string,
  entityId: string,
  payload?: any,
  scope?: LedgerScope
): Promise<void> {
  await EventLedger.create({
    event_type: eventType,
    actor,
    entity_type: entityType,
    entity_id: entityId,
    payload: payload || null,
    tenant_id: scope?.tenant_id ?? null,
    brand_id: scope?.brand_id ?? null,
  } as any);
}

interface ListEventsParams {
  eventType?: string;
  entityType?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function listEvents(params: ListEventsParams) {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const offset = (page - 1) * limit;

  const where: any = {};

  if (params.eventType) where.event_type = params.eventType;
  if (params.entityType) where.entity_type = params.entityType;
  if (params.actor) where.actor = { [Op.iLike]: `%${params.actor}%` };

  if (params.from || params.to) {
    where.created_at = {};
    if (params.from) where.created_at[Op.gte] = new Date(params.from);
    if (params.to) where.created_at[Op.lte] = new Date(params.to + 'T23:59:59.999Z');
  }

  const { rows: events, count: total } = await EventLedger.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });

  return { events, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getEventTypes(): Promise<string[]> {
  const results = await EventLedger.findAll({
    attributes: ['event_type'],
    group: ['event_type'],
    order: [['event_type', 'ASC']],
    raw: true,
  }) as any[];
  return results.map((r: any) => r.event_type);
}
