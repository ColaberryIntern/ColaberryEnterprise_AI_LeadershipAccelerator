/**
 * AL1 (Ali, 2026-11-22): the DA alumni holiday campaign is "hybrid". Each email is Ali's approved
 * text word for word, except its first one or two sentences, which the AI writes per person from
 * their alumni record (program, class month and year, career stage). The body carries the
 * placeholder {{personal_opening}}; the scheduler fills it at send time (fillPersonalOpening).
 *
 * The opening may NOT carry anything that could be wrong in Ali's name: no price, discount, number
 * (other than the person's own class year), link, salary, statistic, company name or promise.
 * screenOpening enforces that. A draft that fails, a timeout, or no AI key all fall back to a
 * plain opening for that step (fallbackOpening), so the email always goes out complete.
 *
 * Failure modes handled: AI unreachable or slow (20 s timeout) -> fallback; a draft that breaks a
 * rule -> fallback, problems recorded on the row; missing alumni fields -> the prompt says less.
 * Never throws.
 */
import { getOpenAI } from '../llmCallWrapper';

export const OPENING_PLACEHOLDER = '{{personal_opening}}';
const MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 20_000;
const MAX_WORDS = 50;

export interface AlumniOpeningContext {
  /** "Data Analytics Bootcamp" */
  program: string | null;
  /** "July 2020" */
  classMonthYear: string | null;
  /** 4-digit class year, the only number an opening may contain. */
  classYear: string | null;
  /** CCPP career stage label, e.g. "placed", "job_seeking". */
  careerStage: string | null;
}

const MONTHS: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
  jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December',
};

/** "Data Analytics Bootcamp - Jul 11 2020 (ONLINE)" -> program + "July 2020". Lenient; nulls when unreadable. */
export function openingContextFrom(alumni: Record<string, any> | null | undefined): AlumniOpeningContext {
  const raw = String(alumni?.class_name || '').trim();
  const [head, tail = ''] = raw.split(/\s+-\s+/);
  const program = head ? head.replace(/\s+/g, ' ').replace(/\b([A-Z])([A-Z]+)\b/g, (_m, a, b) => a + b.toLowerCase()).trim() : null;
  const m = tail.match(/([A-Za-z]{3})[a-z]*\s+\d{1,2},?\s+(\d{4})/);
  const month = m ? MONTHS[m[1].toLowerCase()] : null;
  const year = m ? m[2] : null;
  const stage = String(alumni?.career_stage || '').trim() || null;
  return { program: program || null, classMonthYear: month && year ? `${month} ${year}` : null, classYear: year, careerStage: stage };
}

/** The step's subject or theme, so the opening leads into what the email is about. */
export function buildOpeningPrompt(ctx: AlumniOpeningContext, theme: string): { system: string; user: string } {
  const facts = [
    ctx.program ? `They took Colaberry's ${ctx.program}${ctx.classMonthYear ? ` (class of ${ctx.classMonthYear})` : ''}.` : 'They are a Colaberry alum.',
    ctx.careerStage ? `Career stage on file: ${ctx.careerStage.replace(/_/g, ' ')}.` : '',
  ].filter(Boolean).join(' ');
  return {
    system: [
      'You write ONLY the first one or two sentences of a personal email from Ali Muwwakkil, who founded Colaberry, to a former student.',
      'The greeting ("Hi <name>,") is already written: do not greet. The rest of the email is already written: do not summarize it.',
      `Warm, plain, first person, American English, at most ${MAX_WORDS - 10} words.`,
      'You may mention their program and class month and year naturally. Nothing else factual.',
      'Never mention: a price, discount, offer, deal, special, percent, dollar amount, salary, statistic, any number except their class year, any company, a link, a promise or guarantee, or the word "free". No dashes.',
      'Return only the sentences, no quotes.',
    ].join(' '),
    user: `${facts}\nThis email is about: ${theme}\nWrite the opening.`,
  };
}

const BANNED = /\b(price|pricing|cost|discount|offer|deal|special|percent|salary|salaries|guarantee|guaranteed|promise|free|million|billion|anthropic|claude|gartner|indeed|levels\.fyi)\b|%|\$|https?:|www\.|@/i;

/** Every rule an opening breaks; empty when it may be sent. */
export function screenOpening(text: string, ctx: AlumniOpeningContext): string[] {
  const t = String(text || '').trim();
  const problems: string[] = [];
  if (!t) return ['empty'];
  const words = t.split(/\s+/).length;
  if (words > MAX_WORDS) problems.push(`too long (${words} words)`);
  const sentences = (t.match(/[.!?](\s|$)/g) || []).length;
  if (sentences > 2) problems.push(`more than two sentences (${sentences})`);
  const banned = t.match(BANNED);
  if (banned) problems.push(`banned: ${banned[0]}`);
  const numbers = (t.match(/\d+/g) || []).filter((n) => n !== ctx.classYear);
  if (numbers.length) problems.push(`numbers: ${numbers.join(', ')}`);
  if (/[–—]/.test(t)) problems.push('dash');
  if (/^(hi|hello|dear|hey)\b/i.test(t)) problems.push('greets');
  return problems;
}

/** Plain openings, one per email, used whenever the AI draft cannot be. */
const FALLBACKS = [
  'I hope this finds you well.',
  'I hope you are having a good week.',
  'I wanted to share something with you directly.',
  'I have been thinking a lot about where our alumni are headed.',
  'I hope you are doing well.',
  'I wanted to pass along something I think you will find interesting.',
  'I hope your December is off to a good start.',
  'I wanted to follow up with a few thoughts.',
  'I hope you are getting some time to rest this season.',
  'I hope you are enjoying the holidays.',
];
export function fallbackOpening(stepIndex: number): string {
  return FALLBACKS[Math.abs(stepIndex) % FALLBACKS.length];
}

export interface OpeningResult { text: string; source: 'ai' | 'fallback'; problems: string[] }

export type OpeningModel = (system: string, user: string) => Promise<string>;

const defaultModel: OpeningModel = async (system, user) => {
  const res = await getOpenAI().chat.completions.create(
    { model: MODEL, temperature: 0.7, max_tokens: 120, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] },
    { timeout: TIMEOUT_MS },
  );
  return String(res.choices[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
};

/** Write one person's opening, or the step's plain fallback. Never throws. */
export async function writeOpening(ctx: AlumniOpeningContext, theme: string, stepIndex: number, model: OpeningModel = defaultModel): Promise<OpeningResult> {
  try {
    const { system, user } = buildOpeningPrompt(ctx, theme);
    const text = await model(system, user);
    const problems = screenOpening(text, ctx);
    if (!problems.length) return { text, source: 'ai', problems: [] };
    return { text: fallbackOpening(stepIndex), source: 'fallback', problems };
  } catch (err: any) {
    return { text: fallbackOpening(stepIndex), source: 'fallback', problems: [`model: ${err?.name || 'Error'}: ${String(err?.message || '').slice(0, 120)}`] };
  }
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Put the opening into a body that carries the placeholder. Bodies without it are returned unchanged. */
export function fillPersonalOpening(body: string, opening: string): string {
  return body.includes(OPENING_PLACEHOLDER) ? body.split(OPENING_PLACEHOLDER).join(escHtml(opening)) : body;
}
