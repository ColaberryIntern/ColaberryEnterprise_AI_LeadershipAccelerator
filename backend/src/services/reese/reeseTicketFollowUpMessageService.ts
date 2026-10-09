import OpenAI from 'openai';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import RoomMessage from '../../models/RoomMessage';
import { REESE_PERSONA_BLOCK } from './reeseSystemPrompt';
import { getReeseAgentId, getReeseEnrollmentId } from './reeseIdentitySeed';
import { resolveStudentDisplayName } from './resolveStudentDisplayName';

// Reese ticket follow-up (2026-10-02) — real, unique check-in message generation
// for a student_support ticket that's gone quiet. Mirrors
// reeseOutreachMessageService.ts's real plumbing (same instrumented client,
// same REESE_PERSONA_BLOCK for voice consistency, same "never templated, throws
// on empty" discipline) but grounds the message in the ACTUAL conversation
// history, not a signal snapshot — this is a real student she was already
// talking to, not a cold outreach.

let _openai: OpenAI | null = null;
async function getOpenAI(): Promise<OpenAI> {
  if (!_openai) {
    const agentId = await getReeseAgentId();
    _openai = getInstrumentedOpenAI({ workflow_id: 'reese_ticket_followup', agent_id: agentId ?? undefined });
  }
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const HISTORY_LIMIT = 20;

export interface GenerateTicketFollowUpMessageInput {
  roomId: string;
  studentEnrollmentId: string;
  ticketTitle: string;
  quietDays: number;
  attemptNumber: number;
}

/**
 * Generates one real, unique check-in message, grounded in the real recent
 * conversation history for this room (same fetch shape reeseReplyService.ts
 * uses for a live reply). Throws (never returns a templated fallback) if the
 * completion comes back empty — a follow-up with no real content is a defect
 * the caller must not paper over, same discipline generateOutreachMessage()
 * already established for this class of message.
 */
export async function generateTicketFollowUpMessage(input: GenerateTicketFollowUpMessageInput): Promise<string> {
  const reeseEnrollmentId = await getReeseEnrollmentId();
  const recent = await RoomMessage.findAll({
    where: { room_id: input.roomId, deleted_at: null },
    order: [['created_at', 'DESC']],
    limit: HISTORY_LIMIT,
  });
  const ordered = recent.slice().reverse();
  const studentName = await resolveStudentDisplayName(input.studentEnrollmentId).catch(() => 'the student');

  const historyBlock = ordered.length
    ? ordered
        .map((m) => `${m.enrollment_id === reeseEnrollmentId ? 'You' : studentName}: ${m.content}`)
        .join('\n')
    : '(no real message history found for this conversation)';

  const framing = input.attemptNumber > 1
    ? `This is check-in ${input.attemptNumber} of at most 3 on this same quiet ticket. Reference ` +
      `that you've checked in before without repeating your earlier message verbatim — sound like ` +
      `a real continuation, not a template.`
    : `This is your first check-in since the conversation went quiet.`;

  const systemPrompt = [
    REESE_PERSONA_BLOCK,
    `\nReal conversation history with ${studentName} so far:`,
    historyBlock,
    `\nIt has been about ${input.quietDays} day(s) since your last message, with no reply from ${studentName}.`,
    framing,
    `Write a brief, warm check-in that references what they last asked or what you last offered to help with — grounded ONLY in the real conversation above, never invented. Keep it to a few sentences, per your voice principles.`,
  ].join('\n');

  const openai = await getOpenAI();
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Write the check-in message now.' },
    ],
    temperature: 0.8,
    max_tokens: 300,
  });

  const message = completion.choices[0]?.message?.content?.trim();
  if (!message) {
    throw new Error('[Reese] generateTicketFollowUpMessage() received an empty completion.');
  }
  return message;
}
