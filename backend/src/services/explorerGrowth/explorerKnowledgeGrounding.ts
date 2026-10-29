import { BANNED_COPY_RULES } from '../content/bannedCopyRule';
import type { ExplorerFactSet } from './explorerFactGuard';
import {
  selectQuotableEntries,
  type QuoteRefusalCode,
  type KnowledgeCitation,
} from './explorerKnowledgeQuote';
import type { KnowledgeBase, KnowledgeEntry } from './explorerKnowledgeSource';

/**
 * Turns the knowledge base into a prompt block the draft stage can ground copy on, plus
 * the citations that make every fact traceable back to the entry it came from.
 *
 * ## Governance first, relevance second
 *
 * `explorerKnowledgeQuote`'s header states the division of labour this module completes:
 * *"the useful question is not 'which entry is most relevant' but 'may this entry be
 * repeated at all'. Relevance is somebody else's job."* This is that somebody. Entries are
 * partitioned by {@link selectQuotableEntries} BEFORE anything is ranked, so an entry that
 * may not be repeated cannot be rescued by being a good match. Doing it the other way -
 * rank, then filter the top few - would mean the gate's verdict depended on the search
 * query, and a refused entry would silently take a slot that a quotable one could have had.
 *
 * ## The scoring is Maya's, deliberately unchanged
 *
 * `admissionsKnowledgeService.findRelevantKnowledge` already scores a knowledge library
 * against a query: +3 for a keyword hit, +2 for a title hit, +1 for a body hit, +2 for a
 * category match. That arithmetic is reproduced here against the equivalent fields rather
 * than improved on, because two scoring rules over two knowledge libraries would drift and
 * then disagree about the same question. What is NOT reproduced is Maya's mechanism: she
 * loads her whole active table into JavaScript to score it, which is fine for ~100 rows and
 * is not a pattern worth spreading. Here the corpus is already in memory, parsed and
 * governance-filtered, so scoring is a map over an array and there is no query to push down.
 *
 * ## Why there is no `priority` term
 *
 * Maya's rows carry an editorial `priority` and hers adds `priority * 0.1`. A hub entry has
 * no such field, and inventing one from `confidence` would be double-counting: every entry
 * that reaches the ranker is already `grounded`, because the gate refuses both other states.
 * So the tie-break is the entry id - stable within one version of the export, which is all a
 * tie-break needs, and never used as a durable key.
 *
 * ## Pure, and it reports rather than decides
 *
 * No I/O, no clock, no model call. A thin block is a fact about the corpus, not a failure,
 * so the refusal counts come back with it: if 137 entries are refused for one cause, that is
 * a content problem to fix at the source rather than a gate to loosen.
 */

/** One ranked, quotable entry and why it ranked. */
export interface RankedEntry {
  readonly entry: KnowledgeEntry;
  readonly score: number;
}

/** Everything the draft stage needs from the knowledge base for one message. */
export interface GroundingResult {
  /** The prompt text to append. Empty string when there is nothing quotable to say. */
  readonly block: string;
  /** One per entry in the block, in block order, for persisting on the draft. */
  readonly citations: readonly KnowledgeCitation[];
  /** How many entries survived the gate at all, before ranking narrowed them. */
  readonly quotableCount: number;
  /** Why entries were refused. An entry can appear under several causes. */
  readonly refusalCounts: Readonly<Record<QuoteRefusalCode, number>>;
  /** True when the gate ran with a non-empty rule set. False means UNCHECKED, not clean. */
  readonly copyRulesApplied: boolean;
}

/**
 * How many entries may reach the prompt.
 *
 * Four, matching `buildKnowledgeContext`'s own limit for Maya rather than picking a new
 * number. The constraint is the model's attention, not the corpus: a dozen entries pasted
 * into a 150-250 word email prompt invites the model to summarise the knowledge base
 * instead of writing to one person.
 */
export const MAX_GROUNDING_ENTRIES = 4;

/**
 * Function words that carry no topical signal.
 *
 * THE ONE DELIBERATE DEPARTURE from Maya's tokenizer, and it is about the threshold rather
 * than the weights. Maya keeps every word of 3+ characters with no stopword list, which is
 * harmless for her: she has ~100 curated rows and her callers read the top few. Here the
 * corpus is 217 entries and only {@link MAX_GROUNDING_ENTRIES} reach the prompt, and the
 * query is instruction prose ("Invite the learner to the next cohort and mention ..."), so
 * "and" alone would score +1 against nearly every entry body - clearing the `score > 0`
 * bar and making an irrelevant entry eligible for one of four slots. The weights are still
 * Maya's; only the noise is removed before they are applied.
 *
 * Question words are included because almost every hub entry IS a question, so "what",
 * "when" and "how" match most of the library and discriminate nothing.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'and', 'the', 'for', 'are', 'but', 'not', 'you', 'your', 'yours', 'with', 'this', 'that',
  'these', 'those', 'from', 'have', 'has', 'had', 'was', 'were', 'can', 'will', 'would',
  'should', 'could', 'our', 'ours', 'they', 'them', 'their', 'its', 'into', 'out', 'about',
  'than', 'then', 'there', 'here', 'been', 'being', 'over', 'under', 'also', 'just', 'only',
  'very', 'more', 'most', 'some', 'any', 'all', 'each', 'both', 'such', 'same', 'too',
  'what', 'when', 'how', 'why', 'who', 'which', 'does', 'did', 'done', 'get', 'got',
]);

/**
 * Words worth scoring: 3+ characters, lowercased, punctuation trimmed, stopwords dropped.
 *
 * Technical characters (`+`, `#`, `.`, `-`) survive so "c++" and ".NET" remain findable.
 */
export function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9+#.-]/g, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Score one entry against the tokens. Maya's weights, against the hub's field names.
 *
 * `tags` stands in for her `keywords` and keeps her bidirectional substring match, which
 * catches plurals and compounds in either direction - a tag of `cohort` scores a query word
 * of `cohorts`, and a tag of `ai` scores `ai-engineer`. Note what it does NOT catch: stem
 * variants that are not substrings, so a tag of `pricing` does not match a query word of
 * `price` (they share only the prefix `pric`). Matching those would need stemming, which
 * Maya does not do either, and adding it on one side of the repo only would make the two
 * libraries answer the same question differently.
 *
 * `question` stands in for her `title`; `answer` and `detail` together stand in for her
 * `content`, and they are scored as ONE body so an entry does not earn double for repeating
 * itself in both.
 */
export function scoreEntry(entry: KnowledgeEntry, tokens: readonly string[], category?: string): number {
  const question = entry.question.toLowerCase();
  const body = `${entry.answer} ${entry.detail}`.toLowerCase();
  const tags = entry.tags.map((t) => t.toLowerCase());

  let score = 0;
  for (const token of tokens) {
    if (tags.some((tag) => tag.includes(token) || token.includes(tag))) score += 3;
    if (question.includes(token)) score += 2;
    if (body.includes(token)) score += 1;
  }
  if (category && entry.category.toLowerCase() === category.toLowerCase()) score += 2;
  return score;
}

/**
 * Rank already-quotable entries against a query, highest first.
 *
 * Only strictly positive scores survive, matching Maya: an entry that matches nothing in the
 * query is not "the least relevant result", it is irrelevant, and padding a prompt with it
 * invites the model to use it.
 */
export function rankQuotableEntries(
  entries: readonly KnowledgeEntry[],
  query: string,
  category?: string,
  limit: number = MAX_GROUNDING_ENTRIES,
): RankedEntry[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];

  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens, category) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => (b.score - a.score) || a.entry.id.localeCompare(b.entry.id))
    .slice(0, Math.max(0, limit));
}

/**
 * The verbatim header Maya's prompts already use.
 *
 * Reused rather than reworded so there is one phrasing in the repo for "these are facts, use
 * them", and a prompt change is a change in one place.
 */
export const KNOWLEDGE_BLOCK_HEADER = 'KNOWLEDGE BASE (use these facts to answer accurately):';

/**
 * The instruction that makes the block a CONSTRAINT and not just context.
 *
 * Without it, supplying facts reliably increases the number of facts in the output - some of
 * them adjacent inventions. This is the same discipline `composerDraftService` applies with
 * its "NEVER invent a specific fact ... a placeholder is always better than a plausible
 * guess" rule, narrowed to the knowledge block.
 */
export const KNOWLEDGE_BLOCK_CONSTRAINT =
  'Use only what the facts above state. Do not introduce a date, price, duration or number that is not written there, and do not generalise a fact beyond what it says.';

/** Render ranked entries as numbered, citable prompt text. */
export function buildKnowledgeBlock(ranked: readonly RankedEntry[]): string {
  if (ranked.length === 0) return '';

  const lines = ranked.map((r, i) => {
    const detail = r.entry.detail.trim();
    // Numbered so the model can refer to a fact, and so a reviewer reading the draft beside
    // the citation list can tell which entry a sentence came from.
    return [
      `[${i + 1}] ${r.entry.domain} - ${r.entry.question}`,
      `    ${r.entry.answer.trim()}`,
      detail ? `    ${detail}` : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  });

  return [KNOWLEDGE_BLOCK_HEADER, ...lines, '', KNOWLEDGE_BLOCK_CONSTRAINT].join('\n');
}

export interface GroundDraftInput {
  readonly base: KnowledgeBase;
  /** What the message is about. Typically the step goal plus the selected asset titles. */
  readonly query: string;
  /** The learner's resolved facts. Absent or empty means every date and price is ungrounded. */
  readonly facts?: ExplorerFactSet;
  /** Narrows the category bonus. Omit when the message has no single category. */
  readonly category?: string;
  readonly limit?: number;
}

/**
 * Gate, rank, and render - the whole grounding step for one message.
 *
 * Returns an empty block rather than throwing when nothing is quotable. The caller must
 * treat an empty block as "say nothing specific", never as "no constraints apply": the
 * existing fact guard still judges whatever the model writes.
 */
export function groundDraft(input: GroundDraftInput): GroundingResult {
  const copyRules = BANNED_COPY_RULES;
  const selection = selectQuotableEntries(input.base, {
    facts: input.facts,
    copyRules,
  });

  const ranked = rankQuotableEntries(
    selection.quotable,
    input.query,
    input.category,
    input.limit ?? MAX_GROUNDING_ENTRIES,
  );

  return {
    block: buildKnowledgeBlock(ranked),
    citations: ranked.map((r) => ({
      domain: r.entry.domain,
      question: r.entry.question,
      reference: r.entry.reference,
      referenceLabel: r.entry.referenceLabel,
    })),
    quotableCount: selection.quotable.length,
    refusalCounts: selection.refusalCounts,
    // Reported, not assumed. Zero rules would mean the banned-copy check never ran, and a
    // caller reading "no refusals" as "approved" is the fail-open mistake this subsystem
    // has already made once.
    copyRulesApplied: copyRules.length > 0,
  };
}
