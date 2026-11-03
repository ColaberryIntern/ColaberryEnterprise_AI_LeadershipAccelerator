/**
 * R1 — fills the Revenue Room's initiative cards from production.
 *
 * Read-only. No writes, ever: this is a reporting surface.
 *
 * The job here is the same one `commercializationBoardService` does for its tiles, and it
 * follows the same two rules, because they are what make a board quotable:
 *
 *   - A declared status DEGRADES when the database cannot support it. A missing table is
 *     not an empty one, and "0" must never print for "I cannot see".
 *   - A declared status is PROMOTED when the database has gained the evidence. The Room
 *     should start telling the truth the day somebody records a confirmed bid, rather
 *     than waiting for this file to be edited.
 *
 * WHY A FAILING SECTION DOES NOT FAIL THE PAGE. The hypothesis cards come from a service
 * that reads the funnel, which reads several tables that may or may not exist in a given
 * database. If that throws, the honest result is five cards that say "cannot measure" —
 * not a 500 that shows Ram nothing. A page that disappears under partial failure teaches
 * people not to trust it, which costs more than the missing section.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { TileStatus } from '../commercialization/commercializationTiles';
import { annualizedRevenue } from '../commercialization/commercializationBoardService';
import {
  getHypothesisHealth,
  HypothesisVerdict,
} from '../commercialization/hypothesisHealthService';
import {
  INITIATIVE_DEFINITIONS,
  InitiativeDefinition,
  assertNoCardShowsAnUnmeasuredValue,
} from './revenueInitiatives';

export interface InitiativeCard extends InitiativeDefinition {
  /** Formatted for display, or null when the card has no number it may show. */
  value: string | null;
  /**
   * The hypothesis health verdict, where one applies. Carried SEPARATELY from `status`
   * on purpose: `status` answers "can this number be trusted?", `verdict` answers "is
   * this bet alive?". Collapsing them would lose one of the two.
   */
  verdict?: HypothesisVerdict;
  /** The next date this initiative is judged on, ISO. Null when nothing records one. */
  nextDeadline: string | null;
  /** What happens on that date, so the date is not a bare number on a screen. */
  nextDeadlineMeans: string | null;
  /** The most recent evidence of movement, ISO. Null when nothing records it. */
  lastActivity: string | null;
  /** Anything a reader must know before quoting this card. */
  caveat?: string;
  /**
   * The drill-down target R4 will build. Declared now so the cards are clickable in the
   * shell and the route key cannot be invented twice.
   */
  drillDownKey: string;
}

export interface RevenueRoomBoard {
  asOf: string;
  cards: InitiativeCard[];
  summary: Record<TileStatus, number>;
  /** Everything the reader needs to know about what this page could not see. */
  caveats: string[];
}

/** True when the table exists in this database. A missing table is not an empty one. */
async function tableExists(name: string): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :name`,
    { type: QueryTypes.SELECT, replacements: { name } },
  );
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * True when the column exists. Needed because `lastActivity` wants an `updated_at` that
 * not every table in this schema has — `enrollments` does not, and assuming it did would
 * turn a card into a 500.
 */
async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :table AND column_name = :column`,
    { type: QueryTypes.SELECT, replacements: { table, column } },
  );
  return (rows[0]?.n ?? 0) > 0;
}

interface GovFacts {
  flagged: number;
  withoutProject: number;
  withDocuments: number;
  submitted: number;
  lastActivity: string | null;
}

/**
 * What the government pipeline actually holds.
 *
 * Every number here is a fact about rows. None of them is "how many bids are live",
 * because nothing in the schema records that. The breakdown exists so the card can say
 * what its headline count includes instead of leaving the reader to assume.
 */
async function govPipelineFacts(): Promise<GovFacts | null> {
  if (!(await tableExists('gov_qualifications'))) return null;

  const hasUpdatedAt = await columnExists('gov_qualifications', 'updated_at');
  const docsExist = await tableExists('gov_proposal_documents');
  const submissionsExist = await tableExists('gov_submission');

  const rows = await sequelize.query<{
    flagged: number; without_project: number; last_activity: string | null;
  }>(
    `SELECT COUNT(*)::int AS flagged,
            COUNT(*) FILTER (WHERE delivery_project_id IS NULL)::int AS without_project,
            ${hasUpdatedAt ? 'MAX(updated_at)::text' : 'NULL::text'} AS last_activity
     FROM gov_qualifications
     WHERE decision::text = 'approved_bid_pursuit' AND status::text = 'active'`,
    { type: QueryTypes.SELECT },
  );
  const base = rows[0] ?? { flagged: 0, without_project: 0, last_activity: null };

  // Counted over DISTINCT projects, not rows: the flagged set has contained the same RFP
  // twice, so a row count would report one opportunity as two.
  const withDocuments = docsExist
    ? (await sequelize.query<{ n: number }>(
      `SELECT COUNT(DISTINCT q.delivery_project_id)::int AS n
         FROM gov_qualifications q
        WHERE q.decision::text = 'approved_bid_pursuit' AND q.status::text = 'active'
          AND q.delivery_project_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM gov_proposal_documents d
                       WHERE d.delivery_project_id = q.delivery_project_id)`,
      { type: QueryTypes.SELECT },
    ))[0]?.n ?? 0
    : 0;

  const submitted = submissionsExist
    ? (await sequelize.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM gov_submission',
      { type: QueryTypes.SELECT },
    ))[0]?.n ?? 0
    : 0;

  return {
    flagged: base.flagged,
    withoutProject: base.without_project,
    withDocuments,
    submitted,
    lastActivity: base.last_activity,
  };
}

/** The government card, with its headline count and what that count contains. */
function govCard(def: InitiativeDefinition, facts: GovFacts | null): InitiativeCard {
  const shell: InitiativeCard = {
    ...def,
    value: null,
    nextDeadline: null,
    // Measured 2026-11-03: gov_qualifications has no column for a due date, deadline,
    // close date or submission date. So this is null because nothing records it, which is
    // a different and more actionable statement than "no deadline is near".
    nextDeadlineMeans: null,
    lastActivity: null,
    drillDownKey: 'gov_bid_pursuit',
  };

  if (!facts) {
    return {
      ...shell,
      status: 'unmeasurable',
      sourceTable: null,
      caveat: 'gov_qualifications is not present in this database, so the pipeline cannot '
        + 'be counted. A missing source is not an empty one.',
    };
  }

  if (facts.flagged === 0) {
    // The table is there and the filter matches nothing. That is a real zero.
    return {
      ...shell,
      status: 'measured_zero',
      value: '0',
      lastActivity: facts.lastActivity,
      caveat: 'No bid is flagged for pursuit. The table is present and the filter matches '
        + 'nothing, so this zero is measured rather than assumed.',
    };
  }

  const parts = [
    `${facts.flagged} row(s) carry the pursuit flag.`,
    facts.withDocuments > 0
      ? `${facts.withDocuments} of the distinct projects behind them hold a proposal document.`
      : 'None of them holds a proposal document.',
    facts.withoutProject > 0
      ? `${facts.withoutProject} have no delivery project at all, so they cannot be named or priced.`
      : null,
    facts.submitted === 0
      ? 'gov_submission is empty: nothing has ever been submitted, so none of these may be reported as submitted.'
      : `${facts.submitted} submission(s) exist.`,
    'No column records which of these a human confirmed as live, so the headline is a flag count, not a pipeline.',
  ].filter(Boolean);

  return {
    ...shell,
    value: String(facts.flagged),
    lastActivity: facts.lastActivity,
    caveat: parts.join(' '),
  };
}

/**
 * Hypothesis verdicts answer a different question from tile statuses, so the mapping is
 * narrow on purpose: it only says whether the funnel could COUNT the thing. Whether the
 * bet is healthy travels in `verdict`, untouched.
 */
function statusForVerdict(v: HypothesisVerdict): TileStatus {
  if (v === 'uncountable') return 'unmeasurable';
  if (v === 'no_evidence' || v === 'past_deadline') return 'measured_zero';
  return 'live';
}

/** Build the board. Every card carries its status, its number and why. */
export async function getRevenueRoomBoard(now: Date = new Date()): Promise<RevenueRoomBoard> {
  const caveats: string[] = [];

  const [revenue, facts] = await Promise.all([
    annualizedRevenue().catch((e: Error) => {
      caveats.push(`Membership revenue could not be read: ${e.message}`);
      return null;
    }),
    govPipelineFacts().catch((e: Error) => {
      caveats.push(`The government pipeline could not be read: ${e.message}`);
      return null;
    }),
  ]);

  // A failure here costs five cards, not the page. See the header.
  const health = await getHypothesisHealth(now).catch((e: Error) => {
    caveats.push(
      `Hypothesis health could not be computed, so the five bets report as unmeasurable `
      + `rather than as zero: ${e.message}`,
    );
    return null;
  });
  if (health) caveats.push(...health.caveats);

  const cards: InitiativeCard[] = INITIATIVE_DEFINITIONS.map((def) => {
    if (def.key === 'membership_subscriptions') {
      if (!revenue) {
        return {
          ...def, status: 'unmeasurable' as TileStatus, sourceTable: null, value: null,
          nextDeadline: null, nextDeadlineMeans: null, lastActivity: null,
          drillDownKey: 'membership_subscriptions',
          caveat: 'The subscription figure could not be read, so no number is shown.',
        };
      }
      return {
        ...def, value: revenue.value, caveat: revenue.caveat,
        nextDeadline: null, nextDeadlineMeans: null, lastActivity: null,
        drillDownKey: 'membership_subscriptions',
      };
    }

    if (def.key === 'gov_bid_pursuit') return govCard(def, facts);

    // The five hypotheses.
    const h = health?.hypotheses.find((x) => `hypothesis_${x.key}` === def.key);
    if (!h) {
      return {
        ...def, value: null, nextDeadline: null, nextDeadlineMeans: null,
        lastActivity: null, drillDownKey: def.key,
        caveat: 'Health for this bet was not returned, so nothing is claimed about it.',
      };
    }

    // The next tripwire that has not yet been judged, else the target date itself.
    const pending = h.tripwires.find((t) => !t.due);
    const status = statusForVerdict(h.verdict);
    return {
      ...def,
      status,
      value: h.evidence === null ? null : `${h.evidence} of ${h.target.count}`,
      verdict: h.verdict,
      nextDeadline: pending ? pending.on : h.target.by,
      nextDeadlineMeans: pending
        ? `Survives if ${pending.survivesIf}.`
        : `Target date: ${h.evidenceRequired}.`,
      // A bet is not a record with a timestamp; its movement is the funnel's movement,
      // which R4 will show on the drill-down. Claiming a date here would invent one.
      lastActivity: null,
      caveat: h.note,
      drillDownKey: def.key,
    };
  });

  // The invariant, enforced at the boundary rather than trusted: no card may show a
  // number beside a status that means the number is not knowable.
  assertNoCardShowsAnUnmeasuredValue(cards);

  const summary = cards.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {} as Record<TileStatus, number>);

  return { asOf: now.toISOString(), cards, summary, caveats };
}
