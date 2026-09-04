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

export type ExtractionResult =
  | { ok: true; understanding: ProjectUnderstanding; runtime_ms: number; cost_usd: number }
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

  try {
    const understanding = parseUnderstanding(parsed);

    const sourceViolations = provenanceViolations(understanding, params.source);
    if (sourceViolations.length > 0) {
      return {
        ok: false,
        error_class: 'ContractViolation',
        error: `extraction claimed provenance it could not have: ${sourceViolations.join('; ')}`,
        violations: sourceViolations,
      };
    }

    return { ok: true, understanding, runtime_ms, cost_usd };
  } catch (err: any) {
    if (err instanceof UnderstandingContractError) {
      return { ok: false, error_class: 'ContractViolation', error: err.message, violations: err.violations };
    }
    throw err;
  }
}
