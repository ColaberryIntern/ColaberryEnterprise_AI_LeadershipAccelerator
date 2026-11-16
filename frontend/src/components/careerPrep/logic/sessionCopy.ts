import type { InterviewType } from '../careerPrepApi';

/**
 * Career Prep v27 (CP4.4): the words a session uses. Coaching text, not metrics: nothing here is a score
 * or a claim about the student. Questions come from the interview's own job description when there are
 * some (CP3.3), else from a short bank per interview type. The Learn text explains each skill in one or
 * two plain sentences; it never shows another student's answer (the Answer Library does not exist yet).
 */
export const QUESTION_BANK: Record<InterviewType, string[]> = {
  recruiter: ['Tell me about yourself and why this role.', 'What are you looking for in your next job?', 'Walk me through one project you are proud of.'],
  hiring_manager: ['Tell me about a problem you solved and what changed because of it.', 'How do you decide what to build first?', 'Tell me about a time a project did not go to plan.'],
  technical: ['Explain how a retrieval-augmented generation system works to a non-technical manager.', 'How would you test that an AI feature is working?', 'Walk me through a system you built, end to end.'],
  behavioral: ['Tell me about a time you disagreed with a teammate.', 'Tell me about a time you had to learn something fast.', 'Tell me about a mistake you made and what you did next.'],
};

export const FOLLOW_UPS = ['What was the result, in numbers?', 'What would you do differently?', 'What was your part, exactly?', 'Why did you choose that approach?'];

export const LEARN_TEXT: Record<string, string> = {
  ending_with_number: 'End every story on a result someone can measure: a time saved, a cost cut, a number of users. Say the number first.',
  explaining_ai: 'Explain AI the way you would to a smart friend: what goes in, what comes out, and one example. Skip the jargon.',
  composure_followups: 'When a follow-up catches you, pause for a breath, repeat the question in your own words, then answer.',
  few_fillers: 'Fillers like "um" and "you know" fill silence. A short pause sounds more confident than a filler.',
  behavioral_stories: 'Tell a work story in four parts: the situation, your task, what you did, and the result.',
  role_knowledge: 'Name the tools and the work this role uses, and connect each to something you have built.',
  answer_structure: 'Use STAR: Situation, Task, Action, Result. Keep the situation short and spend most of the time on what you did.',
  proof_of_work: 'Point to something you built that they can see: a case study, a repository, a demo.',
  pace_clarity: 'Most people are easiest to follow at about 100 to 165 words a minute. Slow down on the key point.',
};

export const WARM_UP_LINE = 'Say out loud, once: "Hi, I am glad to be here. Let me tell you about one thing I built."';

/** The Try question for segment `n` of a session: the interview's own questions first, then the bank. */
export function questionFor(n: number, type: InterviewType, own: string[] | null | undefined): string {
  const list = own && own.length ? own : QUESTION_BANK[type];
  return list[n % list.length];
}
