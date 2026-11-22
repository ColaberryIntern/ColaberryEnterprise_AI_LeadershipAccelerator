/**
 * OH1w (Ali, 2026-11-21): campaign membership has rules.
 *
 *   "You can only be in one campaign at a time and once the campaign is over, you must be
 *    removed because Explorer Growth only reaches out to people that aren't in campaigns ...
 *    people that aren't active or have completed a campaign are either moved or removed.
 *    That should be a setting in our campaigns."
 *
 * So:
 *   - A person is IN A CAMPAIGN when they have an enrolled/active campaign_leads row in a
 *     campaign that is running (status 'active', not archived). RUNNING_MEMBERSHIP_SQL.
 *   - Joining a campaign while in another running one is refused, unless it is a MOVE
 *     (supersede), which ends the old membership first (enrollLeadsInCampaign calls
 *     admitToCampaign).
 *   - Every campaign has a "when someone finishes" setting, settings.on_complete:
 *       { action: 'remove' }                                   the default
 *       { action: 'move', move_to_campaign_key: '<key>' }      or move_to_campaign_id
 *   - The hourly exit sweep (sweepFinishedMembers) finds members with nothing left to send
 *     and finishes them (status 'completed'), then applies on_complete.
 *
 * Failure modes: an unreadable membership answer REFUSES the join (fail closed: one campaign
 * at a time is the rule); a failed move is logged and the person is still finished (removed),
 * so nobody is left stuck in a finished campaign. Every write is idempotent: finishing an
 * already-finished member changes nothing.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

type Log = (event: string, context?: Record<string, unknown>) => void;
const defaultLog: Log = (event, context = {}) => {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'campaign-membership', event, ...context })}\n`);
};

export type OnCompleteAction = 'remove' | 'move';
export interface OnCompleteSetting {
  action: OnCompleteAction;
  move_to_campaign_key?: string | null;
  move_to_campaign_id?: string | null;
}

/**
 * The one switch for these rules (system setting, off until set). Ali approves the cleanup of
 * the 12,500 stuck members first (scripts/cleanupCampaignMembership.ts --apply turns it on), so
 * deploying this code changes nothing by itself. Off: joins are admitted as before, nothing is
 * moved, the sweep does nothing, and Explorer Growth holds only the Open House countdown.
 * An unreadable setting is OFF (the pre-OH1w behavior), never a reason to block or move people.
 */
export const MEMBERSHIP_RULES_SETTING = 'campaign_membership_rules_enabled';

export async function membershipRulesOn(): Promise<boolean> {
  try {
    const { getSetting } = await import('./settingsService');
    const v = await getSetting(MEMBERSHIP_RULES_SETTING);
    return v === true || v === 'true';
  } catch {
    return false;
  }
}

/** Hours after the last send before a member with nothing pending is finished. */
export const DEFAULT_EXIT_GRACE_HOURS = 24;
/** An event-timed campaign (the Open House countdown) finishes this long after the event starts. */
export const EVENT_EXIT_AFTER_START_HOURS = 3;

/** The campaign's "when someone finishes" setting, defaulting to remove. Never throws. */
export function readOnComplete(settings: Record<string, any> | null | undefined): OnCompleteSetting {
  const raw = settings?.on_complete;
  if (raw && raw.action === 'move' && (raw.move_to_campaign_key || raw.move_to_campaign_id)) {
    return { action: 'move', move_to_campaign_key: raw.move_to_campaign_key || null, move_to_campaign_id: raw.move_to_campaign_id || null };
  }
  return { action: 'remove' };
}

/** Problems with an on_complete value sent from the admin; empty when it may be saved. */
export function validateOnComplete(raw: unknown, ownCampaignId?: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw !== 'object') return ['on_complete must be an object'];
  const v = raw as Record<string, unknown>;
  if (v.action !== 'remove' && v.action !== 'move') return ['on_complete.action must be "remove" or "move"'];
  if (v.action === 'move') {
    const id = typeof v.move_to_campaign_id === 'string' ? v.move_to_campaign_id : '';
    const key = typeof v.move_to_campaign_key === 'string' ? v.move_to_campaign_key : '';
    if (!id && !key) return ['on_complete.move needs move_to_campaign_id or move_to_campaign_key'];
    if (id && ownCampaignId && id === ownCampaignId) return ['a campaign cannot move people into itself'];
  }
  return [];
}

export const RUNNING_MEMBERSHIP_SQL = `
SELECT cl.campaign_id, c.name FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id
 WHERE cl.lead_id = :leadId AND cl.status IN ('enrolled', 'active')
   AND c.status = 'active' AND c.archived_at IS NULL AND cl.campaign_id <> :exceptId
 ORDER BY cl.enrolled_at ASC NULLS LAST`;

/** The running campaigns this person is in, other than `exceptCampaignId`. */
export async function otherRunningMemberships(leadId: number, exceptCampaignId: string): Promise<Array<{ campaign_id: string; name: string }>> {
  return sequelize.query<{ campaign_id: string; name: string }>(RUNNING_MEMBERSHIP_SQL, {
    replacements: { leadId, exceptId: exceptCampaignId }, type: QueryTypes.SELECT,
  });
}

export type FinishReason = 'finished' | 'moved' | 'cleanup';

/**
 * End one membership: status 'completed' (out of the campaign), with why. A MOVE also cancels
 * whatever that campaign still had queued for the person. Idempotent: only an enrolled/active
 * row changes.
 */
export async function finishMembership(campaignId: string, leadId: number, reason: FinishReason, opts: { transaction?: any; detail?: Record<string, unknown> } = {}): Promise<boolean> {
  if (reason === 'moved') {
    const { cancelScheduledMessagesWhere } = await import('./scheduling/cancelScheduledMessage');
    await cancelScheduledMessagesWhere({ campaign_id: campaignId, lead_id: leadId }, 'moved_to_another_campaign', { transaction: opts.transaction });
  }
  const [, n] = await sequelize.query(
    `UPDATE campaign_leads SET status = 'completed', completed_at = NOW(), outcome = COALESCE(outcome, :reason),
            metadata = COALESCE(metadata, '{}'::jsonb) || CAST(:meta AS jsonb)
      WHERE campaign_id = :campaignId AND lead_id = :leadId AND status IN ('enrolled', 'active')`,
    { replacements: { campaignId, leadId, reason, meta: JSON.stringify({ exit: { reason, at: new Date().toISOString(), ...(opts.detail || {}) } }) }, transaction: opts.transaction },
  ) as unknown as [unknown, number];
  return Number(n) > 0;
}

export type AdmitResult = { admitted: true; moved_from: string[] } | { admitted: false; in_campaign: string };

/**
 * May this person join `campaignId`? One campaign at a time: refused while they are in another
 * running campaign, unless `supersede` (a move), which finishes those memberships first.
 */
export async function admitToCampaign(campaignId: string, leadId: number, opts: { supersede?: boolean } = {}): Promise<AdmitResult> {
  if (!(await membershipRulesOn())) return { admitted: true, moved_from: [] };
  const others = await otherRunningMemberships(leadId, campaignId);
  if (others.length === 0) return { admitted: true, moved_from: [] };
  if (!opts.supersede) return { admitted: false, in_campaign: others[0].name };
  for (const o of others) await finishMembership(o.campaign_id, leadId, 'moved', { detail: { moved_to: campaignId } });
  return { admitted: true, moved_from: others.map((o) => o.campaign_id) };
}

/**
 * Members with nothing left to send: an enrolled/active row in a running campaign, nothing
 * pending or processing for them in it, the last message (or, with none, the enrollment)
 * older than the campaign's exit grace, and (for an event-timed campaign) the event well past.
 * An 'active' member with no messages at all is stuck (e.g. joined the countdown when no Open
 * House was announced) and is finished too. An 'enrolled' member with no messages is queued
 * (a ramp or a paused start), not finished.
 */
export const FINISHED_MEMBERS_SQL = `
SELECT cl.campaign_id, cl.lead_id, c.settings,
       (SELECT se.metadata->>'event_session_id' FROM scheduled_emails se
         WHERE se.campaign_id = cl.campaign_id AND se.lead_id = cl.lead_id AND se.metadata->>'event_session_id' IS NOT NULL
         ORDER BY se.scheduled_for DESC LIMIT 1) AS event_session_id
  FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id
 WHERE cl.status IN ('enrolled', 'active') AND c.status = 'active' AND c.archived_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM scheduled_emails se WHERE se.campaign_id = cl.campaign_id AND se.lead_id = cl.lead_id
                    AND se.status IN ('pending', 'processing', 'paused'))
   AND (cl.status = 'active'
        OR EXISTS (SELECT 1 FROM scheduled_emails se WHERE se.campaign_id = cl.campaign_id AND se.lead_id = cl.lead_id))
   AND COALESCE((SELECT MAX(COALESCE(se.sent_at, se.scheduled_for)) FROM scheduled_emails se
                  WHERE se.campaign_id = cl.campaign_id AND se.lead_id = cl.lead_id), cl.enrolled_at, '-infinity'::timestamptz)
       < NOW() - make_interval(hours => COALESCE(NULLIF(c.settings->>'exit_grace_hours', '')::int, :defaultGrace))
   AND COALESCE((SELECT MAX((se.metadata->>'event_starts_at')::timestamptz) FROM scheduled_emails se
                  WHERE se.campaign_id = cl.campaign_id AND se.lead_id = cl.lead_id AND se.metadata->>'event_starts_at' IS NOT NULL),
                '-infinity'::timestamptz) < NOW() - make_interval(hours => :eventHours)
 ORDER BY cl.campaign_id, cl.lead_id
 LIMIT :limit`;

export interface SweepResult { finished: number; moved: number; move_failed: number; errors: number }

/** Resolve a move target to a running campaign id, or null. */
async function resolveTarget(s: OnCompleteSetting): Promise<{ id: string; key: string | null } | null> {
  const rows = await sequelize.query<{ id: string; key: string | null }>(
    `SELECT id, settings->>'campaign_key' AS key FROM campaigns
      WHERE archived_at IS NULL AND status = 'active'
        AND (id::text = :id OR (CAST(:key AS text) <> '' AND settings->>'campaign_key' = :key))
      ORDER BY created_at ASC LIMIT 1`,
    { replacements: { id: s.move_to_campaign_id || '', key: s.move_to_campaign_key || '' }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/**
 * Move a finished person into the target campaign. The Open House follow-up is booked by
 * attendance for the event they came from; any other campaign is a plain (superseding) join.
 */
async function moveInto(target: { id: string; key: string | null }, leadId: number, eventSessionId: string | null): Promise<boolean> {
  const { OPEN_HOUSE_FOLLOWUP_KEY, bookOpenHouseFollowups, isRecentOpenHouse } = await import('./openHouseFollowup');
  if (target.key === OPEN_HOUSE_FOLLOWUP_KEY) {
    // Only a recent Open House is followed up automatically (the same 2-day window as the
    // hourly run); an older one, like Nov 19, is Ali's call and booked by hand with --book.
    if (!eventSessionId || !(await isRecentOpenHouse(eventSessionId))) return false;
    const r = await bookOpenHouseFollowups(eventSessionId, { leadId });
    return r.outcome === 'booked';
  }
  const { enrollLeadsInCampaign } = await import('./campaignService');
  const [r] = await enrollLeadsInCampaign(target.id, [leadId], { supersede: true });
  return r?.status === 'enrolled';
}

/** The hourly exit sweep. Never throws. */
export async function sweepFinishedMembers(opts: { limit?: number; log?: Log } = {}): Promise<SweepResult> {
  const log = opts.log ?? defaultLog;
  const out: SweepResult = { finished: 0, moved: 0, move_failed: 0, errors: 0 };
  if (!(await membershipRulesOn())) return out;
  try {
    const rows = await sequelize.query<{ campaign_id: string; lead_id: number; settings: Record<string, any> | null; event_session_id: string | null }>(
      FINISHED_MEMBERS_SQL,
      { replacements: { defaultGrace: DEFAULT_EXIT_GRACE_HOURS, eventHours: EVENT_EXIT_AFTER_START_HOURS, limit: opts.limit ?? 500 }, type: QueryTypes.SELECT },
    );
    for (const r of rows) {
      try {
        const rule = readOnComplete(r.settings);
        if (rule.action === 'move') {
          const target = await resolveTarget(rule);
          const ok = target ? await moveInto(target, Number(r.lead_id), r.event_session_id).catch(() => false) : false;
          if (ok) out.moved += 1; else out.move_failed += 1;
        }
        // Finished either way: a failed move must not leave them stuck in a finished campaign.
        if (await finishMembership(r.campaign_id, Number(r.lead_id), 'finished', { detail: { on_complete: rule.action } })) out.finished += 1;
      } catch (err: any) {
        out.errors += 1;
        log('member_exit_failed', { outcome: 'failure', error_class: err?.name || 'DatabaseError', context: { campaign_id: r.campaign_id, lead_id: r.lead_id, message: err?.message } });
      }
    }
    log('member_exit_sweep', { outcome: out.errors ? 'partial' : 'success', context: { candidates: rows.length, ...out } });
  } catch (err: any) {
    out.errors += 1;
    log('member_exit_sweep_failed', { outcome: 'failure', error_class: err?.name || 'DatabaseError', context: { message: err?.message } });
  }
  return out;
}
