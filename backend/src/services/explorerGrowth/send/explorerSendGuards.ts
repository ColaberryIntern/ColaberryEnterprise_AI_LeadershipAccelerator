/**
 * OH1o: the moment an Explorer email leaves (Ali, 2026-11-18: "Explorer Growth: fix + send").
 *
 * An Explorer draft that passed every screen sits in Outbound approvals (maya_outbound_approvals).
 * A person approves it; approveOutbound -> mayaOutboundDelivery.deliverOutboundRow -> HERE, before
 * a single byte goes to the provider. Every guard is checked AGAIN at that moment, because hours or
 * days can pass between the draft and the click:
 *
 *   send_disabled        explorer_growth_send_enabled was switched off after it was queued
 *   not_current_draft    the draft was regenerated (superseded), rejected or already sent since
 *   kill_switch          system_kill_switch is on (unreadable counts as ON)
 *   not_sendable         checkLeadSendable: unsubscribed, do-not-contact, bounced, test lead
 *   open_house_hold      the person is in a live Open House countdown (the Open House goes first)
 *   within_24h           any outbound touch to them in the last 24 hours, or a countdown touch
 *                        within 24 hours either side (Ali: "we can't contact the same person within 24 hours")
 *   cadence              another Explorer email was SENT to them within the brain cadence (72 h default)
 *
 * Any unreadable answer blocks: an unknown is not permission to send. A blocked approval is recorded
 * on the queue row as failed with the reason, and nothing is sent.
 *
 * After a send, the draft row becomes `sent`, its decision `executed`, and the email is logged on the
 * lead (communication log + activity) so the one memory, the 24-hour rule and the governor see it.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

export const EXPLORER_COMPOSER_PREFIX = 'explorer_growth:';
export const EXPLORER_SEND_SETTING = 'explorer_growth_send_enabled';

export type ExplorerSendBlock =
  | 'send_disabled' | 'kill_switch' | 'not_sendable' | 'open_house_hold' | 'within_24h' | 'cadence' | 'bad_row'
  | 'not_current_draft';

export interface ExplorerRowRef {
  composed_by: string;
  recipient_ref: string;
  correlation_id: string;
}

export function isExplorerGrowthRow(row: Pick<ExplorerRowRef, 'composed_by'>): boolean {
  return String(row.composed_by || '').startsWith(EXPLORER_COMPOSER_PREFIX);
}

export function leadIdOf(row: Pick<ExplorerRowRef, 'recipient_ref'>): number | null {
  const n = Number(String(row.recipient_ref || '').replace(/^lead:/, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface ExplorerSendGuardDeps {
  sendEnabled: () => Promise<boolean>;
  killSwitchOn: () => Promise<boolean>;
  sendable: (leadId: number) => Promise<{ sendable: boolean; reason?: string }>;
  inCountdown: (leadId: number) => Promise<boolean>;
  /** Outbound touches in the last 24h, and countdown touches within 24h either side. */
  recentTouches: (leadId: number) => Promise<{ outbound24h: number; countdownNear: number }>;
  /** Hours since the last SENT Explorer email to this lead (excluding this draft), or null if none. */
  hoursSinceLastExplorerSend: (leadId: number, excludeScheduledEmailId: string) => Promise<number | null>;
  minHours: () => Promise<number>;
  /** The draft row is still the current, passing version (not regenerated, rejected or already sent). */
  draftCurrent: (scheduledEmailId: string) => Promise<boolean>;
}

const truthy = (v: unknown) => v === true || v === 'true';

function defaultDeps(): ExplorerSendGuardDeps {
  return {
    sendEnabled: async () => truthy(await (await import('../../settingsService')).getSetting(EXPLORER_SEND_SETTING)),
    killSwitchOn: async () => (await import('../governor/killSwitch')).governorKillSwitch(),
    sendable: async (leadId) => (await import('../../communicationSafetyService')).checkLeadSendable(leadId, 'email'),
    inCountdown: async (leadId) => (await import('../governor/openHouseHold')).isInOpenHouseCountdown(leadId),
    recentTouches: async (leadId) => {
      const [r] = await sequelize.query<{ o: string; c: string }>(
        `SELECT
           (SELECT COUNT(*) FROM communication_logs
             WHERE lead_id = :leadId AND direction = 'outbound' AND created_at > NOW() - INTERVAL '24 hours')::text AS o,
           (SELECT COUNT(*) FROM scheduled_emails
             WHERE lead_id = :leadId AND (metadata->>'event_countdown') = 'true'
               AND status IN ('pending', 'processing', 'sent')
               AND COALESCE(sent_at, scheduled_for) BETWEEN NOW() - INTERVAL '24 hours' AND NOW() + INTERVAL '24 hours')::text AS c`,
        { type: QueryTypes.SELECT, replacements: { leadId } },
      );
      return { outbound24h: Number(r?.o ?? 0), countdownNear: Number(r?.c ?? 0) };
    },
    hoursSinceLastExplorerSend: async (leadId, excludeId) => {
      const [r] = await sequelize.query<{ last: Date | null }>(
        `SELECT MAX(sent_at) AS last FROM scheduled_emails
          WHERE lead_id = :leadId AND status = 'sent' AND (metadata->'brain_pick') IS NOT NULL AND id::text <> :excludeId`,
        { type: QueryTypes.SELECT, replacements: { leadId, excludeId } },
      );
      return r?.last ? (Date.now() - new Date(r.last).getTime()) / 3_600_000 : null;
    },
    minHours: async () => (await (await import('../brainRules')).loadBrainRules()).rules.brainPickMinHours,
    draftCurrent: async (id) => {
      const [r] = await sequelize.query<{ status: string }>(
        `SELECT status FROM scheduled_emails WHERE id::text = :id LIMIT 1`,
        { type: QueryTypes.SELECT, replacements: { id } },
      );
      return r?.status === 'explorer_draft';
    },
  };
}

/** Why this Explorer email may not leave now, or null when every guard passes. Fails closed. */
export async function explorerSendBlock(
  row: ExplorerRowRef,
  deps: ExplorerSendGuardDeps = defaultDeps(),
): Promise<ExplorerSendBlock | null> {
  const leadId = leadIdOf(row);
  if (!leadId || !row.correlation_id) return 'bad_row';
  try {
    if (!(await deps.sendEnabled())) return 'send_disabled';
    if (await deps.killSwitchOn()) return 'kill_switch';
    if (!(await deps.draftCurrent(row.correlation_id))) return 'not_current_draft';
    const s = await deps.sendable(leadId);
    if (!s.sendable) return 'not_sendable';
    if (await deps.inCountdown(leadId)) return 'open_house_hold';
    const t = await deps.recentTouches(leadId);
    if (t.outbound24h > 0 || t.countdownNear > 0) return 'within_24h';
    const [hours, min] = await Promise.all([deps.hoursSinceLastExplorerSend(leadId, row.correlation_id), deps.minHours()]);
    if (hours !== null && hours < Math.max(24, min)) return 'cadence';
    return null;
  } catch (err: unknown) {
    // Which guard could not be read is logged; the answer is the strictest one.
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'explorer-growth', event: 'explorer_send_guard_unreadable',
      outcome: 'failure', error_class: err instanceof Error ? err.name : 'UnknownError', context: { lead_id: leadId },
    }));
    return 'kill_switch';
  }
}

/** The error a blocked approval throws: its name is what the queue row records as the failure reason. */
export class ExplorerSendBlockedError extends Error {
  constructor(public block: ExplorerSendBlock) {
    super(`Explorer email not sent: ${block}`);
    this.name = `ExplorerSendBlocked:${block}`;
  }
}

/**
 * After the provider accepted it: the draft row is `sent`, its decision `executed`, and the email is
 * on the lead's record. A failure here is logged and never turns a delivered email into a failed one.
 */
export async function recordExplorerSend(
  row: ExplorerRowRef & { id: string; recipient_address: string; subject: string | null; body: string; decided_by: string | null },
  providerMessageId: string | null,
): Promise<void> {
  const leadId = leadIdOf(row);
  try {
    await sequelize.query(
      `UPDATE scheduled_emails SET status = 'sent', sent_at = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('outbound_approval_id', CAST(:approvalId AS text), 'approved_by', CAST(:by AS text))
        WHERE id::text = :id AND status = 'explorer_draft'`,
      { replacements: { id: row.correlation_id, approvalId: row.id, by: row.decided_by ?? '' } },
    );
    await sequelize.query(
      `UPDATE explorer_journey_decisions SET executed = true WHERE scheduled_email_id::text = :id`,
      { replacements: { id: row.correlation_id } },
    );
    if (leadId) {
      const { logCommunication } = await import('../../communicationLogService');
      const { logActivity } = await import('../../activityService');
      await logCommunication({
        lead_id: leadId, channel: 'email', direction: 'outbound', delivery_mode: 'live', status: 'sent',
        to_address: row.recipient_address, from_address: null, subject: row.subject ?? null, body: row.body,
        provider: 'mandrill', provider_message_id: providerMessageId,
        metadata: { explorer_growth: true, outbound_approval_id: row.id, scheduled_email_id: row.correlation_id, decided_by: row.decided_by ?? null },
      });
      await logActivity({
        lead_id: leadId, type: 'email_sent', subject: `Maya (Explorer Growth): ${row.subject ?? ''}`.slice(0, 250),
        body: row.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2000),
        metadata: { channel: 'email', explorer_growth: true, outbound_approval_id: row.id, decided_by: row.decided_by ?? null },
      });
    }
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'explorer-growth', event: 'explorer_send_record_failed',
      outcome: 'failure', error_class: err instanceof Error ? err.name : 'UnknownError', context: { id: row.id },
    }));
  }
}
