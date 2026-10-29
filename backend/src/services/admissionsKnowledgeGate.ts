import { quotesRetiredFact } from './admissionsPricing';

/**
 * admissionsKnowledgeGate — decide what a retrieved admissions row may contribute to
 * Maya's prompt, at the moment it would be quoted to a visitor.
 *
 * WHY THIS EXISTS, AND WHAT WAS ACTUALLY BROKEN.
 *
 * Maya's chat is live, public and unauthenticated on every marketing page. Her grounding
 * was a SENTENCE IN A PROMPT — "never fabricate specific numbers, dates, or facts" — with
 * nothing enforcing it. Two consequences, both measured in this repo on 2026-10-29:
 *
 *  1. `buildKnowledgeContext` returned the EMPTY STRING when keyword scoring matched
 *     nothing, so the prompt simply had no knowledge block and the model answered from its
 *     own weights, with no marker, no citation and no refusal. Absent knowledge read
 *     exactly like approved knowledge. That is the fail-open shape recorded against
 *     `resolveContentPageAccess`, which once marked all 153 Explorers CONVERTED.
 *  2. `quotesRetiredFact` — the agreed check for the retired $4,500 offer and the past
 *     March 31 2026 cohort — had exactly ONE call site: the end of `seedAdmissionsKnowledge`,
 *     which runs only at boot. `admissionsKnowledgeSyncAgent` crawls the website at 03:00
 *     and writes active rows WITHOUT applying it. So between a crawl and the next restart a
 *     crawled row quoting a retired fact was retrievable and quotable. The 5 rows sitting
 *     at `active = false` in production are evidence such rows do get produced.
 *
 * This module closes both at the point of use. It holds no rules of its own: the retired
 * facts come from `admissionsPricing`, which is a leaf module with no imports and is
 * already the single declaration of what the program costs.
 *
 * WHAT IT BLOCKS, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * It blocks ONLY retired facts. Those are agreed, specific and carry no false positives:
 * nobody may quote $4,500 or March 31 2026, whatever the surrounding sentence says.
 *
 * It does NOT screen forbidden ADVERTISING WORDING, and that is a decision rather than an
 * omission. `explorerQuoteGuard`'s header records the measurement: of 467 active assets,
 * five matched the rule and only ONE was a genuine violation, so a filter would be wrong
 * four times out of five, and a check that is wrong four times out of five trains the
 * reader to dismiss all five. Screening here would also require declaring the regulated
 * word in a new runtime file, which `bannedWordOutboundCopy.test.ts` ratchets per file —
 * the repo makes a second declaration expensive on purpose. Maya's own prompt already
 * forbids the word. If wording screening is wanted later it belongs behind the same
 * rules-as-an-argument shape `explorerQuoteGuard` uses, not a third copy of the word.
 *
 * NOTHING HERE READS A DATABASE, SENDS, OR CALLS A MODEL. Pure functions over rows the
 * caller already fetched, so the decision is testable without a connection.
 */

/**
 * The shape this gate needs from a knowledge row. Declared structurally rather than as the
 * Sequelize model so the gate can be tested with plain objects, and so a future source
 * (the static hub, a different table) satisfies it without a model instance.
 */
export interface QuotableKnowledgeEntry {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly content: string;
}

/** Why a retrieved row may not be put in front of a visitor. */
export type KnowledgeBlockReason = 'retired_fact';

export interface BlockedKnowledgeEntry {
  readonly entry: QuotableKnowledgeEntry;
  readonly reason: KnowledgeBlockReason;
  /** Human-readable, for the retrieval log and for a person reading it later. */
  readonly detail: string;
}

export interface GatedKnowledge {
  readonly allowed: readonly QuotableKnowledgeEntry[];
  readonly blocked: readonly BlockedKnowledgeEntry[];
  /** How many rows arrived, so "nothing allowed" can be told from "nothing retrieved". */
  readonly retrieved: number;
}

/**
 * What goes in the prompt when there is no sourced answer.
 *
 * It is an explicit instruction, NOT an empty string, because an empty string is
 * indistinguishable from "the knowledge base agrees with whatever you were going to say".
 * The wording avoids the advertising term this repo may not use.
 */
export const NO_KNOWLEDGE_DIRECTIVE: string = [
  'KNOWLEDGE BASE: no entry matched this question, so you have NO sourced answer for it.',
  'Do not state program facts, figures, dates, prices or policies from memory, and do not',
  'estimate or approximate them. Say plainly that you want to give them the exact answer,',
  'then offer to connect them with the admissions team or point them to the relevant page.',
].join(' ');

/**
 * Partition retrieved rows into what may be quoted and what may not.
 *
 * Total by construction: every input lands in exactly one of `allowed` or `blocked`, so a
 * row can never be dropped silently the way a `filter` would drop it.
 */
export function gateKnowledgeEntries(
  entries: readonly QuotableKnowledgeEntry[],
): GatedKnowledge {
  const allowed: QuotableKnowledgeEntry[] = [];
  const blocked: BlockedKnowledgeEntry[] = [];

  for (const entry of entries) {
    // Title AND content, because the seeder's own retirement check reads both and a
    // retired figure in a title is quoted just as readily as one in the body.
    if (quotesRetiredFact(`${entry.title} ${entry.content}`)) {
      blocked.push({
        entry,
        reason: 'retired_fact',
        detail:
          `"${entry.title}" quotes a retired fact (the $4,500 per-participant offer or the ` +
          'past March 31, 2026 cohort). Retired facts must not be quoted, so this entry was ' +
          'withheld from the prompt rather than corrected.',
      });
      continue;
    }
    allowed.push(entry);
  }

  return { allowed, blocked, retrieved: entries.length };
}

/**
 * Render the prompt block.
 *
 * Returns the directive above when nothing survives, so the caller never has to decide what
 * an empty result means — which is the mistake this module exists to remove. The allowed
 * shape is unchanged from what Maya's prompt has always carried, so this is not a prompt
 * rewrite: the only new text appears when there is nothing to say.
 */
export function renderKnowledgeContext(gated: GatedKnowledge): string {
  if (gated.allowed.length === 0) return NO_KNOWLEDGE_DIRECTIVE;

  const parts: string[] = ['KNOWLEDGE BASE (use these facts to answer accurately):'];
  for (const entry of gated.allowed) {
    parts.push(`[${entry.category.toUpperCase()}] ${entry.title}: ${entry.content}`);
  }

  // Named explicitly so the model cannot read a short list as the whole truth.
  if (gated.blocked.length > 0) {
    parts.push(
      `(${gated.blocked.length} further entr${gated.blocked.length === 1 ? 'y was' : 'ies were'} ` +
        'withheld because they quote retired facts. Do not reconstruct them.)',
    );
  }

  return parts.join('\n');
}
