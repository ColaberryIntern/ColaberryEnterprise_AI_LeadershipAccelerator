/**
 * Decides whether a `/knowledge` entry may be quoted to a person, and refuses with a
 * named reason when it may not.
 *
 * WHY A GATE AND NOT A RANKER. The hub is the library an outreach agent has been pointed
 * at, and it is published and public. It is also, measured today, not uniformly safe to
 * quote:
 *
 *   - 137 of 217 entries (63%) carry `confidence: "unstated"` - nobody ever reviewed
 *     them. Only the sales domain has ever been triaged.
 *   - 23 entries plus `core_facts` use the word this repo may not advertise
 *     (40 TAC 807.172(d)); most are our own copy for our own event, not third-party
 *     references.
 *   - 15 entries state a date that has already passed, and `core_facts` states two.
 *   - The file-level description says "Refund and cancellation terms are drafted, not
 *     final", yet all 20 refund/cancellation entries read `needs_verification: false`.
 *     `compliance-8` says "we do not quote them as final"; `sales-8` quotes a specific
 *     non-refundable clause and labels itself "Approved policy." Both unflagged. Which
 *     one an agent repeats is decided by whichever the retriever happened to match.
 *
 * So the useful question is not "which entry is most relevant" but "may this entry be
 * repeated at all". Relevance is somebody else's job.
 *
 * COMPOSED, NOT REINVENTED. The two checks that already exist in this subtree are used
 * as they are:
 *
 *   - `explorerQuoteGuard.scanQuotedCopy` for forbidden wording. It holds no rules; they
 *     arrive as an argument, so this module does not retype the regulated word either.
 *   - `explorerFactGuard.findUngroundedFacts` for dates, prices and seat counts. Its
 *     doctrine is the right one and is better than a staleness check: the question is
 *     not "is this date in the past" but "is it the date actually resolved for this
 *     person". A stale date fails that test, and so does a future date nobody resolved.
 *     With no facts resolved it rejects every date and price, which is the correct
 *     reading of "we know nothing".
 *
 * FAILS CLOSED, INCLUDING ON ITS OWN MISSING INPUTS. If no copy rules are supplied the
 * wording check did not run, and a check that did not run must never read as a check that
 * passed - the rule `explorerQuoteGuard` already states as "zero rules means UNCHECKED,
 * never clean". Here that is made blocking rather than advisory, because the opposite
 * posture is what `resolveContentPageAccess` did when it read absent state as approved
 * and once marked all 153 Explorers CONVERTED.
 */

import {
  findUngroundedFacts,
  EMPTY_FACT_SET,
  type ExplorerFactSet,
} from './explorerFactGuard';
import {
  scanQuotedCopy,
  type QuoteCopyRule,
  type QuotableField,
} from './explorerQuoteGuard';
import type { KnowledgeBase, KnowledgeEntry } from './explorerKnowledgeSource';

/** Why an entry may not be repeated. One code per distinct cause. */
export type QuoteRefusalCode =
  /** Nobody ever vouched for this entry. Absence of a review is not a pass. */
  | 'confidence_unstated'
  /** Written but explicitly not confirmed. The hub's own copy says confirm first. */
  | 'confidence_drafted_verify'
  /** Wording a rule forbids. */
  | 'banned_copy'
  /** States a date, price or seat count the resolved context does not support. */
  | 'ungrounded_fact'
  /** No copy rules were supplied, so the wording check never ran. */
  | 'copy_rules_absent';

export interface QuoteRefusal {
  readonly code: QuoteRefusalCode;
  /** Human-readable, naming the offending text where there is any. */
  readonly detail: string;
}

/**
 * What a caller may attribute a quote to.
 *
 * DELIBERATELY NOT THE ENTRY ID. `build-kb.js` derives ids positionally
 * (`domain + "-" + (i + 1)`), so inserting one entry renumbers every later entry in that
 * domain and `sales-8` silently becomes a different answer. The question text and the
 * hub deep link are both stable across a rebuild and both checkable by a human.
 */
export interface KnowledgeCitation {
  readonly domain: string;
  readonly question: string;
  readonly reference: string;
  readonly referenceLabel: string;
}

/** Which checks actually executed, so "no refusals" cannot be confused with "none ran". */
export interface QuoteChecksRun {
  readonly confidence: boolean;
  readonly bannedCopy: boolean;
  readonly groundedFacts: boolean;
}

export interface KnowledgeQuoteDecision {
  readonly quotable: boolean;
  readonly refusals: readonly QuoteRefusal[];
  readonly checksRun: QuoteChecksRun;
  /** Non-null only when `quotable`. There is nothing to cite for a refused entry. */
  readonly citation: KnowledgeCitation | null;
}

export interface KnowledgeQuoteContext {
  /**
   * The facts resolved for this specific learner. Omit or leave empty and every date,
   * price and seat count in the entry is treated as ungrounded - which is the intended
   * behaviour, not a degenerate case.
   */
  readonly facts?: ExplorerFactSet;
  /**
   * The forbidden-wording rules. Passed in rather than imported so this module holds no
   * copy of the regulated word; see `explorerQuoteGuard` for why neither canonical
   * declaration is importable from a module like this one.
   */
  readonly copyRules: readonly QuoteCopyRule[];
}

/** The fields of an entry that could end up in front of a person. */
function quotableFieldsOf(entry: KnowledgeEntry): QuotableField[] {
  return [
    { field: 'question', text: entry.question },
    { field: 'answer', text: entry.answer },
    { field: 'detail', text: entry.detail },
  ];
}

function confidenceRefusal(entry: KnowledgeEntry): QuoteRefusal | null {
  if (entry.confidence === 'unstated') {
    return {
      code: 'confidence_unstated',
      detail:
        `entry "${entry.id}" carries no confidence statement, so it has never been ` +
        'reviewed. Unstated is not the same as verified.',
    };
  }
  if (entry.confidence === 'drafted-verify') {
    return {
      code: 'confidence_drafted_verify',
      detail:
        `entry "${entry.id}" is marked drafted-verify: written but not confirmed, and ` +
        'the hub asks for confirmation before it is quoted verbatim.',
    };
  }
  return null;
}

/**
 * Screens one block of text for forbidden wording and ungrounded facts.
 *
 * Shared by the entry gate and the `core_facts` gate so the two cannot drift into
 * disagreeing about the same string.
 */
function screenText(
  fields: readonly QuotableField[],
  context: KnowledgeQuoteContext,
): { refusals: QuoteRefusal[]; checksRun: Omit<QuoteChecksRun, 'confidence'> } {
  const refusals: QuoteRefusal[] = [];

  const copy = scanQuotedCopy(fields, context.copyRules);
  const bannedCopyRan = context.copyRules.length > 0;

  if (!bannedCopyRan) {
    refusals.push({
      code: 'copy_rules_absent',
      detail:
        'no forbidden-wording rules were supplied, so that check did not run. A check ' +
        'that did not run is not a check that passed.',
    });
  }

  for (const flag of copy.flags) {
    const alternatives =
      flag.approvedAlternatives.length > 0
        ? ` Approved alternatives: ${flag.approvedAlternatives.join(', ')}.`
        : '';
    refusals.push({
      code: 'banned_copy',
      detail:
        `${flag.field} contains "${flag.matched}" (rule ${flag.ruleId}): ${flag.reason}` +
        `${alternatives} Context: "${flag.excerpt}"`,
    });
  }

  const facts = context.facts ?? EMPTY_FACT_SET;
  for (const field of fields) {
    if (typeof field.text !== 'string' || field.text.length === 0) continue;
    for (const ungrounded of findUngroundedFacts(field.text, facts)) {
      refusals.push({
        code: 'ungrounded_fact',
        detail:
          `${field.field} states a ${ungrounded.kind} the resolved context does not ` +
          `support: "${ungrounded.text}". It must come from a resolved fact, or not be stated.`,
      });
    }
  }

  return { refusals, checksRun: { bannedCopy: bannedCopyRan, groundedFacts: true } };
}

/**
 * Whether this entry may be repeated to a person, and every reason it may not.
 *
 * Every reason, not the first: an entry fixed for one cause but failing another should
 * not need a second round trip to discover that.
 */
export function decideKnowledgeQuote(
  entry: KnowledgeEntry,
  context: KnowledgeQuoteContext,
): KnowledgeQuoteDecision {
  const refusals: QuoteRefusal[] = [];

  const confidence = confidenceRefusal(entry);
  if (confidence) refusals.push(confidence);

  const screened = screenText(quotableFieldsOf(entry), context);
  refusals.push(...screened.refusals);

  const quotable = refusals.length === 0;

  return {
    quotable,
    refusals,
    checksRun: { confidence: true, ...screened.checksRun },
    citation: quotable
      ? {
          domain: entry.domain,
          question: entry.question,
          reference: entry.reference,
          referenceLabel: entry.referenceLabel,
        }
      : null,
  };
}

/**
 * The same judgement for the `core_facts` string.
 *
 * It needs its own entry point because it is the part of the export most likely to be
 * pasted verbatim into a message, and it is not an entry: it carries no confidence
 * statement of any kind. It is therefore treated as `unstated`, which is the honest
 * reading rather than a convenient one.
 */
export function decideCoreFactsQuote(
  base: KnowledgeBase,
  context: KnowledgeQuoteContext,
): KnowledgeQuoteDecision {
  const refusals: QuoteRefusal[] = [
    {
      code: 'confidence_unstated',
      detail:
        'core_facts carries no confidence statement of any kind - it is a single ' +
        'maintained string, not a reviewed entry. Unstated is not the same as verified.',
    },
  ];

  const screened = screenText([{ field: 'core_facts', text: base.coreFacts }], context);
  refusals.push(...screened.refusals);

  return {
    quotable: false,
    refusals,
    checksRun: { confidence: true, ...screened.checksRun },
    citation: null,
  };
}

export interface QuotableSelection {
  readonly quotable: readonly KnowledgeEntry[];
  /** Entry id to the reasons it was refused, for an operator to act on. */
  readonly refused: ReadonlyMap<string, readonly QuoteRefusal[]>;
  /** How many entries were refused for each cause. An entry can appear under several. */
  readonly refusalCounts: Readonly<Record<QuoteRefusalCode, number>>;
}

/**
 * Partitions a whole knowledge base into what may and may not be quoted.
 *
 * The counts are returned rather than logged because the shape of the refusals is the
 * thing worth looking at: if almost everything is refused for one cause, that cause is a
 * content problem to fix at the source, not a gate to loosen.
 */
export function selectQuotableEntries(
  base: KnowledgeBase,
  context: KnowledgeQuoteContext,
): QuotableSelection {
  const quotable: KnowledgeEntry[] = [];
  const refused = new Map<string, readonly QuoteRefusal[]>();
  const refusalCounts: Record<QuoteRefusalCode, number> = {
    confidence_unstated: 0,
    confidence_drafted_verify: 0,
    banned_copy: 0,
    ungrounded_fact: 0,
    copy_rules_absent: 0,
  };

  for (const entry of base.entries) {
    const decision = decideKnowledgeQuote(entry, context);
    if (decision.quotable) {
      quotable.push(entry);
      continue;
    }
    refused.set(entry.id, decision.refusals);
    for (const code of new Set(decision.refusals.map((r) => r.code))) {
      refusalCounts[code] += 1;
    }
  }

  return { quotable, refused, refusalCounts };
}
