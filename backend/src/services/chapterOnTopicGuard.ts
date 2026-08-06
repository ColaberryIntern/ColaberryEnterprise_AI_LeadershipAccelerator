/**
 * chapterOnTopicGuard — deterministic "keep chapters on-topic" policy.
 *
 * The honest, deterministic reframe of the "MoE to keep chapters on-topic" idea:
 * instead of training expert models, we reuse the on-topic / confidence signal from
 * chapterQualityService to DETECT drift, then decide whether one corrective
 * re-prompt is warranted and select the better of the two drafts.
 *
 * CONTRACT: pure + deterministic. No I/O, no LLM, never throws. The actual second
 * LLM call lives in the caller (contentGenerationService); this module only decides
 * IF/WHY to regenerate, builds the corrective instruction, and picks the winner —
 * so the policy is fully unit-testable without a model.
 *
 * The re-prompt is capped at ONE attempt (fail-safe against retry loops, per the
 * repo's prohibition on unbounded retries) and is OFF by default (an automatic
 * extra model call is a cost-model change, gated behind CHAPTER_ONTOPIC_REGEN).
 */
import { ChapterQualityResult, LessonContext } from './chapterQualityService';

/** Below this overall confidence we regenerate even if the topic check passed. */
export const REGEN_CONFIDENCE_FLOOR = 50;

export interface RegenDecision {
  shouldRegenerate: boolean;
  reason: string;
  correctiveInstruction: string;
}

/** Opt-in flag. Default OFF so prod cost/latency is unchanged until turned on. */
export function isOnTopicRegenEnabled(): boolean {
  return process.env.CHAPTER_ONTOPIC_REGEN === 'true';
}

/** A corrective instruction appended to the prompt on the single retry. */
export function buildCorrectiveInstruction(quality: ChapterQualityResult, context: LessonContext): string {
  const topic = [context.title, context.learningGoal].filter(Boolean).join(' — ') || 'the stated lesson topic';
  const weak = quality.sections.filter((s) => s.confidence < 70).map((s) => s.section);
  const weakLine = weak.length
    ? ` These sections were weak or drifted and must be rewritten to directly serve the topic: ${weak.join(', ')}.`
    : '';
  return `IMPORTANT: your previous draft drifted off-topic or was too weak. This lesson is specifically about: ${topic}. Every section must stay tightly focused on that topic and cover it at appropriate depth.${weakLine} Do not introduce unrelated subject matter.`;
}

export function decideRegeneration(
  quality: ChapterQualityResult,
  context: LessonContext,
  alreadyRetried: boolean,
): RegenDecision {
  const no = (reason: string): RegenDecision => ({ shouldRegenerate: false, reason, correctiveInstruction: '' });
  if (alreadyRetried) return no('already retried (capped at one regeneration)');

  const offTopic = !quality.on_topic;
  const tooWeak = quality.overall_confidence < REGEN_CONFIDENCE_FLOOR;
  if (!offTopic && !tooWeak) return no('quality acceptable');

  const reason = offTopic
    ? `off-topic (overall confidence ${quality.overall_confidence})`
    : `low confidence (${quality.overall_confidence} < ${REGEN_CONFIDENCE_FLOOR})`;
  return { shouldRegenerate: true, reason, correctiveInstruction: buildCorrectiveInstruction(quality, context) };
}

/** Keep the higher-confidence draft; on a tie keep the original (`a`). */
export function pickBetterContent<T extends { quality: ChapterQualityResult }>(a: T, b: T): T {
  return b.quality.overall_confidence > a.quality.overall_confidence ? b : a;
}
