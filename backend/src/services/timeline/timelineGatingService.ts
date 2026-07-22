/**
 * timelineGatingService — the Timeline classroom's prerequisite / gating engine.
 *
 * A card is LOCKED for a student while any of its unlock predicates is unmet.
 * Effective predicates = the card's SECTION (bucket) rules ++ the card's OWN
 * `unlock_rules` (AND semantics — all must pass). "Completed" means a
 * `timeline_card_progress` row with status='completed' — the single signal
 * written by `onCardCompleted`. (An Evaluation only reaches 'completed' at ≥75%,
 * so "completed" already means "passed".)
 *
 * Design: lock is a COMPUTED, read-time overlay — evaluated in `getFeed` and at
 * the open/complete choke points — never a persisted state, so there is no
 * "re-unlock" cron to drift. The pure evaluator (`evaluateCardLock` +
 * `normalizeRules`) takes a resolved context and does no I/O, so it is
 * unit-tested in isolation; `buildGateContext` / `assertCardUnlocked` compose it
 * with the DB.
 *
 * Fail-open: any evaluation/DB error is treated as UNLOCKED — never trap a
 * student behind a buggy rule.
 */
import { Op } from 'sequelize';
import TimelineCard, { TimelineBucket } from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import TimelineSectionRule from '../../models/TimelineSectionRule';
import { resolve as resolveType } from './typeRegistry';
import { isStaffEnrollment } from '../access/staffAccess';
import { isFreePreviewTier } from '../access/contentEntitlement';
import { env } from '../../config/env';

// ── predicate model ──────────────────────────────────────────────────────────
export type UnlockScope = 'week' | 'all';
export type UnlockPredicate =
  | { kind: 'card_complete'; card_id: string; label?: string }
  | { kind: 'section_complete'; bucket: TimelineBucket; scope?: UnlockScope; label?: string }
  | { kind: 'type_complete'; type: string; scope?: UnlockScope; label?: string };

export interface UnmetReason { kind: string; label: string }

const BUCKETS: TimelineBucket[] = ['pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance'];
const BUCKET_LABEL: Record<string, string> = {
  pre_class: 'Pre-Class', learn: 'Learn', practice: 'Practice', build: 'Build',
  reflect: 'Reflect', share: 'Share', advance: 'Advance',
};
const bucketLabel = (b: string) => BUCKET_LABEL[b] || b;

// ── the minimal card + context the pure evaluator needs ──────────────────────
export interface GateCard {
  id: string;
  type: string;
  bucket: string;
  week: number | null;
  program_id?: string | null;
  unlock_rules?: any;
}
export interface GateContext {
  allCards: GateCard[];
  completedCardIds: Set<string>;
  sectionRulesFor: (card: GateCard) => UnlockPredicate[];
  isCompletable: (card: GateCard) => boolean;
}
export interface GateResult { locked: boolean; unmet: UnmetReason[] }

/** PURE — validate a JSONB blob into typed predicates; junk is dropped. */
export function normalizeRules(raw: any): UnlockPredicate[] {
  if (!Array.isArray(raw)) return [];
  const out: UnlockPredicate[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : undefined;
    const scope: UnlockScope | undefined = r.scope === 'all' ? 'all' : r.scope === 'week' ? 'week' : undefined;
    if (r.kind === 'card_complete' && typeof r.card_id === 'string' && r.card_id.trim()) {
      out.push({ kind: 'card_complete', card_id: r.card_id.trim(), label });
    } else if (r.kind === 'section_complete' && typeof r.bucket === 'string' && BUCKETS.includes(r.bucket as TimelineBucket)) {
      out.push({ kind: 'section_complete', bucket: r.bucket as TimelineBucket, scope, label });
    } else if (r.kind === 'type_complete' && typeof r.type === 'string' && r.type.trim()) {
      out.push({ kind: 'type_complete', type: r.type.trim(), scope, label });
    }
  }
  return out;
}

/** PURE — is `pred` satisfied for `card` given the completion snapshot? */
function predicateMet(pred: UnlockPredicate, card: GateCard, ctx: GateContext): { met: boolean; reason: UnmetReason } {
  if (pred.kind === 'card_complete') {
    // A card can't gate on its own completion — ignore any self-reference.
    const met = pred.card_id === card.id || ctx.completedCardIds.has(pred.card_id);
    return { met, reason: { kind: pred.kind, label: pred.label || 'Complete the required activity first' } };
  }
  if (pred.kind === 'section_complete') {
    const scope = pred.scope || 'week';
    const targets = ctx.allCards.filter((c) =>
      c.id !== card.id && c.bucket === pred.bucket && ctx.isCompletable(c)
      && (scope === 'all' || c.week === card.week));
    const met = targets.every((c) => ctx.completedCardIds.has(c.id));   // vacuously true if none
    return { met, reason: { kind: pred.kind, label: pred.label || `Finish the ${bucketLabel(pred.bucket)} tasks first` } };
  }
  // type_complete
  const scope = pred.scope || 'week';
  const targets = ctx.allCards.filter((c) =>
    c.id !== card.id && c.type === pred.type && ctx.isCompletable(c)
    && (scope === 'all' || c.week === card.week));
  const met = targets.every((c) => ctx.completedCardIds.has(c.id));
  return { met, reason: { kind: pred.kind, label: pred.label || 'Finish the required activities first' } };
}

/** PURE — the lock verdict for one card. locked = ANY predicate unmet (AND). */
export function evaluateCardLock(card: GateCard, ctx: GateContext): GateResult {
  const rules = [...ctx.sectionRulesFor(card), ...normalizeRules(card.unlock_rules)];
  const unmet: UnmetReason[] = [];
  for (const pred of rules) {
    const r = predicateMet(pred, card, ctx);
    if (!r.met) unmet.push(r.reason);
  }
  return { locked: unmet.length > 0, unmet };
}

// ── I/O: compose the pure engine with the DB ─────────────────────────────────

const toGateCard = (c: TimelineCard): GateCard => ({
  id: c.id, type: c.type, bucket: c.bucket, week: c.week,
  program_id: (c as any).program_id ?? null, unlock_rules: c.unlock_rules,
});

/**
 * A type is "completable" (can reach status='completed') unless it's a system /
 * event / announcement type that has no completion action — those must NOT count
 * toward a `section_complete`, or a section containing one could never finish.
 */
export function isCompletableType(slug: string): boolean {
  const def = resolveType(slug);
  if (!def) return true;   // unknown types: assume completable (fail-open)
  return !def.system && !def.event && def.render_band !== 'announcement';
}

async function loadSectionRules(programIds: Array<string | null>): Promise<Map<string, UnlockPredicate[]>> {
  const ids = programIds.filter((p): p is string => !!p);
  const map = new Map<string, UnlockPredicate[]>();
  if (!ids.length) return map;
  const rows = await TimelineSectionRule.findAll({ where: { program_id: { [Op.in]: ids }, active: true } });
  for (const row of rows) map.set(`${row.program_id}|${row.bucket}`, normalizeRules(row.rules));
  return map;
}

/**
 * Build the gate context for a student. `cards` is the full curriculum set
 * (so section/type predicates see every card) and `completedCardIds` the
 * student's completed set — `getFeed` passes what it already loaded.
 */
export async function buildGateContext(
  cards: TimelineCard[],
  completedCardIds: Set<string>,
): Promise<GateContext> {
  const gateCards = cards.map(toGateCard);
  const sectionRules = await loadSectionRules(Array.from(new Set(gateCards.map((c) => c.program_id ?? null))));
  return {
    allCards: gateCards,
    completedCardIds,
    sectionRulesFor: (c) => sectionRules.get(`${c.program_id ?? 'null'}|${c.bucket}`) || [],
    isCompletable: (c) => isCompletableType(c.type),
  };
}

/** The published, active, shared-curriculum cards (kept local to avoid a cycle
 *  with timelineService, which imports this module). */
async function loadGlobalCards(): Promise<TimelineCard[]> {
  return TimelineCard.findAll({
    where: { cohort_id: null, status: 'active', visibility: 'published' },
    order: [['week', 'ASC'], ['order', 'ASC']],
  });
}

/**
 * Enforcement choke point — throws `{ status: 423, code: 'card_locked' }` when a
 * student tries to open/complete a card whose prerequisites are unmet. A card
 * already in_progress/completed was legitimately reached, so it never re-gates
 * (idempotent, mirrors `assertWatchRequirement`). Fail-open on any other error.
 */
export async function assertCardUnlocked(enrollmentId: string, card: TimelineCard): Promise<void> {
  try {
    // Staff have unrestricted curriculum access — every card is unlocked for them,
    // regardless of prerequisites. (Fail-safe: a lookup error reads as non-staff,
    // so normal gating below still applies.)
    if (await isStaffEnrollment(enrollmentId)) return;

    const progress = await TimelineCardProgress.findOne({ where: { card_id: card.id, enrollment_id: enrollmentId } });
    if (progress && (progress.status === 'completed' || progress.status === 'in_progress')) return;

    // Curriculum paywall backstop (flag-gated): the free-preview tier can open ONLY
    // Week 0 — a week>0 card stays locked until the student enrolls AND pays. Closes
    // the deep-link hole (feed-filtering in getFeed alone would not stop a direct
    // card open/complete). Flag OFF => inert, so legacy behavior is unchanged.
    if (env.contentPaidGateEnabled && card.week != null && card.week > 0) {
      if (await isFreePreviewTier(enrollmentId)) {
        throw Object.assign(
          new Error('Enroll and pay to unlock this week.'),
          { status: 423, code: 'card_locked', reason: 'Enroll and pay to unlock this week.' },
        );
      }
    }

    const cards = await loadGlobalCards();
    const completed = await TimelineCardProgress.findAll({
      where: { enrollment_id: enrollmentId, status: 'completed' },
      attributes: ['card_id'],
    });
    const completedCardIds = new Set(completed.map((p) => p.card_id));
    const ctx = await buildGateContext(cards, completedCardIds);
    const gateCard = ctx.allCards.find((c) => c.id === card.id) || toGateCard(card);
    const verdict = evaluateCardLock(gateCard, ctx);
    if (verdict.locked) {
      throw Object.assign(
        new Error(verdict.unmet[0]?.label || 'This activity is locked until you finish its prerequisites.'),
        { status: 423, code: 'card_locked', reason: verdict.unmet[0]?.label || null },
      );
    }
  } catch (err: any) {
    if (err && err.status === 423) throw err;   // a real lock — propagate
    console.warn('[gating] assertCardUnlocked failed open:', err?.message);   // any other error: fail OPEN
  }
}
