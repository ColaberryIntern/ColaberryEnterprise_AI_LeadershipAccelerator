import { Op, type WhereOptions } from 'sequelize';
import { Activity, CommunicationLog, GrowthJourneyConversationOwnership, GrowthJourneyPolicy } from '../../models';
import type {
  ConversationOwnershipSource,
  GrowthJourneyConversationOwnershipAttributes,
} from '../../models/GrowthJourneyConversationOwnership';
import { classifyError } from '../../utils/errorClassifier';
import { redactForLogs } from '../../utils/piiRedaction';
import { isUniqueViolation } from '../../utils/uniqueViolation';
import type { HumanConversation } from './governor/types';

/**
 * Conversation ownership — the source for `human_conversation` (§7.3; §11 the
 * pause; Phase 4 T402).
 *
 * ─── THREE ANSWERS, EACH WITH ITS REASON ────────────────────────────────────
 *
 *   'yes'      an OPEN human row exists for this lead in this brand (directly
 *              written, or derived below and recorded on first sight)
 *   'no'       the lookups succeeded and found none — the lead was readable,
 *              the ownership table was readable, and nothing derived one
 *   'unknown'  a lookup FAILED; the reason carries the error class
 *
 * `'no'` unlocks nothing by itself: `decideForSubject`'s step 4b still needs
 * `sales_capacity`, and a human-in-the-loop candidate stays suppressed while
 * that is unknown. `'yes'` PAUSES the AI's commercial outreach: the B2B email
 * generators decline `human_in_conversation`, the learner strategy withholds
 * its email and lesson candidates the same way.
 *
 * ─── DERIVED OPENERS, READ-SIDE, NO NEW DETECTOR ────────────────────────────
 *
 * Two records that already exist imply a human is in the thread: an
 * `activities` row with a human author (`admin_user_id` set) of type call,
 * meeting or note, or a `communication_logs` outbound carrying the
 * personal-outreach trigger — either inside the brand's cooldown window
 * (`growth_journey_policies` `cooldown` row, default 7 days). The reader
 * records what it saw as an ownership row, idempotently on the partial unique
 * (one open row per lead per brand), so two consecutive reads create exactly
 * one row. It reads no suppression row and decides nothing about whether the
 * person may be contacted; that remains `contactEvidence.ts`'s composition of
 * the existing evaluators.
 *
 * ─── TWO WRITERS, NOTHING ELSE ──────────────────────────────────────────────
 *
 * `openHumanConversation` (a human accepted a handoff — T405; or the reader's
 * derivation) and `clearHumanConversation` (release or disposition — T405).
 * Nothing here sends, notifies, or creates work for anyone.
 */

const DEFAULT_COOLDOWN_DAYS = 7;
const HUMAN_ACTIVITY_TYPES = ['call', 'meeting', 'note'] as const;
const PERSONAL_OUTREACH_TRIGGER = 'ali_personal_outreach';

export interface HumanConversationAnswer {
  value: HumanConversation;
  reason: string;
  /** The open row, when the answer is 'yes'. */
  ownership_id: string | null;
  source: ConversationOwnershipSource | null;
  since_at: Date | null;
}

export interface ResolveHumanConversationArgs {
  leadId: number | null;
  brandId: string;
  tenantId: string;
  asOf: Date;
}

function log(event: string, fields: Record<string, unknown>): void {
  console.warn(
    redactForLogs(JSON.stringify({ service: 'growth-journey', level: 'warn', outcome: 'failure', event, ...fields })),
  );
}

/** The brand's cooldown window in days: the operator's `cooldown` policy, else the default. */
async function cooldownDays(brandId: string): Promise<number> {
  const policy = await GrowthJourneyPolicy.findOne({
    where: { brand_id: brandId, policy_type: 'cooldown', owner_queue: null, status: 'active' },
  });
  const days = policy?.cooldown_days ?? null;
  return typeof days === 'number' && days > 0 ? days : DEFAULT_COOLDOWN_DAYS;
}

async function openRowFor(leadId: number, brandId: string): Promise<GrowthJourneyConversationOwnership | null> {
  return GrowthJourneyConversationOwnership.findOne({
    where: { lead_id: leadId, brand_id: brandId, owner_type: 'human', cleared_at: null },
    order: [['since_at', 'DESC']],
  });
}

function answerFrom(row: GrowthJourneyConversationOwnership): HumanConversationAnswer {
  return {
    value: 'yes',
    reason: `open_human_conversation:${row.source}`,
    ownership_id: row.id,
    source: row.source,
    since_at: row.since_at,
  };
}

export interface OpenHumanConversationInput {
  tenantId: string;
  brandId: string;
  leadId: number;
  ownerId: string | null;
  channel?: string | null;
  source: ConversationOwnershipSource;
  sinceAt?: Date;
}

export interface OpenHumanConversationResult {
  row: GrowthJourneyConversationOwnership;
  /** True when an open row already existed and was returned instead of a second one. */
  replayed: boolean;
}

/**
 * Open a human conversation. One create; if an open row already exists for the
 * lead in this brand (the partial unique), that row is returned as a replay —
 * the existing owner is never overwritten from here.
 */
export async function openHumanConversation(input: OpenHumanConversationInput): Promise<OpenHumanConversationResult> {
  const row: GrowthJourneyConversationOwnershipAttributes = {
    tenant_id: input.tenantId,
    brand_id: input.brandId,
    lead_id: input.leadId,
    owner_type: 'human',
    owner_id: input.ownerId,
    channel: input.channel ?? null,
    source: input.source,
    since_at: input.sinceAt ?? new Date(),
    cleared_at: null,
  };
  try {
    return { row: await GrowthJourneyConversationOwnership.create(row), replayed: false };
  } catch (err: unknown) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await GrowthJourneyConversationOwnership.findOne({
      where: { lead_id: input.leadId, brand_id: input.brandId, cleared_at: null },
    });
    if (!existing) throw err;
    return { row: existing, replayed: true };
  }
}

export interface ClearHumanConversationInput {
  leadId: number;
  brandId: string;
  clearedBy: string;
  reason: string;
  asOf?: Date;
}

/** Clear every open row for the lead in this brand; returns how many were cleared (0 is a valid answer). */
export async function clearHumanConversation(input: ClearHumanConversationInput): Promise<{ cleared: number }> {
  const [cleared] = await GrowthJourneyConversationOwnership.update(
    { cleared_at: input.asOf ?? new Date(), cleared_by: input.clearedBy, cleared_reason: input.reason },
    { where: { lead_id: input.leadId, brand_id: input.brandId, cleared_at: null } },
  );
  return { cleared };
}

/** The derived opener, when one of the two existing records implies a human is in the thread. */
async function deriveOpener(
  args: ResolveHumanConversationArgs & { leadId: number },
): Promise<OpenHumanConversationInput | null> {
  const days = await cooldownDays(args.brandId);
  const since = new Date(args.asOf.getTime() - days * 86_400_000);
  const window = { [Op.gt]: since, [Op.lte]: args.asOf };

  // `Activity` types `admin_user_id` as an optional string with no `null`, so
  // the IS NOT NULL filter needs the unparameterised `WhereOptions`.
  const humanAuthored: WhereOptions = {
    lead_id: args.leadId,
    admin_user_id: { [Op.ne]: null },
    type: { [Op.in]: [...HUMAN_ACTIVITY_TYPES] },
    created_at: window,
  };
  const activity = await Activity.findOne({ where: humanAuthored, order: [['created_at', 'DESC']] });
  if (activity) {
    return {
      tenantId: args.tenantId,
      brandId: args.brandId,
      leadId: args.leadId,
      ownerId: activity.admin_user_id,
      channel: activity.type === 'call' ? 'voice' : null,
      source: 'human_activity',
      sinceAt: activity.created_at,
    };
  }

  const outreach = await CommunicationLog.findOne({
    where: {
      lead_id: args.leadId,
      direction: 'outbound',
      'metadata.trigger': PERSONAL_OUTREACH_TRIGGER,
      created_at: window,
    },
    order: [['created_at', 'DESC']],
  });
  if (outreach) {
    return {
      tenantId: args.tenantId,
      brandId: args.brandId,
      leadId: args.leadId,
      ownerId: 'ali',
      channel: outreach.channel ?? null,
      source: 'ali_personal_outreach',
      sinceAt: outreach.created_at,
    };
  }
  return null;
}

/**
 * Record a derived opener and answer from the EVIDENCE. The reason names what
 * was seen; the id, source and since come from the row that holds the lock
 * (a replay lands on whatever open row exists - a human's from a race, or
 * the AI's own). If the record itself cannot be written, the answer is still
 * 'yes' - the human in the thread is a fact the write failing does not
 * change - with `record_failed:<class>` in the reason and no row id.
 */
async function recordDerived(derived: OpenHumanConversationInput, leadId: number): Promise<HumanConversationAnswer> {
  const reason = `derived_human_conversation:${derived.source}`;
  try {
    const { row } = await openHumanConversation(derived);
    return { ...answerFrom(row), reason };
  } catch (err: unknown) {
    const error_class = classifyError(err);
    log('growth_journey.human_conversation_record_failed', { error_class, brand_id: derived.brandId, lead_id: leadId, source: derived.source });
    return { value: 'yes', reason: `${reason}:record_failed:${error_class}`, ownership_id: null, source: derived.source, since_at: derived.sinceAt ?? null };
  }
}

/**
 * Answer `human_conversation` for one lead in one brand. Never throws: a
 * failed lookup is `'unknown'` with the error class, logged with ids only.
 * Called by `resolveContactEvidence` only after the lead itself was readable,
 * which is what lets `'no'` mean "none, and we could see".
 */
export async function resolveHumanConversation(args: ResolveHumanConversationArgs): Promise<HumanConversationAnswer> {
  if (args.leadId === null) {
    return { value: 'unknown', reason: 'no_lead_anchor', ownership_id: null, source: null, since_at: null };
  }
  const leadId = args.leadId;
  try {
    const open = await openRowFor(leadId, args.brandId);
    if (open) return answerFrom(open);

    const derived = await deriveOpener({ ...args, leadId });
    if (derived) return recordDerived(derived, leadId);

    return { value: 'no', reason: 'no open human conversation', ownership_id: null, source: null, since_at: null };
  } catch (err: unknown) {
    const error_class = classifyError(err);
    log('growth_journey.human_conversation_lookup_failed', { error_class, brand_id: args.brandId, lead_id: leadId });
    return { value: 'unknown', reason: `lookup_failed:${error_class}`, ownership_id: null, source: null, since_at: null };
  }
}
