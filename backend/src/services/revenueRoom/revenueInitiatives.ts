/**
 * R1 — the Revenue Room's initiative registry, and for each one the reason it reports
 * what it reports.
 *
 * WHY THIS IS A SEPARATE MODULE, as with `commercializationTiles.ts`: the hard part of
 * this page is not fetching counts, it is refusing to let a flagged row read as a live
 * deal. The provenance is the deliverable, so it lives where it can be reviewed and
 * tested without a database.
 *
 * WHAT THE ROOM IS FOR. Ram should be able to open one page, see every source of revenue
 * Colaberry has or is chasing, and understand which parts are real without asking Ali.
 * That only works if a speculative initiative is visibly speculative. So this reuses the
 * five-state vocabulary the commercialization board already established rather than
 * inventing a second one — a reader who has learned one board has learned this one.
 *
 * WHAT IT DELIBERATELY DOES NOT CONTAIN: AN INITIATIVE NOBODY CAN POINT AT.
 * It would be easy to list "self-paced", "corporate training" and "certification" as
 * revenue sources because they are things Colaberry does. None of them has a source that
 * separates its revenue from anything else, so a card for one would be a heading with a
 * dash under it, and five such cards would make the page look emptier than the business
 * is. Every initiative here resolves to a table.
 *
 * THE GOVERNMENT PIPELINE IS A PROXY, AND THAT IS A MEASURED CONCLUSION, not caution.
 * Measured read-only against production on 2026-11-03: twelve rows sit at
 * `decision = approved_bid_pursuit` AND `status = active`. They are not twelve live
 * proposals. One is named "Snow College Adult Learner - T8 test". One RFP appears twice
 * under two different project ids. Three have no `delivery_project_id` at all. Only three
 * projects hold any proposal document, and `gov_submission` is empty, so nothing has ever
 * been submitted. Ali named two proposals as live; the one holding the most documents is
 * not one of the two he named.
 *
 * There is no column anywhere that records "a human confirmed this bid is live", so the
 * distinction cannot be computed. Until R2 step 2 adds one, this card reports the flagged
 * count as a PROXY and says what the count includes. Reporting it as pipeline would put a
 * test row in front of Ram as revenue.
 */
import { TileStatus } from '../commercialization/commercializationTiles';
import { REVENUE_HYPOTHESES } from '../commercialization/hypothesisRegister';

/** What kind of thing a card represents. Drives which fields are meaningful. */
export type InitiativeKind = 'hypothesis' | 'gov_pipeline' | 'membership';

export interface InitiativeDefinition {
  key: string;
  label: string;
  kind: InitiativeKind;
  /**
   * The status this initiative reports before any measurement. The service may DEGRADE
   * it (a missing table is not an empty one) or PROMOTE it (a table that has gained rows
   * should stop reporting a stale zero), exactly as the commercialization board does.
   */
  status: TileStatus;
  /** The table the card is answered from, or null when nothing of the right shape exists. */
  sourceTable: string | null;
  /** One sentence a reader can act on: why this card says what it says. */
  provenance: string;
  /**
   * Who decides this initiative's fate. C8.6 names Ali in as many words for the
   * hypotheses ("Which hypotheses to kill"), and the same person approves every ticket
   * on the C-ladder, so there is one honest answer here rather than an invented org
   * chart. No other name is asserted: this file does not know who works on what.
   */
  owner: string;
  /** What would have to be true for this card to become `live`. */
  unlockedBy?: string;
}

/**
 * The five revenue hypotheses become five cards, derived from the C0.1 register rather
 * than retyped, so the Room cannot drift from the board that already renders them.
 *
 * Each one is `unmeasurable` by default and NOT `measured_zero`. That is the deliberate
 * choice: a hypothesis is a bet about the future, and "zero pilots so far" is a fact
 * about the funnel, not a measurement of the bet. The service fills in the funnel
 * evidence underneath; the card's own status says whether the bet is still testable.
 */
const HYPOTHESIS_CARDS: readonly InitiativeDefinition[] = REVENUE_HYPOTHESES.map((h) => ({
  key: `hypothesis_${h.key}`,
  label: h.label,
  kind: 'hypothesis' as const,
  status: 'unmeasurable' as const,
  sourceTable: null,
  provenance:
    `A revenue bet from the C0.1 register. Stays alive only on evidence: ${h.evidenceRequired}. `
    + `Target is ${h.target.count} at the "${h.target.stage}" funnel stage by ${h.target.by}.`,
  owner: 'Ali',
  unlockedBy:
    'The funnel has to hold something that could still become the required evidence. '
    + 'Until then the bet is untested rather than failing.',
}));

/**
 * Measured against production on 2026-11-03. Every claim below was checked with a
 * read-only query; none is inferred from a table name.
 */
export const INITIATIVE_DEFINITIONS: readonly InitiativeDefinition[] = [
  {
    key: 'membership_subscriptions',
    label: 'Membership subscriptions',
    kind: 'membership',
    status: 'live',
    sourceTable: 'subscriptions',
    provenance:
      'Annualized from active subscriptions carrying a paysimple_payment_id, which is the '
      + 'marker the app-originated revenue rule names. Computed by the same function the '
      + 'commercialization board uses, so the two surfaces cannot disagree about revenue.',
    owner: 'Ali',
  },
  {
    key: 'gov_bid_pursuit',
    label: 'Government bids in pursuit',
    kind: 'gov_pipeline',
    status: 'proxy',
    sourceTable: 'gov_qualifications',
    provenance:
      'Rows at decision=approved_bid_pursuit and status=active. This is a FLAG, not a '
      + 'confirmed pipeline: on 2026-11-03 the twelve flagged rows included a row named '
      + '"Snow College Adult Learner - T8 test", one RFP duplicated under two project ids, '
      + 'and three rows with no delivery project. Nothing has ever been submitted.',
    owner: 'Ali',
    unlockedBy:
      'R2 step 2 — a recorded human confirmation of which bids are live, and a value for '
      + 'each. No column records that today, so it cannot be computed.',
  },
  ...HYPOTHESIS_CARDS,
];

/**
 * Acceptance criterion: a card never shows a number nobody measured.
 *
 * The two statuses that must never carry a value are the two that mean "I cannot answer
 * this": `unmeasurable` (nothing of the right shape exists) and `undefined_rate` (the
 * denominator is empty). A value beside either of them is the exact failure this whole
 * surface exists to prevent, so it is an assertion rather than a convention.
 */
export function assertNoCardShowsAnUnmeasuredValue(
  cards: readonly { key: string; status: TileStatus; value: string | null }[],
): void {
  for (const c of cards) {
    const silent = c.status === 'unmeasurable' || c.status === 'undefined_rate';
    if (silent && c.value !== null) {
      throw new Error(
        `initiative ${c.key} is ${c.status} but carries the value "${c.value}". `
        + 'A status that means "cannot answer" must not print a number.',
      );
    }
  }
}

/**
 * Every initiative must name a source table or explicitly admit it has none. A card with
 * neither is a heading, and a page of headings is what this replaces.
 */
export function assertEveryInitiativeNamesItsSource(): number {
  for (const d of INITIATIVE_DEFINITIONS) {
    if (d.sourceTable === undefined) {
      throw new Error(`initiative ${d.key} does not say whether it has a source table`);
    }
    if (d.sourceTable === null && d.status !== 'unmeasurable') {
      throw new Error(
        `initiative ${d.key} has no source table but claims status "${d.status}". `
        + 'Only "unmeasurable" is honest without a source.',
      );
    }
    if (!d.provenance || d.provenance.length < 40) {
      throw new Error(`initiative ${d.key} has no usable provenance sentence`);
    }
  }
  return INITIATIVE_DEFINITIONS.length;
}

/**
 * Anything not `live` must say what would make it live, or the Room becomes a list of
 * complaints. This is the same rule C8.2 applies to its unmeasurable tiles.
 */
export function assertUnfinishedInitiativesNameTheirUnlock(): void {
  for (const d of INITIATIVE_DEFINITIONS) {
    if (d.status !== 'live' && !d.unlockedBy) {
      throw new Error(
        `initiative ${d.key} is "${d.status}" and does not name what would unlock it`,
      );
    }
  }
}

/**
 * The government card must disclose that its count is a flag rather than a confirmation.
 *
 * This is asserted and not merely written because the failure is silent and expensive: a
 * reader who takes twelve flagged rows as twelve live proposals has been shown a test row
 * as revenue. If someone later promotes this card to `live`, this assertion fails and
 * forces them to deal with the confirmation column instead of the status field.
 */
export function assertGovPipelineIsNotPresentedAsConfirmed(): void {
  const gov = INITIATIVE_DEFINITIONS.find((d) => d.key === 'gov_bid_pursuit');
  if (!gov) throw new Error('the government pipeline initiative is missing');
  if (gov.status === 'live') {
    throw new Error(
      'gov_bid_pursuit is marked "live", but no column records which bids a human '
      + 'confirmed. Add that confirmation (R2 step 2) before calling this measured.',
    );
  }
  if (!/flag/i.test(gov.provenance)) {
    throw new Error(
      'gov_bid_pursuit provenance must say that the count is a flag rather than a '
      + 'confirmed pipeline, because the flagged set has included a test row.',
    );
  }
}
