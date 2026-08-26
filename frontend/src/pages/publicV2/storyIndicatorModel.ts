import type {
  CaseStudySectionKey,
  PublicCaseStudyDetail,
} from '../../services/caseStudyPublicTypes';

/**
 * storyIndicators - the countable facts about a record, so the page can be
 * scanned rather than only read.
 *
 * WHAT AN INDICATOR IS ALLOWED TO BE. A number this record actually carries,
 * counted from the wire, with a noun that says what was counted. Nothing here
 * derives a score, a percentage, a rating or a completeness bar: those are
 * judgements, and a judgement rendered at display size beside a real count
 * borrows the count's credibility. `verificationClass` already carries the one
 * judgement this page is entitled to make, and it has its own badge.
 *
 * ZERO IS NEVER SHOWN. An indicator whose count is zero is omitted entirely
 * rather than printed as "0", because "0 repositories" reads as a finding about
 * the project when it is really a fact about the record. Omitting it means a
 * thin record shows two indicators instead of eight and still looks deliberate,
 * and a record with nothing countable shows the rail not at all. That is the
 * whole template rule, expressed as a filter.
 *
 * PURE. Total functions of the record. `storyIndicators` needs the visible
 * section list too, because "how many sections does this record support" is a
 * fact about the page rather than about the wire, and the page has already
 * decided it.
 */

export interface StoryIndicator {
  /** Stable key, used for React identity and for test selectors. */
  readonly key: string;
  /** The count itself. Always >= 1: a zero indicator is never emitted. */
  readonly count: number;
  /** What was counted, already agreeing in number with `count`. */
  readonly label: string;
}

/** Singular below two, plural at two and above. No other rule is needed here. */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * The hero's indicator rail.
 *
 * Five at most, and each one answers a different question a reader scanning an
 * unfamiliar record actually asks: how much of a story is here, what was it
 * built out of, what can I look at, can I read the source, and what happened
 * after it shipped.
 */
export function storyIndicators(
  detail: PublicCaseStudyDetail,
  sections: readonly CaseStudySectionKey[],
): readonly StoryIndicator[] {
  // `hero` and `cta` are the page's own furniture, not sections of the record.
  const narrative = sections.filter((key) => key !== 'hero' && key !== 'cta').length;
  // `presentation` is the server's stamp. Counting `artifactType` instead would
  // be a second definition of "is this evidence", which is one too many.
  const evidence = detail.artifacts.filter((a) => a.presentation === 'evidence').length;

  const candidates: readonly StoryIndicator[] = [
    { key: 'sections', count: narrative, label: plural(narrative, 'section', 'sections') },
    {
      key: 'stack',
      count: detail.stack.length,
      label: plural(detail.stack.length, 'technology', 'technologies'),
    },
    { key: 'evidence', count: evidence, label: plural(evidence, 'evidence item', 'evidence items') },
    {
      key: 'repositories',
      count: detail.repositories.length,
      // Every repository that survived the projection is public and consented,
      // so "public" is a fact the wire guarantees rather than a hopeful label.
      label: plural(detail.repositories.length, 'public repository', 'public repositories'),
    },
    {
      key: 'roadmap',
      count: detail.roadmap.length,
      label: plural(detail.roadmap.length, 'next step', 'next steps'),
    },
  ];

  return candidates.filter((indicator) => indicator.count > 0);
}

/**
 * What each countable section's chip is counting, for the screen-reader string.
 *
 * A partial map on purpose: a section that is not in here has no count, and
 * adding a key without teaching `sectionCount` how to count it would produce a
 * noun with no number. Both halves are read together in `StorySectionCount`.
 */
export const SECTION_COUNT_NOUNS: Readonly<Record<string, string>> = Object.freeze({
  build: 'milestones',
  measurement: 'measured figures',
  roadmap: 'items',
  contributors: 'named contributors',
  artifacts: 'artifacts',
  repositories: 'linked repositories',
});

/**
 * The count that belongs beside one section's heading, or null.
 *
 * `null` rather than `0` for the same reason the rail drops zeroes, and `null`
 * for every section whose content is prose: "The situation (3)" would be
 * counting paragraphs, which is a fact about the writing and not about the work.
 */
export function sectionCount(
  detail: PublicCaseStudyDetail,
  key: CaseStudySectionKey,
): number | null {
  const count = ((): number => {
    switch (key) {
      case 'build':
        return detail.timeline.length;
      case 'measurement':
        return detail.measurement ? detail.measurement.metrics.length : 0;
      case 'roadmap':
        return detail.roadmap.length;
      case 'contributors':
        // The named people only. The anonymous count has its own sentence
        // underneath, and folding it in here would credit a number to a list
        // that visibly does not contain it.
        return detail.contributors.length;
      case 'artifacts':
        return detail.artifacts.length;
      case 'repositories':
        // Linked repositories. The withheld ones are disclosed by their own
        // note; counting them here would promise links that do not exist.
        return detail.repositories.length;
      default:
        return 0;
    }
  })();
  return count > 0 ? count : null;
}
