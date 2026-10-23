/**
 * C8.4 — computes the funnel from the evidence `funnelStages.ts` defines.
 *
 * ONE IMPLEMENTATION, because the ticket's success metric is "two people independently
 * count the pipeline the same way". Two queries that both look reasonable are how that
 * stops being true, so every count in the business comes through here.
 *
 * AN ACCOUNT SITS AT ITS FURTHEST EVIDENCED STAGE, not at the furthest stage whose
 * predecessors all fired. Those differ, and the difference is worth keeping: an account
 * with an approved contract and no recorded contact is at Contract, and the missing
 * Contacted row is an instrumentation leak rather than a sales one. Collapsing the two
 * would hide exactly the gap this ticket was written to expose.
 *
 * Read-only.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { FUNNEL_STAGES, FunnelStage, EvidenceState } from './funnelStages';

export interface StageCount {
  n: number;
  key: string;
  label: string;
  evidence: EvidenceState;
  /** Accounts whose FURTHEST evidenced stage is exactly this one. Null when uncountable. */
  accountsAtStage: number | null;
  /** Accounts that have reached this stage or beyond. Null when uncountable. */
  accountsReached: number | null;
  /** Why the number is null, when it is. */
  note?: string;
}

export interface FunnelSnapshot {
  asOf: string;
  stages: StageCount[];
  totalAccounts: number;
  /** True when account attribution is impossible, so per-stage counts cannot be trusted. */
  attributionAvailable: boolean;
  caveats: string[];
}

/** Does this column exist in this database? C8.3 is merged; merged is not deployed. */
async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :table AND column_name = :column`,
    { type: QueryTypes.SELECT, replacements: { table, column } },
  );
  return (rows[0]?.n ?? 0) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :table`,
    { type: QueryTypes.SELECT, replacements: { table } },
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Accounts we have decided to pursue. Stage 1 is also the denominator. */
async function targetAccountIds(): Promise<string[]> {
  const rows = await sequelize.query<{ id: string }>(
    `SELECT id FROM organizations WHERE organization_type = 'strategic_account'`,
    { type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.id);
}

/**
 * The furthest stage each account has reached, by stage number.
 *
 * Only the stages whose evidence is actually present contribute. A stage that is absent
 * or undeployed cannot advance an account, and saying so is the honest alternative to
 * treating "no row" as "did not happen".
 */
async function furthestStageByAccount(
  accountIds: string[],
  available: Set<string>,
): Promise<Map<string, number>> {
  const furthest = new Map<string, number>();
  if (!accountIds.length) return furthest;
  for (const id of accountIds) furthest.set(id, 1); // Target, by definition

  const bump = (id: string, n: number) => {
    if ((furthest.get(id) ?? 0) < n) furthest.set(id, n);
  };

  if (available.has('mapped')) {
    const rows = await sequelize.query<{ organization_id: string }>(
      `SELECT DISTINCT organization_id FROM leads
       WHERE organization_id IS NOT NULL AND organization_id IN (:ids)`,
      { type: QueryTypes.SELECT, replacements: { ids: accountIds } },
    );
    for (const r of rows) bump(r.organization_id, 2);
  }

  if (available.has('outcomes')) {
    // Contacted (3), Engaged (4) and Meeting booked (5) all read interaction_outcomes
    // through the lead-to-account join, so one query serves all three.
    const rows = await sequelize.query<{ organization_id: string; outcome: string }>(
      `SELECT DISTINCT l.organization_id, io.outcome::text AS outcome
       FROM interaction_outcomes io
       JOIN leads l ON l.id = io.lead_id
       WHERE l.organization_id IN (:ids)
         AND io.outcome IN ('sent', 'replied', 'answered', 'booked_meeting')`,
      { type: QueryTypes.SELECT, replacements: { ids: accountIds } },
    );
    for (const r of rows) {
      if (r.outcome === 'sent') bump(r.organization_id, 3);
      if (r.outcome === 'replied' || r.outcome === 'answered') bump(r.organization_id, 4);
      if (r.outcome === 'booked_meeting') bump(r.organization_id, 5);
    }
  }

  if (available.has('opportunities')) {
    const rows = await sequelize.query<{ entity_id: string }>(
      `SELECT DISTINCT entity_id FROM revenue_opportunities
       WHERE entity_type = 'organization' AND entity_id IN (:ids)
         AND estimated_value IS NOT NULL`,
      { type: QueryTypes.SELECT, replacements: { ids: accountIds } },
    );
    for (const r of rows) bump(r.entity_id, 7);
  }

  return furthest;
}

/** Which evidence sources this database can actually serve right now. */
async function availableEvidence(): Promise<{ available: Set<string>; caveats: string[] }> {
  const available = new Set<string>();
  const caveats: string[] = [];

  const leadOrg = await columnExists('leads', 'organization_id');
  if (leadOrg) {
    available.add('mapped');
    available.add('outcomes'); // attribution runs through this column
  } else {
    caveats.push(
      'leads.organization_id is not in this database, so no interaction can be attributed '
      + 'to an account. C8.3 shipped the column; merged is not deployed.',
    );
  }

  if (await tableExists('revenue_opportunities')) available.add('opportunities');
  else caveats.push('revenue_opportunities is absent, so Pilot proposed cannot be counted.');

  if (!(await tableExists('delivery_contracts'))) {
    caveats.push('delivery_contracts is absent, so Contract and Expansion cannot be counted.');
  }

  return { available, caveats };
}

const countableNow = (s: FunnelStage, available: Set<string>): boolean => {
  if (s.evidence === 'absent') return false;
  if (s.n === 1) return true;
  if (s.n === 2) return available.has('mapped');
  if (s.n >= 3 && s.n <= 5) return available.has('outcomes');
  if (s.n === 7) return available.has('opportunities');
  return false; // 8 and 10 need delivery_contracts, 9 has no source at all
};

/** The whole funnel, with a null wherever a number would be a guess. */
export async function getFunnelSnapshot(): Promise<FunnelSnapshot> {
  const { available, caveats } = await availableEvidence();
  const ids = await targetAccountIds();
  const furthest = await furthestStageByAccount(ids, available);

  const stages: StageCount[] = FUNNEL_STAGES.map((s) => {
    if (!countableNow(s, available)) {
      return {
        n: s.n, key: s.key, label: s.label, evidence: s.evidence,
        accountsAtStage: null, accountsReached: null,
        note: s.evidence === 'absent'
          ? 'No source records this, so it is not counted rather than counted as zero.'
          : 'The source for this stage is not available in this database yet.',
      };
    }
    let at = 0;
    let reached = 0;
    for (const n of furthest.values()) {
      if (n === s.n) at += 1;
      if (n >= s.n) reached += 1;
    }
    return {
      n: s.n, key: s.key, label: s.label, evidence: s.evidence,
      accountsAtStage: at, accountsReached: reached,
    };
  });

  return {
    asOf: new Date().toISOString(),
    stages,
    totalAccounts: ids.length,
    attributionAvailable: available.has('outcomes'),
    caveats,
  };
}
