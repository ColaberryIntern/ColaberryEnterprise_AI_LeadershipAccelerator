import { Op, fn, col, literal } from 'sequelize';
import {
  Organization,
  OrgMember,
  OrgCohort,
  Enrollment,
  Cohort,
  Lead,
} from '../models';
import type { OrganizationStatus } from '../models/Organization';
import { sequelize } from '../config/database';

/**
 * adminOrgService — staff-side read/write for business accounts.
 *
 * WHY THIS FILE EXISTS. Before it, an admin could not see business accounts at
 * all. Every `/api/portal/org/*` route is participant-scoped: `requireOrgManager`
 * resolves the organization from the *requesting person's own* enrollment, so it
 * structurally cannot answer "show me every company" or "show me company X". No
 * `/api/admin/org*` route existed. This is the staff-side counterpart, and it is
 * deliberately a separate service rather than a widened `orgService`, so that
 * loosening a scope here can never leak into the manager-facing path.
 *
 * AUTHORIZATION IS NOT DONE HERE. These functions assume the caller is already
 * an authenticated admin; the route layer enforces that with `requireAdmin`.
 * Nothing in this file should ever be reachable from a participant token.
 */

export interface OrgListRow {
  id: string;
  name: string;
  status: OrganizationStatus;
  auto_staff_sync: boolean;
  created_at: Date;
  owner_email: string | null;
  owner_name: string | null;
  member_count: number;
  active_member_count: number;
  cohort_count: number;
  lead_id: number | null;
}

export interface OrgListResult {
  organizations: OrgListRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ListOrgParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrganizationStatus;
}

/**
 * List business accounts with their rollups.
 *
 * Counts come from one grouped query rather than N+1 per-org lookups: the roster
 * and cohort-link counts are the two numbers this page exists to show, so
 * fetching them per row would make the list cost scale with the number of
 * companies.
 */
export async function listOrganizations(params: ListOrgParams = {}): Promise<OrgListResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.search && params.search.trim()) {
    where.name = { [Op.iLike]: `%${params.search.trim()}%` };
  }

  const { rows, count } = await Organization.findAndCountAll({
    where,
    include: [
      {
        model: Enrollment,
        as: 'owner',
        attributes: ['id', 'email', 'full_name'],
        required: false,
      },
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset,
    // findAndCountAll with a hasMany include double-counts; the owner include is
    // belongsTo (one row), so `count` stays correct without distinct here.
    subQuery: false,
  });

  const orgIds = rows.map((r) => r.id);
  const [memberCounts, cohortCounts] = await Promise.all([
    countMembersByOrg(orgIds),
    countCohortsByOrg(orgIds),
  ]);

  const organizations: OrgListRow[] = rows.map((org) => {
    const owner = (org as unknown as { owner?: { email?: string; full_name?: string } }).owner;
    const counts = memberCounts.get(org.id) ?? { total: 0, active: 0 };
    return {
      id: org.id,
      name: org.name,
      status: org.status ?? 'active',
      auto_staff_sync: org.auto_staff_sync,
      created_at: org.created_at,
      owner_email: owner?.email ?? null,
      owner_name: owner?.full_name ?? null,
      member_count: counts.total,
      active_member_count: counts.active,
      cohort_count: cohortCounts.get(org.id) ?? 0,
      lead_id: org.lead_id ?? null,
    };
  });

  return {
    organizations,
    total: count,
    page,
    totalPages: Math.max(1, Math.ceil(count / limit)),
  };
}

async function countMembersByOrg(
  orgIds: string[],
): Promise<Map<string, { total: number; active: number }>> {
  const out = new Map<string, { total: number; active: number }>();
  if (!orgIds.length) return out;

  const rows = (await OrgMember.findAll({
    attributes: [
      'org_id',
      [fn('COUNT', col('id')), 'total'],
      [fn('COUNT', literal(`CASE WHEN invite_status = 'active' THEN 1 END`)), 'active'],
    ],
    where: { org_id: { [Op.in]: orgIds } },
    group: ['org_id'],
    raw: true,
  })) as unknown as { org_id: string; total: string; active: string }[];

  rows.forEach((r) => {
    out.set(r.org_id, { total: Number(r.total) || 0, active: Number(r.active) || 0 });
  });
  return out;
}

async function countCohortsByOrg(orgIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!orgIds.length) return out;

  const rows = (await OrgCohort.findAll({
    attributes: ['org_id', [fn('COUNT', col('id')), 'total']],
    where: { org_id: { [Op.in]: orgIds } },
    group: ['org_id'],
    raw: true,
  })) as unknown as { org_id: string; total: string }[];

  rows.forEach((r) => out.set(r.org_id, Number(r.total) || 0));
  return out;
}

export interface OrgDetail {
  organization: {
    id: string;
    name: string;
    status: OrganizationStatus;
    auto_staff_sync: boolean;
    created_at: Date;
    status_changed_at: Date | null;
    status_changed_by: string | null;
  };
  owner: { id: string; email: string; full_name: string } | null;
  /** The lead this account came from, if one is linked or matchable by email. */
  lead: { id: number; email: string; company: string | null; status: string; source: string | null } | null;
  members: {
    id: string;
    email: string;
    role: string;
    team: string | null;
    invite_status: string;
    joined_at: Date | null;
    enrollment_id: string | null;
    cohort_id: string | null;
  }[];
  cohorts: {
    link_id: string;
    cohort_id: string;
    name: string;
    start_date: Date | null;
    status: string | null;
    seats_sponsored: number | null;
    /** Members of THIS org actually placed in this cohort (enrollments.cohort_id). */
    members_placed: number;
  }[];
  stats: {
    member_count: number;
    active_member_count: number;
    invited_member_count: number;
    manager_count: number;
    cohort_count: number;
    members_with_cohort: number;
    members_without_cohort: number;
  };
}

/**
 * Full detail for one business account.
 *
 * NOTE ON `members_placed` vs `seats_sponsored`: these are different facts and
 * the page shows both. `seats_sponsored` is what the company committed to;
 * `members_placed` counts roster members whose *enrollment* actually sits in that
 * cohort. Linking a cohort to an org does not move anybody into it (see
 * models/OrgCohort.ts), so the two numbers legitimately differ and collapsing
 * them would hide unfilled seats.
 */
export async function getOrganizationDetail(orgId: string): Promise<OrgDetail | null> {
  const org = await Organization.findByPk(orgId, {
    include: [
      { model: Enrollment, as: 'owner', attributes: ['id', 'email', 'full_name'], required: false },
    ],
  });
  if (!org) return null;

  const members = await OrgMember.findAll({
    where: { org_id: orgId },
    include: [
      {
        model: Enrollment,
        as: 'enrollment',
        attributes: ['id', 'cohort_id'],
        required: false,
      },
    ],
    order: [
      ['role', 'ASC'],
      ['email', 'ASC'],
    ],
  });

  const cohortLinks = await OrgCohort.findAll({
    where: { org_id: orgId },
    include: [
      {
        model: Cohort,
        as: 'cohort',
        attributes: ['id', 'name', 'start_date', 'status'],
        required: false,
      },
    ],
    order: [['created_at', 'DESC']],
  });

  const memberRows = members.map((m) => {
    const enr = (m as unknown as { enrollment?: { id?: string; cohort_id?: string | null } })
      .enrollment;
    return {
      id: m.id,
      email: m.email,
      role: m.role,
      team: m.team ?? null,
      invite_status: m.invite_status,
      joined_at: m.joined_at ?? null,
      enrollment_id: enr?.id ?? null,
      cohort_id: enr?.cohort_id ?? null,
    };
  });

  const placedByCohort = new Map<string, number>();
  memberRows.forEach((m) => {
    if (m.cohort_id) placedByCohort.set(m.cohort_id, (placedByCohort.get(m.cohort_id) ?? 0) + 1);
  });

  // The lead: prefer the explicit link, fall back to the owner's email. The
  // fallback exists because registration historically wrote the org and the lead
  // through two independent calls with nothing joining them but the address.
  const ownerRec = (org as unknown as { owner?: { email?: string } }).owner;
  let leadRow = null;
  if (org.lead_id) {
    leadRow = await Lead.findByPk(org.lead_id);
  } else if (ownerRec?.email) {
    leadRow = await Lead.findOne({ where: { email: ownerRec.email.toLowerCase() } });
  }

  const owner = (org as unknown as {
    owner?: { id: string; email: string; full_name: string };
  }).owner;

  return {
    organization: {
      id: org.id,
      name: org.name,
      status: org.status ?? 'active',
      auto_staff_sync: org.auto_staff_sync,
      created_at: org.created_at,
      status_changed_at: org.status_changed_at ?? null,
      status_changed_by: org.status_changed_by ?? null,
    },
    owner: owner ? { id: owner.id, email: owner.email, full_name: owner.full_name } : null,
    lead: leadRow
      ? {
          id: (leadRow as unknown as { id: number }).id,
          email: (leadRow as unknown as { email: string }).email,
          company: (leadRow as unknown as { company: string | null }).company ?? null,
          status: (leadRow as unknown as { status: string }).status,
          source: (leadRow as unknown as { source: string | null }).source ?? null,
        }
      : null,
    members: memberRows,
    cohorts: cohortLinks.map((link) => {
      const c = (link as unknown as {
        cohort?: { id: string; name: string; start_date: Date | null; status: string | null };
      }).cohort;
      return {
        link_id: link.id,
        cohort_id: link.cohort_id,
        name: c?.name ?? '(cohort removed)',
        start_date: c?.start_date ?? null,
        status: c?.status ?? null,
        seats_sponsored: link.seats_sponsored ?? null,
        members_placed: placedByCohort.get(link.cohort_id) ?? 0,
      };
    }),
    stats: {
      member_count: memberRows.length,
      active_member_count: memberRows.filter((m) => m.invite_status === 'active').length,
      invited_member_count: memberRows.filter((m) => m.invite_status === 'invited').length,
      manager_count: memberRows.filter((m) => m.role === 'manager').length,
      cohort_count: cohortLinks.length,
      members_with_cohort: memberRows.filter((m) => m.cohort_id).length,
      members_without_cohort: memberRows.filter((m) => !m.cohort_id).length,
    },
  };
}

/**
 * Enable or disable a business account.
 *
 * Idempotent: setting the status it already has is a no-op that still returns the
 * row, so a double-clicked toggle cannot produce a second audit stamp or an error.
 */
export async function setOrganizationStatus(
  orgId: string,
  status: OrganizationStatus,
  changedBy: string,
): Promise<{ id: string; status: OrganizationStatus; changed: boolean } | null> {
  const org = await Organization.findByPk(orgId);
  if (!org) return null;

  if ((org.status ?? 'active') === status) {
    return { id: org.id, status, changed: false };
  }

  await org.update({
    status,
    status_changed_at: new Date(),
    status_changed_by: changedBy,
  });

  return { id: org.id, status, changed: true };
}

/**
 * Link a cohort to a business account.
 *
 * Idempotent by (org_id, cohort_id) — the unique index makes a repeat link a
 * no-op rather than a duplicate row. This records the company-level relationship
 * ONLY; it does not move any member into the cohort, because per-person placement
 * lives on enrollments.cohort_id and silently reassigning it would change what
 * curriculum a real person sees.
 */
export async function addCohortToOrganization(
  orgId: string,
  cohortId: string,
  seatsSponsored: number | null,
  addedBy: string,
): Promise<{ link_id: string; created: boolean } | { error: 'org_not_found' | 'cohort_not_found' }> {
  const [org, cohort] = await Promise.all([
    Organization.findByPk(orgId),
    Cohort.findByPk(cohortId),
  ]);
  if (!org) return { error: 'org_not_found' };
  if (!cohort) return { error: 'cohort_not_found' };

  const [link, created] = await OrgCohort.findOrCreate({
    where: { org_id: orgId, cohort_id: cohortId },
    defaults: {
      org_id: orgId,
      cohort_id: cohortId,
      seats_sponsored: seatsSponsored,
      added_by: addedBy,
    },
  });

  return { link_id: link.id, created };
}

export async function removeCohortFromOrganization(
  orgId: string,
  cohortId: string,
): Promise<boolean> {
  const deleted = await OrgCohort.destroy({ where: { org_id: orgId, cohort_id: cohortId } });
  return deleted > 0;
}

/**
 * Portfolio-level rollup for the list page header.
 *
 * Deliberately a single grouped query rather than several counts: these four
 * numbers are read together on every page load.
 */
export async function getOrganizationStats(): Promise<{
  total: number;
  active: number;
  suspended: number;
  with_cohorts: number;
}> {
  const [row] = (await sequelize.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active,
       COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM org_cohorts oc WHERE oc.org_id = organizations.id
       ))::int AS with_cohorts
     FROM organizations`,
    { type: (sequelize.constructor as unknown as { QueryTypes: { SELECT: string } }).QueryTypes.SELECT as never },
  )) as unknown as { total: number; active: number; suspended: number; with_cohorts: number }[];

  return row ?? { total: 0, active: 0, suspended: 0, with_cohorts: 0 };
}
