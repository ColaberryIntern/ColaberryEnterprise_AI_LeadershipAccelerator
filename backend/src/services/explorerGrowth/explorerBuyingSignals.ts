import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * Explorer Growth — buying signals, readable and NEVER scored. C100.
 *
 * Two facts the C91 audit found and nothing recorded where Explorer Growth or Maya could see them:
 *   - an abandoned checkout: a `pending` subscription with no payment, and no paid one since (4 ad Explorers started
 *     checkout within minutes of signing up, 3 on the annual plan, and stopped);
 *   - an enroll-link click: the "Enroll to unlock" link to the subscription tab (101 ad Explorers on their first page).
 *
 * WHY A SEPARATE READER, NOT TWO MORE ROWS IN `explorerSignalReader`. Everything that reader returns is weighted into
 * the E/I/F scores, and the scores drive the primary state, the overlays and therefore the Governor's candidates. A
 * new weighted signal would move learners between send pools, and this ticket is "no new sends": whether and how to
 * follow up stays with Explorer Growth and Maya. So these are read live for the learner view and feed nothing.
 *
 * WHY THE CLICK JOINS THROUGH visitor_sessions. The link click is a plain `click` page event. Measured 2026-11-02
 * (prod, since 19 Oct): 147 such clicks, only 22 carrying `page_events.lead_id`; 113 more reach the lead only through
 * their visitor session. Reading `page_events.lead_id` alone would miss most of them.
 *
 * Failure: each read degrades to an empty signal with a structured warning, so one unavailable table cannot take the
 * learner view down (the same rule as the scored reader's runSource).
 */

/** A checkout younger than this may still be completing; it is not abandoned yet. */
export const CHECKOUT_GRACE_MINUTES = 30;

/** The href the "Enroll to unlock" link carries (Settings, subscription tab). */
export const ENROLL_LINK_HREF_PATTERN = '%tab=subscription%';

export interface BuyingSignal {
  count: number;
  last_at: string | null;
}

export interface BuyingSignals {
  checkout_abandoned: BuyingSignal & { plans: string[] };
  enroll_link_click: BuyingSignal;
  /** Sources that failed to read; the matching signal is reported as 0 and must not be read as "none". */
  unavailable: Array<'checkout_abandoned' | 'enroll_link_click'>;
}

interface CheckoutRow { n: string | number; last_at: Date | string | null; plans: string[] | null }
interface ClickRow { n: string | number; last_at: Date | string | null }

const CHECKOUT_SQL = `
  SELECT count(*) AS n, max(s.created_at) AS last_at, array_remove(array_agg(DISTINCT s.plan), NULL) AS plans
  FROM subscriptions s
  WHERE s.enrollment_id = :enrollmentId
    AND s.status = 'pending'
    AND s.paysimple_payment_id IS NULL
    AND s.created_at < CAST(:asOf AS timestamptz) - make_interval(mins => :graceMinutes)
    AND NOT EXISTS (
      SELECT 1 FROM subscriptions paid
      WHERE paid.enrollment_id = s.enrollment_id AND paid.status = 'active' AND paid.plan <> 'comp')`;

const CLICK_SQL = `
  SELECT count(*) AS n, max(c.ts) AS last_at FROM (
    SELECT p.id, p.timestamp AS ts FROM page_events p
    WHERE p.lead_id = :leadId AND p.event_data->>'href' LIKE :hrefPattern
    UNION
    SELECT p.id, p.timestamp FROM page_events p JOIN visitor_sessions v ON v.id = p.session_id
    WHERE v.lead_id = :leadId AND p.event_data->>'href' LIKE :hrefPattern
  ) c WHERE c.ts <= CAST(:asOf AS timestamptz)`;

const iso = (v: Date | string | null): string | null => (v ? new Date(v).toISOString() : null);

/** One read.  on success (row undefined = no rows, which is zero, not unknown); null when it failed. */
async function readOne<T>(label: string, enrollmentId: string, run: () => Promise<T[]>): Promise<{ row: T | undefined } | null> {
  try {
    const [row] = await run();
    return { row };
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.warn(JSON.stringify({
      event: 'explorer.buying_signal.read_failed', service: 'explorer-growth', level: 'warn', outcome: 'partial',
      error_class: e?.name || 'BuyingSignalReadError', source: label, enrollment_id: enrollmentId, detail: e?.message,
    }));
    return null;
  }
}

/** Read both buying signals for one learner. `leadId` null (identity not bridged) means no click can be attributed. */
export async function readBuyingSignals(
  enrollmentId: string,
  leadId: number | null,
  options: { asOf?: Date } = {},
): Promise<BuyingSignals> {
  const asOf = (options.asOf ?? new Date()).toISOString();
  const unavailable: BuyingSignals['unavailable'] = [];

  const checkoutRead = await readOne<CheckoutRow>('checkout_abandoned', enrollmentId, () =>
    sequelize.query<CheckoutRow>(CHECKOUT_SQL, {
      replacements: { enrollmentId, asOf, graceMinutes: CHECKOUT_GRACE_MINUTES }, type: QueryTypes.SELECT,
    }));
  if (!checkoutRead) unavailable.push('checkout_abandoned');
  const checkout = checkoutRead?.row;

  let click: ClickRow | undefined;
  if (leadId !== null) {
    const clickRead = await readOne<ClickRow>('enroll_link_click', enrollmentId, () =>
      sequelize.query<ClickRow>(CLICK_SQL, {
        replacements: { leadId, asOf, hrefPattern: ENROLL_LINK_HREF_PATTERN }, type: QueryTypes.SELECT,
      }));
    if (!clickRead) unavailable.push('enroll_link_click');
    click = clickRead?.row;
  }

  return {
    checkout_abandoned: { count: Number(checkout?.n ?? 0), last_at: iso(checkout?.last_at ?? null), plans: checkout?.plans ?? [] },
    enroll_link_click: { count: Number(click?.n ?? 0), last_at: iso(click?.last_at ?? null) },
    unavailable,
  };
}
