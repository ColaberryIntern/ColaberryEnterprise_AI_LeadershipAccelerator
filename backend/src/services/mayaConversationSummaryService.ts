// ─── Maya Conversation Summary Service ─────────────────────────────────────────
// Generates SMS-friendly conversation summaries for Maya to text to visitors.

import OpenAI from 'openai';
import { env } from '../config/env';
import { ChatMessage } from '../models';

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = env.openaiApiKey;
    if (!apiKey) throw new Error('OpenAI API key not configured');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Generate an SMS-friendly summary of a conversation.
 */
export async function generateConversationSummary(
  conversationId: string,
): Promise<{ summary: string; full_summary: string }> {
  const messages = await ChatMessage.findAll({
    where: { conversation_id: conversationId },
    order: [['timestamp', 'ASC']],
  });

  if (messages.length < 2) {
    return {
      summary: 'We had a brief chat about the AI Leadership Accelerator.',
      full_summary: 'Brief conversation — no substantial content to summarize.',
    };
  }

  const transcript = messages
    .filter((m: any) => m.role !== 'system')
    .map((m: any) => `${m.role === 'visitor' ? 'Visitor' : 'Maya'}: ${m.content}`)
    .join('\n');

  const client = getClient();
  const response = await client.chat.completions.create({
    model: env.chatModel,
    max_tokens: 200,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: `You are summarizing a chat between Maya (admissions advisor at Colaberry) and a visitor. Create TWO summaries:

1. SMS_SUMMARY: Under 250 characters. Include: what was discussed and the recommended next step. No URLs. Conversational tone from Maya.
2. FULL_SUMMARY: 2-3 sentences covering the key topics discussed, visitor interest level, and any actions taken.

Format:
SMS: <sms summary>
FULL: <full summary>`,
      },
      { role: 'user', content: transcript },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim() || '';

  // Parse the two summaries
  const smsMatch = text.match(/SMS:\s*(.+?)(?=\nFULL:|$)/s);
  const fullMatch = text.match(/FULL:\s*(.+)/s);

  return {
    summary: smsMatch?.[1]?.trim() || 'We discussed the AI Leadership Accelerator program. Next step: book a strategy call!',
    full_summary: fullMatch?.[1]?.trim() || text,
  };
}

/**
 * Build SMS content from a conversation summary.
 */
export function buildSmsSummaryContent(params: {
  summary: string;
  visitorName: string;
  bookingLink?: string;
}): string {
  const { summary, visitorName, bookingLink } = params;

  const greeting = `Hi ${visitorName}, recap from Maya at Colaberry: `;
  const link = bookingLink
    ? `\nBook a strategy call: ${bookingLink}`
    : '\nReply CALL to book a strategy session.';

  // Keep under 320 chars total for single SMS
  const maxSummaryLen = 320 - greeting.length - link.length;
  const trimmedSummary = summary.length > maxSummaryLen
    ? summary.substring(0, maxSummaryLen - 3) + '...'
    : summary;

  return `${greeting}${trimmedSummary}${link}`;
}
