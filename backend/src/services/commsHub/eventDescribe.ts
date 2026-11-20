import { z } from 'zod';
import { callLLMWithAudit } from '../llmCallWrapper';
import { COMMS_HUB_EVENT_TYPES } from '../../db/ensureCommsHubSchema';
import { EVENT_DESCRIPTION_SYSTEM, eventDescriptionUserPrompt } from './prompts/eventDescriptionPrompt';

/**
 * "Write with AI" for the event description (CH3.2). Goes through llmCallWrapper (logging, cost,
 * cache). The model's output is then checked by code: any sentence that states a date, time, link,
 * price or the word "free" is dropped, and dashes are replaced, so a description can never carry a
 * fact that disagrees with the event record.
 */
export const COMMS_HUB_LLM_NAMESPACE = '00000000-0000-4000-8000-0000000c0b10';
export const DESCRIBE_MODEL = 'gpt-4o-mini';

export const DescribeInput = z.object({
  title: z.string().trim().min(1).max(255),
  event_type: z.enum(COMMS_HUB_EVENT_TYPES).default('other'),
  hosts: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  notes: z.string().trim().max(1000).nullable().optional(),
}).strict();
export type DescribeInput = z.infer<typeof DescribeInput>;

export class DescribeRefusedError extends Error {}

const TYPE_WORDS: Record<string, string> = { session: 'live session', open_house: 'open house', office_hours: 'office hours', workshop: 'workshop', other: 'community event' };

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const ORD = '(?:st|nd|rd|th)?';
/**
 * Any sentence matching one of these is dropped. Deliberately broad: a dropped good sentence costs a
 * click on Write with AI; a kept wrong date ships a fact that disagrees with the event record.
 * Hardened after CH3.2 attempt 1, whose verifier leaked "6 p.m.", "Dec 1st", "2026-12-01", "18:30",
 * "noon", "UTC", "zoom.us/j/1", "bit.ly/x" and a zero-width "fr\u200Bee" through the first version.
 */
const FORBIDDEN: RegExp[] = [
  /\bfree\b/i,
  // links: a scheme, www., or any domain-shaped token (name.tld, optionally with a path)
  /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|net|io|ai|us|ly|co|me|dev|app|gg|link|page|zoom|edu|gov|info|biz|tv)\b|\b[a-z0-9-]+\.[a-z]{2,}\/\S/i,
  // prices: symbol before or after the number, ISO code before or after, and slang
  /[$\u20AC\u00A3\u00A5\u20B9]\s?\d|\d\s?[$\u20AC\u00A3\u00A5\u20B9]|\b(?:usd|eur|gbp|inr|rs\.?)\s?\d|\b\d+(?:[.,]\d+)?\s?(?:dollars?|usd|eur|euros?|pounds?|gbp|bucks|rupees?)\b/i,
  // clock times: 6pm, 6 p.m., 6:30, 18:30, noon, midnight, "at 7", "@ 6"
  /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?|am|pm)(?=[\s.,;:!?)]|$)/i,
  /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/,
  /\b(?:noon|midnight|o'?clock)\b/i,
  /\b(?:at|@)\s?\d{1,2}\b|@\s?\d/i,
  // zones: codes only in capitals (so "et al." or "pt." in prose survive), names in any case
  /\b(?:CST|CDT|CT|EST|EDT|ET|PST|PDT|PT|MST|MDT|MT|UTC|GMT)\b/,
  /\b(?:central|eastern|pacific|mountain)\s+time\b/i,
  // days: full names in any case; short forms only capitalised ("Sat." yes, "sat down" no)
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b|\b(?:tomorrow|tonight|today|weekend|next week)\b|\bin\s\d+\s(?:days?|weeks?)\b/i,
  /\b(?:Mon|Tue|Tues|Wed|Weds|Thu|Thur|Thurs|Fri|Sat|Sun)\b\.?/,
  // dates: "Dec 1st", "Dec. 3", "December 1", "1st of December", "the 3rd", ISO, 12/01, 12.01.2026, 12-01-2026
  new RegExp(`\\b${MONTH}\\s+\\d{1,2}${ORD}\\b`, 'i'),
  new RegExp(`\\b\\d{1,2}${ORD}\\s+(?:of\\s+)?${MONTH}(?=\\W|$)`, 'i'),
  /\bthe\s\d{1,2}(?:st|nd|rd|th)\b/i,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b|\b\d{1,2}-\d{1,2}-\d{2,4}\b/,
];

/** Zero-width and compatibility characters a model (or a paste) can hide a forbidden word behind. */
function normalise(raw: string): string {
  return raw.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '');
}

/** Keep only the sentences that state no forbidden fact; normalise dashes and whitespace. */
export function cleanDescription(raw: string): string {
  const text = normalise(raw)
    .replace(/\b([ap])\.\s?m\./gi, '$1m') // "6 p.m. sharp." must stay one sentence for the splitter below
    // "See you Dec. 3." likewise: an abbreviation's period is not a sentence end
    .replace(/\b(jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|rs)\.(?=\s)/gi, '$1')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ').replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ').trim();
  // Split only where punctuation is followed by whitespace, so the dots inside a URL or "a.m." never
  // cut a sentence in two (which once left a stray "com/e/1." behind after the URL sentence was dropped).
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.map((s) => s.trim()).filter((s) => s && !FORBIDDEN.some((rx) => rx.test(s))).join(' ').slice(0, 600).trim();
}

export async function describeEvent(input: DescribeInput): Promise<string> {
  const result = await callLLMWithAudit({
    lessonId: COMMS_HUB_LLM_NAMESPACE,
    generationType: 'admin_structure',
    step: 'comms_hub_event_description',
    systemPrompt: EVENT_DESCRIPTION_SYSTEM,
    userPrompt: eventDescriptionUserPrompt({ title: input.title, typeLabel: TYPE_WORDS[input.event_type], hosts: input.hosts, notes: input.notes ?? null }),
    model: DESCRIBE_MODEL,
    temperature: 0.7,
    maxTokens: 220,
    // Write with AI is asked for a NEW draft each time; the wrapper's cache would hand back the same
    // text for the same inputs, including the draft that was just refused.
    force: true,
  });
  const cleaned = cleanDescription(result.content);
  if (!cleaned) throw new DescribeRefusedError('The AI draft only had dates, links or prices in it. Try again, or write it yourself.');
  return cleaned;
}
