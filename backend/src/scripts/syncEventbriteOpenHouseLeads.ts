/**
 * Sync recent Eventbrite Open House signups → warm leads in the CRM.
 * Backfill AND daily cron. Idempotent + resilient — safe to re-run.
 *
 *   docker exec accelerator-backend node dist/scripts/syncEventbriteOpenHouseLeads.js            # dry run, 180d
 *   docker exec accelerator-backend node dist/scripts/syncEventbriteOpenHouseLeads.js --apply
 *   docker exec accelerator-backend node dist/scripts/syncEventbriteOpenHouseLeads.js --days 90 --apply
 */
import { connectDatabase } from '../config/database';
import '../models';
import { syncEventbriteOpenHouseLeads } from '../services/eventbriteOpenHouseSyncService';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function run() {
  const apply = process.argv.includes('--apply');
  const days = arg('--days') ? parseInt(arg('--days')!, 10) : 180;
  await connectDatabase();

  const r = await syncEventbriteOpenHouseLeads({ days, apply });
  console.log(`[eventbrite-oh-sync] ${apply ? 'APPLIED' : 'DRY RUN'} — window ${r.window_days}d, pulled ${r.pulled} registrant(s)`);
  console.log(`  leads created:      ${r.created}`);
  console.log(`  leads existing:     ${r.existing}`);
  console.log(`  temperature raised: ${r.raised}`);
  console.log(`  activities logged:  ${r.activities}`);
  console.log(`  failed:             ${r.failed}`);
  r.failures.slice(0, 20).forEach((f) => console.log(`    FAIL ${f.email} — ${f.error}`));
  if (!apply) console.log(`\n  Dry run — nothing written. Re-run with --apply to commit.`);
  process.exit(0);
}

run().catch((err) => { console.error('Failed:', err?.message || err); process.exit(1); });
