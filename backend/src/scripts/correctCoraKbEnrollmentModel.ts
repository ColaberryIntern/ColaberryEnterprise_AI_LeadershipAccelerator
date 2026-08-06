/**
 * One-off: push the 2026-08-06 rolling-enrollment/free-Explorer-tier/no-scholarship
 * KB rewrite into an already-seeded database.
 *
 * `seedKbData.ts` uses findOrCreate keyed on (question_pattern, course_id), so
 * editing its `entries` array only affects a FRESH seed — it does not update rows
 * that already exist in a database seeded before this change (documented gap, see
 * directives/cora-knowledge-base-gaps.md). This script closes that gap for the
 * specific rows touched by today's rewrite: it updates each row's answer_template
 * (and the CoraKbCohort's enrollment/open-house URLs) in place, matched by their
 * stable keys, and leaves every other row untouched.
 *
 * Idempotent — re-running with the same target text is a safe no-op (each row is
 * set to the same value it already has).
 *
 * Usage (dry run — reports what WOULD change, writes nothing):
 *   npx ts-node src/scripts/correctCoraKbEnrollmentModel.ts
 * Apply for real:
 *   npx ts-node src/scripts/correctCoraKbEnrollmentModel.ts --apply
 */

import { sequelize } from '../config/database';
import CoraKbCourse from '../models/CoraKbCourse';
import CoraKbCohort from '../models/CoraKbCohort';
import CoraKbEntry from '../models/CoraKbEntry';

const hasFlag = (name: string): boolean => process.argv.includes(name);

// Keyed on the exact `question_pattern` already in the DB (unchanged by today's
// edit — only the answers changed) -> the new answer_template from seedKbData.ts.
const ANSWER_UPDATES: Record<string, string> = {
  'How much does the program cost?':
    'Not ready to commit? Start with a free Explorer account at training.colaberry.com to preview the material, no payment required. When you\'re ready for full access, there are two options:\n• Annual Plan: ${{cohort.price_annual}}/month billed annually — this founding rate is permanently locked in for you.\n• Month-to-Month: ${{cohort.price_monthly}}/month, cancel anytime.\n\nThere\'s also a small Anthropic tooling cost (~$20/mo for Claude Code + ~$10/mo for API usage) paid directly to Anthropic as you build your projects. Scholarships are not currently available.',
  'How does the $50 seat deposit work?':
    'The $50 seat deposit is no longer offered. Reserving your seat now means paying your plan price directly (${{cohort.price_annual}}/mo annual or ${{cohort.price_monthly}}/mo month-to-month) — there\'s no separate deposit. In the meantime, you get free access to our AI Learning Content to get started right away. Curriculum (Classroom) access itself doesn\'t begin until the day your live cohort starts — that\'s also when your first subscription payment is charged, with each following payment landing on that same date each following month. Reserve your seat at {{cohort.enrollment_url}}.',
  'How do I enroll or sign up?':
    'Enrollment is rolling, so you can start anytime. Go to training.colaberry.com, create a free Explorer account to preview the material, or select your membership plan (Annual at ${{cohort.price_annual}}/mo or Month-to-Month at ${{cohort.price_monthly}}/mo) and complete checkout for full access. Full Classroom access unlocks when your cohort\'s classes begin.',
  'Are there still spots available?':
    'Enrollment is rolling, so there\'s no fixed deadline or capped intake to worry about — you can join anytime at training.colaberry.com. Your current assigned cohort has {{cohort.seats_remaining}} of {{cohort.seats_total}} seats remaining; if it fills, you\'ll be placed in the next one automatically.',
  'Do you offer scholarships or financial aid?':
    'No, scholarships and financial aid are not currently available. If cost is a concern, the free Explorer account at training.colaberry.com is a no-payment way to preview the material before committing to full access.',
  'Tell me about the Open House. How do I attend?':
    'The next Open House is {{cohort.open_house_date}} — completely free, no commitment. You\'ll meet the instructors, see the full 12-week curriculum live, ask questions, and decide from there. Can\'t make it or don\'t want to wait? You can also create a free Explorer account anytime at training.colaberry.com to preview the material right away. Learn more and register at {{cohort.enrollment_url}}.',
  'Can I get my seat deposit back, or what happens if I don\'t attend?':
    'The $50 seat-deposit option is no longer offered as of August 2026 — new reservations are made by paying your plan price directly. If you paid a $50 deposit before then and didn\'t attend your live class, the $50 is still fully refundable, or you can apply it as a credit toward a future cohort of your choice — just email payments@colaberry.com. If your reserved cohort\'s start date passed without you completing enrollment, the reservation lapsed automatically and the $50 became a credit on your account rather than a charge.',
};

const COHORT_URL_UPDATES = {
  open_house_url: 'training.colaberry.com/events/open-house',
  enrollment_url: 'training.colaberry.com',
};

async function run() {
  const apply = hasFlag('--apply');
  await sequelize.authenticate();
  console.log(`\n[correct-kb] ${apply ? 'APPLY' : 'DRY RUN'} — enrollment-model correction\n`);

  const course = await CoraKbCourse.findOne({ where: { slug: 'ai-architect' } });
  if (!course) {
    console.error('No course with slug "ai-architect" found — nothing to correct.');
    process.exit(1);
  }

  // ── Cohort URLs ──────────────────────────────────────────────────────────
  const cohort = await CoraKbCohort.findOne({ where: { course_id: course.id, cohort_number: 1 } });
  if (cohort) {
    const changes: string[] = [];
    if (cohort.open_house_url !== COHORT_URL_UPDATES.open_house_url) {
      changes.push(`open_house_url: "${cohort.open_house_url}" -> "${COHORT_URL_UPDATES.open_house_url}"`);
    }
    if (cohort.enrollment_url !== COHORT_URL_UPDATES.enrollment_url) {
      changes.push(`enrollment_url: "${cohort.enrollment_url}" -> "${COHORT_URL_UPDATES.enrollment_url}"`);
    }
    if (changes.length) {
      console.log(`[cohort ${cohort.id}]`);
      changes.forEach((c) => console.log(`  ${c}`));
      if (apply) await cohort.update(COHORT_URL_UPDATES);
    } else {
      console.log(`[cohort ${cohort.id}] already up to date`);
    }
  } else {
    console.warn('No cohort_number=1 row found — skipping cohort URL correction.');
  }

  // ── KB entry answers ─────────────────────────────────────────────────────
  let updated = 0;
  let alreadyCurrent = 0;
  let missing = 0;
  for (const [question_pattern, answer_template] of Object.entries(ANSWER_UPDATES)) {
    const row = await CoraKbEntry.findOne({ where: { question_pattern, course_id: course.id } });
    if (!row) {
      console.warn(`  [missing] no row found for question_pattern: "${question_pattern}"`);
      missing++;
      continue;
    }
    if (row.answer_template === answer_template) {
      alreadyCurrent++;
      continue;
    }
    console.log(`  [update] "${question_pattern}"`);
    if (apply) await row.update({ answer_template });
    updated++;
  }

  console.log(`\n[summary] ${apply ? 'APPLIED' : 'DRY RUN'}`);
  console.log(`  entries updated:        ${updated}`);
  console.log(`  entries already current: ${alreadyCurrent}`);
  console.log(`  entries missing:        ${missing}`);
  if (!apply) console.log(`\n  Dry run — nothing written. Re-run with --apply to commit.\n`);

  await sequelize.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('[correct-kb] Failed:', err?.message || err);
  process.exit(1);
});
