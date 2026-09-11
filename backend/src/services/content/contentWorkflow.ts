import type { ContentItemStatus } from '../../models/ContentItem';
import { CONTENT_ITEM_STATUSES } from '../../models/ContentItem';

/**
 * contentWorkflow — the content lifecycle as a state machine, and the rule for when an edit
 * throws away an approval.
 *
 * Pure. Given (from, to) it says legal or illegal and why; given (approved snapshot, edited
 * snapshot) it says whether the approval still stands and which field broke it. No I/O, so the
 * whole transition table can be enumerated by a test - every pair, legal and illegal - and every
 * invalidating field can be exercised on its own.
 *
 * WHY A TABLE, NOT IF-STATEMENTS. A lifecycle expressed as conditions scattered through
 * handlers is one nobody can read in full, and "can a cancelled item be scheduled?" gets
 * answered differently by two code paths. The table is the whole answer, and its completeness
 * is asserted: every status has an entry, so adding a status without deciding its exits is a
 * test failure rather than an item that can never leave the state it was put in.
 *
 * WHY INVALIDATION IS STRICT. An approval is a person vouching for a specific thing: this copy,
 * these images, to this account, at roughly this time, with this disclosure, under this
 * campaign. Change any of those and the approved thing no longer exists - the approval is
 * attached to content that is not what will be published. Spec 8.3 lists the fields; the
 * schedule gets a tolerance because moving a post by ten minutes to dodge a clash is not a
 * new post, while moving it by a week is.
 */

/** Every legal exit from every status. A status absent here cannot be left - by design for terminals. */
export const TRANSITIONS: Record<ContentItemStatus, readonly ContentItemStatus[]> = {
  idea: ['draft', 'archived'],
  draft: ['ready_for_review', 'archived', 'validation_failed'],
  ready_for_review: ['approved', 'changes_requested', 'draft', 'archived'],
  changes_requested: ['draft', 'ready_for_review', 'archived'],
  // An approved item that is edited on an invalidating field goes BACK to draft via
  // invalidation, never straight to scheduled with a stale approval.
  approved: ['scheduled', 'draft', 'archived', 'expired'],
  scheduled: ['publishing', 'approved', 'cancelled', 'expired'],
  publishing: ['published', 'publish_failed', 'partially_published'],
  published: ['removed_by_provider', 'archived'],
  // Exceptional states and where they can go.
  validation_failed: ['draft', 'archived'],
  publish_failed: ['scheduled', 'draft', 'cancelled', 'archived'],
  partially_published: ['publishing', 'published', 'publish_failed', 'archived'],
  cancelled: ['draft', 'archived'],
  expired: ['draft', 'archived'],
  removed_by_provider: ['archived'],
  // Terminal. Archiving is deliberately a one-way door: an archived item that could come back
  // is not archived, it is hidden, and "hidden" is not a state this workflow offers.
  archived: [],
};

export const TERMINAL_STATES: readonly ContentItemStatus[] = ['archived'];

export function canTransition(from: ContentItemStatus, to: ContentItemStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export type TransitionResult =
  | { ok: true; from: ContentItemStatus; to: ContentItemStatus }
  | { ok: false; from: ContentItemStatus; to: ContentItemStatus; reason: string };

export function transition(from: ContentItemStatus, to: ContentItemStatus): TransitionResult {
  if (from === to) {
    return { ok: false, from, to, reason: `Already ${from}.` };
  }
  if (!CONTENT_ITEM_STATUSES.includes(to)) {
    return { ok: false, from, to, reason: `"${to}" is not a content status.` };
  }
  if (TERMINAL_STATES.includes(from)) {
    return { ok: false, from, to, reason: `${from} is terminal; nothing leaves it.` };
  }
  if (!canTransition(from, to)) {
    return {
      ok: false, from, to,
      reason: `Cannot go from ${from} to ${to}. Legal exits: ${TRANSITIONS[from].join(', ') || 'none'}.`,
    };
  }
  return { ok: true, from, to };
}

// ── Approval invalidation ───────────────────────────────────────────────────────────────────

/**
 * The fields an approval is a promise about. Spec 8.3 lists them; this is the machine-readable
 * version, and each one is exercised on its own by the test suite so a field silently dropped
 * from this list fails a named test rather than quietly widening what an approval covers.
 */
export const INVALIDATING_FIELDS = [
  'copy', 'media', 'destination', 'account', 'schedule', 'disclosure', 'campaign',
] as const;

export type InvalidatingField = (typeof INVALIDATING_FIELDS)[number];

/** What an approver actually saw. Captured at approval time; compared at edit time. */
export interface ApprovalSnapshot {
  /** The canonical body plus every variant's text, in a stable order. */
  copy: string;
  /** Media asset ids, sorted. Order-insensitive because reordering a carousel is a copy change
   * only if the platform treats it as one - and that is what `media` covers. */
  media: readonly string[];
  /** Where it goes: provider + placement, e.g. "linkedin_organization:feed". */
  destination: readonly string[];
  /** Channel account ids it publishes from. */
  account: readonly string[];
  /** ISO timestamp, or null for "not yet scheduled". */
  schedule: string | null;
  /** Disclosure text (paid partnership, AI-generated, etc.), or empty. */
  disclosure: string;
  campaign: string | null;
}

export interface InvalidationPolicy {
  /**
   * How far a scheduled time may move without invalidating. Dodging a clash by ten minutes is
   * the same post; moving it a week is a decision the approver did not make.
   */
  scheduleToleranceMinutes: number;
  /**
   * Whether metadata-only edits (title, internal notes, tags) invalidate. Off by default:
   * spec 8.3 says minor metadata changes follow configurable policy, and the default that
   * causes the least damage is to leave the approval alone.
   */
  metadataInvalidates: boolean;
}

export const DEFAULT_INVALIDATION_POLICY: InvalidationPolicy = {
  scheduleToleranceMinutes: 15,
  metadataInvalidates: false,
};

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function scheduleMovedBeyondTolerance(before: string | null, after: string | null, toleranceMin: number): boolean {
  // Gaining or losing a schedule entirely is a change the approver did not see.
  if ((before === null) !== (after === null)) return true;
  if (before === null || after === null) return false;
  const b = Date.parse(before);
  const a = Date.parse(after);
  // An unparseable time on either side is a change we cannot vouch for. Invalidate: the
  // failure direction that costs a re-approval is safer than the one that publishes an
  // unapproved schedule.
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return Math.abs(a - b) > toleranceMin * 60_000;
}

export interface InvalidationResult {
  invalidated: boolean;
  /** Which promises the edit broke. Empty when the approval stands. */
  fields: InvalidatingField[];
}

/**
 * Does an edit invalidate an existing approval?
 *
 * Every field is checked independently and every broken one is reported - not just the first.
 * The approver re-reviewing needs to know ALL of what changed; "copy changed" when media
 * changed too sends them back to approve something that will be invalidated again.
 */
export function approvalInvalidatedBy(
  approved: ApprovalSnapshot,
  edited: ApprovalSnapshot,
  policy: InvalidationPolicy = DEFAULT_INVALIDATION_POLICY,
): InvalidationResult {
  const fields: InvalidatingField[] = [];

  if (approved.copy !== edited.copy) fields.push('copy');
  if (!sameSet(approved.media, edited.media)) fields.push('media');
  if (!sameSet(approved.destination, edited.destination)) fields.push('destination');
  if (!sameSet(approved.account, edited.account)) fields.push('account');
  if (scheduleMovedBeyondTolerance(approved.schedule, edited.schedule, policy.scheduleToleranceMinutes)) fields.push('schedule');
  if (approved.disclosure.trim() !== edited.disclosure.trim()) fields.push('disclosure');
  if ((approved.campaign ?? null) !== (edited.campaign ?? null)) fields.push('campaign');

  return { invalidated: fields.length > 0, fields };
}

/**
 * The status an item lands in when its approval is invalidated.
 *
 * Draft, not ready_for_review. The edit that broke the approval may not be finished, and
 * putting it straight back in the review queue would ask an approver to look at something the
 * editor is still working on.
 */
export const STATUS_AFTER_INVALIDATION: ContentItemStatus = 'draft';

/** Statuses in which an approval exists to be invalidated at all. */
export const STATUSES_HOLDING_AN_APPROVAL: readonly ContentItemStatus[] = ['approved', 'scheduled'];

/**
 * Imported history is read-only (spec 18 Stage B). A Loomly post that already went out is a
 * record of something that happened, not a draft; editing or transitioning it would rewrite
 * history that the platform never produced. The flag lives on the row so it survives
 * whatever the status column says.
 */
export function isReadOnlyImport(metadata: Record<string, unknown> | null | undefined): boolean {
  return Boolean(metadata && metadata.readOnly === true && typeof metadata.provenance === 'string');
}
