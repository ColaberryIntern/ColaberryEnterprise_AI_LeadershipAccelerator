/**
 * Repair contaminated `paysimple_customer_id` values on subscriptions and enrollments.
 *
 * BACKGROUND
 * PaySimple ignores its own `GET /v4/customer?email=` filter and returns page 1 of the
 * whole merchant account. The pre-guard `findCustomerByEmail` took `results[0]`, which is
 * always customer 7095991 - "Victor Oragwu", a 2016 bootcamp customer and the oldest
 * record in the account. That id was stored against other people's rows. The upstream
 * lookup is fixed and `resolveCheckoutCustomerId` now verifies a stored id before reusing
 * it, but neither drains the rows that were already written. This script does that.
 *
 * SAFETY
 * - DRY RUN BY DEFAULT. Writes only with an explicit `--apply`.
 * - GET-only against PaySimple. It never creates, charges, schedules, or cancels.
 * - Nothing is hardcoded. Every "wrong" verdict is re-derived live from PaySimple at run
 *   time, so a stale finding in this file can never drive a write.
 * - A replacement value is used only when PaySimple independently confirms the customer
 *   record carries that exact person's email. Otherwise the column is cleared to NULL.
 *   NULL is always safe: `resolveCheckoutCustomerId` mints a fresh, correct customer when
 *   it finds none, whereas a wrong id maps one human's money onto another's.
 * - Idempotent. A second run finds nothing left to change.
 *
 * USAGE
 *   node dist/scripts/repairPaysimpleCustomerIds.js            # dry run, prints the plan
 *   node dist/scripts/repairPaysimpleCustomerIds.js --apply    # writes, inside one transaction
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { getCustomerById, getPayment } from '../services/paysimpleService';

const APPLY = process.argv.includes('--apply');
const INVOKED_DIRECTLY = require.main === module;

type Verdict = 'OK' | 'ALIAS' | 'WRONG' | 'UNVERIFIABLE';

interface Row {
  table: 'subscriptions' | 'enrollments';
  rowId: string;
  personName: string;
  personEmail: string;
  currentId: string;
  context: string;
  paymentId: string | null;
  enrollmentId: string | null;
}

interface Plan extends Row {
  verdict: Verdict;
  psOwner: string;
  proposed: string | null;
  basis: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

/**
 * Name fingerprint, used to tell contamination apart from an alias.
 *
 * A strict email test alone is too blunt for a repair that remaps money. Three people
 * here hold a PaySimple record under a different address than the one on their
 * enrollment - Britiana Akhile (gmail vs yahoo.co.uk), Jude Mofunanya (a +2 alias) and
 * Marione Nkerbu (gmail vs yahoo.fr). Those ids are CORRECT; the person simply checked
 * out under another address. Only a mismatch in BOTH email and name means the record
 * belongs to a different human, which is the actual defect being repaired.
 */
const nameKey = (s: string | null | undefined) =>
  (s || '')
    .toLowerCase()
    .replace(/['’]/g, '')       // O'Brien / D'Angelo are one token, not two
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

export const sameHuman = (a: string | null | undefined, b: string | null | undefined) => {
  const [x, y] = [nameKey(a), nameKey(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  // Tolerate a missing/extra middle name: every token of the shorter appears in the longer.
  const [short, long] = x.split(' ').length <= y.split(' ').length ? [x.split(' '), y.split(' ')] : [y.split(' '), x.split(' ')];
  return short.length >= 2 && short.every((t) => long.includes(t));
};

const customerCache = new Map<string, { email: string; name: string } | null>();
async function customer(id: string) {
  if (!customerCache.has(id)) {
    const c = await getCustomerById(id);
    customerCache.set(id, c ? { email: norm(c.Email), name: `${c.FirstName || ''} ${c.LastName || ''}`.trim() } : null);
  }
  return customerCache.get(id) || null;
}

const paymentCache = new Map<string, string | null>();
async function paymentOwner(paymentId: string): Promise<string | null> {
  if (!paymentCache.has(paymentId)) {
    try {
      const p: any = await getPayment(paymentId);
      paymentCache.set(paymentId, p?.CustomerId != null ? String(p.CustomerId) : null);
    } catch {
      paymentCache.set(paymentId, null);
    }
  }
  return paymentCache.get(paymentId) ?? null;
}

async function loadRows(): Promise<Row[]> {
  const subs = (await sequelize.query(
    `SELECT s.id, s.paysimple_customer_id AS cid, s.paysimple_payment_id AS pid,
            s.status, s.plan, s.amount_cents, s.enrollment_id,
            e.full_name, e.email
       FROM subscriptions s
       JOIN enrollments e ON e.id = s.enrollment_id
      WHERE s.paysimple_customer_id IS NOT NULL`,
    { type: QueryTypes.SELECT }
  )) as any[];

  const enrs = (await sequelize.query(
    `SELECT e.id, e.paysimple_customer_id AS cid, e.paysimple_payment_id AS pid,
            e.full_name, e.email, e.status, e.payment_status
       FROM enrollments e
      WHERE e.paysimple_customer_id IS NOT NULL`,
    { type: QueryTypes.SELECT }
  )) as any[];

  return [
    ...subs.map((r): Row => ({
      table: 'subscriptions',
      rowId: r.id,
      personName: r.full_name,
      personEmail: norm(r.email),
      currentId: String(r.cid),
      context: `${r.status}/${r.plan}/$${(r.amount_cents / 100).toFixed(2)}`,
      paymentId: r.pid ? String(r.pid) : null,
      enrollmentId: r.enrollment_id,
    })),
    ...enrs.map((r): Row => ({
      table: 'enrollments',
      rowId: r.id,
      personName: r.full_name,
      personEmail: norm(r.email),
      currentId: String(r.cid),
      context: `${r.status}/${r.payment_status}`,
      paymentId: r.pid ? String(r.pid) : null,
      enrollmentId: r.id,
    })),
  ];
}

async function buildPlan(rows: Row[]): Promise<Plan[]> {
  const out: Plan[] = [];

  for (const r of rows) {
    const owner = await customer(r.currentId);
    if (!owner) {
      out.push({ ...r, verdict: 'UNVERIFIABLE', psOwner: '(lookup failed)', proposed: null, basis: 'PaySimple lookup failed - left untouched', confidence: 'LOW' });
      continue;
    }
    if (owner.email === r.personEmail) {
      out.push({ ...r, verdict: 'OK', psOwner: `${owner.name} <${owner.email}>`, proposed: r.currentId, basis: 'customer record carries this person email', confidence: 'HIGH' });
      continue;
    }
    if (sameHuman(owner.name, r.personName)) {
      out.push({ ...r, verdict: 'ALIAS', psOwner: `${owner.name} <${owner.email}>`, proposed: r.currentId, basis: 'different email but same person - a second address, not contamination. LEFT UNTOUCHED', confidence: 'HIGH' });
      continue;
    }

    // Different email AND a different human. Contaminated - recover from independent evidence.
    let proposed: string | null = null;
    let basis = '';
    let confidence: Plan['confidence'] = 'HIGH';

    // Strongest: the payment recorded ON THIS ROW names its own customer.
    if (r.paymentId) {
      const payCid = await paymentOwner(r.paymentId);
      if (payCid) {
        const payCustomer = await customer(payCid);
        if (payCustomer && payCustomer.email === r.personEmail) {
          proposed = payCid;
          basis = `payment ${r.paymentId} on this row belongs to customer ${payCid}, whose record carries this person email`;
        }
      }
    }

    // Next: the enrollment-level id, but only if PaySimple confirms it is this person.
    if (!proposed && r.table === 'subscriptions' && r.enrollmentId) {
      const [enr] = (await sequelize.query(
        `SELECT paysimple_customer_id AS cid FROM enrollments WHERE id = :id`,
        { replacements: { id: r.enrollmentId }, type: QueryTypes.SELECT }
      )) as any[];
      if (enr?.cid) {
        const enrCustomer = await customer(String(enr.cid));
        if (enrCustomer && enrCustomer.email === r.personEmail) {
          proposed = String(enr.cid);
          basis = `enrollment-level id ${enr.cid} independently verified as this person`;
        }
      }
    }

    if (!proposed) {
      basis = 'no verifiable customer id for this person - clearing to NULL so the next checkout mints a correct one';
    }

    out.push({ ...r, verdict: 'WRONG', psOwner: `${owner.name} <${owner.email}>`, proposed, basis, confidence });
  }

  return out;
}

function report(plan: Plan[]): Plan[] {
  const wrong = plan.filter((p) => p.verdict === 'WRONG');
  const unver = plan.filter((p) => p.verdict === 'UNVERIFIABLE');
  const ok = plan.filter((p) => p.verdict === 'OK');
  const alias = plan.filter((p) => p.verdict === 'ALIAS');

  console.log(`\n${'='.repeat(78)}`);
  console.log(`PaySimple customer-id repair - ${APPLY ? 'APPLY' : 'DRY RUN (no writes)'}`);
  console.log('='.repeat(78));
  console.log(`rows inspected : ${plan.length}`);
  console.log(`  verified OK  : ${ok.length}`);
  console.log(`  alias (same person, other email - untouched) : ${alias.length}`);
  console.log(`  CONTAMINATED : ${wrong.length}`);
  console.log(`  unverifiable : ${unver.length}`);

  if (wrong.length === 0) {
    console.log('\nNothing to repair.');
    return wrong;
  }

  const byPerson = new Map<string, Plan[]>();
  for (const p of wrong) {
    const k = `${p.personName} <${p.personEmail}>`;
    byPerson.set(k, [...(byPerson.get(k) || []), p]);
  }

  console.log(`\nAffected people: ${byPerson.size}\n`);
  for (const [person, rows] of byPerson) {
    console.log(`- ${person}`);
    for (const p of rows) {
      console.log(`    ${p.table}.${p.rowId}  (${p.context})`);
      console.log(`      currently : ${p.currentId}  -> PaySimple says ${p.psOwner}`);
      console.log(`      proposed  : ${p.proposed ?? 'NULL (clear)'}   [${p.confidence}]`);
      console.log(`      basis     : ${p.basis}`);
    }
    console.log('');
  }

  for (const p of alias) {
    console.log(`~ ALIAS ${p.table}.${p.rowId} ${p.personName} <${p.personEmail}> id=${p.currentId} -> ${p.psOwner} - same person, left untouched`);
  }
  console.log('');

  for (const p of unver) {
    console.log(`! UNVERIFIABLE ${p.table}.${p.rowId} (${p.personEmail}) id=${p.currentId} - left untouched`);
  }

  return wrong;
}

async function main() {
  const rows = await loadRows();
  const plan = await buildPlan(rows);
  const wrong = report(plan);

  if (!APPLY) {
    console.log('DRY RUN - nothing was written. Re-run with --apply to commit these changes.\n');
    return;
  }
  if (wrong.length === 0) return;

  const tx = await sequelize.transaction();
  try {
    for (const p of wrong) {
      await sequelize.query(
        `UPDATE ${p.table} SET paysimple_customer_id = :val WHERE id = :id AND paysimple_customer_id = :expected`,
        { replacements: { val: p.proposed, id: p.rowId, expected: p.currentId }, type: QueryTypes.UPDATE, transaction: tx }
      );
    }
    await tx.commit();
    console.log(`Applied ${wrong.length} correction(s).\n`);
  } catch (err: any) {
    await tx.rollback();
    console.error('Rolled back - no changes written:', err?.message);
    process.exitCode = 1;
  }
}

if (INVOKED_DIRECTLY) {
  main()
    .catch((err) => { console.error('FATAL', err?.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
