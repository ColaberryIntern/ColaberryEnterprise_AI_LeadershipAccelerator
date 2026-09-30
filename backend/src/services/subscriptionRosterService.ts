import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { IS_STAFF_SQL } from './staffDetection';
import { pickBestDuplicate } from './emailIdentity';
import type { TenureRosterRow } from './subscriptionAnalyticsService';

/* ------------------------------------------------------------------ */
/*  The two /admin/revenue drill-down rosters that are independent of  */
/*  classifyAllMembers (subscriptionAnalyticsService.ts): Deposit       */
/*  Holder and Staff both query enrollments directly rather than        */
/*  through the paying-members classification, since staff span         */
/*  enrollment_type boundaries and deposit holders aren't paying         */
/*  members at all. Split into their own file once                     */
/*  subscriptionAnalyticsService.ts crossed this repo's 500-line file    */
/*  size ceiling (CLAUDE.md Modular Composition Rule).                  */
/* ------------------------------------------------------------------ */

/** Soonest-payment-last ordering, as requested: real dates sort descending
 *  (latest next-payment first); anyone with no next payment date (comp,
 *  lapsed, no period on record) sorts to the bottom, not the top. Duplicated
 *  from subscriptionAnalyticsService.ts (8 lines, pure) rather than shared
 *  via import, to keep this file and that one from depending on each other —
 *  CLAUDE.md's own composition rule tolerates duplication at exactly two
 *  call sites ("three is the threshold; two is sometimes a coincidence"). */
function sortByNextPaymentDesc(rows: TenureRosterRow[]): TenureRosterRow[] {
  return rows.sort((a, b) => {
    const at = a.next_payment_date ? new Date(a.next_payment_date).getTime() : -Infinity;
    const bt = b.next_payment_date ? new Date(b.next_payment_date).getTime() : -Infinity;
    return bt - at;
  });
}

/** Drill-down roster for the "Deposit Holder" category: Explorers who paid
 *  the $50 Open House deposit but haven't converted to a paying plan yet —
 *  the same population fetchExplorerCounts() counts, just as rows. Excludes
 *  staff and withdrawn rows, matching fetchExplorerCounts exactly. */
export async function getDepositHolderRoster(): Promise<TenureRosterRow[]> {
  const rows = (await sequelize.query(
    `SELECT e.id AS enrollment_id, e.full_name, e.email, e.created_at, ac.amount_cents
       FROM enrollments e
       LEFT JOIN community_members cm ON cm.enrollment_id = e.id
       JOIN account_credits ac ON ac.enrollment_id = e.id
      WHERE e.enrollment_type = 'explorer' AND e.status = 'active' AND NOT ${IS_STAFF_SQL}
        AND ac.reason = 'open_house_deposit' AND ac.status = 'available'`,
    { type: QueryTypes.SELECT }
  )) as Array<{ enrollment_id: string; full_name: string | null; email: string | null; created_at: string | null; amount_cents: number }>;

  const deduped = pickBestDuplicate(rows, (r) => ({
    email: r.email, hasActiveSubscription: false, paymentStatusPaid: false, isExplorer: true, createdAt: r.created_at,
  }));

  const roster: TenureRosterRow[] = deduped.map((r) => ({
    enrollment_id: r.enrollment_id,
    payer_name: r.full_name || r.email || '—',
    payer_email: r.email || '',
    plan: 'deposit_holder',
    monthly_amount: r.amount_cents / 100,
    member_since: r.created_at ? new Date(r.created_at).toISOString() : null,
    next_payment_date: null,
  }));
  return sortByNextPaymentDesc(roster);
}

/** Drill-down roster for the "Staff" category: real Colaberry team members,
 *  wherever they happen to sit (an Explorer-shaped internal signup, or a
 *  comped/paid enrollment) — a single unified query rather than reusing
 *  classifyAllMembers, since staff span enrollment_type boundaries that
 *  matter for other categories but not for this one. */
export async function getStaffRoster(): Promise<TenureRosterRow[]> {
  const rows = (await sequelize.query(
    `SELECT e.id AS enrollment_id, e.full_name, e.email, e.created_at, e.payment_status, e.enrollment_type
       FROM enrollments e
       LEFT JOIN community_members cm ON cm.enrollment_id = e.id
      WHERE e.status = 'active' AND ${IS_STAFF_SQL}`,
    { type: QueryTypes.SELECT }
  )) as Array<{ enrollment_id: string; full_name: string | null; email: string | null; created_at: string | null; payment_status: string | null; enrollment_type: string | null }>;

  // Real staff shouldn't show up twice just because their account has an
  // unresolved exact-email duplicate the merge sweep hasn't caught (confirmed
  // live: aleem@colaberry.com, sohail@colaberry.com — 2 active rows each).
  const deduped = pickBestDuplicate(rows, (r) => ({
    email: r.email,
    hasActiveSubscription: false, // not tracked at this query's grain; irrelevant for staff
    paymentStatusPaid: r.payment_status === 'paid',
    isExplorer: r.enrollment_type === 'explorer',
    createdAt: r.created_at,
  }));

  const roster: TenureRosterRow[] = deduped.map((r) => ({
    enrollment_id: r.enrollment_id,
    payer_name: r.full_name || r.email || '—',
    payer_email: r.email || '',
    plan: 'staff',
    monthly_amount: 0,
    member_since: r.created_at ? new Date(r.created_at).toISOString() : null,
    next_payment_date: null,
  }));
  return sortByNextPaymentDesc(roster);
}
