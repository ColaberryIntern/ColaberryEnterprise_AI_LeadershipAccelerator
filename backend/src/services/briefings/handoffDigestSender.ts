import { Op } from 'sequelize';
import { env } from '../../config/env';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../../config/growthJourneyFlags';
import { AdminUser, Brand, GrowthJourneyHandoff } from '../../models';
import { guardedSendMail, resolveDeliveryAddress } from '../emailService';
import { claimBriefingSlot } from '../executiveBriefingService';
import { composeAssigneeDigest, type DigestHandoff } from '../growthJourney/handoffs/assigneeDigest';

/**
 * The daily handoff digest, sent (Phase 5 T517, 5A).
 *
 * One mail per human assignee with something open, once per mailbox per
 * Central date, through the existing guarded mailer - the kill switch and
 * the dev sink are `guardedSendMail`'s, the once-a-day slot is the
 * briefing's `claimBriefingSlot` (one atomic UPDATE, so two schedulers
 * firing together still send once). The compose step lives in the journey
 * tree and is pure; this module is the one that reads and sends, and it
 * lives OUTSIDE that tree on purpose: the journey no-send scanner forbids
 * `emailService` in there, and stays that way.
 *
 * ─── GATES, IN ORDER ───────────────────────────────────────────────────────
 *
 *   1  the registry row `GrowthJourneyHandoffDigest` is enabled:false -
 *      `instrumentCronJob` skips it (logged);
 *   2  the master flag and `journeyHandoffs` - asked here, before any read;
 *   3  an assignee with nothing open gets no mail (compose answers null);
 *   4  the slot: already claimed today for that mailbox -> no mail;
 *   5  `guardedSendMail`: the kill switch, then the dev email guard.
 *
 * The mail carries no lead name, address or message body - the compose step
 * is handed handoff rows only (never a lead row: this module does not read
 * `Lead`), and every copied string passes its `safeField`. Logs are counts.
 * A failure for one assignee is one error line and the next assignee still
 * gets theirs; a claim that cannot be read fails CLOSED (no mail), like the
 * briefing.
 */

export const HANDOFF_DIGEST_AGENT = 'GrowthJourneyHandoffDigest';
/** 12:30 UTC, Monday to Friday: 7:30 AM Central in summer, 6:30 AM in winter - before the desk day starts. */
export const HANDOFF_DIGEST_SCHEDULE = '30 12 * * 1-5';
export const HANDOFF_DIGEST_SLOT = 'growth_journey_handoff_digest';
/** The statuses under which a handoff is somebody's: assigned to them, or accepted by them. */
export const DIGEST_STATUSES: readonly string[] = ['assigned', 'accepted'];
export const DIGEST_READ_LIMIT = 2000;
const FROM = () => `"Colaberry Growth Journey" <${env.emailFrom}>`;

export interface HandoffDigestSummary {
  status: 'skipped' | 'ran';
  reason?: string;
  handoffs: number;
  assignees: number;
  sent: number;
  already_sent: number;
  no_admin_row: number;
  ai_operated: number;
  failed: number;
  redacted: number;
}

export interface SendHandoffDigestsArgs {
  flags?: GrowthJourneyFlags;
  asOf?: Date;
}

type HandoffRow = { get(k: string): unknown };
type AdminRow = { get(k: string): unknown };

const log = (level: 'info' | 'error', event: string, context: Record<string, unknown>): void => {
  const line = JSON.stringify({ level, service: 'growth-journey', event: `growth_journey.${event}`, outcome: level === 'error' ? 'failure' : 'success', context });
  if (level === 'error') console.error(line);
  else console.log(line);
};

/** The open handoffs that belong to a human, grouped by that human's admin id. */
async function openHandoffsByAssignee(): Promise<Map<string, DigestHandoff[]>> {
  const rows = (await GrowthJourneyHandoff.findAll({
    where: { status: { [Op.in]: [...DIGEST_STATUSES] }, assigned_to_type: 'human' },
    attributes: ['id', 'brand_id', 'owner_queue', 'priority', 'urgent', 'reason', 'sla_due_at', 'created_at', 'assigned_to_id'],
    order: [['created_at', 'ASC']],
    limit: DIGEST_READ_LIMIT,
  })) as unknown as HandoffRow[];
  const byAssignee = new Map<string, DigestHandoff[]>();
  for (const r of rows) {
    const assignee = r.get('assigned_to_id');
    if (typeof assignee !== 'string' || assignee.length === 0) continue;
    const list = byAssignee.get(assignee) ?? [];
    list.push({
      id: String(r.get('id')),
      brand_id: String(r.get('brand_id')),
      owner_queue: String(r.get('owner_queue')),
      priority: String(r.get('priority')),
      urgent: r.get('urgent') === true,
      reason: String(r.get('reason') ?? ''),
      sla_due_at: (r.get('sla_due_at') as Date | null) ?? null,
      created_at: new Date(r.get('created_at') as Date),
    });
    byAssignee.set(assignee, list);
  }
  return byAssignee;
}

async function brandNamesFor(rows: Iterable<DigestHandoff[]>): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const list of rows) for (const r of list) ids.add(r.brand_id);
  if (ids.size === 0) return new Map();
  const brands = (await Brand.findAll({ where: { id: { [Op.in]: [...ids] } }, attributes: ['id', 'name'] })) as unknown as HandoffRow[];
  return new Map(brands.map((b) => [String(b.get('id')), String(b.get('name'))]));
}

async function adminsById(ids: string[]): Promise<Map<string, AdminRow>> {
  if (ids.length === 0) return new Map();
  const admins = (await AdminUser.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'email', 'is_ai_operated'] })) as unknown as AdminRow[];
  return new Map(admins.map((a) => [String(a.get('id')), a]));
}

/** Every human assignee's digest, once per mailbox per Central date. Never throws for one assignee's sake. */
export async function sendHandoffDigests(args: SendHandoffDigestsArgs = {}): Promise<HandoffDigestSummary> {
  const flags = args.flags ?? env.growthJourney;
  const asOf = args.asOf ?? new Date();
  const summary: HandoffDigestSummary = { status: 'ran', handoffs: 0, assignees: 0, sent: 0, already_sent: 0, no_admin_row: 0, ai_operated: 0, failed: 0, redacted: 0 };
  if (!isGrowthJourneyCapabilityEnabled('journeyHandoffs', flags)) return { ...summary, status: 'skipped', reason: 'journeyHandoffs_off' };

  const byAssignee = await openHandoffsByAssignee();
  summary.assignees = byAssignee.size;
  for (const list of byAssignee.values()) summary.handoffs += list.length;
  if (byAssignee.size === 0) {
    log('info', 'handoff_digest', { ...summary });
    return summary;
  }
  const [brandNames, admins] = await Promise.all([brandNamesFor(byAssignee.values()), adminsById([...byAssignee.keys()])]);

  for (const [assigneeId, rows] of byAssignee) {
    try {
      const admin = admins.get(assigneeId);
      if (!admin) { summary.no_admin_row += 1; continue; }
      if (admin.get('is_ai_operated') === true) { summary.ai_operated += 1; continue; }
      const email = String(admin.get('email') ?? '').trim();
      if (!email) { summary.no_admin_row += 1; continue; }
      const digest = composeAssigneeDigest({ rows, brandNames, baseUrl: env.frontendUrl, asOf });
      if (!digest) continue;
      summary.redacted += digest.redacted;
      // The slot is claimed on the address the mail will really reach, so a dev fan-in of several
      // assignees into one sink mailbox claims one slot - the briefing's own rule.
      const deliveredTo = await resolveDeliveryAddress(email).catch(() => email);
      const claimed = await claimBriefingSlot(HANDOFF_DIGEST_SLOT, deliveredTo);
      if (!claimed) { summary.already_sent += 1; continue; }
      await guardedSendMail({ from: FROM(), to: email, subject: digest.subject, text: digest.text, html: digest.html });
      summary.sent += 1;
    } catch (err: unknown) {
      summary.failed += 1;
      log('error', 'handoff_digest_failed', { assignee_id: assigneeId, error_class: err instanceof Error ? err.name : 'UnknownError', handoffs: rows.length });
    }
  }
  log('info', 'handoff_digest', { ...summary });
  return summary;
}
