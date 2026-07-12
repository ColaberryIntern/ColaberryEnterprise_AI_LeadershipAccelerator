/**
 * mentorService — the AI Mentor, the heart of the Runtime. A Senior AI Systems
 * Architect who coaches during every activity: explains, hints, reviews work,
 * and asks Socratic questions — but NEVER hands over answers to graded work.
 * Also generates AI-guided reflection prompts and video augmentations. Mentor
 * turns are persisted so the coach remembers the student's history.
 */
import { chatText, chatJson } from './runtimeAi';
import MentorTurn from '../../models/MentorTurn';
import TimelineCard from '../../models/TimelineCard';

export type MentorMode = 'ask' | 'hint' | 'explain' | 'review';

interface CardCtx { id: string; type: string; title: string; description?: string | null; student_label?: string; metadata?: any }

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
  const system = `${SYSTEM}\n\nActivity: "${card.title}" (${card.student_label || card.type}). ${card.description ? `Context: ${card.description}` : ''}\n${modeInstruction(mode)}`;
  const msgs = [...history.slice(-6), { role: 'user' as const, content: message || 'Help me get started.' }];
  const r = await chatText('runtime_mentor', system, msgs, undefined, 500);
  await MentorTurn.create({ enrollment_id: enrollmentId, card_id: card.id, mode, question: message, reply: r.text }).catch(() => {});
  return { reply: r.text, kind: mode, cost_usd: r.cost_usd, runtime_ms: r.runtime_ms };
}

/** AI-guided reflection prompts — deeper than "what did you learn?". */
export async function reflectionPrompts(card: CardCtx) {
  const system = 'You design reflection questions that build metacognition for an AI Systems Architect student. Return STRICT json.';
  const user = `For the activity "${card.title}" (${card.type}), return json { "questions": string[] } — 4 sharp reflection questions ` +
    `like "What surprised you?", "What would you build with this?", "How would you explain it to a teammate?", "How would you improve it?", "How does this connect to your current project?". Make them specific to the activity.`;
  const r = await chatJson('runtime_reflection', system, user, undefined, 500);
  const qs = Array.isArray(r.parsed?.questions) && r.parsed.questions.length ? r.parsed.questions.map(String) : DEFAULT_REFLECTION;
  return { questions: qs, cost_usd: r.cost_usd };
}
const DEFAULT_REFLECTION = ['What surprised you most?', 'What would you build with this?', 'How would you explain it to a teammate?', 'How would you improve it, and why?'];

/**
 * Turn a passive video into an interactive experience: chapters, summary, quiz,
 * reflection. Generated ONCE and cached on the card so the whole class shares
 * it — the first student to tap "Make it interactive" pays the cost; everyone
 * after gets the saved copy instantly. `force` regenerates (admin override).
 */
export async function videoAugment(card: CardCtx, force = false) {
  const cached = card.metadata && typeof card.metadata === 'object' ? card.metadata.augment : null;
  if (!force && cached) return { augment: cached, cost_usd: 0, cached: true };

  const system = 'You turn a course video into an interactive study experience for an AI Systems Architect student. Return STRICT json.';
  const user = `Video: "${card.title}". ${card.description || ''}\nReturn json { "summary": string, "chapters": [{"t": "mm:ss", "title": string}], ` +
    `"quiz": [{"q": string, "options": string[], "answer": integer}], "flashcards": [{"front": string, "back": string}], "reflection": string[], "prompt_challenge": string, "github_task": string }.`;
  const r = await chatJson('runtime_video_augment', system, user, undefined, 1600);

  // Persist to the shared card so every future student reuses it (class-wide cache).
  // Non-transactional: concurrent first-views race but converge on an equivalent blob.
  await TimelineCard.update(
    { metadata: { ...(card.metadata && typeof card.metadata === 'object' ? card.metadata : {}), augment: r.parsed } },
    { where: { id: card.id } },
  ).catch(() => {});

  return { augment: r.parsed, cost_usd: r.cost_usd, cached: false };
}
