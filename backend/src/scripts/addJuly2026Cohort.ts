/**
 * One-off: add the July 2026 cohort to prod.
 * Idempotent — findOrCreate on name, safe to run twice.
 *
 * Usage (on VPS inside backend container):
 *   docker exec accelerator-backend node dist/scripts/addJuly2026Cohort.js
 *
 * Or locally with ts-node:
 *   npx ts-node src/scripts/addJuly2026Cohort.ts
 */

import { connectDatabase } from '../config/database';
import '../models';
import { Cohort } from '../models';

async function run() {
  await connectDatabase();

  const [cohort, created] = await Cohort.findOrCreate({
    where: { name: 'Cohort - July 2026' },
    defaults: {
      name: 'Cohort - July 2026',
      start_date: '2026-07-23',
      core_day: 'Thursday',
      core_time: '1:00–3:00 PM EST',
      optional_lab_day: 'Tuesday',
      max_seats: 20,
      seats_taken: 0,
      status: 'open' as const,
    },
  });

  if (created) {
    console.log(`Created: ${cohort.name} — starts ${cohort.start_date}`);
  } else {
    console.log(`Already exists: ${cohort.name} — starts ${cohort.start_date} (status: ${cohort.status})`);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
