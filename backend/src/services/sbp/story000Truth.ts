import { remainingAngles } from './projectDiscoveryCall';
import { DIMENSION_HEADING, groupOf } from './intakeReview';
import { ANGLE_TO_DIMENSION } from './intakeTruth';
import type { UnderstandingItem } from '../delivery/projectUnderstanding';

/**
 * story000Truth — what Story 000 says about the project it opens onto. PURE.
 *
 * ## The half that usually gets dropped
 *
 * A Story 000 that lists only what the platform knows reads as complete. The
 * student opens it, sees six confident headings, and has no way to tell that
 * nobody ever answered where the data lives. Then a story three weeks later
 * runs into it, and the gap looks like a surprise rather than something that
 * was visible on day one.
 *
 * So this renders BOTH halves, and the unknown half is not a footnote. The
 * brief asks Story 000 to project "missing decisions and contradictions"
 * alongside the rest, and the honest reading of that is that a student should
 * be able to see the shape of their own ignorance before they start building.
 *
 * ## Nothing here invents a value
 *
 * Every line is either a statement the student made, quoted, or the name of a
 * question nobody answered. There is no "TBD", no placeholder, and no inferred
 * default dressed as a fact: an unanswered question is rendered as a question.
 *
 * ## Why it is a separate module
 *
 * `commandCenterStory.ts` is already past the file ceiling in `CLAUDE.md`, and
 * the rule there is that the next change to an oversize file splits before
 * adding. This is that split.
 */

export interface Story000TruthInput {
  readonly items: readonly UnderstandingItem[];
  /** The revision this projection was built from, when one is known. */
  readonly revision?: number | null;
}

/**
 * What a still-unanswered angle costs, said plainly rather than as a label.
 * Exported so the pre-build preview says the same words Story 000 will.
 */
export const UNANSWERED_COST: Readonly<Record<string, string>> = {
  'THE GUARDRAIL': 'nobody has said what a person should check before this acts',
  'THE TOOLS': 'the systems it must read from and write to are not settled',
  'WHEN IT IS NOT SURE': 'what it does when it is uncertain is undecided',
  'THE MEASURE': 'there is no baseline, so nothing can be measured against it later',
  'EARNING AUTONOMY': 'what it would take to let this run on its own is unstated',
  'THE JUDGEMENT': 'the call being handed over has not been described',
  'THE OPERATOR': 'who actually uses this is unrecorded',
  'TRIGGER AND RHYTHM': 'what starts it, and how often, is unknown',
  'THE STANDOUT AND THE CUT': 'no one has said what would make this impressive',
  'THE JOB': 'the one-sentence purpose is not written down',
};

const QUOTE_MAX = 240;
const trim = (s: string): string => (s.length <= QUOTE_MAX ? s : `${s.slice(0, QUOTE_MAX - 3)}...`);

/**
 * The markdown section. Returns [] when there is no truth at all, so a project
 * that never ran an intake gets no empty heading promising something absent.
 */
export function story000TruthSection(input: Story000TruthInput): string[] {
  const items = input.items.filter((i) => typeof i.value === 'string' && i.value.trim());
  if (items.length === 0) return [];

  const confirmed = items.filter((i) => groupOf(i) === 'confirmed');
  const unconfirmed = items.filter((i) => groupOf(i) === 'needsConfirmation');
  const fromBuild = items.filter((i) => groupOf(i) === 'fromBuild');
  const questions = items.filter((i) => groupOf(i) === 'openQuestions');
  const inferred = items.filter((i) => groupOf(i) === 'inferences');
  const missing = remainingAngles(items);

  const lines: string[] = [
    '## What the platform understands about this project',
    '',
    input.revision
      ? `Built from revision ${input.revision} of what you confirmed. If you correct`
      : 'Built from what you told us at intake. If you correct',
    'something later, this section is regenerated and the plan records the newer revision.',
    '',
  ];

  const say = (heading: string, group: readonly UnderstandingItem[]): void => {
    if (group.length === 0) return;
    lines.push(`### ${heading}`, '');
    for (const item of group) {
      const label = DIMENSION_HEADING[item.dimension] ?? item.dimension;
      lines.push(`- **${label}.** ${trim(item.value.trim())}`);
    }
    lines.push('');
  };

  say('Confirmed by you', confirmed);
  say('From what you told us, not yet confirmed', unconfirmed);
  say('Found in your build, not yet confirmed by you', fromBuild);

  if (questions.length > 0) {
    lines.push(
      '### Questions a story raised',
      '',
      'A story found something that disagrees with what you confirmed. Neither value was',
      'replaced; settle each one on the review screen.',
      '',
    );
    for (const item of questions) {
      const label = DIMENSION_HEADING[item.dimension] ?? item.dimension;
      lines.push(`- **${label}.** ${trim(item.value.trim())}`);
    }
    lines.push('');
  }

  if (inferred.length > 0) {
    lines.push(
      '### Worked out by the system, not stated by you',
      '',
      'Treat these as guesses. Correcting one is faster than living with it.',
      '',
    );
    for (const item of inferred) {
      const label = DIMENSION_HEADING[item.dimension] ?? item.dimension;
      lines.push(`- **${label}.** ${trim(item.value.trim())}`);
    }
    lines.push('');
  }

  // The half that usually gets dropped.
  if (missing.length > 0) {
    lines.push(
      '### Still unanswered',
      '',
      'None of these blocks the build, and none of them is a mistake. They are listed',
      'because a gap you can see on day one is cheaper than the same gap found by a',
      'story in week six.',
      '',
    );
    for (const angle of missing) {
      const cost = UNANSWERED_COST[angle];
      if (cost) lines.push(`- ${cost}`);
    }
    lines.push(
      '',
      'Forward repair, not backfill: if the plan or the repository already answers one of',
      'these, record it in `.colaberry/enrichment/STORY-000.json` with the file or commit that',
      'shows it, and the platform files it against the right question on your next push. Do',
      'not invent an answer; an honest gap is worth more than a plausible one.',
    );
    lines.push('');
  } else {
    lines.push('Nothing is outstanding: every question the plan needed has an answer.', '');
  }

  return lines;
}

/** Counts for the Command Center, so a surface can show them without re-deriving. */
export function story000TruthCounts(items: readonly UnderstandingItem[]): {
  confirmed: number; unconfirmed: number; inferred: number; unanswered: number;
} {
  const live = items.filter((i) => typeof i.value === 'string' && i.value.trim());
  return {
    confirmed: live.filter((i) => groupOf(i) === 'confirmed').length,
    unconfirmed: live.filter((i) => groupOf(i) === 'needsConfirmation').length,
    inferred: live.filter((i) => groupOf(i) === 'inferences').length,
    // Derived from the same mapping every other channel uses, so the number a
    // student sees here is the number the interview would ask about.
    unanswered: remainingAngles(live).filter((a) => a in ANGLE_TO_DIMENSION).length,
  };
}
