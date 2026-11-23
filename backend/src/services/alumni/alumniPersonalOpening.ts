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

/** Words kept in capitals when an all-caps class name is tidied ("SQLBI BOOTCAMP" -> "SQL BI Bootcamp"). */
const ACRONYMS: Record<string, string> = { SQL: 'SQL', BI: 'BI', MS: 'MS', SQLBI: 'SQL BI', AI: 'AI', ETL: 'ETL', SSIS: 'SSIS', SSRS: 'SSRS', SSAS: 'SSAS', BA: 'BA', II: 'II', I: 'I' };

function tidyProgram(head: string): string {
  return head.replace(/\s+/g, ' ').trim().split(' ').map((w) => {
    const up = w.toUpperCase();
    if (ACRONYMS[up]) return ACRONYMS[up];
    if (/^bootcamp$/i.test(w)) return 'Bootcamp';
    return w === up && /[A-Z]/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w;
  }).join(' ');
}

/** "Data Analytics Bootcamp - Jul 11 2020 (ONLINE)" -> program + "July 2020". Lenient; nulls when unreadable. */
export function openingContextFrom(alumni: Record<string, any> | null | undefined): AlumniOpeningContext {
  const raw = String(alumni?.class_name || '').trim();
  const [head, tail = ''] = raw.split(/\s+-\s+/);
  const program = head ? tidyProgram(head) : null;
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
      'You write ONLY the first one or two short sentences of a personal email from Ali Muwwakkil, who founded Colaberry, to a former student.',
      'The greeting ("Hi <name>,") is already written: do not greet. The rest of the email is already written: do not preview or summarize it, and do not mention holidays or the season (the email does that).',
      'Ali ran the school; he did not take the class with them. Never say "we" were in the class, "together", or that they graduated (not everyone finished).',
      'Ali does not know what they have done since the class: never assume their progress, career or how far they have come, and never imply he has been in touch with them recently.',
      'Tie the sentence to what this email is about, so each of the ten openings is different. Sound like a real person writing one note, not a template: do not start with "I hope", "It\'s been a while" or "I wanted to reach out".',
      `Plain, warm, first person, American English, at most ${MAX_WORDS - 15} words.`,
      'You may mention their program and class month and year naturally. Nothing else factual.',
      'Never mention: a price, discount, offer or offerings, deal, special, percent, dollar amount, salary, statistic, any number except their class year, any company, a link, a promise or guarantee, or the word "free". No dashes.',
      'Return only the sentences, no quotes.',
    ].join(' '),
    user: `${facts}\nThis email is about: ${theme}\nWrite the opening.`,
  };
}

const BANNED = /\b(price|pricing|cost|discount\w*|offer\w*|deal\w*|special|percent|salary|salaries|guarantee\w*|promise\w*|free|million|billion|anthropic|claude|gartner|indeed|levels\.fyi|together|graduat\w*|thanksgiving|christmas|holiday\w*|finds you well)\b|%|\$|https?:|www\.|@/i;

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
  if (/^i hope\b|^it'?’?s been a while|reach(ing)? out/i.test(t.replace(/’/g, "'"))) problems.push('template opener');
  // Ali does not know their story since the class, or whether they finished it.
  if (/how far you|progress you|your career|complet\w*|wrapped up|finish\w*|hearing how/i.test(t)) problems.push('assumes their story');
  return problems;
}

/** Plain openings, one per email, used whenever the AI draft cannot be. */
const FALLBACKS = [
  'I wanted you to hear this from me directly.',
  'You have been on my mind this week.',
  'I wanted to share something with you directly.',
  'I have been thinking a lot about where our alumni are headed.',
  'Here is something I think you will want to see.',
  'I wanted to pass along something I think you will find interesting.',
  'A quick note from me today.',
  'I wanted to follow up with a few thoughts.',
  'I have been looking back on this year.',
  'One more note from me.',
];
export function fallbackOpening(stepIndex: number): string {
  return FALLBACKS[Math.abs(stepIndex) % FALLBACKS.length];
}

/**
 * The "template" mode: one fixed sentence per email, built around the person's own class. Personal
 * (their program and class month and year), different in every email, and always true, because
 * nothing in it is generated. Without a readable class it says "your class with us".
 */
export function templateOpening(ctx: AlumniOpeningContext, stepIndex: number): string {
  const cls = ctx.program ? `${ctx.program} class${ctx.classMonthYear ? ` in ${ctx.classMonthYear}` : ''}` : 'class with us';
  const of = ctx.program ? `${ctx.program} class${ctx.classMonthYear ? ` of ${ctx.classMonthYear}` : ''}` : 'class with us';
  const lines = [
    `Since your ${cls}, the analyst role has changed a lot, and I want you to hear my take on it.`,
    `This week I am thinking about everyone who has come through Colaberry, including your ${of}.`,
    `When you sat in our ${cls}, most people had never heard of this next role.`,
    `Much of what your ${cls} covered now lives inside one platform I built.`,
    `Your ${cls} gave you a foundation, and here is how to show employers what you can build on top of it.`,
    `The skills you started building in our ${cls} are getting serious attention right now.`,
    `If you came into our ${cls} with an eye on BI work, this note is for you.`,
    `If I were starting from your ${of} today, this is the plan I would follow.`,
    `As the year winds down, I am thinking about people from every class, including your ${of}.`,
    `One more note to you and the rest of your ${of}.`,
  ];
  return lines[Math.abs(stepIndex) % lines.length];
}

export interface OpeningResult { text: string; source: 'ai' | 'fallback' | 'template'; problems: string[] }

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
