import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import CommsHubWhatsAppGroup from '../../../models/CommsHubWhatsAppGroup';
import { logActivity, type Actor } from '../activityLog';
import type { ProviderGroup, WhatsAppProvider } from './provider';
import { requireConnection, sameNumber, type Connection } from './whatsappConnection';

/**
 * CH10.2 WhatsApp groups: sync from the provider, list, and switch sending on or off per group (W3).
 *
 * - Every group starts NOT enabled; nothing is ever sent to a group nobody switched on.
 * - A group the number cannot post in (suspended, terminated, admins-only while we are not an admin,
 *   no longer listed, or refused by WhatsApp) is "Can't send here" and cannot be switched on.
 * - Sync reads every page BEFORE writing, then writes in one transaction under an advisory lock, so a
 *   provider failure mid-list changes nothing and two syncs at once cannot interleave. Running it
 *   twice gives the same rows (upsert by provider_group_id).
 */
export const SYNC_PAGE_SIZE = 100;
/** Bound on the page loop: 50 pages is 5,000 groups, far more than one number belongs to. */
export const SYNC_MAX_PAGES = 50;

export type CantSendReason = 'left' | 'suspended' | 'terminated' | 'admins_only' | 'not_a_member' | 'forbidden';
export const CANT_SEND_TEXT: Record<CantSendReason, string> = {
  left: 'The hub number is no longer in this group.',
  suspended: 'WhatsApp has suspended this group.',
  terminated: 'This group has been closed.',
  admins_only: 'Only admins can post here, and the hub number is not an admin.',
  not_a_member: 'The hub number is not listed as a member of this group.',
  forbidden: 'WhatsApp refused a message to this group.',
};

export interface WhatsAppGroupView {
  id: string;
  name: string;
  participants_count: number;
  enabled: boolean;
  sendable: boolean;
  cant_send_reason: string | null;
  last_synced_at: string;
}

export class GroupNotFoundError extends Error { constructor() { super('That WhatsApp group is not in the hub.'); this.name = 'NotFound'; } }
export class GroupNotSendableError extends Error {
  constructor(readonly reason: CantSendReason) { super(`This group cannot be switched on: ${CANT_SEND_TEXT[reason]}`); this.name = 'GroupNotSendable'; }
}

type GroupFacts = Pick<CommsHubWhatsAppGroup, 'left_at' | 'suspended' | 'terminated' | 'announcements' | 'our_rank' | 'cant_send_reason'>;

export function cantSendReason(g: GroupFacts): CantSendReason | null {
  if (g.left_at) return 'left';
  if (g.terminated) return 'terminated';
  if (g.suspended) return 'suspended';
  if (!g.our_rank) return 'not_a_member';
  if (g.announcements && g.our_rank !== 'admin' && g.our_rank !== 'creator') return 'admins_only';
  if (g.cant_send_reason === 'forbidden') return 'forbidden';
  return null;
}

export function toView(g: CommsHubWhatsAppGroup): WhatsAppGroupView {
  const reason = cantSendReason(g);
  return {
    id: g.id, name: g.name, participants_count: g.participants_count,
    enabled: g.enabled && reason === null, sendable: reason === null,
    cant_send_reason: reason ? CANT_SEND_TEXT[reason] : null, last_synced_at: g.last_synced_at.toISOString(),
  };
}

export function ourRank(group: ProviderGroup, number: string): string | null {
  return group.participants.find((p) => sameNumber(p.id, number))?.rank ?? null;
}

const GROUP_ID = /^[\d-]{10,31}@g\.us$/;

/** Every page first, nothing written yet. Groups with an id outside WhatsApp's group shape are dropped. */
export async function fetchAllGroups(provider: WhatsAppProvider): Promise<ProviderGroup[]> {
  const out: ProviderGroup[] = [];
  for (let page = 0; page < SYNC_MAX_PAGES; page += 1) {
    const { groups, total } = await provider.listGroups(SYNC_PAGE_SIZE, page * SYNC_PAGE_SIZE);
    out.push(...groups);
    if (groups.length === 0 || out.length >= total) break;
  }
  const seen = new Set<string>();
  return out.filter((g) => GROUP_ID.test(g.id) && !seen.has(g.id) && (seen.add(g.id), true));
}

export interface SyncResult { listed: number; added: number; left: number }

export async function syncWhatsAppGroups(actor: Actor, deps: { connection?: Connection } = {}): Promise<SyncResult> {
  const { provider, number } = deps.connection ?? await requireConnection();
  const groups = await fetchAllGroups(provider);
  return sequelize.transaction(async (t) => {
    await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('comms_hub:whatsapp_sync'))", { transaction: t });
    let added = 0;
    for (const g of groups) {
      // Fresh facts replace the old ones; enabled is never changed by a sync. A 'forbidden' mark is
      // cleared: the new facts are the truth, and a send that is refused again marks it again (CH10.4).
      const rows = await sequelize.query<{ inserted: boolean }>(
        `INSERT INTO comms_hub_whatsapp_groups
           (provider_group_id, name, participants_count, announcements, our_rank, suspended, terminated, last_synced_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now(), now())
         ON CONFLICT (provider_group_id) DO UPDATE SET
           name = EXCLUDED.name, participants_count = EXCLUDED.participants_count, announcements = EXCLUDED.announcements,
           our_rank = EXCLUDED.our_rank, suspended = EXCLUDED.suspended, terminated = EXCLUDED.terminated,
           left_at = NULL, cant_send_reason = NULL, last_synced_at = now(), updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
        { bind: [g.id, g.name.slice(0, 255), g.participants_count, g.announcements, ourRank(g, number), g.suspended, g.terminated], type: QueryTypes.SELECT, transaction: t },
      );
      if (rows[0]?.inserted) added += 1;
    }
    const left = await sequelize.query<{ id: string }>(
      `UPDATE comms_hub_whatsapp_groups SET left_at = now(), updated_at = now()
        WHERE left_at IS NULL AND NOT (provider_group_id = ANY($1::text[])) RETURNING id`,
      { bind: [groups.map((g) => g.id)], type: QueryTypes.SELECT, transaction: t },
    );
    const result = { listed: groups.length, added, left: left.length };
    await logActivity(actor, 'whatsapp.groups_synced', 'whatsapp_group', null, result, t);
    return result;
  });
}

export async function listWhatsAppGroups(): Promise<WhatsAppGroupView[]> {
  const rows = await CommsHubWhatsAppGroup.findAll({ order: [['name', 'ASC'], ['id', 'ASC']] });
  // Groups still listed first; a group the number left stays visible (its history points at it).
  return rows.map(toView).sort((a, b) => Number(a.cant_send_reason === CANT_SEND_TEXT.left) - Number(b.cant_send_reason === CANT_SEND_TEXT.left));
}

/** Switch sending to one group on or off. Same value twice is a no-op with no activity row. */
export async function setGroupEnabled(id: string, enabled: boolean, actor: Actor): Promise<WhatsAppGroupView> {
  return sequelize.transaction(async (t) => {
    const g = await CommsHubWhatsAppGroup.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!g) throw new GroupNotFoundError();
    const reason = cantSendReason(g);
    if (enabled && reason) throw new GroupNotSendableError(reason);
    if (g.enabled !== enabled) {
      await g.update({ enabled, updated_at: new Date() }, { transaction: t });
      await logActivity(actor, enabled ? 'whatsapp.group_enabled' : 'whatsapp.group_disabled', 'whatsapp_group', g.id, { name: g.name }, t);
    }
    return toView(g);
  });
}
