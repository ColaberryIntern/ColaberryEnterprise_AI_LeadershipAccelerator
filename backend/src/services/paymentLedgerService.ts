import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { env } from '../config/env';
import { listPayments, getCustomerById } from './paysimpleService';
import type { PaySimplePayment } from './paysimpleService';
import { isCollected, normalizeStatus } from './paymentSyncService';

/* ------------------------------------------------------------------ */
/*  Payment ledger sync — the source of truth for Accelerator revenue  */
/*                                                                     */
/*  Pulls Accelerator payments from PaySimple and upserts them into the */
/*  `payments` table (one row per PaySimple payment, keyed on the       */
/*  payment id). Revenue = SUM(amount_cents WHERE is_live)/100, so a    */
/*  status flip (Posted -> ReverseNSF/Returned/Failed) automatically    */
/*  removes the payment from revenue on the next sync — "revenue until  */
/*  the payment fails, then subtracted."                                */
/*                                                                     */
/*  The gateway is SHARED with the bootcamp, so only recognized         */
/*  Accelerator amounts are ingested (a $50 deposit + the membership    */
/*  dollars in config). Bootcamp tuition ($250 installments, etc.) is   */
/*  never counted. For a live membership payment whose payer has no      */
/*  platform account, the sync creates a member enrollment (authorized  */
/*  reconciliation decision) and links the payment to it.               */
/*                                                                     */
/*  Idempotent: upsert on paysimple_payment_id (a re-run only writes on  */
/*  a real change); member creation is guarded by the email lookup and   */
/*  the unique paysimple_payment_id, so it cannot duplicate people.      */
/* ------------------------------------------------------------------ */

const DEPOSIT_CENTS = Math.round(env.paysimpleDepositDollars * 100);
const MEMBERSHIP_CENTS = new Set(env.paysimpleMembershipDollars.map((d) => Math.round(d * 100)));

export type LedgerPaymentType = 'membership' | 'deposit';

/** Classify a PaySimple amount as an Accelerator product, or null to skip it
 *  (bootcamp tuition and other shared-gateway charges return null). */
export function classifyAmount(amountCents: number): LedgerPaymentType | null {
  if (amountCents === DEPOSIT_CENTS) return 'deposit';
  if (MEMBERSHIP_CENTS.has(amountCents)) return 'membership';
  return null;
}

export interface LedgerSyncSummary {
  skipped?: boolean;
  reason?: string;
  dryRun: boolean;
  scanned: number;          // payments pulled from PaySimple in the window
  accelerator: number;      // matched Accelerator amounts (deposit + membership)
  inserted: number;         // new ledger rows
  updated: number;          // existing rows whose status/amount/link changed
  unchanged: number;
  accountsCreated: number;  // member enrollments created for no-account payers
  enrollmentsUpdated: number;
  liveCount: number;
  deadCount: number;
  liveTotalCents: number;
  membershipLiveCents: number;
  depositLiveCents: number;
}

interface Payer {
  email: string | null;
  name: string | null;
}

/* ---- customer resolution (batch, cached) ---- */
async function resolvePayers(customerIds: number[]): Promise<Map<number, Payer>> {
  const out = new Map<number, Payer>();
  const unique = [...new Set(customerIds.filter((id) => id != null))];
  const BATCH = 8;
  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (cid) => {
        try {
          const c = await getCustomerById(cid);
          out.set(cid, {
            email: c?.Email ? c.Email.toLowerCase().trim() : null,
            name: c ? `${c.FirstName || ''} ${c.LastName || ''}`.trim() || null : null,
          });
        } catch {
          out.set(cid, { email: null, name: null });
        }
      })
    );
  }
  return out;
}

/* ---- enrollment lookup + member creation ---- */
async function findEnrollmentsByEmail(emails: string[]): Promise<Map<string, { id: string; payment_status: string; amount_paid: number | null }>> {
  const out = new Map<string, { id: string; payment_status: string; amount_paid: number | null }>();
  const uniq = [...new Set(emails.filter(Boolean))];
  if (uniq.length === 0) return out;
  const rows = (await sequelize.query(
    `SELECT DISTINCT ON (lower(email)) lower(email) AS email, id, payment_status, amount_paid::float8 AS amount_paid
       FROM enrollments WHERE lower(email) IN (:emails)
      ORDER BY lower(email), created_at ASC`,
    { replacements: { emails: uniq }, type: QueryTypes.SELECT }
  )) as any[];
  for (const r of rows) out.set(r.email, { id: r.id, payment_status: r.payment_status, amount_paid: r.amount_paid });
  return out;
}

/** Create a member enrollment for a membership payer with no platform account.
 *  Idempotent via WHERE NOT EXISTS on email + payment id (enrollments has no
 *  UNIQUE on paysimple_payment_id, so ON CONFLICT is not usable here). Returns
 *  the new enrollment id, or null if one already existed (concurrent run / retry). */
async function createMemberEnrollment(p: {
  name: string | null;
  email: string;
  amountDollars: number;
  customerId: number | null;
  paymentId: string;
}): Promise<string | null> {
  const rows = (await sequelize.query(
    `INSERT INTO enrollments
       (id, full_name, email, company, enrollment_type, tier, payment_status, payment_method,
        payment_mode, amount_paid, paysimple_customer_id, paysimple_payment_id, enrolled_at, created_at)
     SELECT gen_random_uuid(), :name, :email, 'Individual Member', 'standard', 'member', 'paid', 'ach',
            'live', :amount, :cid, :pid, NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM enrollments WHERE lower(email) = lower(:email) OR paysimple_payment_id = :pid
      )
     RETURNING id`,
    {
      replacements: {
        name: p.name || p.email,
        email: p.email,
        amount: p.amountDollars,
        cid: p.customerId != null ? String(p.customerId) : null,
        pid: p.paymentId,
      },
      type: QueryTypes.SELECT,
    }
  )) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

/* ---- ledger upsert ---- */
async function upsertPayment(row: {
  paymentId: string;
  customerId: number | null;
  email: string | null;
  name: string | null;
  amountCents: number;
  status: string;
  isLive: boolean;
  type: LedgerPaymentType;
  date: Date | null;
  enrollmentId: string | null;
  raw: unknown;
}): Promise<'inserted' | 'updated' | 'unchanged'> {
  const result = (await sequelize.query(
    `INSERT INTO payments
       (id, paysimple_payment_id, paysimple_customer_id, payer_email, payer_name,
        amount_cents, status, is_live, payment_type, payment_date, enrollment_id, raw, synced_at, created_at, updated_at)
     VALUES
       (gen_random_uuid(), :pid, :cid, :email, :name, :amount, :status, :isLive, :type, :date, :enr, CAST(:raw AS JSONB), NOW(), NOW(), NOW())
     ON CONFLICT (paysimple_payment_id) DO UPDATE SET
       status = EXCLUDED.status,
       is_live = EXCLUDED.is_live,
       amount_cents = EXCLUDED.amount_cents,
       payer_email = COALESCE(EXCLUDED.payer_email, payments.payer_email),
       payer_name = COALESCE(EXCLUDED.payer_name, payments.payer_name),
       payment_type = EXCLUDED.payment_type,
       payment_date = COALESCE(EXCLUDED.payment_date, payments.payment_date),
       enrollment_id = COALESCE(payments.enrollment_id, EXCLUDED.enrollment_id),
       raw = EXCLUDED.raw,
       synced_at = NOW(),
       updated_at = NOW()
     WHERE
       payments.status IS DISTINCT FROM EXCLUDED.status
       OR payments.is_live IS DISTINCT FROM EXCLUDED.is_live
       OR payments.amount_cents IS DISTINCT FROM EXCLUDED.amount_cents
       OR payments.enrollment_id IS DISTINCT FROM COALESCE(payments.enrollment_id, EXCLUDED.enrollment_id)
     RETURNING (xmax = 0) AS inserted`,
    {
      replacements: {
        pid: row.paymentId,
        cid: row.customerId != null ? String(row.customerId) : null,
        email: row.email,
        name: row.name,
        amount: row.amountCents,
        status: row.status,
        isLive: row.isLive,
        type: row.type,
        date: row.date,
        enr: row.enrollmentId,
        raw: JSON.stringify(row.raw ?? null),
      },
      type: QueryTypes.SELECT,
    }
  )) as Array<{ inserted: boolean }>;
  if (result.length === 0) return 'unchanged';
  return result[0].inserted ? 'inserted' : 'updated';
}

/* ----------------------------- sync ------------------------------- */

export async function syncPaymentLedger(opts?: { dryRun?: boolean; sinceISO?: string }): Promise<LedgerSyncSummary> {
  const dryRun = opts?.dryRun ?? false;
  const s: LedgerSyncSummary = {
    dryRun, scanned: 0, accelerator: 0, inserted: 0, updated: 0, unchanged: 0,
    accountsCreated: 0, enrollmentsUpdated: 0, liveCount: 0, deadCount: 0,
    liveTotalCents: 0, membershipLiveCents: 0, depositLiveCents: 0,
  };

  if (!env.paysimpleApiUser || !env.paysimpleApiKey) {
    console.warn('[PaymentLedger] skipped — PaySimple API credentials not configured');
    return { ...s, skipped: true, reason: 'missing_credentials' };
  }

  const since = new Date(opts?.sinceISO || env.paysimpleLedgerStart);
  const payments: PaySimplePayment[] = await listPayments({ since });
  s.scanned = payments.length;

  // Keep only recognized Accelerator amounts.
  const accel = payments
    .map((p) => ({ p, type: classifyAmount(Math.round(Number(p.Amount) * 100)) }))
    .filter((x): x is { p: PaySimplePayment; type: LedgerPaymentType } => x.type !== null);
  s.accelerator = accel.length;

  // Resolve payer email/name for every Accelerator payment.
  const payers = await resolvePayers(accel.map((x) => x.p.CustomerId!).filter((id) => id != null));
  const rows = accel.map(({ p, type }) => {
    const payer = (p.CustomerId != null ? payers.get(p.CustomerId) : null) || { email: null, name: null };
    return {
      p, type,
      amountCents: Math.round(Number(p.Amount) * 100),
      status: p.Status,
      isLive: isCollected(normalizeStatus(p.Status)),
      email: payer.email,
      name: payer.name || `${p.CustomerFirstName || ''} ${p.CustomerLastName || ''}`.trim() || null,
      date: p.PaymentDate ? new Date(p.PaymentDate) : null,
    };
  });

  // Running live totals (independent of writes, so dry-run reports the true target).
  for (const r of rows) {
    if (r.isLive) {
      s.liveCount++;
      s.liveTotalCents += r.amountCents;
      if (r.type === 'membership') s.membershipLiveCents += r.amountCents;
      else s.depositLiveCents += r.amountCents;
    } else {
      s.deadCount++;
    }
  }

  const enrByEmail = await findEnrollmentsByEmail(rows.map((r) => r.email || '').filter(Boolean));

  for (const r of rows) {
    let enrollmentId: string | null = r.email ? enrByEmail.get(r.email)?.id ?? null : null;

    // Live membership payer with no account → create one (authorized decision).
    if (r.type === 'membership' && r.isLive && r.email && !enrollmentId) {
      if (dryRun) {
        // Count one account per unique payer (a recurring member has >1 payment);
        // seed the cache so their later payments don't re-count.
        s.accountsCreated++;
        enrByEmail.set(r.email, { id: 'dry-run', payment_status: 'paid', amount_paid: r.amountCents / 100 });
      } else {
        const newId = await createMemberEnrollment({
          name: r.name, email: r.email, amountDollars: r.amountCents / 100,
          customerId: r.p.CustomerId ?? null, paymentId: String(r.p.Id),
        });
        if (newId) { enrollmentId = newId; s.accountsCreated++; enrByEmail.set(r.email, { id: newId, payment_status: 'paid', amount_paid: r.amountCents / 100 }); }
        else { enrollmentId = r.email ? enrByEmail.get(r.email)?.id ?? null : null; }
      }
    }

    // Existing account with a live membership → reflect paid + amount for the roster view.
    if (!dryRun && r.type === 'membership' && r.isLive && enrollmentId) {
      const existing = r.email ? enrByEmail.get(r.email) : null;
      const needsUpdate = existing && (existing.payment_status !== 'paid' || Number(existing.amount_paid ?? -1) !== r.amountCents / 100);
      if (needsUpdate) {
        await sequelize.query(
          `UPDATE enrollments SET payment_status = 'paid', amount_paid = :amt,
             paysimple_payment_id = COALESCE(paysimple_payment_id, :pid),
             enrolled_at = COALESCE(enrolled_at, NOW())
           WHERE id = :id`,
          { replacements: { amt: r.amountCents / 100, pid: String(r.p.Id), id: enrollmentId }, type: QueryTypes.UPDATE }
        );
        s.enrollmentsUpdated++;
        if (existing) existing.payment_status = 'paid';
      }
    }

    if (dryRun) continue;

    const outcome = await upsertPayment({
      paymentId: String(r.p.Id),
      customerId: r.p.CustomerId ?? null,
      email: r.email,
      name: r.name,
      amountCents: r.amountCents,
      status: r.status,
      isLive: r.isLive,
      type: r.type,
      date: r.date,
      enrollmentId,
      raw: r.p,
    });
    s[outcome === 'inserted' ? 'inserted' : outcome === 'updated' ? 'updated' : 'unchanged']++;
  }

  console.log(
    `[PaymentLedger] ${dryRun ? '(dry-run) ' : ''}done: scanned=${s.scanned} accel=${s.accelerator} ` +
    `inserted=${s.inserted} updated=${s.updated} unchanged=${s.unchanged} accountsCreated=${s.accountsCreated} ` +
    `enrUpdated=${s.enrollmentsUpdated} live=${s.liveCount} ($${(s.liveTotalCents / 100).toFixed(2)}) dead=${s.deadCount}`
  );
  return s;
}

/* ---- revenue read (used by the dashboard KPI + revenue page) ---- */
export async function getLedgerRevenueCents(): Promise<{ totalCents: number; membershipCents: number; depositCents: number; rowCount: number }> {
  const rows = (await sequelize.query(
    `SELECT
        COUNT(*)::bigint AS n,
        COALESCE(SUM(amount_cents) FILTER (WHERE is_live), 0)::bigint AS total,
        COALESCE(SUM(amount_cents) FILTER (WHERE is_live AND payment_type = 'membership'), 0)::bigint AS membership,
        COALESCE(SUM(amount_cents) FILTER (WHERE is_live AND payment_type = 'deposit'), 0)::bigint AS deposit
       FROM payments`,
    { type: QueryTypes.SELECT }
  )) as Array<{ n: string; total: string; membership: string; deposit: string }>;
  const r = rows[0] || { n: '0', total: '0', membership: '0', deposit: '0' };
  return { totalCents: Number(r.total), membershipCents: Number(r.membership), depositCents: Number(r.deposit), rowCount: Number(r.n) };
}
