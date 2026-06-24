/**
 * seedTestStudents.ts — create two test portal enrollments for local dev
 *
 * Creates (or refreshes) a "cold" student (no intake) and a "warm" student
 * (pre-seeded intake variables) linked to the first open cohort found in the DB.
 * Prints direct portal URLs — no email required.
 *
 * Run: npm run seed:students  (from backend/)
 * Safe to re-run: tokens are refreshed, data is not duplicated.
 */

import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { Cohort } from '../models';
import { createTestEnrollments } from '../scripts/createTestUsers';

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  // Find first open cohort; fall back to any non-completed cohort
  let cohort = await Cohort.findOne({ where: { status: 'open' } });
  if (!cohort) {
    cohort = await Cohort.findOne({ where: { status: 'closed' } });
  }
  if (!cohort) {
    console.error('No cohort found in DB. Run seedCohorts first or create one via the admin UI.');
    process.exit(1);
  }

  console.log(`\nUsing cohort: "${cohort.name}" (${cohort.id})\n`);

  const result = await createTestEnrollments(cohort.id);

  const base = process.env.FRONTEND_URL || 'http://localhost:9999';

  console.log('='.repeat(60));
  console.log('TEST STUDENT PORTAL LINKS (valid 90 days)');
  console.log('='.repeat(60));
  console.log('\n[COLD] No intake completed — sees onboarding flow first');
  console.log(`  Email:      ${result.cold.enrollment_id}`);
  console.log(`  Portal URL: ${base}/portal/verify?token=${result.cold.portal_token}`);
  console.log(`  Mode:       ${result.cold.mode}`);
  console.log('\n[WARM] Intake complete, variables pre-seeded (Manufacturing / VP Ops)');
  console.log(`  Portal URL: ${base}/portal/verify?token=${result.warm.portal_token}`);
  console.log(`  Mode:       ${result.warm.mode}`);
  console.log(`  Variables:  ${result.warm.variables_seeded} seeded`);
  console.log('\n' + '='.repeat(60));
  console.log('Paste either URL into your browser to enter the student portal.');
  console.log('No login page, no email — the token IS the session.\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
