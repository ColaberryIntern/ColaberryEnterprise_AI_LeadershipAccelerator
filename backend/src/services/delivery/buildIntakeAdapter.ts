/**
 * buildIntakeAdapter — a Flotation understanding, phrased as a portal intake.
 *
 * ## Why this exists
 *
 *     "Do we want to go through that process of building out the project requirements
 *      just as someone creating a new project on the platform?"  (Ali, 2026-09-04)
 *
 * Two intakes had been built and neither one's output was the other's input. The Flotation
 * interview produces a `ProjectUnderstanding` - twenty dimensions, each item classified and
 * carrying provenance. The portal produces a `build_intake` - an idea plus the answers to an
 * adaptive interview - and runs it through the Student Build Pipeline: decompose, gate,
 * repair, publish, tasks, repo docs, Command Center.
 *
 * The bridge that existed (`requirementsHandoff`) targeted the OLDER RequirementsMap
 * pipeline, which no route reaches any more. This one targets what `/portal/projects`
 * actually runs: it turns the understanding into exactly the `{ idea, answers[] }` a
 * customer would have typed into the wizard, so the same pipeline produces the same plan.
 *
 * ## Provenance survives the crossing, in words
 *
 * The SBP brief has no provenance field, and its decomposer reads prose. So an item's
 * standing travels IN THE ANSWER TEXT: something the customer said is written as their
 * answer; something we inferred is prefixed so the decomposer weighs it as a guess; an open
 * question is handed over as a question. §16 forbids merging assumptions into facts, and a
 * boundary that carried the value but dropped the label would do exactly that.
 *
 * ## Pure
 *
 * No I/O. Given the same understanding it renders the same intake, so what a prospect's
 * project was built from can be reproduced from the stored record rather than guessed at.
 */

import {
  UNDERSTANDING_DIMENSIONS,
  DIMENSION_LABELS,
  itemsFor,
  type ProjectUnderstanding,
  type UnderstandingItem,
  type UnderstandingDimension,
} from './projectUnderstanding';

/** The wizard's own bounds (`sbpRoutes.startSchema`), mirrored so they can be asserted on. */
export const IDEA_MIN = 20;
export const IDEA_MAX = 20_000;
export const ANSWER_MAX = 4_000;
export const ANSWERS_MAX = 20;
export const QUESTION_MAX = 500;
export const NAME_MAX = 200;

/** The wizard hard-codes this tier; a converted enquiry should get the same depth. */
export const DEFAULT_SIZE = 'project';
/** The wizard's middle option. Nothing in a sales conversation says otherwise. */
export const DEFAULT_TARGET_WEEKS = 8;

/**
 * Dimensions that ARE the idea rather than answers about it. They become the opening
 * paragraph, in the order a person would say them.
 */
const IDEA_DIMENSIONS: readonly UnderstandingDimension[] = ['problem', 'desired_outcome', 'pain_points'];

/**
 * Dimensions the decomposer should not treat as requirements at all. `assumptions` and
 * `unknowns` are definitionally not facts (see NEVER_FACT_DIMENSIONS); `delivery_profile`
 * is our own read of the engagement shape, not the customer's project.
 */
const NOT_ANSWERS: readonly UnderstandingDimension[] = ['assumptions', 'delivery_profile'];

export interface BuildIntakeAnswer {
  id: string;
  question: string;
  answer: string;
}

export interface BuildIntake {
  idea: string;
  name: string;
  size: string;
  targetWeeks: number;
  answers: BuildIntakeAnswer[];
  /** Items that could not be carried, and why. Never silent. */
  dropped: Array<{ dimension: string; value: string; reason: string }>;
}

/**
 * How an item reads once it has crossed. The label is the provenance, kept in words.
 */
export function phraseForBrief(item: UnderstandingItem): string {
  const value = item.value.trim();
  if (item.classification === 'QUESTION') return `Open question, not yet answered: ${value}`;
  if (item.provenance === 'ai_inferred' || item.classification === 'ASSUMPTION') {
    return `(Our inference, not confirmed by the customer) ${value}`;
  }
  if (item.classification === 'RECOMMENDATION') return `(Our recommendation) ${value}`;
  if (item.classification === 'DECISION') return `Decided: ${value}`;
  return value;
}

const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/**
 * Render the intake.
 *
 * Idea = the problem, outcome and pain in the customer's words. Answers = one per dimension
 * that has content, phrased as the adaptive interview would have recorded it. The question
 * text is the dimension's label as a question, so the decomposer reads an exchange rather
 * than a bare value whose meaning lived in a key it never sees - the same reason
 * `buildBriefText` carries questions with answers.
 */
export function toBuildIntake(u: ProjectUnderstanding): BuildIntake {
  const dropped: BuildIntake['dropped'] = [];

  const ideaParts = IDEA_DIMENSIONS.flatMap((d) => itemsFor(u, d).map(phraseForBrief));
  let idea = ideaParts.join(' ').trim();
  if (idea.length < IDEA_MIN) {
    // A title alone is not an idea, but it is better than a refused intake. The wizard's
    // floor is 20 characters and a short title can sit under it, so the fallback says
    // where the substance actually is rather than padding with nothing.
    idea = `${u.title}. ${idea || 'Described in conversation; the detail is in the answers below.'}`.trim();
  }
  idea = clip(idea, IDEA_MAX);

  const answers: BuildIntakeAnswer[] = [];
  for (const dimension of UNDERSTANDING_DIMENSIONS) {
    if (IDEA_DIMENSIONS.includes(dimension) || NOT_ANSWERS.includes(dimension)) continue;

    const items = itemsFor(u, dimension);
    if (!items.length) continue;

    if (answers.length >= ANSWERS_MAX) {
      items.forEach((it) => dropped.push({ dimension, value: it.value, reason: `more than ${ANSWERS_MAX} answers` }));
      continue;
    }

    const answer = items.map(phraseForBrief).join('\n');
    if (answer.length > ANSWER_MAX) {
      dropped.push({ dimension, value: `(${items.length} items)`, reason: `answer over ${ANSWER_MAX} chars; clipped` });
    }

    answers.push({
      id: dimension,
      question: clip(`${DIMENSION_LABELS[dimension]}?`, QUESTION_MAX),
      answer: clip(answer, ANSWER_MAX),
    });
  }

  return {
    idea,
    name: clip(u.title, NAME_MAX),
    size: DEFAULT_SIZE,
    targetWeeks: DEFAULT_TARGET_WEEKS,
    answers,
    dropped,
  };
}
