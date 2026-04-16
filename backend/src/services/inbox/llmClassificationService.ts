import OpenAI from 'openai';

const LOG_PREFIX = '[InboxCOS][LLM]';

interface NormalizedEmail {
  id: string;
  from_address: string;
  from_name: string | null;
  to_addresses: any[];
  cc_addresses: any[];
  subject: string;
  body_text: string | null;
  headers: any;
}

interface ClassificationResult {
  confidence: number;
  raw_confidence: number;
  reasoning: string;
  suggested_state: 'INBOX' | 'ASK_USER' | 'SILENT_HOLD' | 'AUTOMATION';
  reply_needed: boolean;
  category: string;
  classified_by: string;
}

const SYSTEM_PROMPT = `You are an email triage assistant for Ali Muwwakkil, CEO of Colaberry.
Classify this email on a confidence scale of 0-100 for how likely it requires Ali's personal attention.

Context:
- Ali runs Colaberry (enterprise AI training), has school-age children
- He cares about: direct business communications, family/school matters, investor relations, partnership requests, personal messages from known contacts
- He does NOT need to see: newsletters, marketing, automated notifications, receipts, social media alerts, bulk sends
- User preference: bias toward filtering OUT — only surface what truly matters

Respond in JSON only:
{
  "confidence": <0-100>,
  "reasoning": "<one sentence>",
  "suggested_state": "INBOX|ASK_USER|SILENT_HOLD|AUTOMATION",
  "reply_needed": <true|false>,
  "category": "<business|personal|notification|marketing|transactional>"
}`;

/**
 * Classifies an email using Claude LLM with deterministic signal adjustments.
 * Falls back to a conservative SILENT_HOLD on any API or parsing failure.
 */
export async function classifyWithLLM(email: NormalizedEmail): Promise<ClassificationResult> {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const headers = email.headers || {};
    const headerKeys = Object.keys(headers);
    const hasListUnsubscribe = headerKeys.some((k) => k.toLowerCase() === 'list-unsubscribe');
    const replyTo = headerKeys.find((k) => k.toLowerCase() === 'reply-to');
    const replyToValue = replyTo ? headers[replyTo] : null;

    const bodyTruncated = email.body_text
      ? email.body_text.substring(0, 2000)
      : '(empty)';

    const userMessage = [
      `From: ${email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}`,
      `To: ${formatAddresses(email.to_addresses)}`,
      `CC: ${formatAddresses(email.cc_addresses)}`,
      `Subject: ${email.subject}`,
      `Date: ${new Date().toISOString()}`,
      `List-Unsubscribe: ${hasListUnsubscribe ? 'present' : 'absent'}`,
      `Reply-To: ${replyToValue || 'none'}`,
      '',
      'Body:',
      bodyTruncated,
    ].join('\n');

    console.log(`${LOG_PREFIX} Classifying email ${email.id} via OpenAI API`);

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    const parsed = parseJsonResponse(content);
    const rawConfidence = clamp(parsed.confidence, 0, 100);

    // Apply deterministic signal adjustments
    let adjusted = rawConfidence;

    // Negative signals
    if (hasListUnsubscribe) {
      adjusted -= 30;
    }
    if (/no[-_.]?reply|no-reply/i.test(email.from_address)) {
      adjusted -= 40;
    }
    if (/\b(unsubscribe|receipt)\b/i.test(email.subject)) {
      adjusted -= 15;
    }
    if (!isInToField(email.to_addresses, 'ali') && isInCcField(email.cc_addresses, 'ali')) {
      adjusted -= 10;
    }
    if ((email.body_text || '').length < 50) {
      adjusted -= 10;
    }

    // Positive signals
    if (/\bali\b/i.test(email.body_text || '')) {
      adjusted += 15;
    }
    if (/\.(edu|gov)$/i.test(email.from_address.split('@')[1] || '')) {
      adjusted += 10;
    }
    if (email.headers && hasNonImageAttachment(email)) {
      adjusted += 5;
    }

    const finalConfidence = clamp(Math.round(adjusted), 0, 100);
    const suggestedState = confidenceToState(finalConfidence);

    console.log(
      `${LOG_PREFIX} Email ${email.id}: raw=${rawConfidence} adjusted=${finalConfidence} state=${suggestedState}`
    );

    return {
      confidence: finalConfidence,
      raw_confidence: rawConfidence,
      reasoning: parsed.reasoning || 'No reasoning provided',
      suggested_state: suggestedState,
      reply_needed: parsed.reply_needed ?? false,
      category: parsed.category || 'unknown',
      classified_by: 'llm',
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Classification failed for email ${email.id}: ${error.message}`);

    return {
      confidence: 40,
      raw_confidence: 0,
      reasoning: 'LLM classification failed — held for review',
      suggested_state: 'SILENT_HOLD',
      reply_needed: false,
      category: 'unknown',
      classified_by: 'llm',
    };
  }
}

/**
 * Parses a JSON response from the LLM, stripping markdown fences if present.
 */
function parseJsonResponse(text: string): any {
  let cleaned = text.trim();

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error(`${LOG_PREFIX} Failed to parse LLM JSON response: ${cleaned.substring(0, 200)}`);
    throw new Error('Invalid JSON from LLM response');
  }
}

/**
 * Maps final confidence score to a suggested state.
 */
function confidenceToState(confidence: number): 'INBOX' | 'ASK_USER' | 'SILENT_HOLD' | 'AUTOMATION' {
  if (confidence >= 75) return 'INBOX';
  if (confidence >= 50) return 'ASK_USER';
  if (confidence >= 25) return 'SILENT_HOLD';
  return 'AUTOMATION';
}

/**
 * Checks if a target name appears in the To field addresses.
 */
function isInToField(toAddresses: any[], name: string): boolean {
  if (!Array.isArray(toAddresses)) return false;
  const pattern = new RegExp(name, 'i');
  return toAddresses.some((addr: any) => {
    const address = typeof addr === 'string' ? addr : addr?.address || addr?.email || '';
    return pattern.test(address);
  });
}

/**
 * Checks if a target name appears in the CC field addresses.
 */
function isInCcField(ccAddresses: any[], name: string): boolean {
  if (!Array.isArray(ccAddresses)) return false;
  const pattern = new RegExp(name, 'i');
  return ccAddresses.some((addr: any) => {
    const address = typeof addr === 'string' ? addr : addr?.address || addr?.email || '';
    return pattern.test(address);
  });
}

/**
 * Heuristic check for non-image attachments.
 * Checks the email headers for content-type indicators of attachments.
 */
function hasNonImageAttachment(email: NormalizedEmail): boolean {
  const headers = email.headers || {};
  const contentType = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === 'content-type'
  );
  if (contentType) {
    const val = String(contentType[1]).toLowerCase();
    if (val.includes('multipart/mixed')) {
      // multipart/mixed typically indicates attachments beyond inline images
      return true;
    }
  }
  return false;
}

/**
 * Formats an address array for display in the LLM prompt.
 */
function formatAddresses(addresses: any[]): string {
  if (!Array.isArray(addresses) || addresses.length === 0) return '(none)';
  return addresses
    .map((addr: any) => {
      if (typeof addr === 'string') return addr;
      const name = addr?.name || addr?.display_name || '';
      const email = addr?.address || addr?.email || '';
      return name ? `${name} <${email}>` : email;
    })
    .filter(Boolean)
    .join(', ') || '(none)';
}

/**
 * Clamps a number between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
