/**
 * C8.2 — the ten Commercialization Command Center tiles and, for each, the reason it
 * shows what it shows.
 *
 * WHY THIS FILE IS SEPARATE FROM THE SERVICE. The hard part of this dashboard is not
 * fetching two numbers, it is refusing to let eight empty tiles read as eight zeros.
 * The provenance is the deliverable, so it lives in its own module where it can be
 * reviewed and tested without a database.
 *
 * C8.1 designed this board with three states and classified eight tiles as
 * "NOT YET MEASURABLE — no source exists". Measuring production on 2026-10-23 showed
 * that is wrong in both directions, so this file carries five states instead:
 *
 *   - Two of those tables EXIST, are correctly shaped, and are empty. `revenue_opportunities`
 *     has estimated_value, confidence, status and deal_closed_at and has never been
 *     written to. That is a measured zero with an unfilled pipe, not a missing source,
 *     and the difference is the whole point of this ticket.
 *   - A rate over an empty denominator is UNDEFINED, not zero. Reporting a 0% win rate
 *     says we lost; we have not closed anything either way.
 *   - Two tiles have a near neighbor that is not the metric, and two more have a table
 *     whose NAME suggests it is the source when it belongs to another domain entirely.
 *     Those false friends are recorded, because the next person to build on this will
 *     find them the same way and needs to know they were already rejected.
 */

/**
 * The five honest answers to "what is this number?".
 *
 * These are deliberately not collapsible. A reader who cannot tell `measured_zero` from
 * `unmeasurable` will read the board as "we have nothing", and a reader who cannot tell
 * `proxy` from `live` will quote a number that does not mean what they think.
 */
export type TileStatus =
  | 'live'            // a source exists, holds data, and is the metric asked for
  | 'measured_zero'   // a correctly shaped source exists and is empty; the answer is 0
  | 'undefined_rate'  // a ratio whose denominator is empty; not 0, not knowable
  | 'proxy'           // a near neighbor exists; it is NOT the metric and over- or under-counts
  | 'unmeasurable';   // nothing of the right shape exists anywhere

export interface TileDefinition {
  key: string;
  label: string;
  status: TileStatus;
  /** The table the value comes from, or would come from. Null only when nothing fits. */
  sourceTable: string | null;
  /** One sentence a reader can act on: why this tile says what it says. */
  provenance: string;
  /** A table whose name suggests it is the source but which belongs to another domain. */
  falseFriend?: string;
  /** What would have to happen for this tile to become `live`. */
  unlockedBy?: string;
}

/**
 * Measured against production on 2026-10-23. Every row's claim was checked with a
 * read-only query; none is inferred from a schema name.
 */
export const TILE_DEFINITIONS: readonly TileDefinition[] = [
  {
    key: 'annualized_revenue',
    label: 'Annualized revenue',
    status: 'live',
    sourceTable: 'subscriptions',
    provenance:
      'Active subscriptions carrying a paysimple_payment_id, which is the marker the '
      + 'app-originated revenue rule names. 27 of 53 active rows carry one; the other 26 '
      + 'are comp at $0 and are excluded by the same filter.',
  },
  {
    key: 'qualified_pipeline',
    label: 'Qualified pipeline',
    status: 'measured_zero',
    sourceTable: 'revenue_opportunities',
    provenance:
      'The table exists with estimated_value, confidence and status, and has never been '
      + 'written to. The pipeline is genuinely zero because nobody records opportunities, '
      + 'not because the number cannot be known.',
    unlockedBy: 'C8.4 — write an opportunity when a commercial conversation qualifies.',
  },
  {
    key: 'proposal_value_out',
    label: 'Proposal value out',
    status: 'measured_zero',
    sourceTable: 'revenue_opportunities',
    provenance:
      'Same empty table; estimated_value summed over opportunities at a proposal stage '
      + 'is zero because there are no rows.',
    falseFriend:
      'gov_proposal_response holds 2 rows, but they are requirement-level response TEXT '
      + 'for one project (REQ-001, REQ-002) and carry no dollar value.',
    unlockedBy: 'C8.4 — record a value when a proposal goes out.',
  },
  {
    key: 'win_rate',
    label: 'Win rate',
    status: 'undefined_rate',
    sourceTable: 'revenue_opportunities',
    provenance:
      'Win rate is closed-won over closed-total. Both are zero, so the rate is undefined '
      + 'rather than 0%. Showing 0% would say we lose every deal; we have closed none.',
    unlockedBy: 'C8.4 — set deal_closed_at and a terminal status on opportunities.',
  },
  {
    key: 'active_pilots',
    label: 'Active pilots',
    status: 'proxy',
    sourceTable: 'delivery_engagements',
    provenance:
      'Two rows are status=active, but both are engagement_type=commercial_client with no '
      + 'start date, no end date, no source lead and no metadata, and one is named '
      + '"AI Project Factory - demo engagement". Counting them as pilots overstates it.',
    unlockedBy: 'C8.4 — a pilot entity distinct from an internal delivery engagement.',
  },
  {
    key: 'executive_meetings',
    label: 'Executive meetings',
    status: 'proxy',
    sourceTable: 'interaction_outcomes',
    provenance:
      'The nearest real signal is outcome=booked_meeting, 9 across 69,671 campaign events. '
      + 'That counts meetings BOOKED from outbound, says nothing about seniority, and does '
      + 'not record whether the meeting happened.',
    falseFriend:
      'workforce_meetings holds 51 rows, but they are internal "Daily Leadership Meeting" '
      + 'records about student engagement and unpaid tuition — a different domain.',
    unlockedBy: 'C8.4 — an interaction record for meetings held with named executives.',
  },
  {
    key: 'paid_pilots',
    label: 'Paid pilots',
    status: 'unmeasurable',
    sourceTable: null,
    provenance:
      'Nothing anywhere marks an engagement as paid. A schema-wide search for a contract, '
      + 'deal or pilot value column returned one hit, referral_commissions.deal_value, '
      + 'which belongs to referral payouts. A paid pilot could not be recorded today.',
    unlockedBy: 'C8.4 — a pilot entity carrying a fee and a payment reference.',
  },
  {
    key: 'partner_conversations',
    label: 'Strategic partner conversations',
    status: 'unmeasurable',
    sourceTable: null,
    provenance:
      'No table records a partner conversation. The campaign tables track leads through '
      + 'email steps, which is a different relationship and a different cadence.',
    unlockedBy: 'C8.4 — an interaction record scoped to partner organizations.',
  },
  {
    key: 'demos_delivered',
    label: 'Demos delivered',
    status: 'unmeasurable',
    sourceTable: null,
    provenance:
      'No outcome value means "a demo was delivered". The ten outcomes recorded are sent, '
      + 'opened, clicked, bounced, no_answer, voicemail, replied, answered, booked_meeting '
      + 'and unsubscribed. None of them is a demo.',
    unlockedBy: 'C8.4 — log a demo as its own interaction type.',
  },
  {
    key: 'deployment_outcomes',
    label: 'Deployment outcomes',
    status: 'unmeasurable',
    sourceTable: null,
    provenance:
      'delivery_contracts exists with a definition_of_done and success_measures and has '
      + 'zero rows, but an outcome needs a measured RESULT against those measures and no '
      + 'column holds one. The pipe for the promise exists; the pipe for the result does not.',
    unlockedBy: 'C8.4 — record measured results against a contract’s success measures.',
  },
];

/** How each status should read. The UI renders these; it does not invent its own wording. */
export const STATUS_PRESENTATION: Record<TileStatus, {
  label: string; glyph: string; tone: 'good' | 'neutral' | 'warn' | 'absent';
}> = {
  live: { label: 'Measured', glyph: '●', tone: 'good' },
  measured_zero: { label: 'Measured zero', glyph: '○', tone: 'neutral' },
  undefined_rate: { label: 'Undefined', glyph: '—', tone: 'neutral' },
  proxy: { label: 'Proxy only', glyph: '◐', tone: 'warn' },
  unmeasurable: { label: 'Not yet measurable', glyph: '✕', tone: 'absent' },
};

/**
 * Every tile states where its number came from. A tile without provenance is the
 * failure this board exists to prevent: a figure on a slide with nothing behind it.
 */
export function assertEveryTileHasProvenance(): number {
  for (const t of TILE_DEFINITIONS) {
    if (!t.provenance || t.provenance.trim().length < 40) {
      throw new Error(`tile ${t.key} has no usable provenance`);
    }
  }
  return TILE_DEFINITIONS.length;
}

/**
 * The structural invariant behind "measured zero distinguished from unmeasured".
 *
 * A measured zero is only honest if a real, correctly shaped source backs it — that is
 * what makes the zero a fact rather than an absence. Conversely a tile claiming nothing
 * can be measured must not be quietly sitting on a table that would serve.
 */
export function assertZeroAndUnmeasurableAreDistinguishable(): void {
  for (const t of TILE_DEFINITIONS) {
    const needsSource = t.status === 'measured_zero' || t.status === 'undefined_rate'
      || t.status === 'live' || t.status === 'proxy';
    if (needsSource && !t.sourceTable) {
      throw new Error(`tile ${t.key} is '${t.status}' but names no source table`);
    }
    if (t.status === 'unmeasurable' && t.sourceTable) {
      throw new Error(`tile ${t.key} claims to be unmeasurable but names ${t.sourceTable}`);
    }
  }
  const statuses = new Set(TILE_DEFINITIONS.map((t) => t.status));
  if (!statuses.has('measured_zero') || !statuses.has('unmeasurable')) {
    throw new Error('the board must distinguish a measured zero from an unmeasured tile');
  }
}

/** Anything not yet live should say what would make it live, or it is just a complaint. */
export function assertUnmeasurableTilesNameTheirUnlock(): void {
  for (const t of TILE_DEFINITIONS) {
    if (t.status !== 'live' && !t.unlockedBy) {
      throw new Error(`tile ${t.key} is not live and does not say what would unlock it`);
    }
  }
}
