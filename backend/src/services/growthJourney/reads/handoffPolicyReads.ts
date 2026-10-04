import { Op } from 'sequelize';
import { GrowthJourneyConversationOwnership, GrowthJourneyHandoff, GrowthJourneyPolicy } from '../../../models';
import { subjectRef } from '../../../models/GrowthJourneyEnrollment';
import { OPEN_HANDOFF_STATUSES } from '../../../models/GrowthJourneyHandoff';
import { safeField } from '../handoffs/assigneeDigest';
import { brandWhere, emptyPage, paging, type Page, type ReadScope } from './readPaging';

/**
 * How the queues are configured, and who is holding a person right now
 * (Phase 6, T607).
 *
 * ─── CAPACITY IS IN COLUMNS, NOT IN `settings` ──────────────────────────────
 *
 * The plan described the capacity policy as a `settings` JSONB with a shape to
 * validate. It is not: `daily_capacity`, `sla_hours`, `assigned_to_type`,
 * `assigned_to_id` and `cooldown_days` are typed scalar columns, and `settings`
 * is `{}` on every row in the database — the seed writes `{}` and nothing
 * anywhere updates it. So the scalars are projected and `settings` is not
 * requested at all: an empty JSONB is not worth a round trip, and a JSONB that
 * nothing writes is not worth a shape.
 *
 * ─── THE CONFIGURED NUMBER, NOT THE LIVE ONE ────────────────────────────────
 *
 * `capacityService.resolveQueueCapacity` already answers "is this queue full
 * right now", with `used`, a status and a reason, counting today's handoffs.
 * That computation is not repeated here and not called: this read answers what
 * an operator CONFIGURED, so a screen can show the policy beside the live
 * figure the capacity service gives it. Two answers to two questions, one
 * implementation each.
 *
 * ─── OWNERSHIP IS TWO FACTS, AND THEY ARE NOT JOINED ────────────────────────
 *
 * The plan asked for "open ownership rows: subject_ref, brand_id, owner id,
 * since" as one collection. There is no such row and no view that makes one.
 * The system records ownership two ways:
 *
 *   - `growth_journey_handoffs` — keyed by `subject_ref`, open when `status` is
 *     one of `OPEN_HANDOFF_STATUSES`, owner in `assigned_to_type/_id`, and the
 *     only "since the human took it" stamp is `accepted_at` (there is no
 *     `assigned_at`), so `since` falls back to `created_at` and the row says
 *     which one it used.
 *   - `growth_journey_conversation_ownership` — keyed by `lead_id`, open when
 *     `cleared_at IS NULL` (not a status), owner in `owner_type/owner_id`,
 *     since `since_at`.
 *
 * They are returned as two collections rather than merged, because merging them
 * would invent a single notion of ownership the system does not have: a handoff
 * can be open while no conversation is owned, and a human can own a
 * conversation with no handoff at all. The lead-keyed rows do get a
 * `subject_ref`, built with the shared `subjectRef()` the writers use, so the
 * two collections can be lined up by a screen without this file guessing at the
 * format.
 *
 * `assigned_to_id` and `owner_id` are `STRING(255)` columns that hold whatever
 * identifier the assigning operator gave, which may be an address, so both go
 * through T517's `safeField`. `evidence`, `talking_points`,
 * `qualification_gaps` and `return_to_ai` are never requested.
 */

/* ── queue policies ─────────────────────────────────────────────────────────── */

export interface QueuePolicyRow {
  id: string;
  brand_id: string;
  policy_type: string;
  owner_queue: string | null;
  daily_capacity: number | null;
  sla_hours: number | null;
  assigned_to_type: string | null;
  /** Through `safeField` - an assignee id may be an address. */
  assigned_to_id: string | null;
  assigned_to_id_redacted: boolean;
  cooldown_days: number | null;
  status: string;
}

export interface QueuePolicyFilters extends ReadScope {
  policyType?: string;
  ownerQueue?: string;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function readQueuePolicies(filters: QueuePolicyFilters): Promise<Page<QueuePolicyRow>> {
  const { limit, offset } = paging(filters);
  if (filters.brandIds.length === 0) return emptyPage(limit, offset);
  const where = brandWhere(filters.brandIds);
  if (filters.policyType) where.policy_type = filters.policyType;
  if (filters.ownerQueue) where.owner_queue = filters.ownerQueue;
  const { rows, count } = await GrowthJourneyPolicy.findAndCountAll({
    where,
    attributes: [
      'id', 'brand_id', 'policy_type', 'owner_queue', 'daily_capacity', 'sla_hours',
      'assigned_to_type', 'assigned_to_id', 'cooldown_days', 'status',
    ],
    order: [['policy_type', 'ASC'], ['owner_queue', 'ASC'], ['id', 'ASC']],
    limit,
    offset,
  });
  return {
    rows: rows.map((r) => {
      const raw = r.get('assigned_to_id');
      const assignee = raw === null || raw === undefined ? null : safeField(raw);
      return {
        id: String(r.get('id')),
        brand_id: String(r.get('brand_id')),
        policy_type: String(r.get('policy_type')),
        owner_queue: (r.get('owner_queue') as string | null) ?? null,
        daily_capacity: num(r.get('daily_capacity')),
        sla_hours: num(r.get('sla_hours')),
        assigned_to_type: (r.get('assigned_to_type') as string | null) ?? null,
        assigned_to_id: assignee ? assignee.value : null,
        assigned_to_id_redacted: assignee ? assignee.redacted : false,
        cooldown_days: num(r.get('cooldown_days')),
        status: String(r.get('status')),
      };
    }),
    total: count,
    limit,
    offset,
  };
}

/* ── ownership ──────────────────────────────────────────────────────────────── */

export interface HandoffOwnerRow {
  id: string;
  brand_id: string;
  subject_ref: string;
  owner_queue: string;
  status: string;
  owner_type: string | null;
  owner_id: string | null;
  owner_id_redacted: boolean;
  since: string;
  /** Which column `since` came from: `accepted_at` when a human took it, else `created_at`. */
  since_source: 'accepted_at' | 'created_at';
}

export interface ConversationOwnerRow {
  id: string;
  brand_id: string;
  /** Built with the shared `subjectRef()`, so it matches every other `lead:<id>` on this surface. */
  subject_ref: string | null;
  owner_type: string;
  owner_id: string | null;
  owner_id_redacted: boolean;
  channel: string | null;
  source: string;
  since: string;
}

export interface OwnershipResult {
  handoffs: { rows: HandoffOwnerRow[]; total: number };
  conversations: { rows: ConversationOwnerRow[]; total: number };
  limit: number;
  offset: number;
  open_handoff_statuses: readonly string[];
}

export async function readOwnership(filters: ReadScope): Promise<OwnershipResult> {
  const { limit, offset } = paging(filters);
  const empty: OwnershipResult = {
    handoffs: { rows: [], total: 0 },
    conversations: { rows: [], total: 0 },
    limit,
    offset,
    open_handoff_statuses: OPEN_HANDOFF_STATUSES,
  };
  if (filters.brandIds.length === 0) return empty;

  const [handoffs, conversations] = await Promise.all([
    GrowthJourneyHandoff.findAndCountAll({
      where: { ...brandWhere(filters.brandIds), status: { [Op.in]: [...OPEN_HANDOFF_STATUSES] } },
      attributes: ['id', 'brand_id', 'subject_ref', 'owner_queue', 'status', 'assigned_to_type', 'assigned_to_id', 'accepted_at', 'created_at'],
      order: [['created_at', 'DESC'], ['id', 'ASC']],
      limit,
      offset,
    }),
    GrowthJourneyConversationOwnership.findAndCountAll({
      where: { ...brandWhere(filters.brandIds), cleared_at: null },
      attributes: ['id', 'brand_id', 'lead_id', 'owner_type', 'owner_id', 'channel', 'source', 'since_at'],
      order: [['since_at', 'DESC'], ['id', 'ASC']],
      limit,
      offset,
    }),
  ]);

  const owner = (v: unknown) => (v === null || v === undefined ? null : safeField(v));
  return {
    handoffs: {
      rows: handoffs.rows.map((r) => {
        const who = owner(r.get('assigned_to_id'));
        const accepted = r.get('accepted_at') as Date | null;
        return {
          id: String(r.get('id')),
          brand_id: String(r.get('brand_id')),
          subject_ref: String(r.get('subject_ref')),
          owner_queue: String(r.get('owner_queue')),
          status: String(r.get('status')),
          owner_type: (r.get('assigned_to_type') as string | null) ?? null,
          owner_id: who ? who.value : null,
          owner_id_redacted: who ? who.redacted : false,
          since: new Date((accepted ?? r.get('created_at')) as Date).toISOString(),
          since_source: accepted ? 'accepted_at' : 'created_at',
        };
      }),
      total: handoffs.count,
    },
    conversations: {
      rows: conversations.rows.map((r) => {
        const who = owner(r.get('owner_id'));
        return {
          id: String(r.get('id')),
          brand_id: String(r.get('brand_id')),
          subject_ref: subjectRef({ leadId: r.get('lead_id') as number | null }),
          owner_type: String(r.get('owner_type')),
          owner_id: who ? who.value : null,
          owner_id_redacted: who ? who.redacted : false,
          channel: (r.get('channel') as string | null) ?? null,
          source: String(r.get('source')),
          since: new Date(r.get('since_at') as Date).toISOString(),
        };
      }),
      total: conversations.count,
    },
    limit,
    offset,
    open_handoff_statuses: OPEN_HANDOFF_STATUSES,
  };
}
