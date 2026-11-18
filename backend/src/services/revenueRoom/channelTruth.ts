/**
 * R19 — WHERE THE PEOPLE WHO PAY US ACTUALLY CAME FROM, as a decision, with no database.
 *
 * The panel this feeds answers one question for Ram: per acquisition channel, how many members
 * pay, how much they pay, and what was spent to get them. The SQL lives in
 * `channelTruthService.ts`; the rules that decide what a row is allowed to CLAIM live here, so
 * they can be tested without a database, the same split `enrollmentLeadLink.ts` uses.
 *
 * ── WHY `leads.source` AND NOT UTM ───────────────────────────────────────────────────
 *
 * Measured read-only on production, 2026-11-17, over the 26 currently-paying members:
 *
 *     leads.source ............ 26 of 26   complete
 *     enrollments.lead_id ..... 26 of 26   (R18; agrees with the email join on all 26)
 *     any UTM tag .............  7 of 26
 *     utm_campaign ............  6 of 26
 *     enrollments.referral_channel  0 of 26   NULL for every paying member
 *
 * A panel keyed on campaign would be blank for 19 of the 26 people who pay us. Keyed on
 * `leads.source` it is complete today. `referral_channel` is the open-text VARCHAR(50) that
 * `enrollments` carried before R18 added `lead_id`; it is not a fallback, it is empty.
 *
 * This is deliberately a CHANNEL panel, not a campaign panel. Campaign-level return already
 * exists and is already surfaced: `adSpend/adProfitabilityService.ts` on
 * /admin/marketing/performance. That report is scoped to `LANDING_SOURCES`, and none of the 26
 * paying members has one of those sources, so it is structurally blind to the three channels
 * that produced every member we have. The two are complements, not competitors, and this file
 * must never grow a second opinion about campaign return.
 *
 * ── WHAT A ROW MAY AND MAY NOT SAY ───────────────────────────────────────────────────
 *
 * Three rails, in the vocabulary the Revenue Room and the former Commercialization board
 * already share (`TileStatus`), because a reader who has learned one board has learned this one:
 *
 *   1. SPEND THAT WAS NEVER RECORDED IS NULL, NEVER ZERO. We hold Meta spend. We hold nothing
 *      for the open house or the CCPP lists, and "we spent $0 on the open house" is a claim
 *      nobody measured. `spendCents: null` means not recorded; `0` would be a lie.
 *   2. COST PER PAYING MEMBER EXISTS ONLY WHERE BOTH SIDES WERE MEASURED. Spend with zero
 *      members is `undefined_rate` — a ratio with an empty denominator, which is not a big
 *      number and not zero. A blended cost across channels where one side is missing is exactly
 *      the lie this panel exists to prevent.
 *   3. A MEASURED ZERO IS NOT AN ABSENCE. Paid ads at 0 paying members against $3,894.80 of
 *      recorded spend is the single most useful number on this panel. It must print, with its
 *      spend beside it, and must never be averaged away or hidden.
 *
 * Pure: counts in, rows out.
 */
import { TileStatus } from '../commercialization/commercializationTiles';

/**
 * The `leads.source` values that mean "arrived through a landing page", which is the population
 * ad spend buys. Imported rather than retyped: `acquisitionFunnel.ts` owns this list and the ad
 * profitability report is scoped by the same constant. Two copies would drift, and the drift
 * would move money between rows.
 */
export { LANDING_SOURCES } from '../marketing/acquisitionFunnel';

/** One acquisition channel, as the panel reports it. */
export interface ChannelRow {
  /** `leads.source`, the synthetic `paid_landing` group, or `unlinked`. */
  key: string;
  label: string;
  /** Lead rows ever recorded with this source. The denominator, and a crude one: see `note`. */
  leads: number;
  payingMembers: number;
  mrrCents: number;
  /** Recorded ad spend, or NULL when none was ever recorded for this channel. Never 0 for "unknown". */
  spendCents: number | null;
  /** Only where spend AND members were both measured. */
  costPerPayingMemberCents: number | null;
  /** Whether the MEMBER count can be trusted. */
  status: TileStatus;
  /** Whether the COST figure can be trusted. Separate, because they fail independently. */
  costStatus: TileStatus;
  note: string;
}

/** Human labels for the sources that actually appear. Anything else falls back to its raw value. */
const LABELS: Record<string, string> = {
  open_house: 'Open house',
  ccpp_alumni: 'CCPP alumni',
  ccpp_winback: 'CCPP winback',
  paid_landing: 'Paid ads and landing pages',
  free_signup: 'Landing page signup',
  apollo: 'Apollo outbound',
  apollo_contacts: 'Apollo contacts',
  unlinked: 'No lead on record',
};

export function labelForChannel(key: string): string {
  return LABELS[key] ?? key;
}

/**
 * Whether the member count on this row can be trusted.
 *
 * `measured_zero` and `unmeasurable` are the distinction that makes the panel worth reading: a
 * channel with 800 leads and no members is a FINDING, while a channel with no leads at all is
 * an absence of data. Collapsing them would let "we have never run this" read as "this does not
 * work".
 */
export function channelStatus(leads: number, payingMembers: number): TileStatus {
  if (payingMembers > 0) return 'live';
  if (leads > 0) return 'measured_zero';
  return 'unmeasurable';
}

/**
 * Whether the cost-per-paying-member figure on this row can be trusted.
 *
 * Spend recorded and nobody paying is `undefined_rate`, NOT a huge cost and NOT zero: dividing
 * by zero members has no answer, and the honest rendering is a dash beside the spend that
 * produced it.
 */
export function costStatus(spendCents: number | null, payingMembers: number): TileStatus {
  if (spendCents === null) return 'unmeasurable';
  if (payingMembers === 0) return 'undefined_rate';
  return 'live';
}

/** Cost per paying member, or null when the ratio has no honest answer. */
export function costPerPayingMemberCents(
  spendCents: number | null,
  payingMembers: number,
): number | null {
  if (spendCents === null || payingMembers <= 0) return null;
  return Math.round(spendCents / payingMembers);
}

/**
 * The sentence under a row. Written here rather than in the component because it is the part a
 * reader quotes, and it has to stay next to the rules that decide it.
 */
export function noteForChannel(row: Omit<ChannelRow, 'note'>): string {
  if (row.key === 'unlinked') {
    return 'These enrollments resolve to no `leads` row at all, so no channel can be claimed for '
      + 'them. They are shown rather than dropped, because dropping them would quietly inflate '
      + 'every other channel\'s share.';
  }
  const parts: string[] = [];
  if (row.status === 'measured_zero' && row.spendCents !== null) {
    parts.push(
      'Spend is recorded here and no member from this channel is paying today. That is a '
      + 'measured zero, not a gap in the data.',
    );
  } else if (row.status === 'measured_zero') {
    parts.push('Leads arrived through this channel and none of them is paying today.');
  }
  if (row.spendCents === null) {
    parts.push('No spend was ever recorded against this channel, so cost per member cannot be '
      + 'computed. That is not the same as it having cost nothing.');
  }
  if (row.leads > 0 && row.payingMembers > 0) {
    parts.push(`${row.payingMembers} of ${row.leads.toLocaleString('en-US')} lead rows ever `
      + 'recorded with this source are paying today. Lifetime, not a cohort: the leads and the '
      + 'members are not from the same window.');
  }
  return parts.join(' ');
}

/**
 * No row may show a cost beside a status that says the cost is not knowable.
 *
 * Asserted at the boundary rather than trusted, for the reason `revenueInitiatives.ts` gives
 * about its own cards: the failure is silent, and a cost-per-member figure invented from a
 * missing denominator is precisely the number somebody would repeat in a meeting.
 */
export function assertNoChannelShowsAnUnmeasuredCost(rows: readonly ChannelRow[]): void {
  for (const r of rows) {
    if (r.costStatus !== 'live' && r.costPerPayingMemberCents !== null) {
      throw new Error(
        `channel ${r.key} shows a cost per paying member while its costStatus is `
        + `"${r.costStatus}", which means that figure is not knowable`,
      );
    }
    if (r.costStatus === 'live' && r.costPerPayingMemberCents === null) {
      throw new Error(`channel ${r.key} claims a knowable cost but carries none`);
    }
    if (r.spendCents === 0 && r.costStatus === 'unmeasurable') {
      throw new Error(
        `channel ${r.key} records spend of 0 but reports it as unmeasurable. Zero spend that was `
        + 'actually measured is a different statement from no spend recorded; use null for the '
        + 'latter.',
      );
    }
  }
}

/** Biggest MRR first, then most members, then alphabetically, so the order cannot wobble. */
export function sortChannels(rows: readonly ChannelRow[]): ChannelRow[] {
  return [...rows].sort((a, b) => (
    b.mrrCents - a.mrrCents
    || b.payingMembers - a.payingMembers
    || a.key.localeCompare(b.key)
  ));
}
