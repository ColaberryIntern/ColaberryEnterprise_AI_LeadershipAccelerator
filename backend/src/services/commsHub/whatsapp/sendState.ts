import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { centralDateKey } from '../../centralDate';
import CommsHubWhatsAppGroup from '../../../models/CommsHubWhatsAppGroup';
import { BREAKER_MS } from './sendRules';

/**
 * CH10.4 WhatsApp's sending state on the hub's one settings row: the pacing gap, the Central day's
 * count, and the breaker. Every write is one atomic UPDATE (no read-modify-write race). These writes
 * are deliberately NOT in the delivery's transaction: a send that happened stays counted even if the
 * delivery's own transaction later rolls back, which can only make pacing more cautious, never less.
 */
export interface WhatsAppSendState {
  next_send_at: Date | null;
  day: string | null;
  count: number;
  breaker_until: Date | null;
  breaker_reason: string | null;
}

export interface SendStateStore {
  read(): Promise<WhatsAppSendState>;
  /** Count one send for today (Central) and set the earliest next send. Called BEFORE the send. */
  reserve(now: Date, nextAt: Date): Promise<void>;
  /** Open the breaker for 48 hours; returns its end. */
  openBreaker(now: Date, reason: string): Promise<Date>;
  /** Close the breaker early (a person chose to) and release the deliveries it held. Returns its old end (or null) and how many were released. */
  clearBreaker(): Promise<{ was: Date | null; released: number }>;
  /** True the first time `key` is claimed for an alert; false when it was already alerted. */
  claimAlert(key: string): Promise<boolean>;
  /** WhatsApp refused this group (403): it cannot be sent to and is switched off. */
  markForbidden(groupId: string): Promise<void>;
  /** The provider's id for a hub group, or null when the group is gone. */
  providerGroupId(groupId: string): Promise<string | null>;
  /** Provider message ids already recorded by OTHER deliveries (the CH7.1 rule). */
  recordedElsewhere(ids: string[], deliveryId: string): Promise<Set<string>>;
}

type Row = { whatsapp_next_send_at: Date | null; whatsapp_day: string | null; whatsapp_day_count: number; whatsapp_breaker_until: Date | null; whatsapp_breaker_reason: string | null };

export const sendStateStore: SendStateStore = {
  async read() {
    const rows = await sequelize.query<Row>(
      'SELECT whatsapp_next_send_at, whatsapp_day::text AS whatsapp_day, whatsapp_day_count, whatsapp_breaker_until, whatsapp_breaker_reason FROM comms_hub_settings WHERE id = 1',
      { type: QueryTypes.SELECT },
    );
    const r = rows[0];
    return {
      next_send_at: r?.whatsapp_next_send_at ? new Date(r.whatsapp_next_send_at) : null, day: r?.whatsapp_day ?? null, count: Number(r?.whatsapp_day_count ?? 0),
      breaker_until: r?.whatsapp_breaker_until ? new Date(r.whatsapp_breaker_until) : null, breaker_reason: r?.whatsapp_breaker_reason ?? null,
    };
  },
  async reserve(now, nextAt) {
    const today = centralDateKey(now.getTime());
    await sequelize.query(
      `UPDATE comms_hub_settings SET whatsapp_next_send_at = $1,
              whatsapp_day_count = CASE WHEN whatsapp_day = $2::date THEN whatsapp_day_count + 1 ELSE 1 END,
              whatsapp_day = $2::date
        WHERE id = 1`,
      { bind: [nextAt, today] },
    );
  },
  async openBreaker(now, reason) {
    const until = new Date(now.getTime() + BREAKER_MS);
    await sequelize.query('UPDATE comms_hub_settings SET whatsapp_breaker_until = $1, whatsapp_breaker_reason = $2 WHERE id = 1', { bind: [until, reason.slice(0, 64)] });
    return until;
  },
  async clearBreaker() {
    // One transaction: close the breaker AND release every WhatsApp delivery it was holding (their
    // next try was set to the breaker's end), so "Resume early" really resumes. Each is then claimed
    // one at a time under the normal pacing.
    return sequelize.transaction(async (t) => {
      const rows = await sequelize.query<{ was: Date | null }>(
        `UPDATE comms_hub_settings s SET whatsapp_breaker_until = NULL, whatsapp_breaker_reason = NULL
           FROM (SELECT whatsapp_breaker_until AS was FROM comms_hub_settings WHERE id = 1) old
          WHERE s.id = 1 RETURNING old.was`,
        { type: QueryTypes.SELECT, transaction: t },
      );
      const released = await sequelize.query<{ id: string }>(
        `UPDATE comms_hub_deliveries SET next_attempt_at = now(), updated_at = now()
          WHERE channel = 'whatsapp' AND status = 'pending' AND error LIKE 'held: whatsapp_paused_by_whatsapp%'
            AND next_attempt_at > now() RETURNING id`,
        { type: QueryTypes.SELECT, transaction: t },
      );
      return { was: rows[0]?.was ? new Date(rows[0].was) : null, released: released.length };
    });
  },
  async claimAlert(key) {
    const rows = await sequelize.query<{ id: number }>(
      'UPDATE comms_hub_settings SET whatsapp_breaker_alerted_for = $1 WHERE id = 1 AND whatsapp_breaker_alerted_for IS DISTINCT FROM $1 RETURNING id',
      { bind: [key.slice(0, 128)], type: QueryTypes.SELECT },
    );
    return rows.length > 0;
  },
  async markForbidden(groupId) {
    await CommsHubWhatsAppGroup.update({ cant_send_reason: 'forbidden', enabled: false, updated_at: new Date() }, { where: { id: groupId } });
  },
  async providerGroupId(groupId) {
    const g = await CommsHubWhatsAppGroup.findByPk(groupId, { attributes: ['provider_group_id'] });
    return g?.provider_group_id ?? null;
  },
  async recordedElsewhere(ids, deliveryId) {
    if (ids.length === 0) return new Set();
    const rows = await sequelize.query<{ provider_message_id: string }>(
      "SELECT provider_message_id FROM comms_hub_deliveries WHERE channel = 'whatsapp' AND provider_message_id = ANY($1::text[]) AND id <> $2",
      { bind: [ids, deliveryId], type: QueryTypes.SELECT },
    );
    return new Set(rows.map((r) => r.provider_message_id));
  },
};
