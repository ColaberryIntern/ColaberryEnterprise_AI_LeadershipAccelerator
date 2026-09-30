/**
 * mentorContext — assembles the ASSIGNMENT-AWARE context the AI Mentor needs to
 * coach on the exact card the student is working, from data the runtime already
 * captures: the card's content (what the activity is), the student's latest
 * quiz/evaluation attempt (which questions they got right/wrong, by competency),
 * any saved non-quiz work (prompt-lab / reflection / structured responses), and
 * the section's growth + weekly-survey signal.
 *
 * Why this exists: the runtime mentor used to receive only the card title +
 * description, so it truthfully answered "I don't see your answers yet." This
 * module hands it the student's actual work.
 *
 * Safety: the mentor now holds the answer key, so `renderAttempt` WITHHOLDS the
 * correct option for a graded Evaluation the student has not yet passed (they can
 * retake it) and returns `graded_lock=true` so the coach hints instead of reveals.
 *
 * Read-only + fully defended: every source is optional. A brand-new card with no
 * attempt yields an empty block, so the mentor degrades to "let's get started"
 * rather than inventing work that isn't there.
 */
import AssessmentAttempt from '../../models/AssessmentAttempt';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import { contentFromMetadata } from '../timeline/timelineService';
import { sectionResultsSummary } from './assessmentService';
import { clip, renderAttempt, renderSavedWork } from './mentorContextFormat';

export { renderAttempt, renderSavedWork } from './mentorContextFormat';

const MAX_BLOCK = 1800; // token-budget guard on the injected context

export interface MentorContext {
  block: string;        // context to inject into the coach's system prompt ('' when nothing yet)
  graded_lock: boolean; // true = a graded eval the student can retake; coach must not reveal answers
  has_work: boolean;    // did the student actually submit/save anything on this card?
}

interface CardLike { id: string; type: string; title: string; metadata?: any; program_id?: string | null; week?: number | null; }

/** Assemble the full assignment-aware context for (student, card). Read-only. */
export async function buildMentorContext(enrollmentId: string, card: CardLike): Promise<MentorContext> {
  const parts: string[] = [];
  let graded_lock = false;
  let has_work = false;

  // 1) What the activity IS — the student-facing content the card rendered.
  const content = contentFromMetadata(card.metadata);
  if (content) {
    const bits: string[] = [];
    if (content.summary) bits.push(clip(content.summary, 400));
    if (Array.isArray(content.questions) && content.questions.length) {
      bits.push(`Prompts: ${content.questions.slice(0, 8).map((x) => clip(String(x))).join(' | ')}`);
    }
    if (bits.length) parts.push(`ACTIVITY: ${bits.join(' ')}`);
  }

  // 2) The student's latest quiz/evaluation attempt on THIS card — their answers.
  const attempt = await AssessmentAttempt.findOne({
    where: { enrollment_id: enrollmentId, card_id: card.id },
    order: [['submitted_at', 'DESC']],
  });
  if (attempt) {
    const rendered = renderAttempt(attempt);
    graded_lock = rendered.graded_lock;
    has_work = true;
    parts.push(`THEIR WORK ON THIS ACTIVITY:\n${rendered.text}`);
  }

  // 3) Saved non-quiz work (prompt-lab, reflection, structured responses).
  const progress = await TimelineCardProgress.findOne({ where: { enrollment_id: enrollmentId, card_id: card.id } });
  const saved = renderSavedWork(progress?.student_progress);
  if (saved) { has_work = true; parts.push(`SAVED WORK: ${saved}`); }

  // 4) Section growth + weekly survey — how the student is trending, not just this card.
  const section = await sectionResultsSummary(enrollmentId, card.program_id, card.week);
  if (section) parts.push(`SECTION PROGRESS: ${section}`);

  return { block: parts.join('\n\n').slice(0, MAX_BLOCK), graded_lock, has_work };
}
