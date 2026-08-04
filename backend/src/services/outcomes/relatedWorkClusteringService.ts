import { Op } from 'sequelize';
import { Ticket, TicketActionLink, WorkLedgerEvent } from '../../models';

// ProofDesk Outcomes & Learning — Milestone 5. Related-work clustering (spec 20.9):
// "Cluster tickets, incidents, events, and failed traces by shared resource, error
// fingerprint, intent, entity, or deployment." v1 implements two real, computable
// dimensions from data that actually exists today — entity sharing and shared ledger
// target resource — among currently-open tickets. Both return empty arrays when no
// repo data supports a cluster, which is the common/honest case, not a placeholder.
//
// Failure-First Design:
// 1. What happens if this fails? Read-only aggregation; a DB failure propagates.
// 2. Retry? None — stateless read.
// 3. Recovery if exhausted? N/A — no write side effect.
// 4. Explicit failure modes handled: no open tickets (returns empty clusters, no
//    crash); an open ticket with no linked ledger events (simply contributes nothing
//    to the resource-cluster dimension, doesn't error).

const OPEN_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review'];

export interface EntityCluster {
  entity_type: string;
  entity_id: string;
  ticket_ids: string[];
}

export interface ResourceCluster {
  target_id: string;
  ticket_ids: string[];
}

export interface RelatedWorkClusters {
  entity_clusters: EntityCluster[];
  resource_clusters: ResourceCluster[];
}

export async function computeRelatedWorkClusters(): Promise<RelatedWorkClusters> {
  const openTickets = await (Ticket as any).findAll({
    where: { status: { [Op.in]: OPEN_STATUSES } },
    attributes: ['id', 'entity_type', 'entity_id'],
  });

  // Dimension 1: shared (entity_type, entity_id), both non-null, across >=2 open tickets.
  const entityGroups = new Map<string, { entity_type: string; entity_id: string; ticket_ids: string[] }>();
  for (const t of openTickets as any[]) {
    if (!t.entity_type || !t.entity_id) continue;
    const key = `${t.entity_type}::${t.entity_id}`;
    if (!entityGroups.has(key)) {
      entityGroups.set(key, { entity_type: t.entity_type, entity_id: t.entity_id, ticket_ids: [] });
    }
    entityGroups.get(key)!.ticket_ids.push(t.id);
  }
  const entity_clusters: EntityCluster[] = Array.from(entityGroups.values()).filter((g) => g.ticket_ids.length >= 2);

  // Dimension 2: shared work_ledger_events.target_id, reached via ticket_action_links
  // (captures both primary and related links), across >=2 distinct open tickets.
  const openTicketIds = (openTickets as any[]).map((t) => t.id);
  let resource_clusters: ResourceCluster[] = [];
  if (openTicketIds.length > 0) {
    const links = await (TicketActionLink as any).findAll({
      where: { ticket_id: { [Op.in]: openTicketIds } },
      attributes: ['ticket_id', 'event_id'],
    });

    if (links.length > 0) {
      const eventIds = Array.from(new Set((links as any[]).map((l) => l.event_id)));
      const events = await (WorkLedgerEvent as any).findAll({
        where: { event_id: { [Op.in]: eventIds }, target_id: { [Op.ne]: null } },
        attributes: ['event_id', 'target_id'],
      });
      const targetByEventId = new Map<string, string>();
      for (const e of events as any[]) {
        if (e.target_id) targetByEventId.set(e.event_id, e.target_id);
      }

      const resourceGroups = new Map<string, Set<string>>();
      for (const link of links as any[]) {
        const targetId = targetByEventId.get(link.event_id);
        if (!targetId) continue;
        if (!resourceGroups.has(targetId)) resourceGroups.set(targetId, new Set());
        resourceGroups.get(targetId)!.add(link.ticket_id);
      }

      resource_clusters = Array.from(resourceGroups.entries())
        .filter(([, ticketIds]) => ticketIds.size >= 2)
        .map(([target_id, ticketIds]) => ({ target_id, ticket_ids: Array.from(ticketIds) }));
    }
  }

  return { entity_clusters, resource_clusters };
}
