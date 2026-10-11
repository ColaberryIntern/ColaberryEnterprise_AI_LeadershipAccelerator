import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { WorkflowError } from '../content/contentWorkflowService';

/**
 * landingPageNameService - read a brief, propose what to call the page.
 *
 * WHY. Ali, 2026-10-08: "after building and pasting in 'The brief' on the landing page, I should
 * be able to click an AI button next to name that would scan it and come up with the best name."
 * The name is required before the page can be built, and it is the one field the brief already
 * answers - everything needed to name it was just pasted in below.
 *
 * THIS IS AN INTERNAL LABEL, NOT A HEADLINE. The name goes in the admin list and seeds the URL
 * slug; nobody visiting the page ever reads it. So the model is asked for something short and
 * identifying rather than something persuasive, and is told not to return a marketing headline -
 * a page called "Transform Your Career With AI Today!" is useless in a list of thirty.
 *
 * NOTHING IS INVENTED, which is the same rule the draft service runs under. The name may only
 * use what the brief says. A brief that never names a month must not produce "October Cohort",
 * because that name would then seed a slug, a URL and a tracked link that all assert a date
 * nobody wrote.
 *
 * FAILURE IS NOT FATAL. The operator can always type a name - this is a convenience on a field
 * that is otherwise theirs. So a model failure returns a clear error the caller shows beside the
 * field, and never blocks building the page.
 */

const MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 20_000;

/** Long enough to be identifying, short enough for a list and a slug. */
export const MAX_NAME_LENGTH = 60;
/** Below this there is not enough to name anything from, and the model would invent. */
export const MIN_BRIEF_LENGTH = 20;

const SYSTEM = [
  'You name landing pages for an internal admin list.',
  '',
  'The name is an INTERNAL LABEL. It is never shown to a visitor. It appears in a list beside',
  'other pages and seeds the page\'s URL slug, so it must identify this page among many at a',
  'glance. It is not a headline and not a call to action.',
  '',
  'Rules:',
  '- Use ONLY what the brief says. Never add a date, price, duration, cohort number, audience or',
  '  place that is not written there. If the brief does not say when it starts, the name must not',
  '  imply when it starts.',
  '- 2 to 6 words. No trailing punctuation. No quotation marks. No emoji.',
  `- At most ${MAX_NAME_LENGTH} characters.`,
  '- Prefer the subject plus what the page is for: "AI Learning Platform", "Analyst Upskilling',
  '  Class", "Partner Referral Signup".',
  '- Do not write sentence-case marketing copy such as "Start learning AI today".',
  '',
  'Reply with JSON only: {"name": "..."}',
].join('\n');

export interface SuggestNameResult {
  name: string;
  model: string;
}

/** Strip what the model was told not to send but sometimes does anyway. */
export function tidyName(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/^["'\s]+|["'\s.!?,;:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

export async function suggestLandingPageName(source: string): Promise<SuggestNameResult> {
  const brief = source.trim();
  if (brief.length < MIN_BRIEF_LENGTH) {
    throw new WorkflowError(
      'There is not enough in the brief to name the page from. Write a couple of sentences first.',
      400,
      'ValidationError',
    );
  }

  const client = getInstrumentedOpenAI(
    { workflow_id: 'landing_page_name', prompt_version: 'landing-page-name-v1' },
    { timeout: TIMEOUT_MS, maxRetries: 1 },
  );

  let raw: string;
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      // Low: this is a label, and a different answer every click would read as a broken button
      // rather than as creativity.
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Brief:\n\n${brief.slice(0, 4000)}` },
      ],
    });
    raw = res.choices[0]?.message?.content?.trim() ?? '';
  } catch (err: any) {
    throw new WorkflowError(
      'A name could not be suggested. Type one in instead.',
      502,
      err?.name === 'APIConnectionTimeoutError' ? 'TimeoutError' : 'DraftUnavailable',
    );
  }

  let name = '';
  try {
    name = tidyName(String((JSON.parse(raw) as { name?: unknown }).name ?? ''));
  } catch {
    // Malformed JSON is the same outcome as an empty answer: nothing usable came back.
    name = '';
  }

  if (!name) {
    throw new WorkflowError('A name could not be suggested. Type one in instead.', 502, 'DraftUnavailable');
  }

  return { name, model: MODEL };
}
