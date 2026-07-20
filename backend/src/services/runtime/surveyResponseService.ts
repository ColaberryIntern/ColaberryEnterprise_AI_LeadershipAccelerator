/**
 * surveyResponseService — capture + store a student's answers to a weekly
 * feedback Survey card, and read them back to prefill the form.
 *
 * The questions themselves live on the card's generated content
 * (metadata.content.questions[] + reflection); we snapshot the question text
 * WITH each answer so a stored response is self-describing for later analysis
 * (the questions are week-specific and regenerate over time).
 *
 * Idempotency: one row per (card_id, enrollment_id) — saving upserts, so a
 * student re-submitting overwrites their own prior answers (never duplicates).
 * Failure design: pure validators throw typed {status:400} errors the
 * controller maps to HTTP; no external calls, so no retries/timeouts needed.
 */
import CardSurveyResponse, { SurveyAnswers, SurveyAnswerItem } from '../../models/CardSurveyResponse';
import TimelineCard from '../../models/TimelineCard';
import { awardCardCompletionPoints } from '../progression/cardPointsService';

const MAX_COMMENT = 2000;
const MAX_OPEN = 4000;
const MAX_ITEMS = 40;

export interface SurveyView {
  questions: string[];        // the Likert statements to render (from card content)
  open_prompt: string | null; // the open-ended prompt (content.reflection)
  answers: SurveyAnswers | null; // this student's saved answers, or null
}

/** PURE — the survey questions + open prompt carried on a card's metadata. */
export function questionsFromCard(metadata: any): { questions: string[]; open_prompt: string | null } {
  const c = metadata && typeof metadata === 'object' ? metadata.content : null;
  const questions = c && Array.isArray(c.questions)
    ? c.questions.filter((q: any) => typeof q === 'string' && q.trim()).map((q: string) => q.trim())
    : [];
  const open_prompt = c && typeof c.reflection === 'string' && c.reflection.trim() ? c.reflection.trim() : null;
  return { questions, open_prompt };
}

/** PURE — validate + normalize a submitted answers payload, or throw a 400.
 *  `questions` is the authoritative list from the card; item text is snapshotted
 *  from it by index so a stale/forged client label can't rewrite the question. */
export function normalizeAnswers(payload: any, questions: string[]): SurveyAnswers {
  const rawItems = payload && Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length > MAX_ITEMS) throw Object.assign(new Error('Too many answers'), { status: 400 });
  const items: SurveyAnswerItem[] = rawItems.map((it: any, i: number) => {
    const idx = Number.isInteger(it?.index) ? it.index : i;
    const question = (typeof questions[idx] === 'string' && questions[idx]) || (typeof it?.question === 'string' ? it.question : `Question ${idx + 1}`);
    let rating: number | null = null;
    if (it?.rating != null) {
      const r = Number(it.rating);
      if (!Number.isInteger(r) || r < 1 || r > 5) throw Object.assign(new Error('Rating must be 1–5'), { status: 400 });
      rating = r;
    }
    const comment = typeof it?.comment === 'string' && it.comment.trim() ? it.comment.trim().slice(0, MAX_COMMENT) : null;
    return { question: String(question).slice(0, 500), rating, comment };
  });
  const open = typeof payload?.open === 'string' && payload.open.trim() ? payload.open.trim().slice(0, MAX_OPEN) : null;
  if (!items.some((it) => it.rating != null) && !open) {
    throw Object.assign(new Error('Answer at least one question before submitting'), { status: 400 });
  }
  return { items, open };
}

/** The survey to render for this student: the card's questions + any saved answers. */
export async function getSurvey(enrollmentId: string, cardId: string): Promise<SurveyView> {
  const card = await TimelineCard.findByPk(cardId, { attributes: ['id', 'metadata'] });
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  const { questions, open_prompt } = questionsFromCard(card.metadata);
  const row = await CardSurveyResponse.findOne({ where: { card_id: cardId, enrollment_id: enrollmentId } });
  return { questions, open_prompt, answers: row ? row.answers : null };
}

/** Save (upsert) this student's answers; snapshots week/program + question text.
 *  Submitting the survey is what completes the card, so it also awards engagement
 *  points (idempotent per card — re-submitting never re-awards). */
export async function saveSurvey(enrollmentId: string, cardId: string, payload: any): Promise<{ saved: true; answers: SurveyAnswers; points_awarded: number }> {
  const card = await TimelineCard.findByPk(cardId, { attributes: ['id', 'type', 'program_id', 'week', 'metadata'] });
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  const { questions } = questionsFromCard(card.metadata);
  const answers = normalizeAnswers(payload, questions);
  const existing = await CardSurveyResponse.findOne({ where: { card_id: cardId, enrollment_id: enrollmentId } });
  if (existing) {
    await existing.update({ answers, program_id: (card as any).program_id ?? null, week: card.week ?? null });
  } else {
    await CardSurveyResponse.create({
      card_id: cardId, enrollment_id: enrollmentId,
      program_id: (card as any).program_id ?? null, week: card.week ?? null,
      answers,
    });
  }
  const points_awarded = await awardCardCompletionPoints(enrollmentId, { id: card.id, type: card.type });
  return { saved: true, answers, points_awarded };
}
