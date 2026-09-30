/**
 * intelCardContent — generate the body of ONE intelligence card, completely or
 * not at all.
 *
 * WHY THIS EXISTS
 * `materializeIntelCard` (intelPipeline) and `materializeNewsCard`
 * (aiNewsIngestionService) ran byte-identical copies of this block, both at
 * `max_tokens: 1600`, and NEITHER inspected the response's stop reason. That is
 * the path that truncated the "4-Layer Model for AI Search Readiness" Build
 * Breakdown, and it feeds the entire intel card feed. Extracting it means the
 * completeness rules exist once instead of twice.
 *
 * WHY IT RETURNS null RATHER THAN A PARTIAL CARD
 * The caller's contract is already "null ⇒ the item stays un-carded and the next
 * cron run retries" — no partial commit, no duplicate. Persisting instead is
 * actively worse than persisting nothing: a truncated body fails `JSON.parse`,
 * the old catch turned that into `{}`, and an empty content object was written
 * with a fresh `content_at`, pinning a BLANK card in the feed for the full
 * 30-day cache life. A partial card students can half-use beats a blank one they
 * cannot — and an absent card that regenerates tonight beats both.
 *
 * THE TWO GATES
 *   1. Stop reason (llm/stopReason.ts) — did the model finish its own sentence?
 *   2. Structure (timeline/cardCompletenessGate.ts) — is what it produced
 *      actually a whole card? Necessary because a derailed generation sometimes
 *      closes the JSON tidily and still reports `finish_reason: "stop"`.
 * A failure of either gets exactly ONE retry with double the headroom. Bounded on
 * purpose — unbounded retry loops are prohibited (CLAUDE.md, Stall Detection).
 * This path is a nightly cron with nobody waiting on it, which is why it spends a
 * retry where the student-facing card path deliberately does not.
 */
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { stopReasonOf, isRetryableStop, COMPLETE_STOP_REASON } from '../llm/stopReason';
import { checkCardCompleteness } from '../timeline/cardCompletenessGate';

/** First attempt's ceiling — the historical value, kept so cost does not move for healthy cards. */
export const INTEL_CARD_MAX_TOKENS = 1600;
/** The one retry's ceiling. Double the headroom, once. */
export const INTEL_CARD_MAX_TOKENS_RETRY = 3200;

/** The content shape both intel materializers persist to `summary_json` and `metadata.content`. */
export interface IntelCardContent {
  title: string;
  summary?: string;
  body_html?: string;
  questions: string[];
  reflection?: string;
  discussion_prompt?: string;
}

export interface IntelCardGenerationArgs {
  /** Pipeline slug, which is also the curriculum-type slug stamped on the card. */
  slug: string;
  /** Human label for the system prompt, e.g. "AI News Flash". */
  label: string;
  /** The type's generation prompt with the item's variables already resolved. */
  resolvedPrompt: string;
  /** Used as the card title when the model does not supply one. */
  fallbackTitle: string;
  /** Telemetry workflow id, e.g. "ai_news_flash_generate". */
  workflowId: string;
  model: string;
  /** Item guid, logged for triage. */
  guid?: string;
}

const USER_INSTRUCTION = 'Produce the card as json with keys: title, summary, body_html (clean self-contained HTML, no scripts, no style), questions (string[]), reflection (string), discussion_prompt (string), github_task (string|null), evaluation_criteria (string[]), completion (string).';

/** any: the model returns untyped JSON; every key is validated before it is used. */
function toContent(parsed: any, fallbackTitle: string): IntelCardContent {
  return {
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : fallbackTitle,
    summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
    body_html: typeof parsed.body_html === 'string' ? parsed.body_html : undefined,
    questions: Array.isArray(parsed.questions) ? parsed.questions.map(String) : [],
    reflection: typeof parsed.reflection === 'string' ? parsed.reflection : undefined,
    discussion_prompt: typeof parsed.discussion_prompt === 'string' ? parsed.discussion_prompt : undefined,
  };
}

function logIncomplete(
  event: string,
  level: 'warn' | 'error',
  args: IntelCardGenerationArgs,
  context: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    level, service: 'intel-card-content', event,
    outcome: level === 'warn' ? 'partial' : 'failure', error_class: 'IncompleteGeneration',
    context: { pipeline: args.slug, guid: args.guid, ...context },
  });
  if (level === 'warn') console.warn(line); else console.error(line);
}

/**
 * Generate one intel card's content. Returns the content only when the model
 * both FINISHED (stop reason) and produced a WHOLE card (structure). Returns
 * null otherwise — the caller must then persist nothing and let the next run
 * retry. Never throws.
 */
export async function generateIntelCardContent(args: IntelCardGenerationArgs): Promise<IntelCardContent | null> {
  const { slug, label, resolvedPrompt, fallbackTitle, workflowId, model } = args;
  const messages = [
    { role: 'system' as const, content: `You render the "${label}" intelligence card into the exact content a reader sees. Return STRICT json.` },
    { role: 'user' as const, content: `${USER_INSTRUCTION}\n\nInstruction:\n${resolvedPrompt}` },
  ];

  const budgets = [INTEL_CARD_MAX_TOKENS, INTEL_CARD_MAX_TOKENS_RETRY];

  for (let attempt = 0; attempt < budgets.length; attempt += 1) {
    const max_tokens = budgets[attempt];
    const isLastAttempt = attempt === budgets.length - 1;

    let res: any; // any: the SDK response envelope; only the fields below are read.
    try {
      const client = getInstrumentedOpenAI({ workflow_id: workflowId });
      res = await client.chat.completions.create({
        model, temperature: 0.4, max_tokens, response_format: { type: 'json_object' }, messages,
      });
    } catch (err: any) {
      console.warn(`[intel] ${slug} LLM summarize failed for`, args.guid, '-', err?.message?.split('\n')[0]);
      return null; // API failure: leave un-carded; the next run retries. No partial commit.
    }

    // Gate 1 — did the model finish? A 'content_filter' stop is NOT retryable:
    // a bigger budget cannot un-filter a completion, so give up immediately.
    const stop = stopReasonOf(res);
    if (stop !== COMPLETE_STOP_REASON) {
      const retryable = isRetryableStop(stop) && !isLastAttempt;
      logIncomplete(
        retryable ? 'intel_card_incomplete_retrying' : 'intel_card_incomplete',
        retryable ? 'warn' : 'error',
        args,
        { reason: 'stop_reason', stop_reason: stop, max_tokens, next_max_tokens: retryable ? budgets[attempt + 1] : null },
      );
      if (retryable) continue;
      return null;
    }

    // A truncated body makes JSON.parse throw. Treat that as an incomplete
    // generation like any other rather than letting an empty object through.
    let parsed: any;
    try {
      parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    } catch {
      logIncomplete(
        isLastAttempt ? 'intel_card_incomplete' : 'intel_card_incomplete_retrying',
        isLastAttempt ? 'error' : 'warn',
        args,
        { reason: 'unparseable_json', stop_reason: stop, max_tokens },
      );
      if (!isLastAttempt) continue;
      return null;
    }

    // Gate 2 — is it a whole card? This is the half a stop-reason check misses.
    const content = toContent(parsed, fallbackTitle);
    const verdict = checkCardCompleteness(content, { type: slug });
    if (verdict.warnings.length) {
      console.warn(JSON.stringify({
        level: 'warn', service: 'intel-card-content', event: 'intel_card_structure_warnings',
        outcome: 'success', context: { pipeline: slug, guid: args.guid, warnings: verdict.warnings },
      }));
    }
    if (!verdict.ok) {
      logIncomplete(
        isLastAttempt ? 'intel_card_incomplete' : 'intel_card_incomplete_retrying',
        isLastAttempt ? 'error' : 'warn',
        args,
        { reason: 'structure', stop_reason: stop, max_tokens, failures: verdict.failures },
      );
      if (!isLastAttempt) continue;
      return null;
    }

    return content;
  }

  return null;
}
