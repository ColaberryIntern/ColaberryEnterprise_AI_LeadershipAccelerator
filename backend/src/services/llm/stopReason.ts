/**
 * stopReason — normalise "how did the model stop?" across providers, so that
 * every generation path can ask the same question the same way.
 *
 * WHY THIS EXISTS
 * A model response carries two independent facts: what it produced, and whether
 * it was finished producing it. Reading only the first is how a half-written
 * lesson gets published. Three timeline cards shipped truncated in August 2026
 * because the card generator never looked at `finish_reason`.
 *
 * NECESSARY, NOT SUFFICIENT. A clean stop reason means the model chose to stop;
 * it does NOT mean the artifact is complete. The same derail that burns the token
 * ceiling on one call ("<li>Click on the \"" followed by thousands of whitespace
 * characters) will on another call close the JSON tidily and report
 * `finish_reason: "stop"` with the prose plainly unfinished — one observed repair
 * came back clean-stop at 265 tokens still ending mid-sentence at "Go to the ".
 * So this module is HALF of a completeness check. The structural half lives in
 * `timeline/cardCompletenessGate.ts`. Use both.
 *
 * CONTRACT
 *   stopReasonOf(res) -> string
 *     Pure. Never throws, never returns undefined. Absent / blank / non-string
 *     collapse to NO_STOP_REASON so a response that does not say how it stopped
 *     can never read as success.
 *   isCompleteStop(res) -> boolean   — allowlist of exactly one value.
 *   isRetryableStop(reason) -> boolean — is another call with more headroom worth it?
 */

/** The ONLY stop reason that means the model finished its own sentence. */
export const COMPLETE_STOP_REASON = 'stop';

/**
 * Sentinel for a response that reports no stop reason at all. An ABSENT stop
 * reason must never read as success — that is the same defect as ignoring a
 * length stop, one level up. Fail closed.
 */
export const NO_STOP_REASON = 'missing';

/**
 * Stop reasons a single retry with more headroom can plausibly fix. A
 * 'content_filter' stop cannot be fixed by a bigger budget, so it is deliberately
 * absent — a filtered completion should fail immediately rather than burn a
 * second call.
 */
export const RETRYABLE_STOP_REASONS: ReadonlySet<string> = new Set([
  'length',
  NO_STOP_REASON,
]);

/**
 * Anthropic Messages API stop reasons mapped onto the OpenAI vocabulary, so a
 * caller on either SDK reasons about one set of strings. `end_turn` and
 * `stop_sequence` are both "the model finished"; `max_tokens` is the ceiling;
 * `refusal` is the filtered case. Anything unmapped passes through unchanged
 * and, not being COMPLETE_STOP_REASON, fails closed.
 */
const ANTHROPIC_STOP_ALIASES: Readonly<Record<string, string>> = {
  end_turn: COMPLETE_STOP_REASON,
  stop_sequence: COMPLETE_STOP_REASON,
  max_tokens: 'length',
  refusal: 'content_filter',
};

/** The response shapes this module understands: OpenAI chat completions and Anthropic messages. */
export interface StopReasonBearingResponse {
  choices?: Array<{ finish_reason?: string | null } | null | undefined> | null;
  stop_reason?: string | null;
}

/**
 * The response's stop reason, normalised. Reads OpenAI's
 * `choices[0].finish_reason` first, then Anthropic's top-level `stop_reason`.
 * Absent, blank and non-string all collapse to NO_STOP_REASON.
 */
export function stopReasonOf(res: StopReasonBearingResponse | null | undefined): string {
  const openai = res?.choices?.[0]?.finish_reason;
  if (typeof openai === 'string' && openai) return openai;

  const anthropic = res?.stop_reason;
  if (typeof anthropic === 'string' && anthropic) {
    return ANTHROPIC_STOP_ALIASES[anthropic] || anthropic;
  }

  return NO_STOP_REASON;
}

/** True only when the model reported the one stop reason that means "finished". */
export function isCompleteStop(res: StopReasonBearingResponse | null | undefined): boolean {
  return stopReasonOf(res) === COMPLETE_STOP_REASON;
}

/** True when another call with more token headroom could plausibly fix this stop. */
export function isRetryableStop(reason: string): boolean {
  return RETRYABLE_STOP_REASONS.has(reason);
}
