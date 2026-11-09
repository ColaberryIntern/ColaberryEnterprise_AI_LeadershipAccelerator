/**
 * C112 (Ali, 2026-11-05): a new Explorer's first assignment is the Week 0 program video, not a quiz. The Quick check
 * moves to second and is rewritten so every question is answered in that video ("A if things on the check are
 * covered in the video").
 *
 * C118 (Ali, 2026-11-09): the program video is now Ali's AI-avatar welcome video (1 min 49 s), self-hosted from
 * frontend/public/media/welcome/ because it has no YouTube link. It replaces YouTube cCFr2qc5ME8 (3 min 33 s), whose
 * transcript the earlier questions came from; three of those five were no longer answered in the new video (12 weeks,
 * building with Claude, the portfolio), so the Quick check is rewritten with it. Every answer below is stated in the
 * avatar video, checked against its transcript on 2026-11-09. The video's salary and price figures are deliberately
 * not answers.
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
    question: 'How did Ali make the avatar in this video?',
    options: [
      'With the same kind of AI tools you are about to learn here',
      'By hiring a film studio',
      'By drawing it by hand',
      'It is not an avatar: it is a live recording',
    ],
    correct_index: 0,
    explanation: 'Ali says he made his AI avatar with the same kind of AI tools you are about to learn in this program.',
    competency: 'program_orientation',
  },
  {
    question: 'What does the video call your first win?',
    options: [
      'Buying a membership',
      'Finishing this video',
      'Passing a final exam',
      'Getting hired',
    ],
    correct_index: 1,
    explanation: 'Ali says: stay with me to the end. Finishing this video is your first win.',
    competency: 'program_orientation',
  },
  {
    question: 'What does a frontier, or forward deployed, engineer do?',
    options: [
      'Only chats with AI tools',
      'Writes news articles about AI',
      'Goes into a business and builds real AI systems that work',
      'Answers support tickets about AI',
    ],
    correct_index: 2,
    explanation: 'It is the person who does not just chat with AI, but goes into a business and builds real AI systems that work.',
    competency: 'program_orientation',
  },
  {
    question: 'AI changes every week. How does this program keep up?',
    options: [
      'The slides are updated once a year',
      'It does not need to change',
      'You study last year\'s notes',
      'Every week, Ali goes live on a new topic',
    ],
    correct_index: 3,
    explanation: 'Every week Ali goes live on a new topic, so what you learn is always current, never last year\'s slides.',
    competency: 'program_orientation',
  },
  {
    question: 'Where do you meet so you are never learning alone?',
    options: [
      'Nowhere: the program is solo',
      'At open house and in class',
      'Only by email',
      'Only on social media',
    ],
    correct_index: 1,
    explanation: 'We meet at open house and in class, so you are never learning alone. You do not need to be technical to start: you just need to show up.',
    competency: 'program_orientation',
  },
];

/** C118: the program video card now plays Ali's avatar welcome video, served by nginx from frontend/public. */
export const PROGRAM_VIDEO_TITLE = 'Video: A welcome from Ali | Start Your Learning Journey';
export const WELCOME_VIDEO = {
  url: '/media/welcome/ali-avatar-welcome-v1.mp4',
  poster: '/media/welcome/ali-avatar-welcome-v1.jpg',
  presenter: 'Ali Muwwakkil',
  duration_seconds: 109,
};
export const WELCOME_MINUTES = 2;
/** Where the replaced video, title and minutes are kept on the video card, so a rollback restores the YouTube video. */
export const VIDEO_PRIOR_KEY = 'c118_prior';

/** The fields this change touches on a card, as stored. */
export interface CardState {
  id: string;
  title: string;
  bucket: string;
  order: number;
  estimated_time?: number | null;
  metadata: Record<string, unknown>;
}

export interface CardUpdate {
  id: string;
  set: Partial<Pick<CardState, 'title' | 'bucket' | 'order' | 'estimated_time' | 'metadata'>>;
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
 * The one update for the video card: move it to pre_class order 1 (C112) and play the avatar welcome video (C118), merged
 * so the card never gets two competing updates. Null when both are already true. Each step saves what it replaces, once.
 */
function planVideoCard(video: CardState): CardUpdate | null {
  const set: CardUpdate['set'] = {};
  let meta = video.metadata;
  if (video.bucket !== 'pre_class' || video.order !== 1) {
    set.bucket = 'pre_class'; set.order = 1;
    meta = withPrior(video, ['bucket', 'order'], false);
  }
  const swapped = canonicalJson(video.metadata.video) === canonicalJson(WELCOME_VIDEO)
    && video.title === PROGRAM_VIDEO_TITLE && video.estimated_time === WELCOME_MINUTES;
  if (!swapped) {
    set.title = PROGRAM_VIDEO_TITLE; set.estimated_time = WELCOME_MINUTES;
    const prior = video.metadata[VIDEO_PRIOR_KEY]
      ?? { video: video.metadata.video ?? null, title: video.title, estimated_time: video.estimated_time ?? null };
    meta = { ...meta, video: WELCOME_VIDEO, [VIDEO_PRIOR_KEY]: prior };
  }
  return Object.keys(set).length ? { id: video.id, set: { ...set, metadata: meta } } : null;
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
  const videoUpdate = planVideoCard(video);
  if (videoUpdate) updates.push(videoUpdate);
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
          assessment: { ...assessment, questions: QUICK_CHECK_QUESTIONS, generated_at: assessment.generated_at, rewritten_for: 'C118' },
          content: {
            ...content,
            title: QUICK_CHECK_TITLE,
            summary: 'Five quick questions on Ali\'s welcome video: where this leads and how the program works.',
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

/**
 * Pure: the updates that restore every card to the values saved before C112 and C118 ran. Empty if nothing was saved.
 * The C118 save (video, title, minutes) is applied first, so the older C112 save wins any field both recorded.
 */
export function planRollback(cards: CardState[]): CardUpdate[] {
  const out: CardUpdate[] = [];
  for (const c of cards) {
    const prior = (c.metadata[PRIOR_KEY] ?? {}) as Record<string, unknown>;
    const videoPrior = c.metadata[VIDEO_PRIOR_KEY] as Record<string, unknown> | undefined;
    if (!c.metadata[PRIOR_KEY] && !videoPrior) continue;
    const meta: Record<string, unknown> = { ...c.metadata };
    delete meta[PRIOR_KEY];
    delete meta[VIDEO_PRIOR_KEY];
    const set: CardUpdate['set'] = { metadata: meta };
    if (videoPrior) {
      if (videoPrior.video == null) delete meta.video; else meta.video = videoPrior.video;
      if (typeof videoPrior.title === 'string') set.title = videoPrior.title;
      if (videoPrior.estimated_time !== undefined) set.estimated_time = videoPrior.estimated_time as number | null;
    }
    if ('assessment' in prior) { meta.assessment = prior.assessment; meta.content = prior.content; if (prior.locked === null) delete meta.locked; else meta.locked = prior.locked; }
    if (typeof prior.title === 'string') set.title = prior.title;
    if (typeof prior.bucket === 'string') set.bucket = prior.bucket;
    if (typeof prior.order === 'number') set.order = prior.order;
    out.push({ id: c.id, set });
  }
  return out;
}
