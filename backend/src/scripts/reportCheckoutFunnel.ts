#!/usr/bin/env ts-node
/**
 * Report checkout conversion per person, split by product. C10.1 criterion (2).
 *
 * Read-only: one SELECT, no writes, safe to run against production at any time.
 *
 *   node dist/scripts/reportCheckoutFunnel.js                  monthly, since 2026-07-01
 *   node dist/scripts/reportCheckoutFunnel.js --weekly         weekly, the cadence C10.1 asks for
 *   node dist/scripts/reportCheckoutFunnel.js --since 2026-10-01
 *   node dist/scripts/reportCheckoutFunnel.js --json           machine-readable
 *
 * WHAT IT WILL NOT DO. It never prints a single blended conversion rate. That number fell from
 * 76.6% to 14.3% between July and October and sent C10.1 looking for a broken payment page,
 * when what had changed was the population arriving rather than the page. If the composition
 * moved enough to make an aggregate meaningless, this prints the warning ABOVE the table rather
 * than below it, because a caveat under a number does not get read.
 *
 * It also prints the ORIGIN warning above the table. The explorer / never-explorer split rests
 * on two markers that disagree about 1 versus 30 former Explorers having ever paid, so the
 * split is reported with its own reliability attached rather than as settled fact.
 */
import { sequelize } from '../config/database';
import {
  computeCheckoutFunnel, CHECKOUT_ATTEMPTS_SQL,
  CheckoutAttemptRow, CheckoutPeriod,
} from '../services/checkoutFunnelService';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? String(process.argv[i + 1]) : fallback;
}

async function main(): Promise<void> {
  const period: CheckoutPeriod = process.argv.includes('--weekly') ? 'week' : 'month';
  const since = arg('since', '2026-07-01');
  const asJson = process.argv.includes('--json');

  // Every row is loaded; `since` bounds the OUTPUT, not the input. Filtering rows first would
  // make a returning person look like a first-timer. See CHECKOUT_ATTEMPTS_SQL.
  const [rows] = await sequelize.query(CHECKOUT_ATTEMPTS_SQL);
  const funnel = computeCheckoutFunnel(rows as CheckoutAttemptRow[], { period, since });

  if (asJson) {
    console.log(JSON.stringify({ since, attempts: (rows as unknown[]).length, ...funnel }, null, 2));
    return;
  }

  console.log('Checkout conversion, per person, by ' + period + ', since ' + since);
  console.log('Raw attempt rows: ' + (rows as unknown[]).length
    + '   distinct people: ' + funnel.rows.reduce((n, r) => n + r.started, 0));

  // Both warnings go ABOVE the table. A caveat printed underneath a number does not get read.
  if (funnel.originWarning) console.log('\n!! ' + funnel.originWarning + '\n');
  if (funnel.mixShiftWarning) console.log('\n!! ' + funnel.mixShiftWarning + '\n');

  const pad = (s: unknown, n: number) => String(s).padEnd(n);
  const padL = (s: unknown, n: number) => String(s).padStart(n);
  console.log('\n' + pad('period', 12) + pad('origin', 17) + padL('started', 9)
    + padL('paid', 7) + padL('%paid', 8) + padL('active sub', 12) + padL('%active', 9));
  console.log('-'.repeat(74));
  for (const r of funnel.rows) {
    console.log(pad(r.period, 12) + pad(r.origin, 17) + padL(r.started, 9)
      + padL(r.converted_paid, 7) + padL(r.pct_paid === null ? '-' : r.pct_paid, 8)
      + padL(r.converted_subscription, 12)
      + padL(r.pct_subscription === null ? '-' : r.pct_subscription, 9));
  }

  console.log('\nComposition of each period (why a blended rate is not printed):');
  for (const m of funnel.mix) {
    const parts = Object.entries(m.share)
      .sort((a, b) => b[1] - a[1])
      .map(([t, p]) => t + ' ' + p + '%').join(', ');
    console.log('  ' + pad(m.period, 12) + padL(m.total_started, 5) + ' people   ' + parts);
  }
}

main()
  .then(() => sequelize.close())
  .catch((err) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'checkout-funnel-report',
      event: 'run_failed', outcome: 'failure',
      error_class: err?.constructor?.name || 'Error', context: { message: err?.message },
    }));
    process.exit(1);
  });
