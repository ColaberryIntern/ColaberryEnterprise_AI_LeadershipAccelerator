/**
 * The queries behind the demand path. The rules it obeys live in `demandPath.ts`.
 *
 * ── WHY THE ARRIVED BAND IS READ FROM channelTruth AND NOT QUERIED HERE ──────────────────
 *
 * `channelTruth` already answers "where did the people who pay us come from", it is already
 * tested, and its panel already renders further down the same page. Re-deriving those counts
 * here would put two answers to one question on one screen, and the first anybody would know
 * of a drift is a band disagreeing with the table beneath it. Its own header is explicit that
 * it must never grow a second opinion about campaign return, and the same courtesy runs the
 * other way: this module must never grow a second opinion about channel return.
 *
 * So the only SQL here is the campaign reach the demand path genuinely adds.
 *
 * ── WHAT THE CAMPAIGN QUERY DELIBERATELY DOES NOT COUNT ──────────────────────────────────
 *
 * `interaction_outcomes` carries a `converted` outcome. It is not counted, because nothing in
 * the system writes it: measured on production 2026-11-23, it is zero across all four
 * campaigns in scope, and `InteractionOutcome`'s own model file records that it is "a metric
 * nothing can currently move off zero". Counting it would print a real-looking zero whose
 * meaning is "no writer exists". `demandPath` reports it as not recorded instead.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { getChannelTruth } from '../revenueRoom/channelTruthService';
import {
  CampaignReachRow,
  DEMAND_CAMPAIGN_KEYS,
  DEMAND_CAMPAIGN_TYPES,
  assertDemandPathIsHonest,
  buildDemandBands,
} from './demandPath';
import { DemandBand } from './revenueFlowTypes';

interface RawReach {
  key: string;
  name: string | null;
  status: string | null;
  approval_status: string | null;
  enrolled_leads: number | string | null;
  sent: number | string | null;
  opened: number | string | null;
  replied: number | string | null;
  clicked: number | string | null;
}

const int = (v: number | string | null): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

/**
 * Reach per campaign in scope.
 *
 * ── THE KEY CARRIES THE ID, AND IT HAS TO ───────────────────────────────────────────────
 *
 * `settings->>'campaign_key'` is the canonical identity the open-house services use, but it is
 * not guaranteed unique: both of those lookups end in `LIMIT 1`, which only makes sense
 * because a duplicate is possible. The two alumni campaigns carry no key at all and are told
 * apart by `type`. So the key is the readable identity plus the first eight characters of the
 * row id, which is stable across a rename and unique by construction. It is never rendered;
 * the campaign's own name is the label.
 *
 * `IN (:keys)`, not `= ANY(:keys)`. A Sequelize array replacement expands into a parenthesised
 * list, which `ANY` cannot take, and the query fails at runtime rather than at review.
 */
async function campaignReach(): Promise<CampaignReachRow[]> {
  const rows = await sequelize.query<RawReach>(
    `SELECT coalesce(c.settings->>'campaign_key', c.type) || ':' || left(c.id::text, 8) AS key,
            c.name, c.status, c.approval_status,
            (SELECT count(*)::int FROM campaign_leads cl
              WHERE cl.campaign_id = c.id)                                   AS enrolled_leads,
            (SELECT count(*)::int FROM scheduled_emails se
              WHERE se.campaign_id = c.id AND se.status = 'sent')            AS sent,
            (SELECT count(*)::int FROM interaction_outcomes io
              WHERE io.campaign_id = c.id AND io.outcome = 'opened')         AS opened,
            (SELECT count(*)::int FROM interaction_outcomes io
              WHERE io.campaign_id = c.id AND io.outcome = 'replied')        AS replied,
            -- R27. The click was always recorded and simply never read: interaction_outcomes
            -- held 5,838 'clicked' rows on 2026-11-25, against 14,036 'opened'. Counted from
            -- the same table and the same column as the two above, so a click rate rests on
            -- exactly the instrument the read rate does.
            (SELECT count(*)::int FROM interaction_outcomes io
              WHERE io.campaign_id = c.id AND io.outcome = 'clicked')        AS clicked
       FROM campaigns c
      WHERE c.archived_at IS NULL
        AND (c.settings->>'campaign_key' IN (:keys) OR c.type IN (:types))`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        keys: DEMAND_CAMPAIGN_KEYS as string[],
        types: DEMAND_CAMPAIGN_TYPES as string[],
      },
    },
  );

  return rows.map((r) => ({
    key: r.key,
    // Never blank: a source with no label cannot be read, and a campaign with no name is a
    // data defect rather than a reason to render an empty row.
    name: (r.name ?? '').trim() || 'Campaign with no name recorded',
    status: (r.status ?? 'unknown').trim(),
    approvalStatus: (r.approval_status ?? 'unknown').trim(),
    enrolledLeads: int(r.enrolled_leads),
    sent: int(r.sent),
    opened: int(r.opened),
    replied: int(r.replied),
    clicked: int(r.clicked),
  }));
}

/**
 * The membership stream's demand path.
 *
 * Returns undefined when neither band can be built, rather than two empty bands. An empty
 * band would render as "nobody was asked and nobody arrived", which is a claim; undefined
 * renders as no path at all, which is the truth when the query could not run.
 */
export async function getMembershipDemandPath(): Promise<DemandBand[] | undefined> {
  const [campaigns, channels] = await Promise.all([
    campaignReach(),
    getChannelTruth().then((t) => t.rows),
  ]);

  if (campaigns.length === 0 && channels.length === 0) return undefined;

  const bands = buildDemandBands(campaigns, channels);
  // Throws rather than returning a path that claims a campaign earned money. The caller turns
  // that into a caveat and loses the band, never the page.
  assertDemandPathIsHonest(bands);
  return bands;
}
