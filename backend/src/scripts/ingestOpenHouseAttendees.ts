/**
 * One-off: fold the Open House event data into the CRM as leads with the right
 * interest level. Reads a JSON array of participants and upserts each.
 *
 * Input JSON: [{ email, name?, registered?, attended?, paid?, amountCents? }, ...]
 *   registered = Eventbrite signup (→ warm), attended = joined the live app
 *   (→ hot), paid = deposit/subscription (→ qualified). Strongest wins.
 *
 * Usage (dry run — writes nothing):
 *   docker exec accelerator-backend node dist/scripts/ingestOpenHouseAttendees.js --file /tmp/oh-participants.json
 * Apply:
 *   docker exec accelerator-backend node dist/scripts/ingestOpenHouseAttendees.js --file /tmp/oh-participants.json --apply
 */
import fs from 'fs';
import { connectDatabase } from '../config/database';
import '../models';
import { ingestOpenHouseBatch, OhParticipant } from '../services/openHouseIngestService';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function run() {
  const file = arg('--file');
  if (!file) { console.error('Missing --file <participants.json>'); process.exit(1); }
  const apply = process.argv.includes('--apply');
  const raw = JSON.parse(fs.readFileSync(file!, 'utf8'));
  if (!Array.isArray(raw)) { console.error('Input must be a JSON array'); process.exit(1); }
  const participants: OhParticipant[] = raw;

  await connectDatabase();
  console.log(`\n[open-house-ingest] ${apply ? 'APPLY' : 'DRY RUN'} — ${participants.length} row(s)\n`);

  const summary = await ingestOpenHouseBatch(participants, { apply });

  for (const o of summary.outcomes) {
    const temp = o.raised ? `${o.previousTemp ?? 'new'}→${o.newTemp}` : `${o.newTemp} (unchanged)`;
    console.log(`  ${o.email.padEnd(34)} ${o.status.padEnd(10)} ${o.lead.padEnd(12)} temp:${temp}${o.activityLogged ? '  +activity' : ''}${o.note ? `  (${o.note})` : ''}`);
  }
  console.log(`\n[summary] ${apply ? 'APPLIED' : 'DRY RUN'}`);
  console.log(`  people:             ${summary.total}`);
  console.log(`  leads created:      ${summary.created}`);
  console.log(`  leads existing:     ${summary.existing}`);
  console.log(`  registered/attended/paid: ${summary.by_status.registered} / ${summary.by_status.attended} / ${summary.by_status.paid}`);
  console.log(`  temperature raised: ${summary.raised}`);
  console.log(`  activities logged:  ${summary.activities}`);
  console.log(`  failed:             ${summary.failed}`);
  summary.failures.forEach((f) => console.log(`    FAIL ${f.email} — ${f.error}`));
  if (!apply) console.log(`\n  Dry run — nothing written. Re-run with --apply to commit.\n`);
  process.exit(0);
}

run().catch((err) => { console.error('Failed:', err?.message || err); process.exit(1); });
