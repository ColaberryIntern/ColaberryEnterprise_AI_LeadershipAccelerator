/**
 * P3-T1 — the handoff from project understanding into blueprint generation.
 *
 * THIS MODULE IS THE STEP THAT MEASURABLY FAILED. `projectUnderstanding.ts:79-84` records the
 * incident in the code itself: a simulated intake stated THIRTY numbered requirements, the
 * understanding kept 13, "the brief carried NONE of them", and the plan came back with 24
 * requirements of which 18 were invented. The brief is this handoff. Three upstream causes were
 * fixed on 2026-10-01 — the `requirements` dimension now exists, the extraction ceiling is
 * `EXTRACTION_MAX_TOKENS = 12_000`, and the prompt guards against loss as well as invention — but
 * nothing yet asserts that what survived extraction actually *arrives*. That is this file's job.
 *
 * Two directions, because the incident had both:
 *   - LOSS      30 stated -> 0 carried. Caught by `compareSourceSets`.
 *   - INVENTION 24 returned, 18 of them fabricated. NOT caught by `compareSourceSets`, which
 *               reports `lost`, `duplicated` and `inventedConfirmations` but has no notion of an
 *               id appearing in `after` that was never in `before`. This module adds that
 *               direction rather than reimplementing the three it already has.
 *
 * NO DATABASE. Pure transformation over values, so there is nothing to lazy-load and no route
 * test can be broken by importing it. It reads no tables, which is why it is not gated behind
 * the Phase 3 schema precondition.
 */

import {
  mintSourceItem,
  reviseSourceItem,
  compareSourceSets,
  itemsMissingProvenance,
  type SourceItem,
  type SourceLossReport,
  type Provenance as SourceProvenance,
} from '../sourceIdentity';
import {
  type UnderstandingItem,
  type UnderstandingDimension,
  type Classification,
} from '../../delivery/projectUnderstanding';

/**
 * Character budget for everything forwarded to generation.
 *
 * Deliberately a CHARACTER count, not a token estimate. A token estimate is a guess that varies
 * by tokenizer, and a guess is the wrong instrument for a check whose entire purpose is to be
 * exact about what did and did not arrive. Sized well below the 12_000-token extraction ceiling
 * so overflow surfaces here, as a refusal naming ids, rather than downstream as a silent clip.
 */
export const HANDOFF_BUDGET_CHARS = 24_000;

/**
 * Dimensions whose loss is never acceptable, regardless of budget pressure.
 *
 * `requirements` is first for the reason the incident gives: every other dimension describes the
 * SHAPE of a problem, so losing one degrades a description. Losing a requirement drops something
 * the customer explicitly asked for, in their own words.
 */
export const NEVER_DROPPABLE_DIMENSIONS: ReadonlyArray<UnderstandingDimension> = [
  'requirements',
  'constraints',
  'approval_points',
  'human_only_decisions',
  'security_context',
];

/** A source item plus the understanding context generation needs to allocate it. */
export interface HandoffItem {
  item: SourceItem;
  dimension: UnderstandingDimension;
  /** Carried verbatim from the understanding. Never re-derived, never defaulted. */
  classification: Classification;
  /**
   * The customer's exact words, when the extractor captured them; `null` when it did not.
   *
   * Kept as its own field rather than folded into the item's text or provenance. The
   * `requirements` dimension exists to "record verbatim when someone states it"
   * (`projectUnderstanding.ts:87-88`), and a paraphrase sitting where a quote is expected is how
   * a reviewer comes to believe they are reading the customer.
   */
  sourceQuote: string | null;
}

export interface HandoffOverflow {
  /** Total characters the understanding would contribute. */
  totalChars: number;
  budgetChars: number;
  /** Ids that do not fit. Named, so the refusal is actionable rather than a bare failure. */
  wouldDrop: string[];
  /** Ids in `wouldDrop` that belong to a never-droppable dimension. Any entry is unrecoverable. */
  wouldDropProtected: string[];
}

export interface HandoffReport extends SourceLossReport {
  /**
   * Ids present after the transformation that were never in the input.
   *
   * The direction `compareSourceSets` does not cover, and the one that produced 18 fabricated
   * requirements. An empty input yielding a non-empty output is pure invention.
   */
  invented: string[];
  /** Ids whose provenance was never recorded. Surfaced, never guessed. */
  missingProvenance: string[];
  /**
   * Ids present in both whose TEXT changed and whose revision was bumped.
   *
   * A legitimate wording correction. Reported so a reviewer sees it, but it does not make the
   * report fail: correcting a requirement is allowed, doing it invisibly is not.
   */
  revised: string[];
  /**
   * Ids whose text changed with NO revision bump. History rewritten in place.
   *
   * This is the failure the id-stability fix originally introduced: a corrected requirement
   * came back at the same id and the same revision, so the report said nothing had happened.
   * Any entry here is a failure.
   */
  rewrittenWithoutRevision: string[];
}

export interface HandoffResult {
  /** Empty when `overflow` is set — a refusal does not also return a partial payload. */
  items: ReadonlyArray<HandoffItem>;
  /** Set when the understanding exceeds the budget. Blocking, not advisory. */
  overflow: HandoffOverflow | null;
  /** Human-readable reason when `overflow` is set, else null. */
  refusedReason: string | null;
}

/**
 * Map an understanding provenance onto a source provenance.
 *
 * `client_confirmed` and `pm_confirmed` are NOT mapped to the `confirmed` STATE, and that is a
 * deliberate refusal rather than an oversight. `mintSourceItem` rejects capture as `confirmed`
 * because confirmation is a human act on an existing item, and `compareSourceSets` counts a
 * state arriving at `confirmed` through any other route as an *invented confirmation*. We know
 * from the provenance that someone confirmed something upstream; we do not know WHO, and a
 * confirmation with no nameable human behind it is exactly what the approval ladders exist to
 * refuse. So the fact is preserved where it is true — in `kind` — and the state stays `heard`.
 */
function toSourceProvenance(
  it: UnderstandingItem,
  dimension: UnderstandingDimension,
  ordinal: number,
): SourceProvenance {
  return {
    kind: it.provenance,
    locator: `${dimension}#${ordinal}`,
    // NULL, and deliberately so. `sourceRevision` means "the revision of the source DOCUMENT this
    // was read from", and an UnderstandingItem carries no document revision — it has a
    // `source_quote`, which is a different thing. Putting the quote here would type-check and be
    // wrong, so the field records what it actually is: unrecorded. The quote is carried on
    // HandoffItem.sourceQuote instead. Per the request: a missing provenance detail stays null
    // and is never inferred.
    sourceRevision: null,
  };
}

/**
 * Build the generation handoff from a project understanding.
 *
 * Every item arrives or the whole handoff refuses. There is no partial success, because a partial
 * handoff is precisely what shipped 30 requirements as 0: each individual step looked like it had
 * worked.
 */
export function buildSourceHandoff(
  understanding: ReadonlyArray<UnderstandingItem>,
  prior: ReadonlyMap<string, SourceItem> = new Map(),
): HandoffResult {
  const staged: HandoffItem[] = [];
  let totalChars = 0;

  // Prior items grouped by dimension. The locator encodes the dimension, so this reads the
  // grouping back out of the map the caller threaded in.
  const priorByDimension = new Map<string, SourceItem[]>();
  for (const [locator, item] of prior) {
    const dim = locator.split('#')[0];
    (priorByDimension.get(dim) ?? priorByDimension.set(dim, []).get(dim)!).push(item);
  }

  // One pass per dimension, because identity resolution needs to see the whole set.
  const byDimension = new Map<UnderstandingDimension, UnderstandingItem[]>();
  for (const it of understanding) {
    (byDimension.get(it.dimension) ?? byDimension.set(it.dimension, []).get(it.dimension)!).push(it);
  }

  // Identity is resolved per dimension, because the algorithm needs to see the whole set - but the
  // OUTPUT stays in the understanding's own input order. Grouping the output by dimension would
  // silently reorder the handoff, and a reviewer reading it expects the order they wrote.
  const resolvedByItem = new Map<UnderstandingItem, SourceItem>();
  for (const [dimension, items] of byDimension) {
    const priors = [...(priorByDimension.get(dimension) ?? [])];
    const resolved = resolveIdentities(items, priors);
    items.forEach((it, index) => {
      const identity = resolved[index] ?? mintFor(it, dimension, index + 1);
      resolvedByItem.set(it, identity);
    });
  }

  for (const it of understanding) {
    totalChars += it.value.length;
    staged.push({
      item: resolvedByItem.get(it)!,
      dimension: it.dimension,
      classification: it.classification,
      sourceQuote: it.source_quote ?? null,
    });
  }

  if (totalChars > HANDOFF_BUDGET_CHARS) {
    const overflow = describeOverflow(staged, totalChars);
    return {
      items: [],
      overflow,
      refusedReason:
        `HandoffOverflow: the understanding contributes ${totalChars} characters against a budget of `
        + `${HANDOFF_BUDGET_CHARS}. ${overflow.wouldDrop.length} item(s) would not fit`
        + (overflow.wouldDropProtected.length > 0
          ? `, including ${overflow.wouldDropProtected.length} in a never-droppable dimension`
          : '')
        + '. Refusing rather than truncating: a clipped handoff is how thirty stated requirements '
        + 'reached generation as zero.',
    };
  }

  return { items: staged, overflow: null, refusedReason: null };
}

/** Mint a fresh item for one understanding entry. */
function mintFor(
  it: UnderstandingItem,
  dimension: UnderstandingDimension,
  ordinal: number,
): SourceItem {
  return mintSourceItem({
    text: it.value,
    // Always `heard`: see toSourceProvenance for why a confirmed provenance does not become a
    // confirmed state.
    state: 'heard',
    provenance: toSourceProvenance(it, dimension, ordinal),
    interpretation: null,
  });
}

/**
 * Decide, for one dimension, which prior item (if any) each new item IS.
 *
 * TEXT FIRST, POSITION ONLY WHEN UNAMBIGUOUS. The previous version keyed on position alone, and
 * the P3-T6 attempt-2 verifier measured what that cost:
 *
 *   - REORDERING two requirements reported `ok: true, revised: 2` with both identities swapped
 *     onto the wrong statements. Before the id-stability work a reorder minted fresh ids and
 *     produced a LOUD 3-lost/3-invented false positive: noisy, but safe.
 *   - DELETE ONE AND ADD ONE in the same dimension reported `ok: true, lost: 0, invented: 0`,
 *     with a never-before-stated requirement inheriting an existing id.
 *
 * Both are the founding incident in miniature - a requirement nobody stated arriving as though
 * somebody had - so position alone is not good enough.
 *
 * The rule:
 *   1. An exact TEXT match is the same statement, wherever it sits. Reuse it unchanged. This is
 *      what makes a reorder safe.
 *   2. Otherwise, reuse by position ONLY when exactly one prior and exactly one new item are left
 *      unmatched - then it is unambiguously that item's wording being corrected.
 *   3. Otherwise MINT. The unmatched priors then surface in `lost` and the new items in
 *      `invented`, which is loud and correct rather than quiet and wrong.
 */
function resolveIdentities(
  items: ReadonlyArray<UnderstandingItem>,
  priors: ReadonlyArray<SourceItem>,
): Array<SourceItem | null> {
  const out: Array<SourceItem | null> = items.map(() => null);
  const claimed = new Set<string>();

  // 1. exact text matches, in order, each prior claimed at most once
  items.forEach((it, i) => {
    const hit = priors.find((p) => p.text === it.value && !claimed.has(p.id));
    if (hit) { out[i] = hit; claimed.add(hit.id); }
  });

  // 2. A DECLARED correction, never an inferred one.
  //
  // Position alone cannot tell "AAA was reworded into CCC" from "AAA was deleted and CCC was
  // added" - the data is identical. An earlier version assumed the first, which meant a
  // never-before-stated requirement inherited an existing id, provenance and history. That is the
  // founding incident in miniature.
  //
  // The discriminator is already in the data: a genuine correction carries the prior wording in
  // `UnderstandingItem.history`. So a revision happens when the item SAYS it is one. Everything
  // else mints, and the prior then surfaces in `lost` while the new one surfaces in `invented` -
  // loud and correct rather than quiet and wrong. Declared, not inferred.
  const openPriors = priors.filter((p) => !claimed.has(p.id));
  const openIndexes = out.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  for (const i of openIndexes) {
    const declaredPrior = openPriors.find((p) => !claimed.has(p.id)
      && (items[i].history ?? []).some((h) => h.value === p.text));
    if (declaredPrior) {
      out[i] = reviseSourceItem(declaredPrior, items[i].value);
      claimed.add(declaredPrior.id);
    }
  }

  // 3. everything else mints, which the caller does when it sees null
  return out;
}
/**
 * Which items would not fit, and whether any of them are unrecoverable.
 *
 * Fills the budget in input order and names the remainder. Order matters only for *reporting* —
 * the handoff refuses either way, so this never silently prefers one item over another.
 */
function describeOverflow(
  staged: ReadonlyArray<HandoffItem>,
  totalChars: number,
): HandoffOverflow {
  const protectedDims = new Set<UnderstandingDimension>(NEVER_DROPPABLE_DIMENSIONS);
  const wouldDrop: string[] = [];
  const wouldDropProtected: string[] = [];
  let used = 0;

  for (const s of staged) {
    const len = s.item.text.length;
    if (used + len <= HANDOFF_BUDGET_CHARS) {
      used += len;
      continue;
    }
    wouldDrop.push(s.item.id);
    if (protectedDims.has(s.dimension)) wouldDropProtected.push(s.item.id);
  }

  return { totalChars, budgetChars: HANDOFF_BUDGET_CHARS, wouldDrop, wouldDropProtected };
}

/**
 * Assert that a transformation neither lost nor invented a source item.
 *
 * Extends `compareSourceSets` with the direction it does not cover. The three checks it DOES
 * cover — lost, duplicated, inventedConfirmations — are reused verbatim rather than rewritten,
 * so a fix there is a fix here.
 */
export function reportHandoffIntegrity(
  before: ReadonlyArray<SourceItem>,
  after: ReadonlyArray<SourceItem>,
): HandoffReport {
  const base = compareSourceSets(before, after);
  const beforeById = new Map(before.map((i) => [i.id, i]));
  const invented = [...new Set(after.filter((a) => !beforeById.has(a.id)).map((a) => a.id))];
  const missingProvenance = itemsMissingProvenance(after);

  // The direction a pure id-set comparison cannot see: same id, different words.
  const revised: string[] = [];
  const rewrittenWithoutRevision: string[] = [];
  for (const a of after) {
    const b = beforeById.get(a.id);
    if (!b || b.text === a.text) continue;
    if (a.revision > b.revision) revised.push(a.id);
    else rewrittenWithoutRevision.push(a.id);
  }

  return {
    ...base,
    ok: base.ok && invented.length === 0 && rewrittenWithoutRevision.length === 0,
    invented,
    missingProvenance,
    revised,
    rewrittenWithoutRevision,
  };
}

/**
 * The items of one dimension, in input order.
 *
 * Exists so a caller can assert "all thirty requirements arrived" against the dimension rather
 * than against a total, which is the assertion the incident actually needed.
 */
/**
 * The (locator -> item) map a later replay needs, read off a result.
 *
 * Carries the whole item, not just the id, because a replay has to tell an unchanged
 * requirement from a re-worded one - and that needs the prior TEXT. Exists so a caller never
 * has to know how a locator is built.
 *
 * IDENTITY IS RESOLVED TEXT-FIRST, not by position - see `resolveIdentities`. An earlier
 * version keyed on position alone, and this paragraph used to claim the resulting drift
 * "surfaces as a revision rather than silently reassigning identity". Measured, it did
 * silently reassign identity with `ok: true`, so the paragraph asserted the opposite of the
 * behaviour. A reorder is now safe and a delete-plus-add is now loud.
 *
 * What remains genuinely unresolvable without a stable per-item id on `UnderstandingItem`:
 * two items in one dimension changing wording in the SAME replay. That is ambiguous by
 * construction, so both mint and both surface as lost+invented - loud and safe, at the cost
 * of losing the revision history on those two.
 */
export function itemsByLocator(result: HandoffResult): Map<string, SourceItem> {
  const out = new Map<string, SourceItem>();
  for (const h of result.items) {
    const loc = h.item.provenance?.locator;
    if (loc) out.set(loc, h.item);
  }
  return out;
}

/**
 * The items of one dimension, in input order.
 *
 * Exists so a caller can assert "all thirty requirements arrived" against the dimension rather
 * than against a total, which is the assertion the incident actually needed. A total can be
 * satisfied by thirty copies of one item; a per-dimension list cannot.
 */
export function itemsForDimension(
  result: HandoffResult,
  dimension: UnderstandingDimension,
): ReadonlyArray<HandoffItem> {
  return result.items.filter((i) => i.dimension === dimension);
}
