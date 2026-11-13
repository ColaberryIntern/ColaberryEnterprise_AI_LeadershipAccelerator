/**
 * R16 — the Revenue Flow board: one payload behind the dashboard Ram drills into.
 *
 * Ali's ask: "a dashboard at the top so we can see the big picture and all the pieces that
 * went into it. Like a tracking system."
 *
 * ── TWO STREAMS, BECAUSE TWO IS WHAT WAS ASKED FOR AND WHAT EXISTS ───────────────────────
 *
 * "We can work towards Membership, Annualized (should these be combined) and Gov bids in
 * pursuit." Membership and Annualized turned out to be the same computation printed twice
 * (see `membershipFlow`'s header), so they combine into one stream, leaving two.
 *
 * The five revenue hypotheses are deliberately NOT here. They already have cards on the
 * Revenue Room, they are bets rather than revenue, and adding them to a board whose headline
 * is money would invite them to be read as pipeline. Scope is the two streams named.
 *
 * ── THE HEADLINE HAS NO TOTAL, AND THAT IS THE DESIGN ────────────────────────────────────
 *
 * `FlowHeadline` has no field holding booked revenue plus possible winnings. Adding them
 * would be the most misleading thing this page could do: one is $72.8K that exists, the
 * other is contract value that might arrive, over terms that may run five years. They are
 * reported side by side, labelled, and never summed. The absence of that field is load
 * bearing, so it is asserted in the tests rather than left to taste.
 *
 * ── WHY A VALUE ON THE WRONG EVENT IS REJECTED RATHER THAN RENDERED ──────────────────────
 *
 * `revenueClassifications` declares, per classification, whether an event of that kind may
 * carry a number at all. `bid_flagged` may not, because `gov_qualifications` holds no value.
 * That promise is enforced here, at the boundary, in the shape CLAUDE.md asks for: loud in
 * development, logged-and-stripped in production. A number nobody measured is the one
 * failure this whole surface exists to prevent, and a page that 500s instead of showing Ram
 * the other nine streams is not the better outcome.
 */
import { classificationFor, assertClassificationKeysAreUnique } from './revenueClassifications';
import { buildGovFlow } from './govBidFlow';
import { buildMembershipFlow } from './membershipFlow';
import {
  FlowEvent, FlowHeadline, RevenueFlowBoard, money, noMoney,
} from './revenueFlowTypes';

/**
 * How far back the combined timeline reaches.
 *
 * 180 days covers every dated revenue event production actually holds: the oldest
 * subscription activity is 2026-07 and the oldest proposal document is 2026-10-26. The
 * window is returned in the payload so an empty tail reads as "outside the window" rather
 * than as "nothing happened".
 */
export const DEFAULT_WINDOW_DAYS = 180;

/**
 * Strip any value an event is not entitled to carry, and say so.
 *
 * Returns the cleaned events plus a caveat per violation. In development the first violation
 * throws instead, because a producer that attaches a number to `bid_flagged` is a bug that
 * should be fixed before it ships, not a line in a caveat list nobody reads.
 */
function enforceValueHonesty(
  events: FlowEvent[],
): { events: FlowEvent[]; caveats: string[] } {
  const caveats: string[] = [];
  const cleaned: FlowEvent[] = [];

  for (const e of events) {
    const def = classificationFor(e.classification);
    if (e.valueCents !== null && !def.carriesValue) {
      const message =
        `A "${def.label}" event carried a value of ${e.valueCents} cents, but nothing in the `
        + `schema holds a number for that classification. The value was dropped rather than `
        + `shown. (${e.label})`;
      if (process.env.NODE_ENV !== 'production') throw new Error(message);
      caveats.push(message);
      cleaned.push({ ...e, valueCents: null });
      continue;
    }
    cleaned.push(e);
  }

  return { events: cleaned, caveats };
}

/**
 * Assemble the board.
 *
 * Each stream is built independently and a failure in one costs that stream, not the page —
 * the rule `revenueRoomService` established and the reason it gives: "A page that disappears
 * under partial failure teaches people not to trust it, which costs more than the missing
 * section."
 */
export async function getRevenueFlowBoard(
  now: Date = new Date(),
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<RevenueFlowBoard> {
  assertClassificationKeysAreUnique();

  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const caveats: string[] = [];

  const [membership, gov] = await Promise.all([
    buildMembershipFlow(windowStart).catch((e: Error) => {
      caveats.push(`The membership stream could not be built: ${e.message}`);
      return null;
    }),
    buildGovFlow(windowStart).catch((e: Error) => {
      caveats.push(`The government pipeline could not be built: ${e.message}`);
      return null;
    }),
  ]);

  const streams = [membership?.stream, gov?.stream].filter(Boolean) as RevenueFlowBoard['streams'];
  for (const s of streams) if (s.caveat) caveats.push(s.caveat);

  const rawEvents = [...(membership?.events ?? []), ...(gov?.events ?? [])];
  const { events: honest, caveats: honestyCaveats } = enforceValueHonesty(rawEvents);
  caveats.push(...honestyCaveats);

  // Newest first. Ties broken by classification so a day's events render in a stable order
  // rather than shuffling between requests, which makes a screenshot reproducible.
  honest.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.classification.localeCompare(b.classification)));

  // ── THE HEADLINE ──────────────────────────────────────────────────────────────────────
  const decided = (gov?.decidedWon ?? 0) + (gov?.decidedLost ?? 0);

  const headline: FlowHeadline = {
    bookedAnnualized: membership?.stream.headline
      ?? noMoney('Cannot be read', 'The membership stream could not be built.'),

    possibleWinnings: gov
      ? (gov.openPricedCents > 0
        ? money(gov.openPricedCents,
          'Total contract value of priced bids with no recorded outcome. A bid is only '
          + 'priced when a named human records a value with a stated basis, so unverified '
          + 'and test rows cannot enter this total.')
        : noMoney(
          gov.unpricedBids > 0 ? `${gov.unpricedBids} bids, none priced` : 'No open priced bids',
          'Nothing in the schema holds a bid value until a human records one. '
          + 'gov_qualifications has no value column at all.',
        ))
      : noMoney('Cannot be read', 'The government pipeline could not be built.'),

    possibleWinningsAnnualized: gov?.openPricedAnnualizedCents != null
      ? money(gov.openPricedAnnualizedCents,
        'The same open pipeline divided by each contract\'s recorded term. Bids with no '
        + 'recorded term are excluded rather than assumed to run one year.')
      : noMoney('Term not recorded',
        'An annualized pipeline needs each contract\'s term in months. Where that is not '
        + 'recorded, guessing twelve would be worse than saying nothing.'),

    wonValue: gov && gov.decidedWon > 0
      ? money(gov.wonCents, 'Priced value of bids whose recorded outcome is won.')
      : noMoney('None yet', 'No gov_submission row carries outcome=won.'),

    lostValue: gov && gov.decidedLost > 0
      ? money(gov.lostCents, 'Priced value of bids whose recorded outcome is lost.')
      : noMoney('None yet', 'No gov_submission row carries outcome=lost.'),

    // Null, not zero. gov_submission held zero rows on 2026-11-12, so nothing has ever been
    // decided. A 0% win rate would claim that we lose; the truth is we have not yet played.
    winRate: decided > 0 ? (gov as NonNullable<typeof gov>).decidedWon / decided : null,
    winRateBasis: decided > 0
      ? `${(gov as NonNullable<typeof gov>).decidedWon} won of ${decided} decided.`
      : 'No bid has been decided yet, so there is no rate to report. This is not a zero '
        + 'percent win rate: nothing has reached an outcome.',

    unpricedBids: gov?.unpricedBids ?? 0,
  };

  if (headline.unpricedBids > 0) {
    caveats.push(
      `${headline.unpricedBids} flagged bid(s) have no confirmed value and are therefore `
      + 'absent from the winnings total. The count is shown beside the total so the gap is '
      + 'visible rather than silently excluded.',
    );
  }

  return {
    asOf: now.toISOString(),
    headline,
    streams,
    events: honest,
    windowDays,
    // De-duplicated: the stream caveats and the headline notes overlap by design, and a
    // reader meeting the same sentence three times stops reading them.
    caveats: Array.from(new Set(caveats)),
  };
}
