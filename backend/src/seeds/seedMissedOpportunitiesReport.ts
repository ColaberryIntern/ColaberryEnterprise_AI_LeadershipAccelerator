// Idempotent: registers the Missed Opportunities Report in the automated_reports
// table so it appears in /admin/reports with its schedule and recipients. The
// actual execution is driven by the timezone-pinned cron in schedulerService
// (8 PM CT); this row is operator-facing metadata. Safe to rerun.

import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

export async function seedMissedOpportunitiesReport(): Promise<void> {
  const [existing] = await sequelize.query<{ id: string }>(
    `SELECT id FROM automated_reports WHERE name = :name`,
    { type: QueryTypes.SELECT, replacements: { name: 'Missed Opportunities Report' } },
  );
  if (existing) return;

  await sequelize.query(
    `INSERT INTO automated_reports
       (id, name, description, script_path, cron_schedule, recipients, subject_prefix,
        enabled, frequency, owner, created_at, updated_at)
     VALUES
       (gen_random_uuid(),
        :name,
        :description,
        :script_path,
        :cron,
        ARRAY['ali@colaberry.com']::text[],
        :subject_prefix,
        true,
        'daily',
        'ali@colaberry.com',
        NOW(), NOW())`,
    {
      replacements: {
        name: 'Missed Opportunities Report',
        description:
          'Executive safety net against Inbox COS false negatives. Surfaces hidden, archived, automated and suppressed emails that Ali may have wanted to see, scored by Opportunity Risk.',
        script_path: 'services/inbox/missedOpportunitiesEmailService.ts:runMissedOpportunitiesReport',
        cron: '0 20 * * * (America/Chicago)',
        subject_prefix: '[Missed Opportunities]',
      },
    },
  );
  console.log('[Seed] Missed Opportunities Report registered in automated_reports');
}

if (require.main === module) {
  seedMissedOpportunitiesReport()
    .then(() => { console.log('done'); process.exit(0); })
    .catch((err) => { console.error('seed failed:', err); process.exit(1); });
}
