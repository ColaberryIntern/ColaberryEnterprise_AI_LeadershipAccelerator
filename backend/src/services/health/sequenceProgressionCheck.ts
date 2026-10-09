import { sequelize } from '../../config/database';
import type { HealthCheck } from '../systemHealthService';

/**
 * The sequence-progression health check (moved here by Phase 6, T609).
 *
 * ─── MOVED VERBATIM EXCEPT FOR TWO PATHS, AND THOSE TWO ARE THE STORY ───────
 *
 * `systemHealthService.ts` was 639 lines and T609 adds a ninth check to it, so
 * the 500-line ceiling required a split before anything could be added. This is
 * the first check, lifted out. The body is byte-identical to the lines it came
 * from with EXACTLY TWO EXCEPTIONS, both forced by the move:
 *
 *     require('./sequenceService')  ->  require('../sequenceService')
 *     require('../models')          ->  require('../../models')
 *
 * Those two lines sit inside the auto-fix `try`, whose `catch` does nothing but
 * `console.error` a message about an "auto-fix error". Left unchanged they would
 * have resolved against `services/health/`, thrown MODULE_NOT_FOUND, and been
 * swallowed there: the check would still have pushed its warning, the suite
 * would still have been green, and the only visible effect would have been that
 * stalled leads silently stopped being recovered in production. A relative
 * `require` inside a swallowing `catch` is the reason `checkExternalAPIs` was
 * left where it is (see `campaignHealthCheck.ts`) - this one could move only
 * because its two paths are re-pointed and then PROVEN.
 *
 * Proven, not assumed: `sequenceProgressionCheck.characterization.test.ts` pins
 * the shipped body's md5 (d35ab8ad0cb0b537ecb38e85d2268806), asserts the checks
 * pushed for three fixture states, and - the cell that matters here - mocks
 * `../sequenceService` and asserts the auto-fix branch actually recovered rows.
 * If either path were wrong the mock would not intercept, `fixed` would stay 0,
 * and that cell would fail instead of the failure hiding in a `catch`.
 *
 * It is still called from the same position in `runFullSystemHealthCheck`'s
 * `Promise.allSettled`, so ordering is unchanged.
 *
 * ─── WHY THE TYPE IMPORT IS `import type` ───────────────────────────────────
 *
 * `HealthCheck` is declared in `systemHealthService.ts`, which imports this
 * module - a cycle if the import were a value import. `import type` is erased
 * at compile time, so there is no runtime edge and no initialisation order to
 * reason about. The type stays where the other eight checks read it from rather
 * than being moved to a third file that would exist only to break a cycle that
 * `import type` already prevents.
 *
 * ─── IT PUSHES, IT DOES NOT RETURN ──────────────────────────────────────────
 *
 * The check appends to the array it is handed instead of returning a value,
 * because that is the contract all nine share and `Promise.allSettled` discards
 * return values anyway. Keeping the signature means the call site did not
 * change either, so the only diff in the caller is the import.
 */

// ── 1. Sequence Progression Gaps ────────────────────────────────────────────
// Detects leads that completed a step but have no next step scheduled.
// This means scheduleNextStep() silently failed after send.
export async function checkSequenceProgression(checks: HealthCheck[]): Promise<void> {
  try {
    const [rows] = await sequelize.query(`
      SELECT se.id, se.lead_id, se.campaign_id, se.sequence_id, se.step_index, se.sent_at
      FROM scheduled_emails se
      WHERE se.status = 'sent'
        AND se.sent_at < NOW() - INTERVAL '30 minutes'
        AND se.sent_at > NOW() - INTERVAL '7 days'
        AND se.sequence_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM scheduled_emails se2
          WHERE se2.lead_id = se.lead_id
            AND se2.sequence_id = se.sequence_id
            AND se2.step_index = se.step_index + 1
            AND se2.status IN ('pending', 'processing', 'sent')
        )
        AND EXISTS (
          SELECT 1 FROM follow_up_sequences fs
          WHERE fs.id = se.sequence_id
            AND jsonb_array_length(fs.steps) > se.step_index + 1
        )
    `);

    const gaps = rows as any[];
    if (gaps.length > 0) {
      // Attempt auto-fix: schedule the missing next steps
      let fixed = 0;
      try {
        const { scheduleNextStep } = require('../sequenceService');
        const ScheduledEmail = require('../../models').ScheduledEmail;
        for (const gap of gaps.slice(0, 100)) { // Cap at 100 per run to avoid overload
          const completedAction = await ScheduledEmail.findByPk(gap.id);
          if (completedAction) {
            const next = await scheduleNextStep(completedAction);
            if (next) fixed++;
          }
        }
      } catch (fixErr: any) {
        console.error(`[SystemHealth] Sequence gap auto-fix error: ${fixErr.message}`);
      }

      if (fixed > 0) {
        checks.push({
          name: 'sequence_progression',
          severity: 'warning',
          detail: `Found ${gaps.length} leads stuck after a step with no next step scheduled. Auto-recovered ${fixed} of them by re-running scheduleNextStep.`,
          metric: gaps.length,
          autoFixed: `Recovered ${fixed}/${gaps.length} stuck sequences`,
        });
      } else if (gaps.length >= 5) {
        checks.push({
          name: 'sequence_progression',
          severity: 'critical',
          detail: `${gaps.length} leads completed a campaign step but have no next step scheduled. The scheduleNextStep function may be failing silently. These leads are stalled and not receiving further campaign messages.`,
          metric: gaps.length,
        });
      } else {
        // Small number of gaps (under 5) — likely transient, will self-heal next cycle
        checks.push({
          name: 'sequence_progression',
          severity: 'warning',
          detail: `${gaps.length} lead(s) have a minor sequence gap. Auto-recovery will retry next cycle.`,
          metric: gaps.length,
        });
      }
    } else {
      checks.push({ name: 'sequence_progression', severity: 'ok', detail: 'All sequence progressions are healthy — no gaps detected.', metric: 0 });
    }
  } catch (err: any) {
    checks.push({ name: 'sequence_progression', severity: 'warning', detail: `Check failed: ${err.message}` });
  }
}
