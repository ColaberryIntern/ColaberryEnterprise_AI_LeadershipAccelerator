/**
 * Backfill script: Creates Project records for existing enrollments that don't have one.
 *
 * Usage: npx ts-node src/scripts/backfillProjectsForEnrollments.ts
 *
 * Safe to run multiple times — uses findOrCreate internally.
 */
import '../config/database'; // Initialize sequelize
import '../models'; // Load all models + associations
import { Enrollment } from '../models';
import Project from '../models/Project';
import { createProjectForEnrollment } from '../services/projectService';

async function backfill() {
  console.log('[Backfill] Starting project backfill for existing enrollments...');

  const allEnrollments = await Enrollment.findAll({
    attributes: ['id', 'full_name', 'company'],
  });

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const enrollment of allEnrollments) {
    try {
      const existing = await Project.findOne({ where: { enrollment_id: enrollment.id } });
      if (existing) {
        skipped++;
        continue;
      }

      await createProjectForEnrollment(enrollment.id);
      created++;
      console.log(`  [+] Created project for ${enrollment.full_name} (${enrollment.company})`);
    } catch (err: any) {
      errors++;
      console.error(`  [!] Failed for enrollment ${enrollment.id}: ${err.message}`);
    }
  }

  console.log(`\n[Backfill] Complete.`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (already exists): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total enrollments: ${allEnrollments.length}`);

  process.exit(0);
}

backfill().catch(err => {
  console.error('[Backfill] Fatal error:', err);
  process.exit(1);
});
