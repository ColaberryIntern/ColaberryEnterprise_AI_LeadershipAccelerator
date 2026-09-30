import { ANGLE_TO_DIMENSION, normaliseAngle } from './intakeTruth';
import { NEVER_FACT_DIMENSIONS, type UnderstandingItem } from '../delivery/projectUnderstanding';

/**
 * projectDiscoveryTranscript — a finished call, as truth items. PURE.
 *
 * ## What a transcript is allowed to produce
 *
 * `voice_transcript` items, and nothing else. That provenance is fact-bearing
 * because a person said the words, and the contract requires a `source_quote`
 * for it - which is the right requirement: "the transcript says so" with
 * nothing quoted is unfalsifiable.
 *
 * **A transcript never produces a confirmed item.** The brief is explicit that
 * extraction outputs statements requiring review, and does not confirm them
 * automatically. Confirmation is a person reading it back and agreeing, and a
 * call is not that: speech recognition mishears names, and the one place a
 * mis-heard name is most expensive is the guardrail question, where it becomes
 * the person who approves things.
 *
 * So voice lands in `needsConfirmation` on the same review screen as chat, and
 * the student corrects it there. That is the cross-channel resume the brief
 * asks for, and it falls out of using one contract rather than two.
 *
 * ## Replay
 *
 * This module is pure and deterministic: the same transcript in gives the same
 * items out, every time. That is what makes the webhook's idempotency real
 * rather than hopeful - a re-delivered completion recomputes identical items,
 * and the store's `sameItems` comparison then reports `unchanged` instead of
 * writing a second understanding of the same call.
 */

/** One answer the voice agent captured, as the completion payload carries it. */
export interface TranscriptAnswer {
  /** The angle the agent was asked to cover. */
  readonly angle?: string;
  /** What the student actually said, in their words. */
  readonly said?: string;
}

export interface TranscriptExtractionInput {
  readonly answers?: readonly TranscriptAnswer[];
}

export interface TranscriptExtractionResult {
  readonly items: UnderstandingItem[];
  /** Answers we could not file. Reported, never guessed at. */
  readonly unmapped: number;
}

/** Longest quote kept from a spoken answer. */
const MAX_QUOTE = 600;
const clip = (s: string): string => (s.length <= MAX_QUOTE ? s : `${s.slice(0, MAX_QUOTE - 3)}...`);

export function itemsFromTranscript(input: TranscriptExtractionInput): TranscriptExtractionResult {
  const items: UnderstandingItem[] = [];
  let unmapped = 0;

  for (const answer of input.answers ?? []) {
    const said = typeof answer.said === 'string' ? answer.said.trim() : '';
    // Nothing said is not an answer. A caller who went quiet on a question has
    // left it unanswered, and it stays on the remaining list.
    if (!said) continue;

    const dimension = ANGLE_TO_DIMENSION[normaliseAngle(answer.angle)];
    if (!dimension || NEVER_FACT_DIMENSIONS.includes(dimension)) { unmapped += 1; continue; }

    items.push({
      dimension,
      value: clip(said),
      // FACT because a person said it, on a provenance that records HOW we know.
      // Not `client_confirmed`: nobody has read this back yet.
      classification: 'FACT',
      provenance: 'voice_transcript',
      // Required by the contract for this provenance, and the reason it is
      // required is that it is the only thing that makes the claim checkable.
      source_quote: clip(said),
    });
  }

  return { items, unmapped };
}

/**
 * Merge a call's items into what is already known, without trampling anything.
 *
 * A dimension already carrying a human-confirmed item is left alone: the
 * student read that one and agreed it, and a later call must not quietly
 * replace it. Everything else is additive, because two sources saying different
 * things about the same dimension is information a reviewer should see rather
 * than a conflict this module should silently resolve.
 */
export function mergeTranscriptItems(
  known: readonly UnderstandingItem[],
  fromCall: readonly UnderstandingItem[],
): UnderstandingItem[] {
  const confirmedDimensions = new Set(
    known
      .filter((i) => i.provenance === 'client_confirmed' || i.provenance === 'pm_confirmed')
      .map((i) => i.dimension),
  );
  const isDuplicate = (candidate: UnderstandingItem): boolean =>
    known.some((i) => i.dimension === candidate.dimension && i.value === candidate.value);

  const additions = fromCall
    .filter((i) => !confirmedDimensions.has(i.dimension))
    .filter((i) => !isDuplicate(i));

  return [...known, ...additions];
}
