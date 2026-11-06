/**
 * C112 (Ali, 2026-11-05): a new Explorer's first assignment is the Week 0 program video, not a quiz. The Quick check
 * moves to second and is rewritten so every question is answered in that video ("A if things on the check are
 * covered in the video"). Interim until Ali's AI-avatar welcome video replaces the program video.
 *
 * Every answer below is stated in the video "AI Systems Architect Accelerator | Start Your Learning Journey"
 * (YouTube cCFr2qc5ME8, 3 min 33 s), checked against its transcript on 2026-11-05. The certification is deliberately
 * not an answer: its public wording is not approved in the claims registry (`credential.cca`).
 *
 * The plan is pure so it can be tested without a database; `fixWeek0ProgramVideoFirst.ts` applies it.
 */

export const PROGRAM_VIDEO_ID = 'b0c844c0-01b0-439e-bc28-6a1b76b09afb';
export const QUICK_CHECK_ID = 'c05b1303-29eb-439c-a2de-e0d6853f6754';
export const SELF_STUDY_ID = '88c4af7e-7690-4dd1-9adf-ba8e8f8fb2d7';

export interface CheckQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  competency: string;
}

export const QUICK_CHECK_TITLE = 'Quick check: how this program works';

export const QUICK_CHECK_QUESTIONS: CheckQuestion[] = [
  {
    question: 'Who was this program designed for?',
    options: [
      'People starting with zero coding, IT, or AI background',
      'Experienced software engineers only',
      'Data scientists only',
      'People who already build AI systems',
    ],
    correct_index: 0,
    explanation: 'The video says the path was designed from the ground up for people with zero coding experience, zero IT background, and zero prior exposure to AI.',
    competency: 'program_orientation',
  },
  {
    question: 'How long is the program?',
    options: ['6 weeks', '12 weeks', '6 months', '2 years'],
    correct_index: 1,
    explanation: 'It runs over 12 weeks, from the foundations to building reliable, trustworthy systems.',
    competency: 'program_orientation',
  },
  {
    question: 'Which AI do you build with throughout the program?',
    options: ['Siri', 'Alexa', 'Claude', 'None: you only read about AI'],
    correct_index: 2,
    explanation: 'You start by getting comfortable working alongside Claude, and build up to teaching multiple AI agents to work together.',
    competency: 'program_orientation',
  },
  {
    question: 'What do you leave the program with?',
    options: [
      'A notebook full of ideas',
      'A single quiz score',
      'A portfolio of real working projects you built yourself',
      'A list of videos you watched',
    ],
    correct_index: 2,
    explanation: 'The video says you walk away with a complete portfolio of real working projects you built with your own hands.',
    competency: 'program_orientation',
  },
  {
    question: 'Who supports you along the way?',
    options: [
      'Nobody: you learn alone',
      'Your cohort of peers, mentors and instructors, and the community',
      'Only an automated chatbot',
      'Only your employer',
    ],
    correct_index: 1,
    explanation: 'You are never doing this alone: you have a cohort of peers, dedicated mentors and instructors, and a support community.',
    competency: 'program_orientation',
  },
];

/** The fields this change touches on a card, as stored. */
export interface CardState {
  id: string;
  title: string;
  bucket: string;
  order: number;
  metadata: Record<string, unknown>;
}

export interface CardUpdate {
  id: string;
  set: Partial<Pick<CardState, 'title' | 'bucket' | 'order' | 'metadata'>>;
}

/** Where the prior values are kept, on the card itself, so a rollback needs nothing else. */
export const PRIOR_KEY = 'c112_prior';

/** Metadata with the card's current values saved under PRIOR_KEY, once: a re-run never overwrites the original save. */
function withPrior(card: CardState, fields: Array<'title' | 'bucket' | 'order'>, saveContent: boolean, extra: Record<string, unknown> = {}): Record<string, unknown> {
  if (card.metadata[PRIOR_KEY]) return { ...card.metadata, ...extra };
  const prior: Record<string, unknown> = {};
  for (const f of fields) prior[f] = card[f];
  if (saveContent) {
    prior.assessment = card.metadata.assessment;
    prior.content = card.metadata.content;
    prior.locked = card.metadata.locked ?? null;
  }
  return { ...card.metadata, ...extra, [PRIOR_KEY]: prior };
}

/**
 * JSON text with object keys sorted, so equal values compare equal however they were stored. Postgres jsonb hands keys back
 * in its own order (length, then bytes), and plain JSON.stringify made every re-run plan the Quick check again (5 Nov).
 */
function canonicalJson(x: unknown): string {
  const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]))
    : v;
  return JSON.stringify(sortKeys(x));
}

/**
 * Pure: the updates that put the program video first and the rewritten Quick check second. Empty when the cards are
 * already in that state, so a second run changes nothing. Throws if a card is missing or is not the card expected.
 */
export function planProgramVideoFirst(video: CardState | undefined, check: CardState | undefined, selfStudy: CardState | undefined): CardUpdate[] {
  if (!video || !check || !selfStudy) throw new Error('C112: a Week 0 card is missing; nothing changed');
  if (!/Start Your Learning Journey/.test(video.title)) throw new Error(`C112: ${video.id} is not the program video ("${video.title}")`);
  if (check.metadata.assessment === undefined) throw new Error(`C112: ${check.id} has no assessment; not the Quick check`);
  if (selfStudy.title !== 'Self Study') throw new Error(`C112: ${selfStudy.id} is not Self Study ("${selfStudy.title}")`);

  const updates: CardUpdate[] = [];
  if (video.bucket !== 'pre_class' || video.order !== 1) {
    updates.push({ id: video.id, set: { bucket: 'pre_class', order: 1, metadata: withPrior(video, ['bucket', 'order'], false) } });
  }
  const assessment = (check.metadata.assessment || {}) as Record<string, unknown>;
  const rewritten = canonicalJson(assessment.questions) === canonicalJson(QUICK_CHECK_QUESTIONS);
  if (check.order !== 2 || check.title !== QUICK_CHECK_TITLE || !rewritten || check.metadata.locked !== true) {
    const content = (check.metadata.content || {}) as Record<string, unknown>;
    updates.push({
      id: check.id,
      set: {
        order: 2,
        title: QUICK_CHECK_TITLE,
        metadata: withPrior(check, ['title', 'order'], true, {
          assessment: { ...assessment, questions: QUICK_CHECK_QUESTIONS, generated_at: assessment.generated_at, rewritten_for: 'C112' },
          content: {
            ...content,
            title: QUICK_CHECK_TITLE,
            summary: 'Five quick questions on the video you just watched: who this program is for and how it works.',
            body_html: '<p>Every answer is in the welcome video you just watched.</p>',
          },
          locked: true,
        }),
      },
    });
  }
  if (selfStudy.order !== 3) {
    updates.push({ id: selfStudy.id, set: { order: 3, metadata: withPrior(selfStudy, ['order'], false) } });
  }
  return updates;
}

/** Pure: the updates that restore every card to the values saved before C112 ran. Empty if nothing was saved. */
export function planRollback(cards: CardState[]): CardUpdate[] {
  const out: CardUpdate[] = [];
  for (const c of cards) {
    const prior = c.metadata[PRIOR_KEY] as Record<string, unknown> | undefined;
    if (!prior) continue;
    const meta: Record<string, unknown> = { ...c.metadata };
    delete meta[PRIOR_KEY];
    if ('assessment' in prior) { meta.assessment = prior.assessment; meta.content = prior.content; if (prior.locked === null) delete meta.locked; else meta.locked = prior.locked; }
    const set: CardUpdate['set'] = { metadata: meta };
    if (typeof prior.title === 'string') set.title = prior.title;
    if (typeof prior.bucket === 'string') set.bucket = prior.bucket;
    if (typeof prior.order === 'number') set.order = prior.order;
    out.push({ id: c.id, set });
  }
  return out;
}
