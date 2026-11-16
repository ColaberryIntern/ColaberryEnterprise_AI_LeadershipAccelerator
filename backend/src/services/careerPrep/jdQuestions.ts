import { z } from 'zod';
import { careerPrepChat, logLlmFailure, type LlmCall } from './careerPrepLlm';

/**
 * Career Prep v27 (CP3.3): turn a pasted job description into the questions to practice. This is
 * the minimal grounded step that stands in for Position Prep (v22 N0, not built yet; M1 Q2 default).
 * Grounded: the model sees only the job description, role and interview type. Output is validated
 * (5 to 8 questions, each 10 to 300 characters); anything else is a failure, and a failure returns
 * null so the interview is still saved, just without questions.
 */
export const JD_PROMPT_VERSION = 'career-prep-jd-v1';

const SYSTEM = `You write interview practice questions from a job description.
Return JSON: {"questions": ["...", ...]} with 5 to 8 questions a real interviewer for THIS job would ask,
each one sentence, specific to the duties and tools named in the job description. Mix behavioral and role questions.
Never ask about age, family, health, religion, national origin, the way someone speaks, or any protected trait. No numbering.`;

const Out = z.object({ questions: z.array(z.string().trim().min(10).max(300)).min(5).max(8) });

export async function questionsFromJd(jd: string, role: string, type: string, call: LlmCall = careerPrepChat): Promise<string[] | null> {
  const text = jd.trim();
  if (text.length < 40) return null; // too little to ground anything on
  try {
    const raw = await call(JD_PROMPT_VERSION, SYSTEM, `Role: ${role}\nInterview type: ${type}\n\nJob description:\n${text.slice(0, 12_000)}`);
    if (!raw) return null;
    const parsed = Out.safeParse(JSON.parse(raw));
    if (!parsed.success) throw Object.assign(new Error('model output failed validation'), { name: 'ValidationError' });
    return parsed.data.questions;
  } catch (err) {
    logLlmFailure('career_prep_jd_questions_failed', err);
    return null;
  }
}
