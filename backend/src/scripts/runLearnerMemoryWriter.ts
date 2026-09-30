/**
 * runLearnerMemoryWriter — run the AI Mentor's LearnerMemory distillation batch
 * on demand. The scheduler (schedulerService) also runs it nightly at 02:15 CT.
 * Idempotent per (enrollment, day), so running this by hand is always safe.
 *
 * In-container usage: node dist/scripts/runLearnerMemoryWriter.js
 */
import { sequelize } from '../config/database';
import { runLearnerMemoryBatch } from '../services/runtime/learnerMemoryWriter';

(async () => {
  try {
    await sequelize.authenticate();
    const res = await runLearnerMemoryBatch();
    console.log('[LearnerMemoryWriter] done', JSON.stringify(res));
    process.exit(0);
  } catch (e: any) {
    console.error('[LearnerMemoryWriter] failed:', e?.message || e);
    process.exit(1);
  }
})();
