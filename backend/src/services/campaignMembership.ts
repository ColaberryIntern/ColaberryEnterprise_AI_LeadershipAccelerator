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
/** OH1z: a queued send this many days overdue will not go; the member is finished and it is cancelled. */
export const STALE_QUEUE_DAYS = 7;

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

/**
 * Why a membership ended. OH1z (Ali, 2026-11-22: "no matter what route you take, people should be
 * removed when they are done with the campaign"): campaign_over (completed or archived),
 * paused_idle (paused with nothing left for them), stale_queue (everything queued for them
 * overdue by more than STALE_QUEUE_DAYS, so it will never send).
 */
export type FinishReason = 'finished' | 'moved' | 'cleanup' | 'campaign_over' | 'paused_idle' | 'stale_queue';

/** Rows touched by a raw UPDATE: Postgres hands back its Result ({ rowCount }), other dialects a number. */
function rowsChanged(meta: unknown): number {
  if (typeof meta === 'number' && Number.isFinite(meta)) return meta;
  const rc = (meta as { rowCount?: unknown } | null | undefined)?.rowCount;
  return typeof rc === 'number' && Number.isFinite(rc) ? rc : 0;
}

/**
 * End one membership: status 'completed' (out of the campaign), with why. A MOVE also cancels
 * whatever that campaign still had queued for the person. Idempotent: only an enrolled/active
 * row changes.
 */
export async function finishMembership(campaignId: string, leadId: number, reason: FinishReason, opts: { transaction?: any; detail?: Record<string, unknown> } = {}): Promise<boolean> {
  if (reason === 'moved' || reason === 'stale_queue') {
    const { cancelScheduledMessagesWhere } = await import('./scheduling/cancelScheduledMessage');
    await cancelScheduledMessagesWhere({ campaign_id: campaignId, lead_id: leadId },
      reason === 'moved' ? 'moved_to_another_campaign' : 'stale_overdue', { transaction: opts.transaction });
  }
  const [, n] = await sequelize.query(
    `UPDATE campaign_leads SET status = 'completed', completed_at = NOW(), outcome = COALESCE(outcome, :reason),
            metadata = COALESCE(metadata, '{}'::jsonb) || CAST(:meta AS jsonb)
      WHERE campaign_id = :campaignId AND lead_id = :leadId AND status IN ('enrolled', 'active')`,
    { replacements: { campaignId, leadId, reason, meta: JSON.stringify({ exit: { reason, at: new Date().toISOString(), ...(opts.detail || {}) } }) }, transaction: opts.transaction },
  ) as unknown as [unknown, unknown];
  return rowsChanged(n) > 0;
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
 * Every member who is done, whatever route put them in (OH1z: enrollLeadsInCampaign, alumni,
 * lifecycle, sequence enrollment and the follow-up all write the same campaign_leads row, and
 * this reads that row). exit_kind says why:
 *   finished       running campaign, nothing queued for them, the last message (or, with none,
 *                  the enrollment) older than the exit grace, any event well past. An 'enrolled'
 *                  member with nothing ever scheduled is finished too, except in an autonomous
 *                  campaign, whose ramp holds people 'enrolled' on purpose.
 *   campaign_over  the campaign is completed or archived: everyone in it is done.
 *   paused_idle    the campaign is paused and has nothing queued for them, past the grace (the
 *                  rule Ali approved for the Nov 21 cleanup, category 2b).
 *   stale_queue    running campaign, but everything queued for them is over STALE_QUEUE_DAYS
 *                  overdue, so it will never send; the queue is cancelled (stale_overdue).
 * Draft campaigns are never touched: nothing has started.
 */
export const FINISHED_MEMBERS_SQL = `
WITH m AS (
  SELECT cl.campaign_id, cl.lead_id, cl.status AS member_status, cl.enrolled_at, c.settings,
         c.status::text AS campaign_status, c.archived_at, COALESCE(c.campaign_mode::text, '') AS campaign_mode,
         COALESCE(s.queued, false) AS queued, COALESCE(s.queued_fresh, false) AS queued_fresh, COALESCE(s.any_send, false) AS any_send,
         s.event_session_id,
         COALESCE(s.last_touch, cl.enrolled_at, '-infinity'::timestamptz)
           < NOW() - make_interval(hours => COALESCE(NULLIF(c.settings->>'exit_grace_hours', '')::int, :defaultGrace)) AS idle,
         COALESCE(s.event_at, '-infinity'::timestamptz) < NOW() - make_interval(hours => :eventHours) AS event_past
    FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id
    LEFT JOIN LATERAL (
      SELECT bool_or(se.status IN ('pending', 'processing', 'paused')) AS queued,
             bool_or(se.status IN ('pending', 'processing', 'paused') AND se.scheduled_for >= NOW() - make_interval(days => :staleDays)) AS queued_fresh,
             count(*) > 0 AS any_send,
             MAX(COALESCE(se.sent_at, se.scheduled_for)) AS last_touch,
             MAX((se.metadata->>'event_starts_at')::timestamptz) AS event_at,
             (array_agg(se.metadata->>'event_session_id' ORDER BY se.scheduled_for DESC) FILTER (WHERE se.metadata->>'event_session_id' IS NOT NULL))[1] AS event_session_id
        FROM scheduled_emails se WHERE se.campaign_id = cl.campaign_id AND se.lead_id = cl.lead_id
    ) s ON true
   WHERE cl.status IN ('enrolled', 'active') AND c.status::text <> 'draft'
)
SELECT campaign_id, lead_id, settings, event_session_id,
       CASE WHEN archived_at IS NOT NULL OR campaign_status IN ('completed', 'archived', 'cancelled') THEN 'campaign_over'
            WHEN campaign_status = 'paused' THEN 'paused_idle'
            WHEN queued THEN 'stale_queue'
            ELSE 'finished' END AS exit_kind
  FROM m
 WHERE (archived_at IS NOT NULL OR campaign_status IN ('completed', 'archived', 'cancelled'))
    OR (campaign_status = 'paused' AND NOT queued AND idle)
    OR (campaign_status = 'active' AND NOT queued AND idle AND event_past
        AND (member_status = 'active' OR any_send OR campaign_mode <> 'autonomous'))
    OR (campaign_status = 'active' AND queued AND NOT queued_fresh)
 ORDER BY campaign_id, lead_id
 LIMIT :limit`;

export interface SweepResult { finished: number; moved: number; move_failed: number; errors: number; by_reason: Partial<Record<FinishReason, number>> }

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
  const out: SweepResult = { finished: 0, moved: 0, move_failed: 0, errors: 0, by_reason: {} };
  if (!(await membershipRulesOn())) return out;
  try {
    const rows = await sequelize.query<{ campaign_id: string; lead_id: number; settings: Record<string, any> | null; event_session_id: string | null; exit_kind?: FinishReason }>(
      FINISHED_MEMBERS_SQL,
      { replacements: { defaultGrace: DEFAULT_EXIT_GRACE_HOURS, eventHours: EVENT_EXIT_AFTER_START_HOURS, staleDays: STALE_QUEUE_DAYS, limit: opts.limit ?? 500 }, type: QueryTypes.SELECT },
    );
    for (const r of rows) {
      try {
        const kind: FinishReason = r.exit_kind || 'finished';
        const rule = readOnComplete(r.settings);
        // The "when someone finishes" move applies when the campaign ran its course for them
        // (finished, or the campaign itself ended). A paused campaign or a dead queue just removes.
        const moving = rule.action === 'move' && (kind === 'finished' || kind === 'campaign_over');
        if (moving) {
          const target = await resolveTarget(rule);
          const ok = target ? await moveInto(target, Number(r.lead_id), r.event_session_id).catch(() => false) : false;
          if (ok) out.moved += 1; else out.move_failed += 1;
        }
        // Finished either way: a failed move must not leave them stuck in a finished campaign.
        if (await finishMembership(r.campaign_id, Number(r.lead_id), kind, { detail: { on_complete: moving ? 'move' : 'remove' } })) {
          out.finished += 1;
          out.by_reason[kind] = (out.by_reason[kind] || 0) + 1;
        }
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
