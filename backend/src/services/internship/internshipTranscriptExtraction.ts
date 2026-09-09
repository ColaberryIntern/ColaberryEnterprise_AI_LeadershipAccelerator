import { activeQuestions, isValidAnswer, type InterviewQuestion } from './internshipQuestionBank';
import type { AnswerInput } from './internshipInterviewService';

/**
 * Turn a call transcript into normalized answers against the canonical bank.
 *
 * ── THE DESIGN CONSTRAINT THAT SHAPES EVERYTHING HERE ──────────────────────
 *
 * A phone answer that lands in the database as though the applicant typed it,
 * when in fact a model guessed at it, is a fabricated answer attributed to a real
 * person — and a reviewer would have no way to tell. So extraction NEVER writes a
 * confident `answered`. Every extracted answer lands as `needs_followup`, which
 * `remainingQuestions()` treats as unresolved.
 *
 * The consequence is deliberate and is the point: after a call, the applicant sees
 * their extracted answers in the review screen, corrects anything wrong, and their
 * confirmation is what promotes them to `answered`. The contract asks for exactly
 * this — "Allow the applicant to review a final structured summary and correct it
 * before submission" — and this is the mechanism that makes the review load-bearing
 * rather than decorative.
 *
 * ── WHY THE PARSER IS DELIBERATELY DUMB ────────────────────────────────────
 *
 * The agent is instructed to speak each question with its `[question_key]` marker
 * suppressed from speech but present in the script, and Synthflow transcripts
 * interleave speaker labels. Rather than ask a model to infer which answer belongs
 * to which question — an inference nobody can audit — this looks for the question's
 * own words in the transcript and takes the applicant's next turn.
 *
 * When it cannot find a question, it says so by simply not emitting an answer. A
 * missing answer means the question gets asked again, which is a recoverable
 * outcome. A wrong answer silently attributed to the applicant is not.
 */

/** A parsed transcript turn. */
interface Turn {
  speaker: 'agent' | 'applicant';
  text: string;
}

const AGENT_LABELS = /^\s*(agent|assistant|ai|bot|colaberry)\s*[:\-]/i;
const APPLICANT_LABELS = /^\s*(user|customer|caller|applicant|human|lead)\s*[:\-]/i;

/**
 * Split a transcript into speaker turns.
 *
 * Exported for tests: transcript shapes vary by provider and this is the part most
 * likely to need adjusting against a real payload.
 */
export function parseTurns(transcript: string): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const rawLine of (transcript || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    let speaker: Turn['speaker'] | null = null;
    let text = line;

    if (AGENT_LABELS.test(line)) {
      speaker = 'agent';
      text = line.replace(AGENT_LABELS, '').trim();
    } else if (APPLICANT_LABELS.test(line)) {
      speaker = 'applicant';
      text = line.replace(APPLICANT_LABELS, '').trim();
    }

    if (speaker) {
      if (current) turns.push(current);
      current = { speaker, text };
    } else if (current) {
      // Continuation of the same turn.
      current.text = `${current.text} ${text}`.trim();
    }
  }
  if (current) turns.push(current);
  return turns;
}

/** Words distinctive enough to locate a question in an agent turn. */
function questionFingerprint(q: InterviewQuestion): string[] {
  const stop = new Set([
    'the', 'and', 'you', 'your', 'that', 'this', 'with', 'have', 'has', 'are', 'for',
    'what', 'when', 'how', 'why', 'would', 'could', 'can', 'do', 'does', 'did', 'to',
    'of', 'in', 'on', 'at', 'is', 'it', 'a', 'an', 'be', 'me', 'we', 'they', 'them',
    'about', 'if', 'so', 'or', 'not', 'no', 'yes', 'one', 'first', 'last',
  ]);
  return q.prompt_voice
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w))
    .slice(0, 8);
}

/** Does this agent turn look like it asked `q`? */
function turnAsks(turn: Turn, fingerprint: string[]): boolean {
  if (turn.speaker !== 'agent' || fingerprint.length === 0) return false;
  const text = turn.text.toLowerCase();
  const hits = fingerprint.filter((w) => text.includes(w)).length;
  // Two thirds of the distinctive words, minimum two. Loose enough to survive the
  // agent rephrasing, tight enough not to match a different question.
  const needed = Math.max(2, Math.ceil(fingerprint.length * 0.66));
  return hits >= needed;
}

const YES = /\b(yes|yeah|yep|sure|absolutely|of course|correct|definitely|i do|i can|i will|i am|understood|that'?s right)\b/i;
const NO = /\b(no|nope|not really|i can'?t|i cannot|i won'?t|i don'?t|negative|unfortunately not)\b/i;

const EMPLOYMENT_CHOICES: Array<{ value: string; re: RegExp }> = [
  { value: 'full_time', re: /\bfull[\s-]?time\b/i },
  { value: 'part_time', re: /\bpart[\s-]?time\b/i },
  { value: 'contract', re: /\b(contract|contracting|freelance|consult)/i },
  { value: 'not_employed', re: /\b(not employed|unemployed|between jobs|not working|no job|looking)\b/i },
];

/**
 * Interpret one applicant turn for one question.
 *
 * Returns null when the answer cannot be read confidently — a yes/no where the
 * person said neither, a choice that matched nothing. Null means "ask again",
 * which is always safe.
 */
function interpret(q: InterviewQuestion, said: string): AnswerInput | null {
  const text = said.trim();
  if (!text) return null;

  if (q.answer_type === 'yes_no') {
    // Order matters: "no, I don't" contains neither a bare yes nor ambiguity, but
    // "yes, but no" is genuinely ambiguous and must not be guessed. Require
    // exactly one of the two to match.
    const yes = YES.test(text);
    const no = NO.test(text);
    if (yes === no) return null;
    return { question_key: q.question_key, answer_text: text, answer_value: yes, state: 'needs_followup' };
  }

  if (q.answer_type === 'choice') {
    // Full-time is checked first because "not employed full time" must not read as
    // full_time; the not_employed pattern is tried before the bare full-time one.
    const notEmployed = EMPLOYMENT_CHOICES.find((c) => c.value === 'not_employed')!;
    if (notEmployed.re.test(text)) {
      return { question_key: q.question_key, answer_text: text, answer_value: 'not_employed', state: 'needs_followup' };
    }
    const match = EMPLOYMENT_CHOICES.find((c) => c.value !== 'not_employed' && c.re.test(text));
    if (!match) return null;
    return { question_key: q.question_key, answer_text: text, answer_value: match.value, state: 'needs_followup' };
  }

  // Free text. A one-word grunt is not an answer to "describe something you built".
  if (text.replace(/[^a-z0-9]/gi, '').length < 3) return null;
  return { question_key: q.question_key, answer_text: text, state: 'needs_followup' };
}

export interface ExtractionResult {
  answers: AnswerInput[];
  /** Questions the transcript did not clearly cover. These get asked again. */
  unmatched: string[];
}

/**
 * Extract answers from a transcript.
 *
 * Pure — no database, no clock, no model call — so the whole behaviour is testable
 * against a fixture, which matters because this is the component most likely to
 * misattribute an answer.
 *
 * `askedOnly` restricts extraction to the questions this call was actually given,
 * so a resumed call cannot overwrite an answer the form already collected.
 */
export function extractAnswersFromTranscript(params: {
  transcript: string;
  askedOnly?: readonly string[];
}): ExtractionResult {
  const turns = parseTurns(params.transcript);
  const allowed = params.askedOnly ? new Set(params.askedOnly) : null;
  const questions = activeQuestions().filter((q) => !allowed || allowed.has(q.question_key));

  const answers: AnswerInput[] = [];
  const unmatched: string[] = [];

  for (const q of questions) {
    const fingerprint = questionFingerprint(q);
    let found: AnswerInput | null = null;

    for (let i = 0; i < turns.length; i++) {
      if (!turnAsks(turns[i], fingerprint)) continue;

      // Take the applicant's next turn. Skip further agent turns (a follow-up),
      // and stop at the first applicant reply — that is their answer.
      for (let j = i + 1; j < turns.length; j++) {
        if (turns[j].speaker === 'applicant') {
          const candidate = interpret(q, turns[j].text);
          if (candidate && isValidAnswer(q, candidate)) found = candidate;
          break;
        }
      }
      if (found) break;
    }

    if (found) answers.push(found);
    else unmatched.push(q.question_key);
  }

  return { answers, unmatched };
}
