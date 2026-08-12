/**
 * sharpeningQuestions — the ten questions that turn an idea into a brief.
 *
 * PURE. No I/O, no model call. The tailoring step lives in `tailorQuestions.ts`;
 * this file owns the spine and the assembly, so both are unit-testable without
 * a network.
 *
 * WHY TEN FIXED SLOTS, TAILORED — RATHER THAN TEN GENERATED QUESTIONS:
 * The advisor's existing 10-question set (`execution/advisory/question_engine.py`)
 * is the precedent, but it asks org-level lead-gen questions — "how large is
 * your organization", "what is your budget for AI". Those size a consulting
 * engagement. They do not sharpen one student's one project, which is what the
 * decomposer consumes.
 *
 * The opposite extreme — asking a model to invent ten questions per idea — makes
 * the brief's SHAPE non-deterministic. The decomposer, the gate, and the
 * Architect all depend on certain facts being present; if question 6 is about
 * data sources for one student and about branding for another, the plans are
 * not comparable and the gate rules fire unevenly. CLAUDE.md's default
 * resolution strategy is explicit: prefer deterministic.
 *
 * So: a FIXED spine of ten dimensions, each one traceable to a requirement kind
 * and to a gate rule, with only the wording and examples adapted to the idea. A
 * dental clinic and a warehouse get the same ten questions, asked in their own
 * language.
 *
 * EVERY SLOT EARNS ITS PLACE FROM A MEASURED DEFECT. The pilot and the first
 * three live runs produced specific failures; each is named on the slot that
 * prevents it. A question that prevents nothing does not belong here — four
 * fields (users / data_sources / done_definition / target_weeks) is what we had,
 * and the gaps below are what that let through.
 */

/** The requirement kinds the decomposer emits. A slot declares what it feeds. */
export type FeedsKind = 'FUNC' | 'SAFE' | 'OBS' | 'NFR' | 'CONSTRAINT' | 'SCOPE';

export interface QuestionSlot {
  /** Stable id. Persisted with the answer, so re-tailoring never orphans data. */
  id: string;
  index: number;
  /** Short label for the wizard's progress rail. */
  label: string;
  /** The default question text, used verbatim when tailoring is unavailable. */
  text: string;
  /** One line under the field. */
  help: string;
  /** Generic examples; tailoring replaces these with idea-specific ones. */
  examples: string[];
  /** What this answer becomes downstream. */
  feeds: FeedsKind;
  /** The gate rule or measured defect this slot exists to prevent. */
  guards: string;
  /** A blank answer is tolerated for optional slots; required ones block submit. */
  required: boolean;
}

export const SHARPENING_QUESTIONS: readonly QuestionSlot[] = [
  {
    id: 'q1_job',
    index: 0,
    label: 'The job',
    text: 'In one sentence, what does this system do, and for whom?',
    help: 'The single job it exists to do. Not the features — the outcome.',
    examples: [
      'It tells a dental front desk which patients will miss tomorrow, in time to refill the slot.',
      'It decides what happens to each returned item before it reaches a shelf.',
    ],
    feeds: 'FUNC',
    guards: 'The descriptor and project_name the whole plan is written against.',
    required: true,
  },
  {
    id: 'q2_operator',
    index: 1,
    label: 'Who operates it',
    text: 'Who sits in front of this, and what should they NOT need to know?',
    help: 'Their role, how technical they are, and what device they are on.',
    examples: [
      'Front desk staff at a 4-chair clinic. They should never see a model score, just a name and a reason.',
      'Warehouse receivers on a handheld scanner, high turnover, trained in ten minutes.',
    ],
    feeds: 'NFR',
    guards: 'Replaces the old `users` field. Grounds the "As a <role>" narrative on every story.',
    required: true,
  },
  {
    id: 'q3_trigger',
    index: 2,
    label: 'What starts it',
    text: 'What kicks this off — a person, an event, or a clock? How often?',
    help: 'A schedule, an inbound webhook, a button someone presses, or a file landing.',
    examples: [
      'A nightly 6pm job over tomorrow\'s schedule, plus an 8am cutoff check.',
      'Every time a return is scanned at the dock — roughly 300 a day, 900 after Christmas.',
    ],
    feeds: 'FUNC',
    guards: 'r0 needs a runnable entry point. Without this the walking skeleton has nothing to walk.',
    required: true,
  },
  {
    id: 'q4_systems',
    index: 3,
    label: 'Systems it touches',
    text: 'What must it read from or write to that already exists?',
    help: 'Name the real systems. If you do not know the integration method, say so.',
    examples: [
      'Reads the Dentrix appointment export. Sends SMS through Twilio. Writes nothing back to Dentrix.',
      'Shopify orders API for the order, our own Postgres for the SKU catalog.',
    ],
    feeds: 'CONSTRAINT',
    guards:
      'THE LAYER-STORY FIX. The pilot typed "connect to Postgres" and "use Mandrill" as FUNC/must ' +
      'requirements, so the coverage rule demanded a story for each and manufactured 3 layer stories ' +
      'out of 12. Answers here are typed CONSTRAINT, which is exempt from story coverage.',
    required: false,
  },
  {
    id: 'q5_decision',
    index: 4,
    label: 'The judgement call',
    text: 'What decision are you handing to the machine, and what does it decide from?',
    help: 'The one judgement that used to need a person. Name the inputs it gets to see.',
    examples: [
      'Which patients are likely to no-show, from their history, lead time, and weather.',
      'Restock, refurbish, or scrap — from the photo, the SKU, and the stated reason.',
    ],
    feeds: 'FUNC',
    guards: 'Separates the automated judgement from the plumbing around it, so r1+ stories are slices.',
    required: true,
  },
  {
    id: 'q6_never',
    index: 5,
    label: 'The guardrail',
    text: 'What must NEVER happen without a human saying yes first?',
    help: 'The thing that would be genuinely bad. This becomes a hard constraint, not a preference.',
    examples: [
      'No appointment is ever cancelled automatically.',
      'Nothing over $200 is scrapped without a reviewer.',
      'No grant application is ever submitted by the system.',
    ],
    feeds: 'SAFE',
    guards:
      'Feeds the r0 trust spine. The pilot\'s r0 demo was "enroll a member and take a payment" — a happy ' +
      'path proving no guarantee, which is exactly what r0_no_trust_spine now rejects.',
    required: true,
  },
  {
    id: 'q7_measure',
    index: 6,
    label: 'How you will know',
    text: 'What number tells you this worked? What is it today?',
    help: 'Something you could actually measure in a month. A count, a rate, or minutes saved.',
    examples: [
      'No-show rate drops from 18% to under 12%.',
      'Returns cleared same-day goes from 40% to 80%.',
    ],
    feeds: 'NFR',
    guards:
      'THE UNFALSIFIABLE FIX. "Should provide a user-friendly interface" is a requirement no test can ' +
      'fail; it failed a live build on 2026-08-10 and repair could not fix it because no story repairs ' +
      'a vague requirement. Forcing a number at intake stops it being written in the first place.',
    required: true,
  },
  {
    id: 'q8_volume',
    index: 7,
    label: 'How much',
    text: 'How many of these per day now, and at your worst week?',
    help: 'Rough is fine. Ten a day and ten thousand a day are different systems.',
    examples: [
      'About 40 appointments a day, 60 in January.',
      '300 returns a day, 900 the week after Christmas.',
    ],
    feeds: 'NFR',
    guards: 'Stops the plan over-engineering a ten-a-day tool or under-engineering a ten-thousand-a-day one.',
    required: false,
  },
  {
    id: 'q9_not_building',
    index: 8,
    label: 'Not in v1',
    text: 'What are you deliberately NOT building this time?',
    help: 'The tempting thing you are cutting. Naming it keeps it out of your releases.',
    examples: [
      'Not touching billing. Not building a patient-facing app.',
      'No multi-warehouse support, no returns analytics dashboard.',
    ],
    feeds: 'SCOPE',
    guards:
      'Becomes the non-goals chapter and keeps r0 honest. The pilot skewed 8 of 12 stories into r0 ' +
      'partly because nothing said where the line was.',
    required: false,
  },
  {
    id: 'q10_evidence',
    index: 9,
    label: 'What must be provable',
    text: 'After the fact, what must you be able to show, and to whom?',
    help: 'An audit trail, a reason for a decision, or a record someone will ask you for.',
    examples: [
      'Every released slot, who approved it, and when.',
      'For any scrapped item, the photo the decision was made from.',
    ],
    feeds: 'OBS',
    guards:
      'The other half of the trust spine. Turns "it works" into "it can be shown to have worked", ' +
      'which is what the Trust acceptance line on every story asserts.',
    required: false,
  },
] as const;

export const TOTAL_QUESTIONS = SHARPENING_QUESTIONS.length;

export type Answers = Record<string, string>;

export function questionById(id: string): QuestionSlot | undefined {
  return SHARPENING_QUESTIONS.find((q) => q.id === id);
}

/** Required slots with no meaningful answer. The wizard blocks submit on these. */
export function missingRequired(answers: Answers): QuestionSlot[] {
  return SHARPENING_QUESTIONS.filter((q) => q.required && !(answers[q.id] ?? '').trim());
}

/**
 * Assemble the brief the Architect and the decomposer both read.
 *
 * Section headings are deliberately blunt and stable — they are the only thing
 * telling the model that q4 is a constraint rather than a feature request, and
 * that q7 is the falsifiable success measure. Changing this wording changes
 * generated plans, so it is asserted in tests.
 */
export function buildBriefFromAnswers(idea: string, answers: Answers, targetWeeks?: number): string {
  const parts: string[] = [idea.trim()];
  const say = (heading: string, id: string) => {
    const v = (answers[id] ?? '').trim();
    if (v) parts.push(`${heading}\n${v}`);
  };

  say('THE JOB IT DOES:', 'q1_job');
  say('WHO OPERATES IT (and what they must not need to know):', 'q2_operator');
  say('WHAT TRIGGERS IT, AND HOW OFTEN:', 'q3_trigger');
  // Explicitly framed as constraints. This single line is what stops the
  // decomposer typing "connect to Dentrix" as a must-have FUNC requirement and
  // manufacturing a layer story to cover it.
  say(
    'EXISTING SYSTEMS IT MUST WORK WITH — these are IMPLEMENTATION CONSTRAINTS, '
    + 'not features. Type them as CONSTRAINT requirements and do NOT write a story whose only purpose '
    + 'is to connect to one:',
    'q4_systems',
  );
  say('THE JUDGEMENT BEING AUTOMATED, AND ITS INPUTS:', 'q5_decision');
  say('HARD GUARDRAIL — this must never happen without a human approving it:', 'q6_never');
  say('MEASURABLE DEFINITION OF DONE — every quality requirement must be at least this falsifiable:', 'q7_measure');
  say('VOLUME, NOW AND AT PEAK:', 'q8_volume');
  say('EXPLICITLY OUT OF SCOPE FOR THIS BUILD — do not write requirements or stories for these:', 'q9_not_building');
  say('WHAT MUST BE PROVABLE AFTERWARDS, AND TO WHOM:', 'q10_evidence');

  if (targetWeeks) {
    // Scheduling context only. The first live run turned "TIMELINE: 6 weeks" into
    // REQ-016 "must be deployed within 6 weeks" — a must-have no story can fulfil,
    // which the coverage rule then flagged as uncovered.
    parts.push(
      `SCHEDULE (context for release planning, NOT a requirement — do not emit a requirement about the `
      + `timeline): fit the releases into ${targetWeeks} weeks.`,
    );
  }

  return parts.join('\n\n');
}

/**
 * The answers that must survive into the plan whatever else is dropped: the
 * guardrail, the measurable definition of done, and what must be provable.
 * These are what become SAFE, NFR and OBS requirements and the r0 trust spine.
 */
const NON_NEGOTIABLE_SLOTS: ReadonlyArray<[string, string]> = [
  ['q6_never', 'MUST NEVER HAPPEN without a human approving it'],
  ['q7_measure', 'MEASURABLE DEFINITION OF DONE'],
  ['q10_evidence', 'MUST BE PROVABLE AFTERWARDS'],
];

/**
 * Re-state the owner's non-negotiables at the END of a generated document.
 *
 * MEASURED, NOT HYPOTHETICAL. A live Architect run on 2026-08-12 turned a
 * 1,995-character brief into a 183,396-character document — and the word
 * "approv" appeared in it **zero times**, even though the brief said, under a
 * heading reading HARD GUARDRAIL, *"No appointment is ever cancelled or released
 * without a human at the front desk approving it."* The expansion kept the
 * operator, Dentrix, Twilio and the waitlist, and lost the one sentence that
 * protects a patient.
 *
 * The decomposer already ranks the brief above the document and reads it first,
 * which is the primary defence. This is the cheap deterministic backstop for the
 * attention problem underneath: 24,000 words of detail against 300 words of
 * brief. Restating three sentences at the point the model finishes reading costs
 * nothing and cannot be argued with.
 *
 * Idempotent: a document that already carries a non-negotiable is not padded
 * with it again, so re-running never grows the text unboundedly.
 */
export function reinforceNonNegotiables(
  document: string,
  answers: Answers,
): { document: string; reinstated: string[] } {
  if (!document.trim()) return { document, reinstated: [] };

  const haystack = document.toLowerCase();
  const missing = NON_NEGOTIABLE_SLOTS
    .map(([id, heading]) => ({ id, heading, value: (answers[id] ?? '').trim() }))
    .filter((s) => s.value && !documentMentions(haystack, s.value));

  if (!missing.length) return { document, reinstated: [] };

  const block = [
    '',
    '---',
    '',
    '## Non-negotiables restated from the owner\'s brief',
    '',
    'These were stated by the person who asked for this system. Where anything above',
    'conflicts with them, these win.',
    '',
    ...missing.map((s) => `- **${s.heading}:** ${s.value}`),
    '',
  ].join('\n');

  return { document: `${document.trimEnd()}\n${block}`, reinstated: missing.map((s) => s.id) };
}

/** Words must co-occur this closely to count as discussing the same thing. */
const PROXIMITY_WINDOW = 600;
const REQUIRED_OVERLAP = 0.6;

/**
 * Is the substance of `value` already in the document?
 *
 * By distinctive-word overlap WITHIN A WINDOW, which is the only version of this
 * that survives a real document. Two earlier attempts failed, and both failures
 * are worth keeping written down:
 *
 *  1. Contiguous-phrase matching. Building a phrase from the long words produced
 *     "appointment ever cancelled without" — dropping "is" and "a" yields a
 *     sequence that appears in no English text, so it could never match.
 *  2. Whole-document overlap. Measured against the real 183,396-character
 *     Architect output, "appointment", "cancelled", "released", "human" and
 *     "front" all appear SOMEWHERE in a healthcare document — 6 of 7 distinctive
 *     words, 86% overlap — so the guardrail was judged present in a document
 *     containing the word "approv" exactly zero times. A small test fixture hid
 *     this completely; only the real artifact exposed it.
 *
 * Requiring the words to co-occur inside one window is what distinguishes "this
 * document discusses the owner's guardrail" from "this document is about
 * appointments and also mentions humans".
 */
function documentMentions(haystack: string, value: string): boolean {
  const distinctive = [...new Set(
    value.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length > 4),
  )];
  if (!distinctive.length) return false;          // nothing to match on: treat as absent, and restate

  const needed = Math.ceil(distinctive.length * REQUIRED_OVERLAP);

  // Anchor on the rarest term so we scan around plausible locations only. Using
  // the first occurrence of every term as a candidate centre keeps this linear
  // in the number of occurrences rather than the length of the document.
  for (let start = 0; start < haystack.length; start += PROXIMITY_WINDOW / 2) {
    const window = haystack.slice(start, start + PROXIMITY_WINDOW);
    if (!window) break;
    let hits = 0;
    for (const w of distinctive) {
      if (window.includes(w)) hits += 1;
      if (hits >= needed) return true;
    }
  }
  return false;
}

/**
 * How many of the ten were actually answered. Surfaced to the student, because a
 * 4-of-10 brief produces a visibly thinner plan and they should know that before
 * they spend fifteen minutes generating one.
 */
export function completeness(answers: Answers): { answered: number; total: number; percent: number } {
  const answered = SHARPENING_QUESTIONS.filter((q) => (answers[q.id] ?? '').trim()).length;
  return { answered, total: TOTAL_QUESTIONS, percent: Math.round((answered / TOTAL_QUESTIONS) * 100) };
}
