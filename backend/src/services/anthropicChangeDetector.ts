import { sequelize } from '../config/database';
import AnthropicContentRegistry from '../models/AnthropicContentRegistry';
import AnthropicChangeEvent from '../models/AnthropicChangeEvent';

export interface ChangeEventResult {
  registry_id: string;
  url: string;
  detection_method: string;
  error?: string;
  error_class?: string;
}

export interface ChangeDetectorRunResult {
  processed: number;
  errors: number;
  skipped: number;
  events: ChangeEventResult[];
}

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  context: Record<string, unknown> = {},
): void {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'anthropicChangeDetector',
      event,
      ...context,
    }) + '\n',
  );
}

export async function runChangeDetector(): Promise<ChangeDetectorRunResult> {
  const flagged = await AnthropicContentRegistry.findAll({
    where: { change_detected: true },
  });

  const result: ChangeDetectorRunResult = { processed: 0, errors: 0, skipped: 0, events: [] };

  if (flagged.length === 0) {
    log('info', 'run_complete', { processed: 0, errors: 0, skipped: 0 });
    return result;
  }

  log('info', 'run_start', { flagged_count: flagged.length });

  for (const row of flagged) {
    const summary = row.change_summary;

    if (!summary) {
      // Flagged without a summary — defensive clear, no event written.
      await row.update({ change_detected: false });
      result.skipped += 1;
      log('warn', 'skipped_no_summary', { url: row.url });
      continue;
    }

    try {
      // Transaction: write event + clear flag atomically.
      // If the INSERT fails (e.g. duplicate), the flag stays set and the next
      // run will retry. If the UPDATE fails, the row will be double-processed
      // on the next run but the UNIQUE constraint prevents a duplicate event.
      await sequelize.transaction(async (t) => {
        await AnthropicChangeEvent.create(
          {
            registry_id: row.id,
            url: row.url,
            content_type: row.content_type,
            detected_at: new Date(summary.detected_at),
            detection_method: summary.detection_method,
            previous_value: summary.previous_value,
            current_value: summary.current_value,
            severity: 'unknown',
          },
          { transaction: t },
        );

        await row.update(
          { change_detected: false, change_summary: null },
          { transaction: t },
        );
      });

      result.processed += 1;
      result.events.push({
        registry_id: row.id,
        url: row.url,
        detection_method: summary.detection_method,
      });
      log('info', 'event_written', {
        url: row.url,
        detection_method: summary.detection_method,
        outcome: 'success',
      });
    } catch (err: any) {
      result.errors += 1;
      const error_class =
        err.name === 'SequelizeUniqueConstraintError' ? 'DuplicateEventError' : 'DatabaseError';
      result.events.push({
        registry_id: row.id,
        url: row.url,
        detection_method: summary.detection_method,
        error: err.message,
        error_class,
      });
      log('error', 'event_write_failed', {
        url: row.url,
        error_class,
        message: err.message,
        outcome: 'failure',
      });
    }
  }

  log('info', 'run_complete', {
    processed: result.processed,
    errors: result.errors,
    skipped: result.skipped,
  });
  return result;
}
