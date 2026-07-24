import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { Cohort } from '../models';

// Live Sessions build-out (Session CC-20260721-s7h4): dev seed aligned to the
// real cohort landscape (April / July / November 2026, Central Time). Each
// cohort carries an explicit settings_json.schedule so generateSessionsFromCohort
// runs without manual setup; the generator also derives the same shape from the
// top-level core_day / optional_lab_day / core_time fields as a fallback.
const PROGRAM_SCHEDULE = {
  recurring_days: ['Tuesday', 'Thursday'],
  core_days: ['Thursday'],
  start_time: '13:00',
  end_time: '15:00',
  total_sessions: 24, // 12-week program: core (Thu) + optional lab (Tue)
};

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  const base = {
    core_day: 'Thursday',
    core_time: '1:00–3:00 PM CT',
    optional_lab_day: 'Tuesday',
    timezone: 'America/Chicago',
    max_seats: 20,
    seats_taken: 0,
    status: 'open' as const,
    settings_json: { schedule: PROGRAM_SCHEDULE },
  };

  const cohorts = [
    { name: 'Cohort - April 2026', start_date: '2026-04-01', ...base },
    { name: 'Cohort - July 2026', start_date: '2026-07-01', ...base },
    { name: 'Cohort - November 2026', start_date: '2026-11-01', ...base },
  ];

  for (const cohortData of cohorts) {
    const [cohort, created] = await Cohort.findOrCreate({
      where: { name: cohortData.name },
      defaults: cohortData,
    });

    // Idempotent repair: an existing cohort that predates the schedule contract
    // gets its settings_json.schedule backfilled so session generation works.
    if (!created && !(cohort as any).settings_json?.schedule) {
      const settings = { ...((cohort as any).settings_json || {}), schedule: PROGRAM_SCHEDULE };
      await cohort.update({ settings_json: settings });
      console.log(`Backfilled schedule: ${cohort.name}`);
    } else {
      console.log(`${created ? 'Created' : 'Already exists'}: ${cohort.name}`);
    }
  }

  console.log('Cohort seeding complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
