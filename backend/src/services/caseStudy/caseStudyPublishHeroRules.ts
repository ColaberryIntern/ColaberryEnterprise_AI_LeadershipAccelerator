import type { Blockers, MetricAt } from './caseStudyPublishRules';
import type { CaseStudyMetricEntry } from '../../types/caseStudy';

/**
 * caseStudyPublishHeroRules - what may stand in the hero row of a case study.
 * PURE.
 *
 * ## The card row that made the library worse
 *
 * Measured 2026-09-12 across the three live records: all fourteen published
 * figures were inventory counts of our own artifacts. Six phases. Eight
 * agents. Forty-five endpoints. Sixteen migrations. Fourteen decision
 * records. A reader outside the team cannot tell whether eight agents is a
 * lot, because nothing says what it is eight OF, or what it was before.
 *
 * Three of them were worse than uninformative. "20 tests, over 1 of 142
 * files" is 0.7% coverage. "46 of 292 files" is 16%. "78 commits over 21
 * weeks" is under four a week. Each was published in the position a reader
 * reads as "here is the result", and each tells a technical reader to stop
 * trusting the page.
 *
 * ## Why the skill alone could not stop it
 *
 * `build-case-study` §5a has said "at least one metric must COMPARE, not just
 * COUNT" for months. Nothing enforced it. The readiness rubric scores it and
 * readiness authorises nothing, so the score went up and the card row stayed
 * wrong. A rule that lives only in prose is a rule that holds until someone
 * is in a hurry.
 *
 * ## What this refuses, and what it deliberately does not
 *
 * A HEADLINE figure must carry a comparison: a denominator, a curve, two
 * endpoints, or a stated baseline. A bare count is refused from the hero and
 * remains perfectly publishable in the measurement section, where "we built
 * eight agents" is an honest thing to say.
 *
 * It does NOT try to judge whether a number is flattering. A machine cannot
 * tell pride from embarrassment, and one that tried would be wrong in both
 * directions. Instead, a comparative headline must carry its three plain
 * answers, including "what it doesn't tell you". An author who has to write
 * that line about one file in a hundred and forty-two tends to notice.
 */

/** Shapes that carry a comparison in their own structure. */
const COMPARATIVE_SHAPES = ['ratio', 'share', 'series'] as const;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const filled = (v: unknown): boolean => text(v).length > 0;

/** A `span` compares only when it actually has two ends to compare. */
function spanHasBothEnds(metric: CaseStudyMetricEntry): boolean {
  const p = metric.payload as Record<string, unknown> | undefined;
  if (!p || p.shape !== 'span') return false;
  return p.from !== undefined && p.to !== undefined;
}

/**
 * Does this figure compare anything?
 *
 * Shape first, because a shaped metric states it structurally. A stated
 * baseline counts for a legacy metric that predates shapes: an author who
 * wrote down what it was before has done the work, whatever the payload says.
 */
export function isComparative(metric: CaseStudyMetricEntry): boolean {
  const shape = text(metric.shape);
  if ((COMPARATIVE_SHAPES as readonly string[]).includes(shape)) return true;
  if (spanHasBothEnds(metric)) return true;
  return filled(metric.measurement?.baseline);
}

/** Every plain-language answer a reader is owed, present and non-empty. */
export function hasPlainAnswers(metric: CaseStudyMetricEntry): boolean {
  const p = metric.plain;
  return Boolean(p) && filled(p!.counts) && filled(p!.from) && filled(p!.cannotShow);
}

const isHero = (at: MetricAt): boolean => at.path.startsWith('heroMetrics[') || at.metric?.isHeadline === true;

export function ruleHeroMetrics(metrics: readonly MetricAt[], b: Blockers): void {
  for (const at of metrics) {
    if (!isHero(at)) continue;
    // `publishable` defaults false in the DDL, so a figure nobody promoted is
    // not on the page and none of this applies to it.
    if (at.metric?.publishable !== true) continue;

    const label = text(at.metric.label) || at.path;

    if (!isComparative(at.metric)) {
      b.add(
        'headline_metric_is_a_bare_count',
        `${at.path}.shape`,
        `"${label}" reads "${text(at.metric.valueDisplay)}", which counts our own work and compares it to nothing: a reader cannot tell whether that is good`,
        'give it a denominator, a before and after, or a stated baseline; or move it out of the hero into the measurement section, where a count is an honest thing to say',
      );
      continue;
    }

    if (!hasPlainAnswers(at.metric)) {
      b.add(
        'headline_metric_missing_plain_answers',
        `${at.path}.plain`,
        `"${label}" stands in the hero without saying what it counts, where it came from, and what it does not tell you`,
        'write all three plain answers; the third one is the test, because a figure that cannot survive its own "what this does not tell you" does not belong in the hero',
      );
    }
  }
}
