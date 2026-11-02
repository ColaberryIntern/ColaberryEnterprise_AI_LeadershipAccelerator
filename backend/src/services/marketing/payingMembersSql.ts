import { IS_STAFF_SQL } from '../staffDetection';

/**
 * "Who is paying today", as SQL, in ONE place.
 *
 * The landing page Paying column, the campaign Paying column and the ad profitability report all
 * credit marketing with paying members. If each wrote its own definition, the same campaign could
 * show three different payer counts on one screen. The rule is Revenue health's Collectible MRR:
 * an active annual or monthly subscription whose paid period is running today, never staff. One
 * row per person (by email), carrying their monthly-equivalent MRR.
 */
export const PAYING_MEMBERS_CTE = `paying AS (
       SELECT DISTINCT ON (lower(btrim(e.email)))
              lower(btrim(e.email)) AS email,
              CASE WHEN s.plan = 'annual' THEN s.amount_cents / 1200.0 ELSE s.amount_cents / 100.0 END AS mrr
         FROM subscriptions s
         JOIN enrollments e ON e.id = s.enrollment_id
         LEFT JOIN community_members cm ON cm.enrollment_id = e.id
        WHERE s.plan IN ('annual', 'monthly')
          AND s.status = 'active'
          AND s.current_period_end >= now()
          AND e.email IS NOT NULL
          AND NOT ${IS_STAFF_SQL}
        ORDER BY lower(btrim(e.email)), s.current_period_end DESC
     )`;

/**
 * Cash each person has paid, net of refunds, keyed by email. Same money as the Revenue page's
 * "Cash collected" (memberships + deposits - refunds), but counted per CHARGE rather than read
 * from `enrollments.amount_paid`, which a renewal OVERWRITES with the latest charge.
 *
 *   paid terms     amount_cents x periods paid - applied_credit_cents
 *                  A reminder-link renewal is a new row (one period each). An AUTOPAY renewal
 *                  extends the SAME row's current_period_end (subscriptionScheduleService), so a
 *                  row's periods are its span divided by its cadence, rounded: one for a manual
 *                  term, N after N autopay charges. The credit discounted only the first charge.
 *   + deposits     every Open House $50 that was taken, including ones later VOIDED by a refund:
 *                  the refund row below takes it back, so dropping the voided credit as well would
 *                  subtract it twice.
 *   - refunds      succeeded refunds.
 *
 * A paid enrollment with no activated term (the missed-webhook gap) falls back to amount_paid, so a
 * real payment is not read as zero. Staff are excluded throughout.
 */
export const COLLECTED_CTE = `terms AS (
       SELECT lower(btrim(e.email)) AS email,
              SUM(s.amount_cents * CASE
                    WHEN s.current_period_end IS NULL THEN 1
                    ELSE GREATEST(1, ROUND(EXTRACT(EPOCH FROM (s.current_period_end - s.started_at)) / 86400.0
                                           / CASE WHEN s.plan = 'annual' THEN 365.25 ELSE 30.4375 END))
                  END
                  - COALESCE(s.applied_credit_cents, 0)) AS cents
         FROM subscriptions s
         JOIN enrollments e ON e.id = s.enrollment_id
         LEFT JOIN community_members cm ON cm.enrollment_id = e.id
        WHERE s.plan IN ('annual', 'monthly') AND s.started_at IS NOT NULL AND s.status <> 'failed'
          AND e.email IS NOT NULL AND NOT ${IS_STAFF_SQL}
        GROUP BY 1
     ),
     paid_enrollment AS (
       SELECT lower(btrim(e.email)) AS email, MAX(e.amount_paid) * 100 AS cents
         FROM enrollments e
         LEFT JOIN community_members cm ON cm.enrollment_id = e.id
        WHERE e.payment_status = 'paid' AND e.amount_paid > 0 AND e.email IS NOT NULL AND NOT ${IS_STAFF_SQL}
        GROUP BY 1
     ),
     deposits AS (
       SELECT lower(btrim(e.email)) AS email, SUM(ac.amount_cents) AS cents
         FROM account_credits ac
         JOIN enrollments e ON e.id = ac.enrollment_id
         LEFT JOIN community_members cm ON cm.enrollment_id = e.id
        WHERE ac.reason = 'open_house_deposit' AND ac.status IN ('available', 'applied', 'void')
          AND e.email IS NOT NULL AND NOT ${IS_STAFF_SQL}
        GROUP BY 1
     ),
     refunded AS (
       SELECT lower(btrim(r.customer_email)) AS email, SUM(r.amount_cents) AS cents
         FROM refunds r
        WHERE r.status = 'succeeded' AND r.customer_email IS NOT NULL
        GROUP BY 1
     ),
     first_paid AS (
       -- When each person first paid, to tell a new customer from an existing one who filled in
       -- a form again. The earliest activated term, else the paid enrollment's own date.
       SELECT email, MIN(at) AS at FROM (
         SELECT lower(btrim(e.email)) AS email, s.started_at AS at
           FROM subscriptions s JOIN enrollments e ON e.id = s.enrollment_id
          WHERE s.plan IN ('annual', 'monthly') AND s.started_at IS NOT NULL AND s.status <> 'failed' AND e.email IS NOT NULL
         UNION ALL
         SELECT lower(btrim(e.email)), COALESCE(e.enrolled_at, e.created_at)
           FROM enrollments e
          WHERE e.payment_status = 'paid' AND e.amount_paid > 0 AND e.email IS NOT NULL
       ) x
       GROUP BY email
     )`;

/** Collected cents for a person, given the alias their email column is under. Uses COLLECTED_CTE. */
export const collectedCentsFor = (emailExpr: string) => `(
       COALESCE((SELECT cents FROM terms t WHERE t.email = ${emailExpr}),
                (SELECT cents FROM paid_enrollment pe WHERE pe.email = ${emailExpr}), 0)
       + COALESCE((SELECT cents FROM deposits d WHERE d.email = ${emailExpr}), 0)
       - COALESCE((SELECT cents FROM refunded rf WHERE rf.email = ${emailExpr}), 0))`;
