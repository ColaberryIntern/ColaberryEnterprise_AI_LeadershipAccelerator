/**
 * R16 — the government pipeline as a funnel with a price on it.
 *
 * Ali's ask: "What about the proposal value and then reporting on the status of if we won.
 * We have this much of possible proposal winnings."
 *
 * ── THE FUNNEL IS NOT INVENTED HERE ──────────────────────────────────────────────────────
 *
 * Flagged, Priced, Documented, Exported, Submitted, Acknowledged, Won/Lost. Six of those
 * seven stages already existed: `gov_qualifications.decision`, `gov_proposal_documents`, and
 * the lifecycle `models/GovSubmission.ts` declares as
 * `preparing → needs_review → ready → exported → externally_submitted → acknowledged` with
 * an outcome of `pending | won | lost | withdrawn | no_bid | unknown`. Only "Priced" is new,
 * and `gov_bid_values` is the whole of that addition.
 *
 * Reusing the existing lifecycle rather than defining a parallel one is the point. Two
 * vocabularies for the same bid is how a dashboard and a subsystem end up disagreeing about
 * whether something was submitted.
 *
 * ── WHY THE HEADLINE COUNTS ONLY PRICED BIDS ─────────────────────────────────────────────
 *
 * Measured against production on 2026-11-12, the 14 rows at
 * `decision=approved_bid_pursuit AND status=active` included:
 *   - one named "Snow College Adult Learner - T8 test"
 *   - "RFP - Enterprise Work Order Management System" twice, under two project ids
 *   - three rows with no `delivery_project_id` at all
 *   - zero rows in `gov_submission`, so nothing has ever been submitted
 *
 * Summing a value across all 14 would therefore have put a test row into Ram's pipeline
 * total. Because a price can only be written by a named human with a stated basis
 * (`govBidValueService`), "priced" IS the human confirmation the government card has been
 * asking for since R1 — and the unpriced count travels beside the total so the gap is
 * visible rather than silently dropped.
 *
 * ── EXPORTED IS NOT SUBMITTED ────────────────────────────────────────────────────────────
 *
 * Kept as two stages because `GovSubmission`'s header is emphatic that exporting a package
 * is something the system can do and recording a submission is a manual operator act. One
 * stage would let this page claim a submission nobody made.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { TileStatus } from '../commercialization/commercializationTiles';
import { getLiveBidValues, annualizedCents, BidValue } from './govBidValueService';
import {
  FlaggedBid, FlowEvent, FunnelStage, Money, RevenueStream, money, noMoney, formatCents,
} from './revenueFlowTypes';

/** True when the table exists. A missing table is not an empty one. */
async function tableExists(name: string): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :name`,
    { type: QueryTypes.SELECT, replacements: { name } },
  );
  return (rows[0]?.n ?? 0) > 0;
}

interface FlaggedRow {
  delivery_project_id: string | null;
  canonical_opportunity_id: string | null;
  project_name: string | null;
  flagged_at: string;
}

interface SubmissionRow {
  delivery_project_id: string;
  status: string;
  outcome: string;
  exported_at: string | null;
  externally_submitted_at: string | null;
  acknowledged_at: string | null;
  outcome_recorded_at: string | null;
}

interface DocRow {
  delivery_project_id: string;
  title: string | null;
  observed_at: string;
}

/** Day precision. The timeline buckets by day, and a time-of-day would be false detail. */
function day(iso: string | null): string | null {
  return iso ? String(iso).slice(0, 10) : null;
}

export interface GovFlow {
  stream: RevenueStream;
  events: FlowEvent[];
  /** Pulled up for the page headline, which reports winnings across streams. */
  openPricedCents: number;
  openPricedAnnualizedCents: number | null;
  wonCents: number;
  lostCents: number;
  decidedWon: number;
  decidedLost: number;
  unpricedBids: number;
}

/**
 * An empty-but-honest stream, for when the tables this reads are not in the database.
 *
 * Returned rather than thrown so one missing table costs this section and not the page.
 * A dashboard that disappears under partial failure teaches people not to open it, which
 * costs more than the missing section — the rule `revenueRoomService` already follows.
 */
function absentFlow(reason: string): GovFlow {
  return {
    stream: {
      key: 'gov_pipeline',
      label: 'Government bids in pursuit',
      status: 'unmeasurable' as TileStatus,
      headline: noMoney('Cannot be read', reason),
      funnel: [],
      provenance: reason,
      caveat: reason,
      drillDownKey: 'gov_bid_pursuit',
    },
    events: [],
    openPricedCents: 0,
    openPricedAnnualizedCents: null,
    wonCents: 0,
    lostCents: 0,
    decidedWon: 0,
    decidedLost: 0,
    unpricedBids: 0,
  };
}

/**
 * Flags derived from the row itself, never from a judgment about the opportunity.
 *
 * Each of these was really present on 2026-11-12, which is why they are computed rather
 * than assumed absent. `govBidFlow` emits a `bid_suspect` event for any row that trips one,
 * so a reader scanning the timeline sees the cleanup work as work.
 */
function suspectReasons(
  row: FlaggedRow,
  titleCounts: Map<string, number>,
): string[] {
  const title = (row.project_name ?? '').trim();
  const out: string[] = [];
  if (!row.delivery_project_id) out.push('no delivery project, so it cannot be named or priced');
  if (/\btest\b/i.test(title)) out.push('looks like a test row');
  if (title && (titleCounts.get(title.toLowerCase()) ?? 0) > 1) out.push('duplicate title');
  return out;
}

export async function buildGovFlow(windowStart: Date): Promise<GovFlow> {
  if (!(await tableExists('gov_qualifications'))) {
    return absentFlow(
      'gov_qualifications is not present in this database, so the pipeline cannot be '
      + 'counted. A missing source is not an empty one.',
    );
  }

  const flagged = await sequelize.query<FlaggedRow>(
    `SELECT q.delivery_project_id,
            q.canonical_opportunity_id,
            p.name AS project_name,
            q.created_at::text AS flagged_at
       FROM gov_qualifications q
       LEFT JOIN delivery_projects p ON p.id = q.delivery_project_id
      WHERE q.decision::text = 'approved_bid_pursuit' AND q.status::text = 'active'
      ORDER BY q.created_at DESC`,
    { type: QueryTypes.SELECT },
  );

  // Count titles so a duplicated RFP is flagged on BOTH rows rather than neither.
  const titleCounts = new Map<string, number>();
  for (const r of flagged) {
    const t = (r.project_name ?? '').trim().toLowerCase();
    if (t) titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
  }

  const values = await getLiveBidValues();
  const valueByProject = new Map<string, BidValue>(values.map((v) => [v.deliveryProjectId, v]));

  const submissions = (await tableExists('gov_submission'))
    ? await sequelize.query<SubmissionRow>(
      `SELECT delivery_project_id, status, outcome,
              exported_at::text, externally_submitted_at::text,
              acknowledged_at::text, outcome_recorded_at::text
         FROM gov_submission`,
      { type: QueryTypes.SELECT },
    )
    : [];
  const subByProject = new Map<string, SubmissionRow>(
    submissions.map((s) => [s.delivery_project_id, s]),
  );

  const docs = (await tableExists('gov_proposal_documents'))
    ? await sequelize.query<DocRow>(
      `SELECT d.delivery_project_id, d.title,
              COALESCE(d.drafted_at, d.created_at)::text AS observed_at
         FROM gov_proposal_documents d
        WHERE COALESCE(d.drafted_at, d.created_at) >= :since`,
      { type: QueryTypes.SELECT, replacements: { since: windowStart } },
    )
    : [];

  const nameOf = new Map<string, string>();
  for (const r of flagged) {
    if (r.delivery_project_id) {
      nameOf.set(r.delivery_project_id, (r.project_name ?? '').trim() || '(unnamed project)');
    }
  }

  // ── EVENTS ────────────────────────────────────────────────────────────────────────────
  const events: FlowEvent[] = [];

  for (const r of flagged) {
    const at = day(r.flagged_at);
    if (!at) continue;
    const label = (r.project_name ?? '').trim() || '(unnamed project)';
    events.push({
      at,
      classification: 'bid_flagged',
      stream: 'gov_pipeline',
      label,
      entityKey: r.delivery_project_id,
      // No value: gov_qualifications holds none, and the classification declares that.
      valueCents: null,
    });
    for (const reason of suspectReasons(r, titleCounts)) {
      events.push({
        at,
        classification: 'bid_suspect',
        stream: 'gov_pipeline',
        label: `${label} — ${reason}`,
        entityKey: r.delivery_project_id,
        valueCents: null,
      });
    }
  }

  // A price is itself a dated event, and a revision is a different event from a first
  // price. `superseded_at` on an older row is what distinguishes them, so the history read
  // is per-project rather than one global query: a bid priced once should not read as
  // revised.
  for (const v of values) {
    const at = day(v.confirmedAt);
    if (!at) continue;
    const name = nameOf.get(v.deliveryProjectId) ?? v.deliveryProjectId;
    events.push({
      at,
      classification: 'bid_priced',
      stream: 'gov_pipeline',
      label: `${name} — ${formatCents(v.proposalValueCents, v.currency)} (${v.basisSource.replace(/_/g, ' ')})`,
      entityKey: v.deliveryProjectId,
      valueCents: v.proposalValueCents,
    });
  }

  for (const d of docs) {
    const at = day(d.observed_at);
    if (!at) continue;
    const name = nameOf.get(d.delivery_project_id) ?? d.delivery_project_id;
    events.push({
      at,
      classification: 'proposal_document',
      stream: 'gov_pipeline',
      label: `${name} — ${(d.title ?? 'untitled document').slice(0, 80)}`,
      entityKey: d.delivery_project_id,
      valueCents: null,
    });
  }

  const OUTCOME_CLASS: Record<string, string> = {
    won: 'bid_won', lost: 'bid_lost', no_bid: 'bid_no_bid', withdrawn: 'bid_withdrawn',
  };

  for (const s of submissions) {
    const name = nameOf.get(s.delivery_project_id) ?? s.delivery_project_id;
    const priced = valueByProject.get(s.delivery_project_id) ?? null;

    const exported = day(s.exported_at);
    if (exported) {
      events.push({
        at: exported,
        classification: 'bid_exported',
        stream: 'gov_pipeline',
        label: `${name} — package exported (not yet submitted)`,
        entityKey: s.delivery_project_id,
        valueCents: null,
      });
    }
    const submitted = day(s.externally_submitted_at);
    if (submitted) {
      events.push({
        at: submitted,
        classification: 'bid_submitted',
        stream: 'gov_pipeline',
        label: name,
        entityKey: s.delivery_project_id,
        valueCents: priced ? priced.proposalValueCents : null,
      });
    }
    const acked = day(s.acknowledged_at);
    if (acked) {
      events.push({
        at: acked,
        classification: 'bid_acknowledged',
        stream: 'gov_pipeline',
        label: name,
        entityKey: s.delivery_project_id,
        valueCents: priced ? priced.proposalValueCents : null,
      });
    }
    const decided = day(s.outcome_recorded_at);
    const cls = OUTCOME_CLASS[s.outcome];
    if (decided && cls) {
      // An unpriced win reports as a win with NO number rather than as a guess. That is the
      // same rule the cards follow and it matters most here, where the temptation to
      // estimate is strongest.
      const carries = cls === 'bid_won' || cls === 'bid_lost';
      events.push({
        at: decided,
        classification: cls,
        stream: 'gov_pipeline',
        label: name,
        entityKey: s.delivery_project_id,
        valueCents: carries && priced ? priced.proposalValueCents : null,
      });
    }
  }

  // ── FUNNEL AND TOTALS ─────────────────────────────────────────────────────────────────
  //
  // "Open" means priced and not yet decided. A bid with no submission row has no outcome,
  // so it is open; `pending` is explicitly open too, because that is what the column's
  // default means.
  const isDecided = (pid: string): string | null => {
    const s = subByProject.get(pid);
    if (!s || s.outcome === 'pending' || s.outcome === 'unknown') return null;
    return s.outcome;
  };

  let openPricedCents = 0;
  let openAnnualized = 0;
  let openAnnualizableCount = 0;
  let wonCents = 0;
  let lostCents = 0;
  let decidedWon = 0;
  let decidedLost = 0;

  for (const v of values) {
    const outcome = isDecided(v.deliveryProjectId);
    if (outcome === 'won') { wonCents += v.proposalValueCents; decidedWon += 1; continue; }
    if (outcome === 'lost') { lostCents += v.proposalValueCents; decidedLost += 1; continue; }
    if (outcome === 'no_bid' || outcome === 'withdrawn') continue;
    openPricedCents += v.proposalValueCents;
    const ann = annualizedCents(v);
    if (ann !== null) { openAnnualized += ann; openAnnualizableCount += 1; }
  }

  const pricedProjects = new Set(values.map((v) => v.deliveryProjectId));
  const flaggedWithProject = flagged.filter((r) => r.delivery_project_id);
  const unpricedBids = flaggedWithProject
    .filter((r) => !pricedProjects.has(r.delivery_project_id as string)).length;

  // ── THE BIDS THEMSELVES, so the page can offer a price control next to the gap ────────
  //
  // Unpriced first, then by flag count. A reader who opens this is here to fix the gap, so
  // the rows that need fixing are the rows at the top. Secondary ordering by flag count puts
  // the test row and the duplicate near the unpriced ones, which is where someone deciding
  // what to price wants them: those are the rows to NOT price.
  const bids: FlaggedBid[] = flagged
    .filter((r) => r.delivery_project_id)
    .map((r) => {
      const pid = r.delivery_project_id as string;
      const v = valueByProject.get(pid) ?? null;
      const sub = subByProject.get(pid);
      return {
        deliveryProjectId: pid,
        canonicalOpportunityId: r.canonical_opportunity_id,
        name: (r.project_name ?? '').trim() || '(unnamed project)',
        flags: suspectReasons(r, titleCounts),
        priced: v
          ? {
            cents: v.proposalValueCents,
            display: formatCents(v.proposalValueCents, v.currency),
            periodMonths: v.periodMonths,
            basisSource: v.basisSource,
            valueBasis: v.valueBasis,
            confirmedBy: v.confirmedBy,
            confirmedAt: v.confirmedAt,
          }
          : null,
        // 'pending' is the column's own default and the honest answer when no submission row
        // exists at all: nothing has been decided, which is different from a decision of
        // "unknown".
        outcome: sub?.outcome ?? 'pending',
      };
    })
    .sort((a, b) => {
      if ((a.priced === null) !== (b.priced === null)) return a.priced === null ? -1 : 1;
      return b.flags.length - a.flags.length;
    });

  const docProjects = new Set(docs.map((d) => d.delivery_project_id));
  const exportedCount = submissions.filter((s) => s.exported_at).length;
  const submittedCount = submissions.filter((s) => s.externally_submitted_at).length;
  const ackedCount = submissions.filter((s) => s.acknowledged_at).length;

  const unpricedNote = (n: number): Money => noMoney(
    n === 0 ? 'None priced yet' : `${n} unpriced`,
    'No value exists for a bid until a human records one with a stated basis. '
    + 'gov_qualifications holds no value column at all.',
  );

  const funnel: FunnelStage[] = [
    {
      key: 'flagged',
      label: 'Flagged for pursuit',
      count: flagged.length,
      value: unpricedNote(unpricedBids),
      classification: 'bid_flagged',
      definition:
        'gov_qualifications at decision=approved_bid_pursuit and status=active. A flag, not '
        + 'a confirmed pursuit.',
    },
    {
      key: 'priced',
      label: 'Priced by a human',
      count: values.length,
      value: values.length
        ? money(values.reduce((a, v) => a + v.proposalValueCents, 0),
          'Sum of live rows in gov_bid_values, each confirmed by a named person with a basis.')
        : noMoney('Nothing priced', 'gov_bid_values holds no live row for any flagged bid.'),
      classification: 'bid_priced',
      definition:
        'A live gov_bid_values row. Pricing a bid is the human confirmation that it is a '
        + 'real pursuit, which is what lets the winnings total exclude test rows.',
    },
    {
      key: 'documented',
      label: 'Has a proposal document',
      count: docProjects.size,
      value: noMoney('Not a money stage', 'Counts distinct projects holding a drafted document.'),
      classification: 'proposal_document',
      definition: 'At least one gov_proposal_documents row exists for the project.',
    },
    {
      key: 'exported',
      label: 'Package exported',
      count: exportedCount,
      value: noMoney('Not yet submitted', 'Exporting is not submitting; the two are separate states.'),
      classification: 'bid_exported',
      definition: 'gov_submission.exported_at is set. The system can do this on its own.',
    },
    {
      key: 'submitted',
      label: 'Submitted',
      count: submittedCount,
      value: noMoney(
        submittedCount === 0 ? 'Never submitted' : 'See priced value',
        'gov_submission.externally_submitted_at, recorded manually by an operator.',
      ),
      classification: 'bid_submitted',
      definition: 'An operator recorded an external submission receipt. A manual act, never inferred.',
    },
    {
      key: 'acknowledged',
      label: 'Receipt acknowledged',
      count: ackedCount,
      value: noMoney('Awaiting outcome', 'gov_submission.acknowledged_at.'),
      classification: 'bid_acknowledged',
      definition: 'The agency confirmed receipt. The last state before an outcome.',
    },
    {
      key: 'won',
      label: 'Won',
      count: decidedWon,
      value: decidedWon
        ? money(wonCents, 'Sum of the priced value of bids whose recorded outcome is won.')
        : noMoney('None yet', 'No gov_submission row carries outcome=won.'),
      classification: 'bid_won',
      definition: 'gov_submission.outcome = won. Recorded, never inferred.',
    },
    {
      key: 'lost',
      label: 'Lost',
      count: decidedLost,
      value: decidedLost
        ? money(lostCents, 'Sum of the priced value of bids whose recorded outcome is lost.')
        : noMoney('None yet', 'No gov_submission row carries outcome=lost.'),
      classification: 'bid_lost',
      definition: 'gov_submission.outcome = lost. Counted in the win rate, never in winnings.',
    },
  ];

  // ── STATUS ────────────────────────────────────────────────────────────────────────────
  //
  // `proxy` while nothing is priced: the headline is then a FLAG COUNT, which is a near
  // neighbour of pipeline value and not the thing itself. It promotes to `live` the moment
  // a human prices a bid, because at that point the number means what it says. This is the
  // promotion rule `revenueRoomService` already applies, and it is why the government card
  // can stop lying about itself without anyone editing a file.
  const status: TileStatus = values.length > 0 ? 'live' : (flagged.length ? 'proxy' : 'measured_zero');

  const headline: Money = values.length > 0
    ? money(openPricedCents,
      `Total contract value of ${values.length - decidedWon - decidedLost} priced, undecided `
      + 'bid(s). Excludes anything nobody has priced, so a test row cannot inflate it.')
    : noMoney(
      `${flagged.length} flagged, none priced`,
      'Nothing in the schema holds a bid value until a human records one, so there is no '
      + 'honest number here yet. The count is a flag count.',
    );

  const caveatParts = [
    `${flagged.length} row(s) carry the pursuit flag.`,
    unpricedBids > 0 ? `${unpricedBids} of them have no confirmed value.` : null,
    submittedCount === 0
      ? 'gov_submission is empty: nothing has ever been submitted, so nothing may be reported as submitted.'
      : null,
    openAnnualizableCount < values.length && values.length > 0
      ? `${values.length - openAnnualizableCount} priced bid(s) have no recorded term, so they `
        + 'are excluded from the annualized figure rather than assumed to be one year.'
      : null,
  ].filter(Boolean) as string[];

  return {
    stream: {
      key: 'gov_pipeline',
      label: 'Government bids in pursuit',
      status,
      headline,
      funnel,
      provenance:
        'gov_qualifications for the flag, gov_bid_values for the price, '
        + 'gov_proposal_documents for the work, gov_submission for submission and outcome. '
        + 'Every stage is a column that exists; none is inferred.',
      caveat: caveatParts.length ? caveatParts.join(' ') : null,
      drillDownKey: 'gov_bid_pursuit',
      bids,
    },
    events,
    openPricedCents,
    openPricedAnnualizedCents: openAnnualizableCount > 0 ? openAnnualized : null,
    wonCents,
    lostCents,
    decidedWon,
    decidedLost,
    unpricedBids,
  };
}
