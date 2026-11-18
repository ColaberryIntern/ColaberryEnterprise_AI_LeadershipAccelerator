/**
 * R19 — fills the Revenue Room's channel panel from production. Read-only, always.
 *
 * Depends on R18. `enrollments.lead_id` is what turns "which channel produced this paying
 * member" from a hand-match on lowercased email into a join. Measured 2026-11-17: it resolves
 * for 26 of 26 paying members and agrees with the email join on all 26.
 *
 * ── WHAT IS REUSED, AND WHY REUSE IS THE POINT ───────────────────────────────────────
 *
 *   - `PAYING_MEMBERS_CTE` decides who is paying. Its own header warns that three surfaces
 *     already credit marketing with paying members and that a fourth definition would let one
 *     screen show three different payer counts. This panel is that fourth surface, so it
 *     imports the rule instead of writing one.
 *   - `allocateSpend` resolves spend. A plain SUM over `marketing_spend_facts` would double
 *     count a day covered by both a manual row and a Meta row; that module already owns the
 *     precedence rules and is unit-tested on them.
 *   - `LANDING_SOURCES` groups the ad population, imported from `acquisitionFunnel.ts` rather
 *     than retyped, because a divergence between the two lists would silently move money
 *     between rows.
 *
 * ── THE ONE JUDGEMENT THIS FILE MAKES ────────────────────────────────────────────────
 *
 * Recorded ad spend is attached to the landing group as a whole, not spread across channels.
 * Spend is keyed by campaign, campaigns run against landing pages, and the landing sources are
 * the population that buys. Attributing a share of Meta spend to the open house would be an
 * invention. Every other channel therefore reports `spendCents: null`, meaning NOT RECORDED —
 * never 0, which would assert those channels were free.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { PAYING_MEMBERS_CTE } from '../marketing/payingMembersSql';
import { LANDING_SOURCES } from '../marketing/acquisitionFunnel';
import { allocateSpend } from '../marketing/adSpend/spendAllocation';
import { listSpend, toFacts } from '../marketing/adSpend/spendLedger';
import { centralToday } from '../marketing/adSpend/metaSpendSync';
import {
  ChannelRow,
  assertNoChannelShowsAnUnmeasuredCost,
  channelStatus,
  costPerPayingMemberCents,
  costStatus,
  labelForChannel,
  noteForChannel,
  sortChannels,
} from './channelTruth';

/** The synthetic key the landing sources collapse into, and the only row spend attaches to. */
export const PAID_LANDING_KEY = 'paid_landing';

/** The day the spend ledger is read from. Before any Colaberry ad account existed. */
const SPEND_EPOCH = '2020-01-01';

export interface ChannelTruth {
  asOf: string;
  rows: ChannelRow[];
  totals: { payingMembers: number; mrrCents: number; recordedSpendCents: number };
  /** Everything a reader must know before quoting this panel. */
  caveats: string[];
}

/**
 * Test and staff addresses, excluded from the LEAD denominator so a conversion rate is not
 * diluted by rows that were never prospects. The same exclusions the ad profitability report
 * applies, kept in sync by being written the same way.
 */
const NOT_A_PROSPECT = `
      lower(l.email) NOT LIKE 'e2e-%'
  AND lower(l.email) NOT LIKE '%@colaberry-test.local'
  AND NOT (lower(l.email) LIKE '%@colaberry.com' AND lower(l.email) NOT LIKE '%+%@colaberry.com')`;

interface MemberRow { source: string | null; members: number; mrr: number | string | null }
interface LeadRow { source: string | null; leads: number }

/**
 * Paying members per channel.
 *
 * The channel comes from the lead the enrollment is linked to, via R18's edge. `min(lead_id)` is
 * belt and braces: a person's enrollments all resolve to the same lead, because
 * `pickLeadForEnrollment` picks the oldest matching row for their email, so the min is that same
 * row. Taking the min rather than an arbitrary one keeps the answer stable if that ever changes.
 */
async function membersByChannel(): Promise<MemberRow[]> {
  return sequelize.query<MemberRow>(
    `WITH ${PAYING_MEMBERS_CTE},
     member_lead AS (
       SELECT p.email, p.mrr,
              (SELECT min(e2.lead_id) FROM enrollments e2
                WHERE lower(btrim(e2.email)) = p.email AND e2.lead_id IS NOT NULL) AS lead_id
         FROM paying p
     )
     SELECT l.source AS source,
            count(*)::int AS members,
            COALESCE(sum(ml.mrr), 0)::float AS mrr
       FROM member_lead ml
       LEFT JOIN leads l ON l.id = ml.lead_id
      GROUP BY l.source`,
    { type: QueryTypes.SELECT },
  );
}

/** Lead rows per source, the denominator. Lifetime, and the note on each row says so. */
async function leadsByChannel(): Promise<LeadRow[]> {
  return sequelize.query<LeadRow>(
    `SELECT l.source AS source, count(*)::int AS leads
       FROM leads l
      WHERE l.email IS NOT NULL AND ${NOT_A_PROSPECT}
      GROUP BY l.source`,
    { type: QueryTypes.SELECT },
  );
}

/** Every cent of ad spend we hold, resolved through the ledger's own precedence rules. */
async function recordedSpendCents(): Promise<number> {
  const today = centralToday();
  const records = await listSpend(SPEND_EPOCH, today, null);
  if (records.length === 0) return 0;
  return allocateSpend(toFacts(records), SPEND_EPOCH, today).totalCents;
}

/** `leads.source` to the key the panel groups it under. */
const groupKey = (source: string | null): string => {
  if (source === null || source.trim() === '') return 'no_source';
  return (LANDING_SOURCES as readonly string[]).includes(source) ? PAID_LANDING_KEY : source;
};

export async function getChannelTruth(now: Date = new Date()): Promise<ChannelTruth> {
  const caveats: string[] = [];

  const [members, leads, spendCents] = await Promise.all([
    membersByChannel(),
    leadsByChannel(),
    recordedSpendCents().catch((e: Error) => {
      caveats.push(
        `Ad spend could not be read, so no channel shows a cost per paying member: ${e.message}`,
      );
      return null;
    }),
  ]);

  const acc = new Map<string, { leads: number; members: number; mrrCents: number }>();
  const touch = (key: string) => {
    const cur = acc.get(key) ?? { leads: 0, members: 0, mrrCents: 0 };
    acc.set(key, cur);
    return cur;
  };

  for (const l of leads) {
    const cur = touch(groupKey(l.source));
    cur.leads += Number(l.leads) || 0;
  }
  for (const m of members) {
    // A paying member whose enrollment resolves to no lead at all is its own row rather than
    // being folded into a channel. See `noteForChannel`.
    const key = m.source === null ? 'unlinked' : groupKey(m.source);
    const cur = touch(key);
    cur.members += Number(m.members) || 0;
    cur.mrrCents += Math.round((Number(m.mrr) || 0) * 100);
  }

  const rows: ChannelRow[] = Array.from(acc.entries()).map(([key, v]) => {
    // Spend attaches to the landing group ONLY. Everywhere else it is null, meaning not
    // recorded, which is a different statement from zero. See the header.
    const spend = key === PAID_LANDING_KEY ? spendCents : null;
    const base = {
      key,
      label: labelForChannel(key),
      leads: v.leads,
      payingMembers: v.members,
      mrrCents: v.mrrCents,
      spendCents: spend,
      costPerPayingMemberCents: costPerPayingMemberCents(spend, v.members),
      status: channelStatus(v.leads, v.members),
      costStatus: costStatus(spend, v.members),
    };
    return { ...base, note: noteForChannel(base) };
  });

  // Enforced at the boundary rather than trusted: no row may print a cost beside a status
  // saying that cost is not knowable.
  assertNoChannelShowsAnUnmeasuredCost(rows);

  if (spendCents !== null) {
    caveats.push(
      'Recorded ad spend is shown against the landing-page group as a whole, because spend is '
      + 'keyed by campaign and campaigns run against landing pages. No share of it is assigned '
      + 'to the other channels, and their blank spend means NOT RECORDED rather than zero.',
    );
  }
  caveats.push(
    'Lead counts are lifetime and paying members are who pays today, so a channel ratio is a '
    + 'crude lifetime rate rather than a cohort conversion. It compares channels honestly; it is '
    + 'not a forecast.',
  );
  caveats.push(
    'Campaign-level return lives on /admin/marketing/performance, which is scoped to landing '
    + 'sources. This panel is by channel and covers the rest of the book.',
  );

  const sorted = sortChannels(rows);
  return {
    asOf: now.toISOString(),
    rows: sorted,
    totals: {
      payingMembers: sorted.reduce((t, r) => t + r.payingMembers, 0),
      mrrCents: sorted.reduce((t, r) => t + r.mrrCents, 0),
      recordedSpendCents: spendCents ?? 0,
    },
    caveats,
  };
}
