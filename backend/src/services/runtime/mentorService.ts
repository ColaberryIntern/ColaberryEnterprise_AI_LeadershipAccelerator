/**
 * mentorService — the AI Mentor, the heart of the Runtime. A Senior AI Systems
 * Architect who coaches during every activity: explains, hints, reviews work,
 * and asks Socratic questions — but NEVER hands over answers to graded work.
 * Also generates AI-guided reflection prompts and video augmentations. Mentor
 * turns are persisted so the coach remembers the student's history.
 */
import { chatText, chatJson } from './runtimeAi';
import MentorTurn from '../../models/MentorTurn';
import { buildMentorContext, MentorContext } from './mentorContext';
import { getLearnerContextBlock } from '../learnerContextService';
import { loadConversation } from './mentorMemory';

export type MentorMode = 'ask' | 'hint' | 'explain' | 'review';

interface CardCtx { id: string; type: string; title: string; description?: string | null; student_label?: string; metadata?: any; program_id?: string | null; week?: number | null }

const SYSTEM =
  'You are a Senior AI Systems Architect acting as a warm, sharp personal mentor to a student in an AI Systems ' +
  'Architect Accelerator. Coach like a great senior engineer: explain concepts clearly, give HINTS and guiding ' +
  'questions, review the student\'s work and name specific strengths + one concrete next step. NEVER hand over a ' +
  'full answer to graded work — lead them to it. Keep replies tight (2-5 sentences). Encourage without flattery.';

function modeInstruction(mode: MentorMode): string {
  switch (mode) {
    case 'hint': return 'The student is stuck. Give ONE nudge — a question or a partial cue — not the answer.';
    case 'explain': return 'Explain the concept simply, with one concrete example.';
    case 'review': return 'Review what the student shared: name a genuine strength, then the single most valuable improvement.';
    default: return 'Answer helpfully while keeping the student thinking.';
  }
}

export async function coach(enrollmentId: string, card: CardCtx, mode: MentorMode, message: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
  // Assignment-aware context: the student's actual work on this card (answers,
  // score, saved work, section growth). Degrade gracefully — a context-assembly
  // failure must NOT 500 the chat; the mentor just falls back to card-only coaching.
  // The shared learner-360 (persona, competency, assessment history, project) —
  // this is what makes the mentor smarter over time. Never throws (returns '' on
  // failure). Kick it off in parallel with the card-scoped context below.
  const profileP = getLearnerContextBlock(enrollmentId);
  // Durable conversation memory: read prior MentorTurns back so context survives
  // page reloads and return visits (never throws — empty window on failure).
  const memoryP = loadConversation(enrollmentId, card.id);
  let learner: MentorContext = { block: '', graded_lock: false, has_work: false };
  try {
    learner = await buildMentorContext(enrollmentId, card);
  } catch (e: any) {
    console.warn(JSON.stringify({ level: 'warn', service: 'runtime_mentor', event: 'context_assembly_failed', card_id: card.id, error_class: e?.name || 'Error', message: String(e?.message || e) }));
  }
  const profile = await profileP;
  const convo = await memoryP;
  const profileBlock = profile ? `\n\n${profile}` : '';
  const memoryBlock = convo.summary ? `\n\nEARLIER IN THIS CONVERSATION: ${convo.summary}.` : '';
  const work = learner.block
    ? `\n\nWHAT THE STUDENT HAS DONE ON THIS ACTIVITY (this is their real work — reference it specifically, never say you can't see it):\n${learner.block}`
    : '';
  const lock = learner.graded_lock
    ? '\nThis is a graded Evaluation the student can retake: do NOT reveal the correct option for any question they missed — coach them toward it with a question or a hint.'
    : '';
  const system = `${SYSTEM}${profileBlock}${memoryBlock}\n\nActivity: "${card.title}" (${card.student_label || card.type}). ${card.description ? `Context: ${card.description}` : ''}${work}${lock}\n${modeInstruction(mode)}`;
  // Prefer the DB-durable conversation (survives reloads); fall back to the
  // client-sent history only when there are no stored turns yet.
  const priorMsgs = convo.recent.length ? convo.recent : history.slice(-6);
  const msgs = [...priorMsgs, { role: 'user' as const, content: message || 'Help me get started.' }];
  const r = await chatText('runtime_mentor', system, msgs, undefined, 500);
  await MentorTurn.create({ enrollment_id: enrollmentId, card_id: card.id, mode, question: message, reply: r.text }).catch(() => {});
  return { reply: r.text, kind: mode, cost_usd: r.cost_usd, runtime_ms: r.runtime_ms };
}

/** AI-guided reflection prompts — deeper than "what did you learn?". */
export async function reflectionPrompts(card: CardCtx, resultsContext?: string | null) {
  const system = 'You design reflection questions that build metacognition for an AI Systems Architect student. Return STRICT json.';
  const base = `For the activity "${card.title}" (${card.type}), return json { "questions": string[] } — 4 sharp reflection questions ` +
    `like "What surprised you?", "What would you build with this?", "How would you explain it to a teammate?", "How would you improve it?", "How does this connect to your current project?". Make them specific to the activity.`;
  // The section's reflection sits AFTER the evaluation + survey, so when their
  // results are available, make the questions help the student make sense of them.
  const user = resultsContext
    ? `${base}\n\nThe student has JUST finished this section's Evaluation and weekly Survey:\n${resultsContext}\nMake at least TWO of the four questions help them make sense of THESE specific results — their score and pass/fail, where they were strong vs weak, their growth since the entry Knowledge Check, and what their own survey feedback reveals — not generic prompts.`
    : base;
  const r = await chatJson('runtime_reflection', system, user, undefined, 500);
  const qs = Array.isArray(r.parsed?.questions) && r.parsed.questions.length ? r.parsed.questions.map(String) : DEFAULT_REFLECTION;
  return { questions: qs, cost_usd: r.cost_usd };
}
const DEFAULT_REFLECTION = ['What surprised you most?', 'What would you build with this?', 'How would you explain it to a teammate?', 'How would you improve it, and why?'];
