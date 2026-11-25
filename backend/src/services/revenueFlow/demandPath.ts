/**
 * The path in front of a revenue number: what we asked, then who arrived.
 *
 * Ali, 23 Nov 2026: *"Currently there is an alumni campaign and 2 Maya campaigns and marketing
 * (Landing page - open house) currently going towards this revenue source. Can we show that so
 * we can see the path before they reach the final revenue number."*
 *
 * The rules that decide what a band is allowed to CLAIM live here, with no database, the same
 * split `channelTruth.ts` uses. The SQL lives in `demandPathService.ts`.
 *
 * ── WHY TWO BANDS AND NOT ONE FUNNEL ─────────────────────────────────────────────────────
 *
 * A funnel is one population passing through stages, and its counts partition. These do not.
 * Four campaigns running at once are PARALLEL, their audiences overlap, and the same person can
 * sit in two of them. Folding them into `funnel[]` would put them in a column headed Stage,
 * implying a sequence and a partition that neither holds, and a reader would reasonably
 * subtract one row from the next.
 *
 * So: band one is what we did, band two is who turned up and paid, and between them sits a
 * stated break.
 *
 * ── THE BREAK IS THE FINDING, NOT A FOOTNOTE ─────────────────────────────────────────────
 *
 * Nothing in the schema joins a campaign to the money it produced. `subscriptions` carries no
 * campaign, no source and no UTM column, only `enrollment_id`. Measured on production
 * 2026-11-23 over the 33 people currently paying: `leads.source` covers 33 of 33, any UTM tag
 * covers 7, and `utm_campaign` covers 6. So a path keyed on campaign would be blank for 27 of
 * the 33 people who pay us, and `ideaFlow`'s conversion stream already says the same thing in
 * production copy on a stage that sits at zero.
 *
 * The honest response is neither to omit the campaigns nor to let them appear to add up to the
 * revenue figure. It is to show both bands and DRAW the gap. A gap drawn is a finding; a gap
 * omitted is a claim.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────────────────
 *
 * No figure anywhere in this module. `DemandSource` has no money field at all, and the reason
 * is written at length on that type: a per-channel monthly sum and the stream's per-person
 * annualized headline do not reconcile, and two revenue numbers disagreeing on one screen
 * costs the reader's trust in both. Counts of people and messages only.
 *
 * There is also no `converted` count, though `interaction_outcomes` has the vocabulary for one.
 * It is reported as NOT RECORDED rather than as zero, because nothing in the system writes that
 * outcome. Measured 2026-11-23: zero across all four campaigns, which is a property of the
 * writer and not of the campaigns.
 */
import { ChannelRow, sortChannels } from '../revenueRoom/channelTruth';
import { FlowTone } from './revenueClassifications';
import { DemandBand, DemandRate, DemandSource } from './revenueFlowTypes';

/**
 * Which campaigns count as feeding the membership motion.
 *
 * A DECLARED list rather than a derived one, and that is deliberate. There is no column on
 * `campaigns` that says "this one is aimed at paid membership", so any derivation would be a
 * guess dressed as a rule. Naming them means a new campaign does not silently appear in the
 * revenue path, and does not silently stay out of it either: it stays out until someone adds
 * it here, which is a visible, reviewable act.
 *
 * The two keys are the canonical identity the open-house services already use
 * (`settings->>'campaign_key'`, never the name, because the name has been rewritten at least
 * once). The two types are how the alumni campaigns are distinguished from each other.
 */
export const DEMAND_CAMPAIGN_KEYS: readonly string[] = [
  'open_house_countdown', 'open_house_followup',
];
export const DEMAND_CAMPAIGN_TYPES: readonly string[] = [
  'alumni', 'alumni_re_engagement',
];

/** One campaign's reach, as the service measures it. Emails and people, never money. */
export interface CampaignReachRow {
  /** `settings->>'campaign_key'` where present, else `type`. Stable across a rename. */
  key: string;
  name: string;
  /** `campaigns.status`: draft, active, paused, completed. */
  status: string;
  /** `campaigns.approval_status`, which can disagree with `status`. Both are shown. */
  approvalStatus: string;
  /** Rows in `campaign_leads`. PEOPLE. */
  enrolledLeads: number;
  /** Rows in `scheduled_emails` at status=sent. EMAILS, which is not the same number. */
  sent: number;
  opened: number;
  replied: number;
  /** `interaction_outcomes.outcome = 'clicked'`. Read from R27; recorded all along. */
  clicked: number;
}

export const ASKED_LABEL = 'Who we asked';
export const ARRIVED_LABEL = 'Where the people who pay came from';

export const ASKED_DEFINITION =
  'A campaign that went out, counted in people asked and emails sent, since that campaign '
  + 'started rather than within this board\'s window. The alumni campaigns began in March '
  + '2026, so a 180-day cut would hide most of what they did. These are activity numbers: '
  + 'none of them is revenue and none can be traced to a payment.';

export const ARRIVED_DEFINITION =
  'The acquisition channel recorded on the lead of each person who pays TODAY, read through '
  + 'enrollments.lead_id. A standing count rather than a windowed one, for the same reason. '
  + 'This is the band that reaches the number below it.';

/**
 * The sentence rendered in the gap between the two bands.
 *
 * Kept as one exported constant so the page, the tests and any future report say it the same
 * way. It names the column that is missing rather than describing the problem abstractly,
 * because the fix is a column and a reader who knows that can ask for it.
 */
export const ATTRIBUTION_BREAK =
  'The bands above and below cannot be joined. Nothing records that a subscription exists '
  + 'because a campaign asked: subscriptions carries no campaign, source or UTM column, only '
  + 'enrollment_id. Over the people paying today, the lead source is known for every one of '
  + 'them and a campaign tag for fewer than one in five, so campaign numbers are shown as '
  + 'reach and are never added into the revenue figure.';

/** What a campaign's numbers can be trusted to mean. */
export function campaignStatus(row: CampaignReachRow): DemandSource['status'] {
  if (row.enrolledLeads === 0 && row.sent === 0) return 'unmeasurable';
  if (row.sent === 0) return 'measured_zero';
  return 'live';
}

/**
 * How worried to be about a campaign row.
 *
 * Muted by default, because an activity number in front of a revenue figure should not wear a
 * colour that reads as money. The one exception earns it: a campaign that is live or approved
 * and has sent nothing is a thing to fix, not a thing to scroll past. Measured 2026-11-23,
 * `Open House Follow-up (Maya)` is active, approved, holds 233 enrolled people and has sent
 * zero emails.
 *
 * Deliberately NOT a judgement on reply rate. Replies are recorded for some channels and not
 * others, so a low number can be a property of the recorder rather than of the campaign, and
 * painting it as a failure would be this module inventing a finding.
 */
export function campaignTone(row: CampaignReachRow): FlowTone {
  const running = row.status === 'active' || row.approvalStatus === 'approved'
    || row.approvalStatus === 'live';
  if (running && row.sent === 0 && row.enrolledLeads > 0) return 'warn';
  return 'muted';
}

/**
 * One rate, carried with the two numbers that made it. R27.
 *
 * A zero denominator yields `defined: false` and an explanation rather than 0%, for the same
 * reason the government card reports a null win rate: 0% claims nobody read it, when the truth
 * is that nothing was sent to be read. The basis travels with the number because a rate quoted
 * without one is the easiest figure on this page to misuse.
 */
export function rateOf(
  key: string,
  label: string,
  rawNumerator: number,
  rawDenominator: number,
  basis: string,
): DemandRate {
  // Coerced before anything else. A count that arrives undefined or NaN would otherwise
  // divide into "NaN%", which renders as a confident-looking figure rather than as a gap.
  const numerator = Number.isFinite(rawNumerator) ? Math.max(0, Math.trunc(rawNumerator)) : 0;
  const denominator = Number.isFinite(rawDenominator) ? Math.max(0, Math.trunc(rawDenominator)) : 0;

  if (denominator <= 0) {
    return {
      key,
      label,
      numerator,
      denominator,
      display: 'No emails sent yet',
      basis,
      defined: false,
    };
  }
  const pct = (numerator / denominator) * 100;
  return {
    key,
    label,
    numerator,
    denominator,
    // One decimal: a tenth of a percent is meaningful over 8,518 emails and noise over 12,
    // and the basis beside it is what lets a reader tell which case they are in.
    display: `${pct.toFixed(1)}%`,
    basis,
    defined: true,
  };
}

/** One campaign as a source in the `asked` band. */
export function campaignSource(row: CampaignReachRow): DemandSource {
  const state = row.status === row.approvalStatus
    ? row.status
    : `${row.status}, approval ${row.approvalStatus}`;

  return {
    key: row.key,
    label: row.name,
    count: row.enrolledLeads,
    countLabel: 'people asked',
    measures: [
      {
        label: 'emails sent',
        count: row.sent,
        note:
          'Emails, not people. A multi-step sequence sends more than one message to the same '
          + 'person, so this can exceed the number asked.',
      },
      {
        label: 'opened',
        count: row.opened,
        note: 'Recorded opens. An open is a weak signal and is never treated as interest.',
      },
      {
        label: 'replied',
        count: row.replied,
        note: 'Recorded replies on this campaign.',
      },
      {
        label: 'converted',
        count: null,
        note:
          'Not recorded. The outcome vocabulary has a converted value and nothing in the '
          + 'system writes it, so this is an absence of a writer rather than an absence of '
          + 'conversions.',
      },
    ],
    // Both over EMAILS SENT rather than people asked, deliberately: an open and a click are
    // events on a message, so dividing them by a count of people would produce a rate above
    // 100% the moment a sequence sends twice to the same person.
    rates: [
      rateOf('read_rate', 'read rate', row.opened, row.sent, 'opened over emails sent'),
      rateOf('click_rate', 'click rate', row.clicked, row.sent, 'clicked over emails sent'),
    ],
    status: campaignStatus(row),
    // False for every campaign, always. It is a fact about the schema, not about the campaign.
    attributable: false,
    note:
      row.sent === 0 && row.enrolledLeads > 0
        ? `Holds ${row.enrolledLeads} people and has sent nothing (${state}). The audience `
          + 'exists and the sending does not.'
        : `${state}. Reach only: no record ties this campaign to a payment.`,
    tone: campaignTone(row),
  };
}

/**
 * Whether a channel belongs in the path.
 *
 * Anything that produced a payer, plus anything that cost money and did not. The second half
 * is `channelTruth`'s third rail and is the reason this is a filter rather than a `> 0` test:
 * paid ads at zero paying members against recorded spend is the most useful number on that
 * panel, and a path that quietly dropped it would be hiding the finding.
 */
export function includeChannel(row: ChannelRow): boolean {
  return row.payingMembers > 0 || row.spendCents !== null;
}

/**
 * One channel as a source in the `arrived` band.
 *
 * Status and note come straight off the `ChannelRow` rather than being recomputed. That is
 * the whole point of reading `channelTruth` instead of re-querying: this band and the channel
 * panel further down the same page are then structurally unable to disagree.
 */
export function channelSource(row: ChannelRow): DemandSource {
  return {
    key: row.key,
    label: row.label,
    count: row.payingMembers,
    countLabel: 'paying members',
    // Empty, and the required field is what forced the decision rather than letting it default.
    // A channel is not a campaign: nothing sends an email on its behalf, so there is no
    // denominator and a read rate here would be a number about a thing that did not happen.
    rates: [],
    measures: [
      {
        label: 'leads ever recorded',
        count: row.leads,
        note:
          'Lead rows carrying this source, whether or not they ever paid. A crude '
          + 'denominator, and the honest one available.',
      },
    ],
    status: row.status,
    attributable: true,
    note: row.note,
    tone: channelTone(row),
  };
}

/** Good where people pay, a warning where money went out and nobody came back. */
export function channelTone(row: ChannelRow): FlowTone {
  if (row.payingMembers > 0) return 'good';
  if (row.spendCents !== null) return 'warn';
  return 'muted';
}

/**
 * Assemble the two bands.
 *
 * Campaign order is by people asked, descending, with the key breaking ties so the same inputs
 * always render in the same order and a screenshot is reproducible. Channel order is
 * `channelTruth`'s own `sortChannels`, so the band reads top to bottom in the same order as
 * the panel below it.
 */
export function buildDemandBands(
  campaigns: readonly CampaignReachRow[],
  channels: readonly ChannelRow[],
): DemandBand[] {
  const asked = [...campaigns]
    .sort((a, b) => (b.enrolledLeads - a.enrolledLeads) || a.key.localeCompare(b.key))
    .map(campaignSource);

  const arrived = sortChannels(channels.filter(includeChannel)).map(channelSource);

  return [
    {
      key: 'asked',
      label: ASKED_LABEL,
      definition: ASKED_DEFINITION,
      sources: asked,
      attributionBreak: ATTRIBUTION_BREAK,
    },
    {
      key: 'arrived',
      label: ARRIVED_LABEL,
      definition: ARRIVED_DEFINITION,
      sources: arrived,
      // Null, not an empty string: this band's numbers DO reach the figure below them.
      attributionBreak: null,
    },
  ];
}

/**
 * The promises this path makes, enforced rather than trusted.
 *
 * Throws on violation. Called by the service before the bands leave it, so a producer that
 * marks a campaign attributable, or drops the break, fails loudly here instead of shipping a
 * page that quietly claims a campaign earned money.
 */
export function assertDemandPathIsHonest(bands: readonly DemandBand[]): void {
  const seen = new Set<string>();

  for (const band of bands) {
    if (band.key === 'asked' && !band.attributionBreak) {
      throw new Error(
        'The asked band must carry the attribution break. Without it the page implies that '
        + 'campaign reach adds up to the revenue figure below it.',
      );
    }
    if (band.key === 'arrived' && band.attributionBreak !== null) {
      throw new Error(
        'The arrived band must not carry an attribution break: its numbers do reach the '
        + 'revenue figure, and a break here would understate what is known.',
      );
    }

    for (const s of band.sources) {
      const id = `${band.key}:${s.key}`;
      if (seen.has(id)) throw new Error(`Two demand sources share the key ${id}.`);
      seen.add(id);

      if (band.key === 'asked' && s.attributable) {
        throw new Error(
          `Campaign "${s.label}" was marked attributable. Nothing joins a campaign to a `
          + 'payment, so no source in the asked band may claim it.',
        );
      }
      if (!Number.isInteger(s.count) || s.count < 0) {
        throw new Error(`Demand source "${s.label}" has a count of ${s.count}.`);
      }
      for (const m of s.measures) {
        if (m.count !== null && (!Number.isInteger(m.count) || m.count < 0)) {
          throw new Error(`Measure "${m.label}" on "${s.label}" has a count of ${m.count}.`);
        }
      }
    }
  }
}
