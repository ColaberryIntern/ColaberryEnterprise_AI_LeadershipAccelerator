import type { Transaction } from 'sequelize';
import CommsHubActivity, { type CommsHubEntityType } from '../../models/CommsHubActivity';

/**
 * The hub's activity trail (CH2.2 onward). Written in the same transaction as the change it
 * describes, so a rolled-back change never leaves an activity row claiming it happened.
 */
export interface Actor { id: string | null; label: string | null }
export const WORKER_ACTOR: Actor = { id: null, label: 'Scheduled sender' };

export async function logActivity(
  actor: Actor, action: string, entityType: CommsHubEntityType, entityId: string | null,
  detail: Record<string, unknown> = {}, transaction?: Transaction,
): Promise<void> {
  await CommsHubActivity.create(
    { actor_id: actor.id, actor_label: actor.label, action, entity_type: entityType, entity_id: entityId, detail },
    { transaction },
  );
}

export async function listActivity(limit = 100): Promise<CommsHubActivity[]> {
  return CommsHubActivity.findAll({ order: [['created_at', 'DESC']], limit: Math.min(Math.max(limit, 1), 500) });
}
