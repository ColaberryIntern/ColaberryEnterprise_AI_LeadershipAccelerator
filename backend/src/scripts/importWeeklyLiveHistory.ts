/**
 * Import docs/live-sessions/history.json into weekly_live_session_weeks (Basecamp WL2.4), so the
 * curriculum map knows which weeks the Weekly Live already taught before the Studio existed.
 *
 * One-time, idempotent: rows are inserted ON CONFLICT DO NOTHING and a rerun tags nothing twice. Every
 * row carries the batch id this prints, so the import can be undone with
 *   DELETE FROM weekly_live_session_weeks WHERE import_batch = '<batch>';
 *
 * Run (the history file is not in the image, so pass its path):
 *   node dist/scripts/importWeeklyLiveHistory.js /tmp/history.json [batch-id]
 */
import fs from 'fs';
import { sequelize } from '../config/database';
import { importHistory, type HistorySession } from '../services/weeklyLive/curriculumMap';

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) throw new Error('usage: importWeeklyLiveHistory <history.json> [batch-id]');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { sessions?: HistorySession[] };
  if (!Array.isArray(parsed.sessions)) throw new Error(`${file} has no "sessions" array`);
  const batch = process.argv[3] || `history-${new Date().toISOString().slice(0, 10)}`;
  const result = await importHistory(parsed.sessions, batch);
  console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'weekly_live.history_import', outcome: result.unmatched.length ? 'partial' : 'success', context: result }));
}

main()
  .catch((err: unknown) => {
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'weekly_live.history_import', outcome: 'failure', error_class: err instanceof Error ? err.name : 'UnknownError', context: { message: err instanceof Error ? err.message : String(err) } }));
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
