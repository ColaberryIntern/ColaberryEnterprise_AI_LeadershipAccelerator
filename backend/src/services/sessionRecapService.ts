import OpenAI from 'openai';
import { getInstrumentedOpenAI } from './openaiInstrumented';
import { env } from '../config/env';
import { LiveSession } from '../models';

// Live Sessions build-out Phase 4 (Session CC-20260721-s7h4): generate a short
// AI recap for a completed live session so absentees get a "here's what you
// missed" summary in the Today "you missed it" replay card. Best-effort — a
// failed or unconfigured LLM call must never break the session-completion cron.

export interface SessionRecap {
  summary: string;
  takeaways: string[];
  generated_at: string;
  model: string;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = env.openaiApiKey;
    if (!apiKey) throw new Error('OpenAI API key not configured');
    client = getInstrumentedOpenAI({ workflow_id: 'session_recap' }, { apiKey });
  }
  return client;
}

/** Pure: the user-content the recap is generated from. Exported for testing. */
export function buildRecapInput(session: {
  title?: string;
  description?: string;
  session_number?: number;
  curriculum_json?: any;
}): string {
  const parts = [`Session ${session.session_number ?? ''}: ${session.title || 'Live class'}`.trim()];
  if (session.description) parts.push(`Description: ${session.description}`);
  if (session.curriculum_json) {
    const cur =
      typeof session.curriculum_json === 'string'
        ? session.curriculum_json
        : JSON.stringify(session.curriculum_json);
    parts.push(`Curriculum: ${cur.slice(0, 4000)}`);
  }
  return parts.join('\n\n');
}

/**
 * Pure: defensively parse the model's JSON into a normalized recap body.
 * Falls back to treating the raw text as the summary if it isn't valid JSON.
 * Exported for testing.
 */
export function parseRecapContent(raw: string | null | undefined): {
  summary: string;
  takeaways: string[];
} {
  if (!raw) return { summary: '', takeaways: [] };
  try {
    const obj = JSON.parse(raw);
    const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
    const takeaways = Array.isArray(obj.takeaways)
      ? obj.takeaways
          .filter((t: any) => typeof t === 'string' && t.trim())
          .map((t: string) => t.trim())
          .slice(0, 6)
      : [];
    return { summary, takeaways };
  } catch {
    return { summary: raw.trim().slice(0, 600), takeaways: [] };
  }
}

const SYSTEM_PROMPT =
  'You write concise recaps of a live class session for adult professional learners who missed it. ' +
  'Return JSON only: { "summary": string (2-3 sentences on what the session covered and why it matters), ' +
  '"takeaways": string[] (3-5 short bullet phrases of the key points) }. No preamble.';

/**
 * Generate + persist an AI recap for a session. Idempotent by default: if a
 * recap already exists it is returned unchanged (pass force to regenerate).
 * Returns null when the LLM is unconfigured or the call fails (best-effort), so
 * the caller (the completion cron) is never broken by recap generation.
 */
export async function generateSessionRecap(
  session: LiveSession,
  opts: { force?: boolean } = {}
): Promise<SessionRecap | null> {
  if (!opts.force && session.recap_json?.summary) {
    return session.recap_json as SessionRecap;
  }
  if (!env.openaiApiKey) return null;
  try {
    const response = await getClient().chat.completions.create({
      model: env.aiModel,
      max_tokens: 400,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildRecapInput(session) },
      ],
    });
    const { summary, takeaways } = parseRecapContent(response.choices[0]?.message?.content);
    if (!summary) return null;
    const recap: SessionRecap = {
      summary,
      takeaways,
      generated_at: new Date().toISOString(),
      model: env.aiModel,
    };
    await session.update({ recap_json: recap } as any);
    return recap;
  } catch (err: any) {
    console.warn('[SessionRecap] generation failed:', err?.message);
    return null;
  }
}
