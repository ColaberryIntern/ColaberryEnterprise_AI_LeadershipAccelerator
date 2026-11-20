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

const FORBIDDEN: RegExp[] = [
  /\bfree\b/i,
  /https?:\/\/|www\.|\.(com|org|ai|io|net)\b/i,
  /\$\s?\d|\b\d+\s?(dollars|usd)\b/i,
  /\b\d{1,2}(:\d{2})?\s?(am|pm|a\.m\.|p\.m\.)\b/i,
  /\b(cst|cdt|central time|ct)\b/i,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|today)s?\b/i,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i,
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/,
];

/** Keep only the sentences that state no forbidden fact; normalise dashes and whitespace. */
export function cleanDescription(raw: string): string {
  const text = raw.replace(/[–—]/g, ', ').replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ').trim();
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
  });
  const cleaned = cleanDescription(result.content);
  if (!cleaned) throw new DescribeRefusedError('The AI draft only had dates, links or prices in it. Try again, or write it yourself.');
  return cleaned;
}
