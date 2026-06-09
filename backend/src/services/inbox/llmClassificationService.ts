import OpenAI from 'openai';
import { countPriorEmailsFromSender } from './senderHistory';

const LOG_PREFIX = '[InboxCOS][LLM]';

// Subject/body fragments that almost exclusively appear in cold outreach.
// Each match contributes a deterministic penalty regardless of LLM verdict —
// the LLM was scoring podcast/MRR/consulting pitches at 85-90 because they
// look like business communications. These signals catch the pattern.
const COLD_OUTREACH_PATTERNS: RegExp[] = [
  /\b(more|grow|boost|scale|10x|2x)\s+(your\s+)?(mrr|revenue|sales|pipeline|leads|business)\b/i,
  /\b(open\s+(for|to)|interested\s+in)\s+(advertising|partnership|sponsoring|guest|podcast|collaboration)\b/i,
  /\b(guest|feature\s+you)\s+on\s+(your|the)\s+(podcast|show|newsletter)\b/i,
  /\b(quick|brief|short)\s+(call|chat|intro|coffee)\b/i,
  /\b(15|20|30)[\s-]?min(ute)?s?\b.*\b(call|chat|demo|intro)\b/i,
  /\bworth\s+a\s+(quick\s+)?(call|chat|conversation)\b/i,
  /\bwould\s+you\s+be\s+(open\s+to|interested\s+in|down\s+for)\b/i,
  /\b(follow[- ]?up|following\s+up|circling\s+back|bumping\s+this)\b/i,
  /\bbundling\s+your\b/i,
  /\bbeating\s+(goliath|giants)\b/i,
];

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
- He cares about: direct business communications from known contacts, family/school matters, investor relations, partnership requests from existing relationships, personal messages
- He does NOT need to see: newsletters, marketing, automated notifications, receipts, social media alerts, bulk sends, AND cold outreach (see below)

COLD OUTREACH — DO NOT SURFACE (score 30 or lower, category "marketing"):
Cold outreach is the largest source of false positives in this inbox. It commonly:
- Pitches podcast appearances or guest spots ("would love to feature you", "guest on your podcast", "from contact-center data to AI")
- Pitches consulting, advertising, or partnerships from senders Ali has never replied to ("bundling your consulting", "open for advertising", "potential collaboration")
- Uses growth-hook hype ("more MRR", "scale your business", "10x your pipeline", "beating Goliath with AI")
- Asks for a "quick 15-min call" or "brief intro chat"
- Drops Ali's name into the subject ("Re: Ali Muwwakkil, Opportunity for X") to look personalized
- Comes from never-seen-before senders with no thread history

These look like business communications but they are NOT — they are unsolicited pitches. Default to filtering them out. A real business contact will have prior email history with Ali or will be CC'd alongside a known Colaberry address.

User preference: bias HARD toward filtering OUT — only surface what truly matters. When in doubt, score lower.

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

    // Cold-outreach signal: pitch keywords in subject or first 500 chars of body.
    // Single penalty regardless of match count — multiple hits don't compound.
    const pitchHaystack = `${email.subject || ''}\n${(email.body_text || '').slice(0, 500)}`;
    if (COLD_OUTREACH_PATTERNS.some((rx) => rx.test(pitchHaystack))) {
      adjusted -= 25;
    }

    // First-time-sender signal: zero prior emails from this address is the
    // strongest cold-outreach predictor. Skip the DB query if the sender is
    // already a no-reply/list-unsub (other signals already cover those).
    if (!hasListUnsubscribe && !/no[-_.]?reply/i.test(email.from_address)) {
      const priorCount = await countPriorEmailsFromSender(email.from_address, email.id);
      if (priorCount === 0) {
        adjusted -= 20;
      }
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
