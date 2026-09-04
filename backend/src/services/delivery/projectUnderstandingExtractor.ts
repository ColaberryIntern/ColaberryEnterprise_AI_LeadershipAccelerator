/**
 * projectUnderstandingExtractor — turn a conversation into structured project truth.
 *
 * This is the step the customer journey was missing. The call already happens; the
 * transcript already arrives; what did not exist was anything that read it. Gate 0's
 * VOICE_INTAKE_MAP named this precisely: "build the missing piece: transcript → structured
 * intake, converging with chat on one canonical contract".
 *
 * The canonical contract is `projectUnderstanding.ts`. This module is one door into it.
 *
 * ## An extractor may not mint provenance it could not have
 *
 * The contract allows six provenances, but a given extraction run has only seen ONE kind
 * of source. A run over a phone transcript has no way to know what a PM confirmed or what
 * a document said, so it must not be able to say so - and a model asked for provenance
 * will cheerfully return `client_confirmed` for everything, because that is the most
 * agreeable-sounding value in the list.
 *
 * So the allowed set is narrowed per source and enforced after the model returns, not
 * requested politely in the prompt. A transcript run can produce exactly two things:
 * something the person said (`voice_transcript`, with their words attached) or something
 * the model worked out (`ai_inferred`, which by contract can never be a FACT).
 *
 * That is what makes the provenance trail worth anything downstream. Without it, every
 * item in the blueprint would claim to be client-confirmed and none of them would be.
 *
 * ## Empty is a failure, not an understanding
 *
 * `chatJson` swallows a JSON parse error and returns `{}` - both the Anthropic and OpenAI
 * paths do. An empty object would otherwise fail contract validation with "title cannot be
 * empty", which reads like the model produced a nameless project rather than that it
 * produced nothing parseable. The two need different responses from a human, so they are
 * reported differently here.
 */

import { chatJson } from '../runtime/runtimeAi';
import {
  parseUnderstanding,
  validateItem,
  UnderstandingContractError,
  UNDERSTANDING_DIMENSIONS,
  DIMENSION_LABELS,
  type ProjectUnderstanding,
  type Provenance,
} from './projectUnderstanding';

/** Provenances an extractor is allowed to produce, by what it actually looked at. */
export const PROVENANCE_BY_SOURCE = {
  voice_transcript: ['voice_transcript', 'ai_inferred'] as Provenance[],
  chat: ['source_message', 'ai_inferred'] as Provenance[],
  document: ['source_document', 'ai_inferred'] as Provenance[],
} as const;

export type ExtractionSource = keyof typeof PROVENANCE_BY_SOURCE;

export interface ExtractionFacts {
  name?: string | null;
  company?: string | null;
  role?: string | null;
}

/**
 * An item the model produced that the contract would not accept.
 *
 * Kept rather than discarded. The customer said something to produce it, and a dropped item
 * that nobody can see is indistinguishable from a call that was never made - so the raw
 * value travels with the reason it was refused, and a human can look at the pile.
 */
export interface RejectedItem {
  index: number;
  reason: string;
  raw: unknown;
}

export type ExtractionResult =
  | {
      ok: true;
      understanding: ProjectUnderstanding;
      /** Items the contract refused. Empty on a clean run; never silently dropped. */
      rejected: RejectedItem[];
      runtime_ms: number;
      cost_usd: number;
    }
  | { ok: false; error_class: 'EmptyInput' | 'EmptyModelResponse' | 'ContractViolation'; error: string; violations?: string[] };

/**
 * Items whose provenance the source could not possibly support.
 *
 * Exported so the chat and document extractors reuse it rather than re-deriving the rule
 * and drifting from it - the failure mode being a second door into the same contract that
 * quietly permits a provenance the first one forbids.
 */
export function provenanceViolations(u: ProjectUnderstanding, source: ExtractionSource): string[] {
  const allowed = PROVENANCE_BY_SOURCE[source];
  return u.items
    .map((item, i) =>
      allowed.includes(item.provenance)
        ? null
        : `item ${i} (${item.dimension}): provenance "${item.provenance}" is not available to a ${source} extraction`,
    )
    .filter((v): v is string => v !== null);
}

/* ── Quotes have to be real, and they have to be theirs ───────────── */

/**
 * Speaker labels that mean "the customer" in each kind of source.
 *
 * A document has no speakers, so every word in it is quotable and the check degrades to
 * verbatim-only.
 */
const CUSTOMER_LABELS: Record<ExtractionSource, string[]> = {
  voice_transcript: ['human', 'user', 'customer', 'caller', 'client', 'prospect'],
  chat: ['user', 'human', 'customer', 'client', 'prospect'],
  document: [],
};

export interface QuoteIndex {
  /** Whether the conversation had recognisable `speaker:` turns at all. */
  has_turns: boolean;
  /** Normalised text of everything the CUSTOMER said. */
  customer_text: string;
  /** Normalised text of the whole conversation, both sides. */
  all_text: string;
}

/**
 * Compare quotes the way a person would, not the way a byte comparator would.
 *
 * Transcripts come back with curly apostrophes and doubled spaces; a model reproducing a
 * quote will often straighten the punctuation without changing a word. Failing an item
 * over `’` versus `'` would punish the model for being right, so the comparison is
 * normalised on both sides. Nothing beyond punctuation and whitespace is touched - the
 * WORDS still have to match, which is the entire point of the check.
 */
export function normalizeQuote(s: string): string {
  return (s || '')
    .replace(/[‘’ʼ‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseTurns(conversation: string): Array<{ speaker: string; text: string }> {
  const turns: Array<{ speaker: string; text: string }> = [];

  conversation.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9 _-]{0,20}):\s?(.*)$/);
    if (match) {
      turns.push({ speaker: match[1].trim().toLowerCase(), text: match[2] });
    } else if (turns.length > 0 && line.trim()) {
      // A wrapped continuation of the previous turn, not a new one.
      turns[turns.length - 1].text += ` ${line.trim()}`;
    }
  });

  return turns;
}

export function buildQuoteIndex(conversation: string, source: ExtractionSource): QuoteIndex {
  const turns = parseTurns(conversation);
  const labels = CUSTOMER_LABELS[source];
  const customerTurns = turns.filter((t) => labels.includes(t.speaker));

  return {
    has_turns: turns.length > 0 && labels.length > 0,
    customer_text: normalizeQuote(customerTurns.map((t) => t.text).join(' \n ')),
    all_text: normalizeQuote(conversation),
  };
}

/**
 * Why a quote cannot be trusted, or null if it can.
 *
 * Both failures were observed on the FIRST real call this ran against, which is the only
 * reason they are enforced rather than assumed away:
 *
 *   - The model attributed a pain point to "Ralph has the sheet, and Johnny needs to stay
 *     in the loop" - the AGENT's own sentence. Provenance said `voice_transcript`, which
 *     was true and worthless: the model had cited itself and the contract could not tell.
 *   - Nothing stops a model from inventing a quote outright, and a fabricated quote is
 *     worse than none, because it launders a guess into a sourced fact.
 *
 * Neither is a judgement call, so neither is left to the prompt. What this CANNOT catch is
 * a genuine customer quote that does not support the claim attached to it - the same call
 * produced "that would be a hobby" as evidence for who approves spending. That needs a
 * different mechanism, and pretending this one covers it would be the exact overclaiming
 * the contract exists to prevent.
 */
export function quoteViolation(quote: string, index: QuoteIndex): string | null {
  const needle = normalizeQuote(quote);
  if (!needle) return null;

  if (!index.all_text.includes(needle)) {
    return 'source_quote does not appear in the conversation';
  }

  if (index.has_turns && !index.customer_text.includes(needle)) {
    return 'source_quote is the agent speaking, not the customer';
  }

  return null;
}

/**
 * The extraction instructions. Deterministic and pure, so the prompt a given run used can
 * be reconstructed rather than guessed at, and so it can be asserted on in a test without
 * a model in the loop.
 */
export function buildExtractionSystemPrompt(source: ExtractionSource): string {
  const allowed = PROVENANCE_BY_SOURCE[source];

  return [
    'You convert a conversation about a software project into structured project truth.',
    'You are not writing a summary and you are not writing a proposal. You are recording what is known, what is guessed, and what is still open, keeping those three things apart.',
    '',
    'RETURN STRICT JSON with exactly this shape:',
    '{',
    '  "title": "<short name for what they are building, e.g. Property Operations AI>",',
    '  "proposed_surfaces": ["<screen or area the system would need>", ...],',
    '  "items": [',
    '    { "dimension": "<one of the dimensions below>", "value": "<one plain-language statement>",',
    '      "classification": "FACT|ASSUMPTION|RECOMMENDATION|QUESTION|DECISION",',
    `      "provenance": "${allowed.join('|')}", "source_quote": "<their words, when quoting>" }`,
    '  ]',
    '}',
    '',
    'DIMENSIONS (use these keys exactly):',
    ...UNDERSTANDING_DIMENSIONS.map((d) => `  ${d} - ${DIMENSION_LABELS[d]}`),
    '',
    'CLASSIFICATION RULES, WHICH MATTER MORE THAN COVERAGE:',
    '- FACT: they stated it. It must quote them.',
    '- ASSUMPTION: you worked it out from what they said. It is not a fact no matter how obvious.',
    '- RECOMMENDATION: your suggestion, which nobody has agreed to.',
    '- QUESTION: something genuinely unresolved that a person still has to answer.',
    '- DECISION: a choice that belongs to the customer and must not be made for them.',
    '',
    'NEVER present an assumption as a fact. An inferred item is ASSUMPTION even when you are confident.',
    '',
    'PROVENANCE RULES:',
    `- Allowed values for this extraction: ${allowed.join(', ')}. Using any other value invalidates the whole result.`,
    `- "${allowed[0]}" requires a source_quote containing their actual words.`,
    '- "ai_inferred" must NOT have a source_quote, and can never be classified FACT.',
    '',
    'QUOTE RULES, WHICH ARE CHECKED MECHANICALLY AND WILL REJECT THE ITEM:',
    '- A source_quote must be copied VERBATIM from the conversation. Do not paraphrase, tidy, or compose it.',
    '- Quote only what the CUSTOMER said. Never quote the assistant/agent side of the conversation - quoting your own question back is not evidence of anything.',
    '',
    'WHEN YOU CANNOT HEAR THEM PROPERLY:',
    'Voice transcripts contain mishearings and noise. If their answer is garbled, or the assistant had to ask them to repeat or clarify and never got a clear answer, that is a QUESTION, not a FACT. Record what still needs answering rather than choosing the most likely meaning and stating it as settled.',
    '',
    'PROPOSED SURFACES are screens the NEW system would need. They are not a list of the tools the customer already uses.',
    '',
    'Do not invent integrations, systems, team sizes, budgets or timelines that were not discussed. An empty dimension is correct and useful; a filled-in guess is not.',
    'Leave a dimension out entirely rather than padding it.',
  ].join('\n');
}

export function buildExtractionUserPrompt(conversation: string, facts: ExtractionFacts = {}): string {
  const who = [
    facts.name ? `Name: ${facts.name}` : null,
    facts.company ? `Company: ${facts.company}` : null,
    facts.role ? `Role: ${facts.role}` : null,
  ].filter(Boolean);

  return [
    who.length > 0 ? `WHAT WE ALREADY KNEW BEFORE THE CONVERSATION:\n${who.join('\n')}\n` : '',
    'THE CONVERSATION:',
    conversation.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Run an extraction. Returns a result rather than throwing, because every caller here is a
 * pipeline step that has to record WHY it produced nothing - "the model returned junk" and
 * "the model contradicted the contract" lead to different fixes, and collapsing both into a
 * generic failure is how a broken extractor survives in production looking merely quiet.
 */
export async function extractUnderstanding(params: {
  conversation: string;
  source: ExtractionSource;
  facts?: ExtractionFacts;
  workflow?: string;
  max_tokens?: number;
}): Promise<ExtractionResult> {
  const conversation = (params.conversation || '').trim();
  if (!conversation) {
    return { ok: false, error_class: 'EmptyInput', error: 'no conversation to extract from' };
  }

  const system = buildExtractionSystemPrompt(params.source);
  const user = buildExtractionUserPrompt(conversation, params.facts);

  const { parsed, runtime_ms, cost_usd } = await chatJson(
    params.workflow || 'project-understanding-extraction',
    system,
    user,
    undefined,
    params.max_tokens ?? 4000,
  );

  // chatJson returns {} for unparseable output. Distinguish that from a real but invalid
  // understanding, because they are not the same failure.
  if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
    return {
      ok: false,
      error_class: 'EmptyModelResponse',
      error: 'model returned nothing parseable as JSON',
    };
  }

  // Items are validated ONE AT A TIME rather than as a block.
  //
  // The first live run against a real 245-second call failed entirely because the model
  // invented a dimension on a single item; a rerun of the same transcript produced eleven
  // valid ones. Model drift on an enum key is normal and will keep happening, and losing a
  // customer's whole interview to it is a far worse failure than dropping the one item.
  // Nothing is coerced or repaired - refused items are returned, with the reason and their
  // raw value, so the loss is visible instead of silent.
  const allowed = PROVENANCE_BY_SOURCE[params.source];
  const quotes = buildQuoteIndex(conversation, params.source);
  const rawItems: unknown[] = Array.isArray((parsed as any).items) ? (parsed as any).items : [];
  const items: any[] = [];
  const rejected: RejectedItem[] = [];

  rawItems.forEach((raw, index) => {
    const checked = validateItem(raw);
    if (!checked.ok) {
      rejected.push({ index, reason: checked.reason, raw });
      return;
    }
    if (!allowed.includes(checked.item.provenance)) {
      rejected.push({
        index,
        reason: `provenance "${checked.item.provenance}" is not available to a ${params.source} extraction`,
        raw,
      });
      return;
    }

    // A quote is the only thing making a sourced claim checkable, so it is checked.
    const badQuote = checked.item.source_quote ? quoteViolation(checked.item.source_quote, quotes) : null;
    if (badQuote) {
      rejected.push({ index, reason: badQuote, raw });
      return;
    }

    items.push(checked.item);
  });

  // Document-level failures, which per-item salvage cannot rescue: no name for the project,
  // or nothing left after the refusals. An understanding of nothing is not an understanding.
  try {
    const understanding = parseUnderstanding({ ...(parsed as any), items });

    if (understanding.items.length === 0) {
      return {
        ok: false,
        error_class: 'ContractViolation',
        error:
          rejected.length > 0
            ? `every item was refused by the contract: ${rejected.map((r) => r.reason).join('; ')}`
            : 'model returned no items',
        violations: rejected.map((r) => `item ${r.index}: ${r.reason}`),
      };
    }

    return { ok: true, understanding, rejected, runtime_ms, cost_usd };
  } catch (err: any) {
    if (err instanceof UnderstandingContractError) {
      return { ok: false, error_class: 'ContractViolation', error: err.message, violations: err.violations };
    }
    throw err;
  }
}
