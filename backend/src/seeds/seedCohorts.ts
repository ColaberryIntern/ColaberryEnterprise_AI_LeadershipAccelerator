import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { Cohort } from '../models';

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  const cohorts = [
    {
      name: 'Cohort 1 — March 2026',
      start_date: '2026-03-31',
      core_day: 'Thursday',
      core_time: '1:00–3:00 PM EST',
      optional_lab_day: 'Tuesday',
      max_seats: 20,
      seats_taken: 0,
      status: 'open' as const,
    },
    {
      name: 'Cohort 2 — June 2026',
      start_date: '2026-06-01',
      core_day: 'Thursday',
      core_time: '1:00–3:00 PM EST',
      optional_lab_day: 'Tuesday',
      max_seats: 20,
      seats_taken: 0,
      status: 'open' as const,
    },
    {
      name: 'Cohort 3 — August 2026',
      start_date: '2026-08-03',
      core_day: 'Thursday',
      core_time: '1:00–3:00 PM EST',
      optional_lab_day: 'Tuesday',
      max_seats: 20,
      seats_taken: 0,
      status: 'open' as const,
    },
  ];

  for (const cohortData of cohorts) {
    const [cohort, created] = await Cohort.findOrCreate({
      where: { name: cohortData.name },
      defaults: cohortData,
    });
    console.log(`${created ? 'Created' : 'Already exists'}: ${cohort.name}`);
  }

  console.log('Cohort seeding complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
