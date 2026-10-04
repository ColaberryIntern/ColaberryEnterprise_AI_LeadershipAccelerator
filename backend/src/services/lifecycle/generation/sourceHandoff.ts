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
  const perDimensionCount = new Map<UnderstandingDimension, number>();
  const staged: HandoffItem[] = [];
  let totalChars = 0;

  for (const it of understanding) {
    const ordinal = (perDimensionCount.get(it.dimension) ?? 0) + 1;
    perDimensionCount.set(it.dimension, ordinal);

    // REPLAY: reuse the prior ITEM, and revise it when the wording changed.
    //
    // The P3-T1 verifier found that minting a fresh uuid per call meant a REPLAYED handoff over
    // an unchanged understanding would read to reportHandoffIntegrity as 30 lost and 30 invented
    // - the integrity check firing on a correct replay.
    //
    // THE FIRST FIX FOR THAT TRADED A LOUD FALSE POSITIVE FOR A SILENT FALSE NEGATIVE, which is
    // strictly worse. Carrying the id alone meant a CORRECTED requirement came back with the
    // same id and `revision: 1`, so `reportHandoffIntegrity` reported ok/0 lost/0 invented for
    // text that had materially changed. A reviewer would have been told nothing happened.
    //
    // So the replay map carries the prior ITEMS, and a wording change goes through
    // `reviseSourceItem` - same id, next revision - which is what it exists for. An absent
    // entry still mints, so first runs are unchanged.
    const locator = `${it.dimension}#${ordinal}`;
    const priorItem = prior.get(locator);

    const item = mintSourceItem({
      text: it.value,
      // Always `heard`: see toSourceProvenance for why a confirmed provenance does not
      // become a confirmed state.
      state: 'heard',
      provenance: toSourceProvenance(it, it.dimension, ordinal),
      // Our reading of an ambiguous statement is kept separate from the statement itself.
      interpretation: null,
    });

    // Three outcomes, and the middle one is the whole point:
    //   no prior        -> the freshly minted item
    //   prior, same text -> the prior item unchanged, id AND revision preserved
    //   prior, new text  -> reviseSourceItem: same id, revision + 1, state dropped if it had
    //                       been confirmed, because re-wording something is not re-confirming it
    const stable = !priorItem
      ? item
      : priorItem.text === it.value
        ? priorItem
        : reviseSourceItem(priorItem, it.value);

    totalChars += it.value.length;
    staged.push({
      item: stable,
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
 * KNOWN LIMIT, recorded rather than hidden: the locator is POSITIONAL
 * (`${dimension}#${ordinal}`), which the plan prescribed, so deleting an item shifts every
 * later item in that dimension onto its predecessor's locator. `reportHandoffIntegrity`
 * surfaces that as a revision rather than silently reassigning identity, but the attribution
 * is wrong in that case. A stable per-item id on `UnderstandingItem` is the real fix and does
 * not exist yet.
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
