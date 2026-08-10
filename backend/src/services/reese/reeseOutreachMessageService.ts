import OpenAI from 'openai';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { getLearnerContextBlock } from '../learnerContextService';
import { REESE_PERSONA_BLOCK } from './reeseSystemPrompt';
import type { ReeseOutreachSignalType } from '../../models/ReeseOutreach';

// Reese Phase 2 (Autonomous Outreach) — real, unique message generation for
// both a new outreach thread (T005) and a follow-up in an existing one (T006).
// Deliberately centralized here (rather than duplicated in each caller) since
// both need identical LLM-call plumbing with only the framing prompt
// differing — reuses Phase 1's REESE_PERSONA_BLOCK for voice consistency and
// the same getInstrumentedOpenAI()/getLearnerContextBlock() plumbing
// reeseReplyService.ts/reeseSystemPrompt.ts already established.
//
// NEVER templated: every call is a real LLM completion grounded in the
// caller's real signal_snapshot data (never a fixed string with values
// interpolated in) — the model is instructed to describe only what it's told,
// not invent specifics.

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = getInstrumentedOpenAI({ workflow_id: 'reese_autonomous_outreach' });
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

export interface GenerateOutreachMessageInput {
  enrollmentId: string;
  signalType: ReeseOutreachSignalType;
  signalSnapshot: Record<string, any>;
  goal: string;
  isFollowUp: boolean;
  attemptNumber: number;
}

function describeSignal(signalType: ReeseOutreachSignalType, snapshot: Record<string, any>): string {
  if (signalType === 'inactivity') {
    const parts: string[] = [];
    if (snapshot.daysSinceActive != null) parts.push(`no recorded activity in about ${Math.floor(snapshot.daysSinceActive)} days`);
    if (snapshot.completionPct != null) parts.push(`${snapshot.completionPct}% curriculum completion so far`);
    return parts.length > 0 ? parts.join(', ') : 'a detected engagement-risk signal';
  }
  const parts: string[] = [];
  if (snapshot.idleCount != null) {
    parts.push(`${snapshot.idleCount} idle events in the last ${snapshot.windowHours ?? 24} hours`);
  }
  if (snapshot.lessonTitle) parts.push(`on "${snapshot.lessonTitle}"`);
  return parts.length > 0 ? parts.join(' ') : 'a detected behavior-anomaly signal';
}

/**
 * Generates one real, unique message. Throws (never returns a fallback
 * templated string) if the completion comes back empty — an autonomous send
 * with no real content is a defect the caller must not paper over.
 */
export async function generateOutreachMessage(input: GenerateOutreachMessageInput): Promise<string> {
  const learnerBlock = await getLearnerContextBlock(input.enrollmentId).catch(() => '');

  const framing = input.isFollowUp
    ? `This is follow-up message ${input.attemptNumber} of at most 3 in an outreach ` +
      `thread you already started. Reference that you reached out before without ` +
      `repeating your earlier message verbatim — sound like a real continuation, ` +
      `not a template.`
    : `You are INITIATING this conversation — the student has not messaged you. ` +
      `Be direct and specific about why you're reaching out, grounded only in the ` +
      `real data below.`;

  const systemPrompt = [
    REESE_PERSONA_BLOCK,
    learnerBlock ? '\n' + learnerBlock : '',
    `\nReal reason for this outreach: ${describeSignal(input.signalType, input.signalSnapshot)}.`,
    `Your goal for this outreach: ${input.goal}.`,
    framing,
    `Never invent specifics beyond what's given above. Keep it to a few sentences, per your voice principles.`,
  ].join('\n');

  const completion = await getOpenAI().chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Write the message now.' },
    ],
    temperature: 0.8,
    max_tokens: 300,
  });

  const message = completion.choices[0]?.message?.content?.trim();
  if (!message) {
    throw new Error('[Reese] generateOutreachMessage() received an empty completion.');
  }
  return message;
}
