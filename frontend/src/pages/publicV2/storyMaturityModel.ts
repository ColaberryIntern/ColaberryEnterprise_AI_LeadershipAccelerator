import type { PublicCaseStudyDetail } from '../../services/caseStudyPublicTypes';

/**
 * storyMaturityModel - what the page may say about how far a record's
 * evidence goes, derived from facts the wire already carries.
 *
 * WHY IT EXISTS. The first record published under this format was reviewed
 * as "a shipped capability presented as though it were a measured result". Its
 * masthead said Verified, Shipped and Enterprise work, and only a careful
 * reader reached the measurement band's admission that no operational outcome
 * had been measured. Both statements were true; the page let the first stand
 * in for the second. The fix is a label at the top that names which of the two
 * the record is, so a reader who never scrolls still leaves with the right
 * understanding.
 *
 * WHY IT IS DERIVED AND NOT A FIELD. A record with no headline figure has, by
 * this system's own rules, no verified outcome to lead with: the headline slot
 * is where a measured result goes, and `heroMetrics` is empty exactly when
 * there is none. Combined with a verified `shipped` status that is the whole
 * definition of a capability demonstration, and it is true of every record in
 * that state, not only the one that was reviewed. A field would have to be set
 * by hand on each record and could disagree with the figures on the page; this
 * cannot.
 *
 * WHEN IT SAYS NOTHING. A record that leads with a measured figure needs no
 * label, because the figure is the label. A record that is not verified as
 * shipped is not a capability demonstration either, and this stays silent
 * rather than promote it to one.
 */
export interface StoryMaturity {
  /** The short form for a facts grid: "Capability demonstration". */
  readonly label: string;
  /** The one-sentence form for the slot a headline figure would occupy. */
  readonly statement: string;
}

export const CAPABILITY_DEMONSTRATION: StoryMaturity = Object.freeze({
  label: 'Capability demonstration',
  statement: 'Software status: shipped. Operational result: not yet measured. '
    + 'The figures on this record size what was built; none of them is an outcome.',
});

export function evidenceMaturity(detail: PublicCaseStudyDetail): StoryMaturity | null {
  if (detail.heroMetrics.length > 0) return null;
  if (detail.productionStatus !== 'shipped') return null;
  return CAPABILITY_DEMONSTRATION;
}

export default evidenceMaturity;
