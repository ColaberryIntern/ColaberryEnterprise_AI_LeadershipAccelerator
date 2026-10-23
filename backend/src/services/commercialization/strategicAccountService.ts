/**
 * C8.3 — strategic accounts inside the existing data universe, not beside it.
 *
 * THE WHOLE TICKET IS THE AMBIGUOUS CASE. C8.3 names what would make this untrustworthy:
 * "silent duplication", and requires that deduplication be proven by test. The obvious
 * reading is "do not create a second account table" — but the real hazard, measured on
 * production 2026-10-23, is subtler and already present:
 *
 *   THREE organizations are named exactly "Colaberry" (22 members, 1 member with
 *   lead 24472, and 1 member). TWELVE leads carry the company text "Colaberry".
 *
 * So a backfill of the obvious form
 *
 *   UPDATE leads SET organization_id = o.id FROM organizations o
 *   WHERE lower(trim(leads.company)) = lower(trim(o.name))
 *
 * does not fail. It silently picks one of the three and makes it authoritative for all
 * twelve, and nothing downstream can tell that happened. That is the silent duplication,
 * and it arrives through a JOIN rather than through a CREATE TABLE.
 *
 * The rule here is therefore: AN AMBIGUOUS NAME IS NEVER RESOLVED. It is reported.
 * `organization_id` stays null, which is honest, instead of pointing at a coin flip.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/** The value `organizations.organization_type` carries for a commercial target account. */
export const STRATEGIC_ACCOUNT_TYPE = 'strategic_account';

export interface AccountCandidate {
  id: string;
  name: string;
  organizationType: string | null;
  memberCount: number;
}

export type AccountResolution =
  | { status: 'matched'; account: AccountCandidate }
  | { status: 'ambiguous'; candidates: AccountCandidate[] }
  | { status: 'none' };

/**
 * Fold a company name to a comparison key.
 *
 * Deliberately conservative. An aggressive normalizer that strips "Inc", "LLC" and
 * punctuation would merge genuinely distinct organizations, and merging two real
 * accounts is worse than leaving two spellings unlinked: the first loses data silently,
 * the second shows up as an unlinked row somebody can fix.
 */
export function normalizeAccountName(name: string | null | undefined): string {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Every organization whose name folds to the same key. */
export async function findAccountsByName(name: string): Promise<AccountCandidate[]> {
  const key = normalizeAccountName(name);
  if (!key) return [];

  const rows = await sequelize.query<{
    id: string; name: string; organization_type: string | null; members: number;
  }>(
    `SELECT o.id, o.name, o.organization_type,
            (SELECT COUNT(*) FROM org_members m WHERE m.org_id = o.id)::int AS members
     FROM organizations o
     WHERE lower(regexp_replace(btrim(o.name), '\\s+', ' ', 'g')) = :key
     ORDER BY members DESC, o.name ASC`,
    { type: QueryTypes.SELECT, replacements: { key } },
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    organizationType: r.organization_type,
    memberCount: Number(r.members),
  }));
}

/**
 * Resolve a company name to at most one account.
 *
 * Returns `ambiguous` rather than guessing. Callers must handle it; there is deliberately
 * no "pick the biggest" fallback, because member count is a learner-org signal and says
 * nothing about which row is the right COMMERCIAL account.
 */
export async function resolveAccount(name: string): Promise<AccountResolution> {
  const candidates = await findAccountsByName(name);
  if (candidates.length === 0) return { status: 'none' };
  if (candidates.length === 1) return { status: 'matched', account: candidates[0] };
  return { status: 'ambiguous', candidates };
}

export type LinkOutcome =
  | { linked: true; organizationId: string }
  | { linked: false; reason: 'ambiguous'; candidates: AccountCandidate[] }
  | { linked: false; reason: 'no_match' | 'no_company' };

/**
 * Link one lead to its account by company text, refusing anything ambiguous.
 *
 * Idempotent: linking an already-linked lead to the same account is a no-op write and
 * returns the same result, so a re-run of the backfill changes nothing.
 */
export async function linkLeadToAccount(leadId: number): Promise<LinkOutcome> {
  const rows = await sequelize.query<{ company: string | null }>(
    `SELECT company FROM leads WHERE id = :leadId`,
    { type: QueryTypes.SELECT, replacements: { leadId } },
  );
  const company = rows[0]?.company;
  if (!normalizeAccountName(company)) return { linked: false, reason: 'no_company' };

  const resolution = await resolveAccount(company as string);
  if (resolution.status === 'none') return { linked: false, reason: 'no_match' };
  if (resolution.status === 'ambiguous') {
    return { linked: false, reason: 'ambiguous', candidates: resolution.candidates };
  }

  await sequelize.query(
    `UPDATE leads SET organization_id = :orgId WHERE id = :leadId`,
    { replacements: { orgId: resolution.account.id, leadId } },
  );
  return { linked: true, organizationId: resolution.account.id };
}

export interface BackfillReport {
  examined: number;
  linked: number;
  /** Names that matched more than one organization. These are the rows a human must settle. */
  ambiguous: Array<{ company: string; leads: number; candidates: AccountCandidate[] }>;
  unmatched: number;
  dryRun: boolean;
}

/**
 * Seed `leads.organization_id` from the existing company text.
 *
 * Only unambiguous names are written. Ambiguous ones are COUNTED AND RETURNED so the
 * collision is visible as a number rather than disappearing into a join, which is the
 * difference between this and the one-line UPDATE in the file header.
 */
export async function backfillLeadOrganizations(
  opts: { dryRun?: boolean } = {},
): Promise<BackfillReport> {
  const dryRun = opts.dryRun !== false; // writing is opt-in, never the default
  const report: BackfillReport = {
    examined: 0, linked: 0, ambiguous: [], unmatched: 0, dryRun,
  };

  // Group by the fold key so each distinct company name is resolved once rather than
  // once per lead, and so an ambiguous name is reported once with its lead count.
  const groups = await sequelize.query<{ key: string; sample: string; leads: number }>(
    `SELECT lower(regexp_replace(btrim(company), '\\s+', ' ', 'g')) AS key,
            MIN(company) AS sample, COUNT(*)::int AS leads
     FROM leads
     WHERE company IS NOT NULL AND btrim(company) <> ''
     GROUP BY 1`,
    { type: QueryTypes.SELECT },
  );

  for (const g of groups) {
    report.examined += Number(g.leads);
    const resolution = await resolveAccount(g.sample);

    if (resolution.status === 'none') { report.unmatched += Number(g.leads); continue; }

    if (resolution.status === 'ambiguous') {
      report.ambiguous.push({
        company: g.sample, leads: Number(g.leads), candidates: resolution.candidates,
      });
      continue; // organization_id stays null. This is the guarantee.
    }

    if (!dryRun) {
      await sequelize.query(
        `UPDATE leads SET organization_id = :orgId
         WHERE lower(regexp_replace(btrim(company), '\\s+', ' ', 'g')) = :key
           AND (organization_id IS DISTINCT FROM :orgId)`,
        { replacements: { orgId: resolution.account.id, key: g.key } },
      );
    }
    report.linked += Number(g.leads);
  }

  return report;
}

export type PromoteOutcome =
  | { promoted: true; organizationId: string; created: boolean }
  | { promoted: false; reason: 'ambiguous'; candidates: AccountCandidate[] };

/**
 * Mark an organization as a strategic account, creating one only if none exists.
 *
 * This is the other half of the dedup guarantee and the one that would create the
 * parallel universe outright: calling `INSERT` without looking first is how a tenth
 * "Colaberry" appears. An ambiguous name refuses rather than adding to the pile; the
 * caller must pass the id it means.
 */
export async function promoteToStrategicAccount(name: string): Promise<PromoteOutcome> {
  const resolution = await resolveAccount(name);

  if (resolution.status === 'ambiguous') {
    return { promoted: false, reason: 'ambiguous', candidates: resolution.candidates };
  }

  if (resolution.status === 'matched') {
    await sequelize.query(
      `UPDATE organizations SET organization_type = :t, updated_at = NOW()
       WHERE id = :id AND organization_type IS DISTINCT FROM :t`,
      { replacements: { t: STRATEGIC_ACCOUNT_TYPE, id: resolution.account.id } },
    );
    return { promoted: true, organizationId: resolution.account.id, created: false };
  }

  const inserted = await sequelize.query<{ id: string }>(
    `INSERT INTO organizations (name, organization_type, status, created_at, updated_at)
     VALUES (:name, :t, 'active', NOW(), NOW())
     RETURNING id`,
    { type: QueryTypes.SELECT, replacements: { name: String(name).trim(), t: STRATEGIC_ACCOUNT_TYPE } },
  );
  return { promoted: true, organizationId: inserted[0].id, created: true };
}
