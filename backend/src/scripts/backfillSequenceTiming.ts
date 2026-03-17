/**
 * One-time backfill: Fix sequences where all steps have delay_days=0
 * but are NOT T-minus campaigns (no minutes_before_call).
 *
 * These sequences were created before normalizeSequenceTiming() was added
 * and have broken timing (all steps on Day 0).
 *
 * Run: npx ts-node -r tsconfig-paths/register src/scripts/backfillSequenceTiming.ts
 */
import '../models'; // init sequelize
import { FollowUpSequence } from '../models';
import { normalizeSequenceTiming } from '../services/sequenceService';
import { sequelize } from '../config/database';

async function main() {
  await sequelize.authenticate();
  console.log('[Backfill] Connected to database');

  const sequences = await FollowUpSequence.findAll();
  console.log(`[Backfill] Found ${sequences.length} total sequences`);

  let fixed = 0;
  let skippedTMinus = 0;
  let skippedOk = 0;
  let skippedEmpty = 0;

  for (const seq of sequences) {
    const steps = (seq as any).steps || [];

    // Skip single-step or empty sequences
    if (steps.length < 2) {
      skippedEmpty++;
      continue;
    }

    const allZeroDelay = steps.every((s: any) => (s.delay_days || 0) === 0);

    // Skip sequences that already have proper timing
    if (!allZeroDelay) {
      skippedOk++;
      continue;
    }

    const hasTMinus = steps.some((s: any) => s.minutes_before_call != null);

    // Skip T-minus campaigns — their delay_days=0 is intentional
    if (hasTMinus) {
      skippedTMinus++;
      console.log(`[Backfill] SKIP T-minus sequence ${seq.id} "${(seq as any).name}"`);
      continue;
    }

    // This is a broken standard campaign — all Day 0, no T-minus
    const corrected = normalizeSequenceTiming(steps);
    const newDays = corrected.map((s: any) => s.delay_days);

    await (seq as any).update({ steps: corrected });
    console.log(`[Backfill] FIXED sequence ${seq.id} "${(seq as any).name}": days=[${newDays.join(',')}]`);
    fixed++;
  }

  console.log(`\n[Backfill] Complete:`);
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Skipped (already OK): ${skippedOk}`);
  console.log(`  Skipped (T-minus): ${skippedTMinus}`);
  console.log(`  Skipped (empty/single): ${skippedEmpty}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Backfill] Error:', err);
    process.exit(1);
  });
