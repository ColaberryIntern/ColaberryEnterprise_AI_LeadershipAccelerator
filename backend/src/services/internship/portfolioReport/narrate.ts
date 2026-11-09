/**
 * narrate - OPTIONAL. Pulls "what are they asking Ali for" out of each intern's own recent emails.
 *
 * Deliberately this one job. The first version also had the model write the "lately" paragraph and
 * the nudge; on the 9 Nov 2026 production dry run it invented a commit date, mixed activity-event
 * counts up with commits, and gendered an intern. Those sections are deterministic (compose.ts);
 * the model only reads email text, which is the one thing the composer cannot summarize.
 *
 * Failure path: no client, a timeout (30s), a malformed reply or an API error leaves `asks` empty,
 * and the report shows the thread subjects instead. No retries: a missing digest costs nothing,
 * and a retry is a second paid call.
 */
import type { InternCard, PortfolioReport } from './types';

export const ASKS_MODEL = process.env.INTERN_REPORT_MODEL || 'gpt-4o-mini'; // same model class the old weekly report used
const TIMEOUT_MS = 30000;
const CONCURRENCY = 4;

/** The slice of the OpenAI client this module uses, so tests can pass a stub. */
export interface ChatClient {
  chat: { completions: { create: (params: any, opts?: any) => Promise<any> } }; // any: the SDK's overloaded signature; the reply is validated by parseAsks
}

const stripDashes = (s: string): string => s.replace(/[—–]/g, '-');

const SYSTEM = [
  'You read emails an intern sent to Ali, who runs their AI internship, and list what the intern is asking Ali for.',
  'Only list requests, questions, decisions or help the INTERN asks for in their own words. Ignore quoted text from Ali and status updates that ask for nothing.',
  'Never invent anything. Never use he/she/his/her: use the first name or "they".',
  'Plain American English, no em-dashes, each item under 20 words, at most 4 items, newest first.',
  'Return JSON: {"asks": string[]} (an empty array when they asked for nothing).',
].join('\n');

export function asksPrompt(c: InternCard): string {
  return JSON.stringify({
    firstName: c.firstName,
    emails: c.emails.threads.slice(0, 8).map((t) => ({ date: String(t.date).slice(0, 10), subject: t.subject, text: t.snippet })),
  });
}

/** Validate the model's reply. Anything off-contract is dropped, never repaired. */
export function parseAsks(text: unknown): string[] | null {
  const m = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: unknown;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const asks = (j as { asks?: unknown })?.asks;
  if (!Array.isArray(asks)) return null;
  return asks
    .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    .filter((a) => !/\b(he|she|his|her|him)\b/i.test(a))
    .slice(0, 4)
    .map((a) => stripDashes(a).trim().slice(0, 160));
}

async function askOne(client: ChatClient, c: InternCard): Promise<string[] | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const resp = await client.chat.completions.create({
      model: ASKS_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: asksPrompt(c) }],
    }, { signal: ctl.signal });
    return parseAsks(resp?.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timer);
  }
}

/** Mutates each card's `asks`/`asksFromModel`. Returns how many interns got a digest. */
export async function narrateAsks(report: PortfolioReport, client: ChatClient | null): Promise<{ narrated: number; total: number }> {
  const withMail = report.groups.flatMap((g) => g.interns).filter((c) => c.emails.threads.length > 0);
  if (!client) return { narrated: 0, total: withMail.length };
  let cursor = 0;
  let ok = 0;
  const worker = async (): Promise<void> => {
    while (cursor < withMail.length) {
      const c = withMail[cursor++];
      try {
        const asks = await askOne(client, c);
        if (asks) { c.asks = asks; c.asksFromModel = true; ok += 1; }
      } catch (err) {
        const e = err as Error;
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(), level: 'warn', service: 'internship-portfolio-report', event: 'asks_failed',
          outcome: 'failure', error_class: e?.name === 'AbortError' ? 'TimeoutError' : 'UpstreamUnavailable', context: { intern: c.firstName, message: e?.message },
        }));
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { narrated: ok, total: withMail.length };
}
