/**
 * The canonical AI Internship interview — ONE versioned question bank, shared by
 * both channels.
 *
 * ── WHY THIS IS CODE AND NOT ROWS ──────────────────────────────────────────
 *
 * The contract's hardest requirement is that the guided form and the AI phone
 * call ask the SAME questions and write the SAME keys, and that an applicant can
 * start in one and finish in the other without being asked anything twice. The
 * only way that is structurally true is if there is one definition and both
 * channels read it.
 *
 * So the bank lives here, versioned, and is mirrored into
 * `internship_interview_question_sets` / `_questions` for audit — the DB row
 * records which version an answer was given against, but this file is the source
 * of truth. A bank edited only in the database would let the phone prompt and the
 * form drift apart with nothing failing.
 *
 * ── THE TWO PHRASINGS ARE NOT A TRANSLATION ────────────────────────────────
 *
 * Each question carries `prompt_form` and `prompt_voice`. They ask the same thing
 * and share one `question_key`, but a question read aloud cannot be phrased like
 * a form label — "Employment status" works on screen and is a non-sentence on the
 * phone. Keeping both on one record is what stops the voice script becoming a
 * separate, unversioned document.
 *
 * ── WHAT IS DELIBERATELY ABSENT ────────────────────────────────────────────
 *
 * No field here collects a credential. `tools_secrets_ack` explicitly asks the
 * applicant to CONFIRM they will never share a key — it is the one question about
 * secrets, and answering it correctly means saying "yes, I understand", never
 * producing one.
 *
 * No question infers a protected trait, and none is scored. Weights and rubrics
 * are absent on purpose: `internshipRecommendation.ts` reasons over these answers
 * and produces an explainable recommendation, but the bank itself holds no
 * opinion about what a good answer is.
 */

/** Bump when a question is added, removed, or its meaning changes. */
export const ACTIVE_QUESTION_SET_VERSION = 1;

export type InterviewSection =
  | 'motivation'
  | 'availability'
  | 'projects'
  | 'experience'
  | 'working_style'
  | 'tools_and_costs'
  | 'agreement';

export type AnswerType = 'text' | 'long_text' | 'yes_no' | 'choice';

export interface InterviewQuestion {
  question_key: string;
  section: InterviewSection;
  display_order: number;
  /** Phrasing for the on-screen guided form. */
  prompt_form: string;
  /** Phrasing for the AI interviewer to speak. Same question, sayable. */
  prompt_voice: string;
  answer_type: AnswerType;
  /** Only for `choice`. */
  options?: readonly string[];
  required: boolean;
  /**
   * A confirmation the applicant must actively agree to, rather than a question
   * with a range of valid answers. Surfaced to the reviewer as a contradiction
   * when answered "no" — never auto-rejected.
   */
  is_confirmation?: boolean;
}

/**
 * Section order and headings for the guided form. The phone call follows the same
 * order so a resumed interview picks up where the other channel stopped.
 */
export const SECTION_ORDER: readonly InterviewSection[] = [
  'motivation', 'availability', 'projects', 'experience',
  'working_style', 'tools_and_costs', 'agreement',
] as const;

export const SECTION_TITLES: Record<InterviewSection, string> = {
  motivation: 'Why this, and what you want from it',
  availability: 'Time and attendance',
  projects: 'Real project work',
  experience: 'What you have built',
  working_style: 'How you work',
  tools_and_costs: 'Tools and costs',
  agreement: 'Confirmations',
};

const Q = (q: InterviewQuestion): InterviewQuestion => q;

/**
 * Version 1. Every question below maps 1:1 to the implementation contract's
 * "Group B — qualification interview" list, in its order.
 */
export const QUESTION_BANK_V1: readonly InterviewQuestion[] = [
  Q({
    question_key: 'why_join',
    section: 'motivation',
    display_order: 10,
    prompt_form: 'Why do you want to join the AI Internship?',
    prompt_voice: 'To start — why do you want to join the AI Internship?',
    answer_type: 'long_text',
    required: true,
  }),
  Q({
    question_key: 'career_target',
    section: 'motivation',
    display_order: 20,
    prompt_form: 'What AI career or role are you pursuing?',
    prompt_voice: 'What kind of AI role are you aiming for?',
    answer_type: 'text',
    required: true,
  }),
  Q({
    question_key: 'success_definition',
    section: 'motivation',
    display_order: 30,
    prompt_form: 'What would make the internship successful for you?',
    prompt_voice: 'If this goes well, what would that look like for you personally?',
    answer_type: 'long_text',
    required: true,
  }),

  Q({
    question_key: 'employment_status',
    section: 'availability',
    display_order: 40,
    prompt_form: 'Are you currently employed full-time, part-time, contract, or not employed?',
    prompt_voice: 'Are you working at the moment — full time, part time, contract, or not currently employed?',
    answer_type: 'choice',
    options: ['full_time', 'part_time', 'contract', 'not_employed'] as const,
    required: true,
  }),
  Q({
    question_key: 'weekly_hours_commitment',
    section: 'availability',
    display_order: 50,
    prompt_form: 'Can you commit at least 25 hours per week?',
    prompt_voice: 'The internship needs at least twenty-five hours a week. Can you commit to that?',
    answer_type: 'yes_no',
    required: true,
    is_confirmation: true,
  }),
  Q({
    question_key: 'can_attend_meetings',
    section: 'availability',
    display_order: 60,
    prompt_form: 'Can you attend the required internship and class meetings?',
    prompt_voice: 'There are required internship and class meetings. Can you attend those?',
    answer_type: 'yes_no',
    required: true,
    is_confirmation: true,
  }),
  Q({
    question_key: 'conflicting_obligations',
    section: 'availability',
    display_order: 70,
    prompt_form: 'What recurring obligations could interfere with those commitments?',
    prompt_voice: 'What regular commitments do you have that might get in the way?',
    answer_type: 'long_text',
    required: true,
  }),
  Q({
    question_key: 'will_notify_absence',
    section: 'availability',
    display_order: 80,
    prompt_form: 'Will you notify the team before a meeting you cannot attend?',
    prompt_voice: 'If you cannot make a meeting, will you tell the team beforehand?',
    answer_type: 'yes_no',
    required: true,
    is_confirmation: true,
  }),

  Q({
    question_key: 'accountable_for_kpis',
    section: 'projects',
    display_order: 90,
    prompt_form: 'Are you prepared to work on real Colaberry AI projects and be accountable for personal and project KPIs?',
    prompt_voice: 'This is real client-facing project work, and you would be accountable for your own KPIs and the project’s. Are you up for that?',
    answer_type: 'yes_no',
    required: true,
    is_confirmation: true,
  }),
  Q({
    question_key: 'two_active_projects',
    section: 'projects',
    display_order: 100,
    prompt_form: 'Are you prepared to work on as many as two active projects?',
    prompt_voice: 'You could be on as many as two active projects at once. Is that manageable for you?',
    answer_type: 'yes_no',
    required: true,
    is_confirmation: true,
  }),

  Q({
    question_key: 'built_something',
    section: 'experience',
    display_order: 110,
    prompt_form: 'Describe something technical, analytical, automated, or AI-related that you have built.',
    prompt_voice: 'Tell me about something you have built — technical, analytical, automated, anything AI-related. Walk me through it.',
    answer_type: 'long_text',
    required: true,
  }),
  Q({
    question_key: 'tool_comfort',
    section: 'experience',
    display_order: 120,
    prompt_form: 'How comfortable are you with GitHub, VS Code, Claude Code, APIs, and debugging?',
    prompt_voice: 'How comfortable are you with GitHub, VS Code, Claude Code, APIs and debugging? Be honest — we would rather know.',
    answer_type: 'long_text',
    required: true,
  }),

  Q({
    question_key: 'when_blocked',
    section: 'working_style',
    display_order: 130,
    prompt_form: 'What do you do when you are blocked?',
    prompt_voice: 'When you get stuck on something, what do you actually do?',
    answer_type: 'long_text',
    required: true,
  }),
  Q({
    question_key: 'revision_response',
    section: 'working_style',
    display_order: 140,
    prompt_form: 'How do you respond when a manager requests a revision?',
    prompt_voice: 'A manager comes back and asks you to redo something. How do you take that?',
    answer_type: 'long_text',
    required: true,
  }),
  Q({
    question_key: 'unreliable_metric',
    section: 'working_style',
    display_order: 150,
    prompt_form: 'What do you do when a metric or data source appears unreliable?',
    prompt_voice: 'Say a number looks wrong, or a data source seems unreliable. What do you do?',
    answer_type: 'long_text',
    required: true,
  }),
  Q({
    question_key: 'prove_it_works',
    section: 'working_style',
    display_order: 160,
    prompt_form: 'How would you prove that a feature works?',
    prompt_voice: 'How would you prove to someone else that a feature actually works?',
    answer_type: 'long_text',
    required: true,
  }),

  Q({
    question_key: 'tools_required_ack',
    section: 'tools_and_costs',
    display_order: 170,
    prompt_form: 'Do you understand that Claude Code and API usage are required for the class and the internship?',
    prompt_voice: 'Claude Code and your own API usage are required for both the class and the internship. Is that clear?',
    answer_type: 'yes_no',
    required: true,
    is_confirmation: true,
  }),
  Q({
    question_key: 'tools_ready_or_will_obtain',
    section: 'tools_and_costs',
    display_order: 180,
    prompt_form: 'Do you have, or are you prepared to obtain before activation, your own Claude Code account and your own API key with billing available?',
    prompt_voice: 'Do you already have your own Claude Code account and your own API key with billing set up — or are you ready to get them before you start?',
    answer_type: 'yes_no',
    required: true,
    is_confirmation: true,
  }),
  Q({
    question_key: 'tools_secrets_ack',
    section: 'tools_and_costs',
    display_order: 190,
    // The one question about secrets. Answering it means saying "I understand" —
    // never producing a credential.
    prompt_form: 'Do you understand that credentials, passwords, and API-key values must never be given to Colaberry staff, to the interviewer, or entered into this platform?',
    prompt_voice: 'One important thing: you must never give your password or API key to anyone at Colaberry, including me on this call, and never type it into the platform. Do you understand that?',
    answer_type: 'yes_no',
    required: true,
    is_confirmation: true,
  }),
  Q({
    question_key: 'costs_understood',
    section: 'tools_and_costs',
    display_order: 200,
    prompt_form: 'Do you understand the membership cost and the separate third-party tool costs?',
    prompt_voice: 'The membership is one hundred and forty-nine dollars a month billed annually, or one hundred and ninety-nine month to month, and it is waived if you already pay Colaberry. On top of that you pay your own tool costs, usually around thirty dollars a month. Is that all clear?',
    answer_type: 'yes_no',
    required: true,
    is_confirmation: true,
  }),

  Q({
    question_key: 'agrees_to_expectations',
    section: 'agreement',
    display_order: 210,
    prompt_form: 'Do you agree to the stated time, attendance, communication, project, and conduct expectations?',
    prompt_voice: 'Last one. Do you agree to the time, attendance, communication, project and conduct expectations we have gone through?',
    answer_type: 'yes_no',
    required: true,
    is_confirmation: true,
  }),
];

/** The bank for a given version. Throws on an unknown version rather than guessing. */
export function questionBank(version: number = ACTIVE_QUESTION_SET_VERSION): readonly InterviewQuestion[] {
  if (version === 1) return QUESTION_BANK_V1;
  throw new Error(`Unknown internship question set version: ${version}`);
}

export function activeQuestions(): readonly InterviewQuestion[] {
  return questionBank(ACTIVE_QUESTION_SET_VERSION);
}

/** Every key in the active bank. The alphabet both channels are allowed to write. */
export function activeQuestionKeys(): string[] {
  return activeQuestions().map((q) => q.question_key);
}

export function findQuestion(
  key: string,
  version: number = ACTIVE_QUESTION_SET_VERSION,
): InterviewQuestion | null {
  return questionBank(version).find((q) => q.question_key === key) ?? null;
}

/** Questions in ask-order: by section, then display order within it. */
export function orderedQuestions(
  version: number = ACTIVE_QUESTION_SET_VERSION,
): InterviewQuestion[] {
  const sectionRank = new Map(SECTION_ORDER.map((s, i) => [s, i]));
  return [...questionBank(version)].sort((a, b) => {
    const sa = sectionRank.get(a.section) ?? 999;
    const sb = sectionRank.get(b.section) ?? 999;
    return sa !== sb ? sa - sb : a.display_order - b.display_order;
  });
}

/** The confirmations, which the reviewer needs to see resolved either way. */
export function confirmationKeys(
  version: number = ACTIVE_QUESTION_SET_VERSION,
): string[] {
  return questionBank(version).filter((q) => q.is_confirmation).map((q) => q.question_key);
}

/**
 * Is this a valid answer for the question's type?
 *
 * Used by both channels, so a transcript extraction cannot write a value the form
 * would have refused. A `choice` answer must be one of the declared options; a
 * `yes_no` must be a real boolean.
 */
export function isValidAnswer(
  question: InterviewQuestion,
  value: { answer_text?: string | null; answer_value?: unknown },
): boolean {
  switch (question.answer_type) {
    case 'yes_no':
      return typeof value.answer_value === 'boolean';
    case 'choice':
      return typeof value.answer_value === 'string'
        && (question.options ?? []).includes(value.answer_value);
    case 'text':
    case 'long_text':
    default:
      return typeof value.answer_text === 'string' && value.answer_text.trim().length > 0;
  }
}
