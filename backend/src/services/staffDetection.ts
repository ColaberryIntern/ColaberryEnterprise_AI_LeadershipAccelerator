/** Canonical "is this a real Colaberry team member" check, shared by every
 *  query that needs to carve staff out of revenue/funnel numbers. Requires
 *  the query to alias `enrollments` as `e` and LEFT JOIN
 *  `community_members cm ON cm.enrollment_id = e.id`.
 *
 *  Two signals, either one qualifies:
 *   1. A real `community_members.mgmt_role` — the same field
 *      `duplicateAccountSweepService` already trusts to protect staff
 *      accounts from auto-merge.
 *   2. A plain `name@colaberry.com` address. Ali's own test personas use a
 *      "+N" plus-alias (`ali+9@`, `ram+1@`, `ali+business@`, etc. —
 *      confirmed against every such row in production, 2026-07-31) and are
 *      deliberately NOT staff by this rule: those are test/demo data,
 *      handled by a separate withdrawal script, not this category. */
export const IS_STAFF_SQL =
  `(cm.mgmt_role IS NOT NULL OR (e.email ILIKE '%@colaberry.com' AND e.email NOT LIKE '%+%@colaberry.com'))`;
