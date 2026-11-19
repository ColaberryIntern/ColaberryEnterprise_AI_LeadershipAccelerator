/**
 * Measure the recordings we already hold, so the substance rule has something to read.
 *
 * WHY THIS EXISTS. `attachRecording` has probed every new recording since
 * 2026-11-18, and `listResources` now hides any recording measurably shorter than
 * `MIN_SUBSTANTIVE_RECORDING_SECONDS`. But the rule reads `metadata.duration_seconds`,
 * and the rows already on disk predate the probe, so they carry no geometry at all.
 * Without this pass the filter is inert on exactly the 89 clips it was written for.
 *
 * WHY NOT INFER FROM size_bytes INSTEAD. It was tried, on real data, and it does not
 * work: probing production's whole 98 KB - 3 MB band found 474,525 bytes holding
 * 15.8 s while 1,213,625 bytes held 44.9 s. No byte threshold separates the clips from
 * the sessions. Measuring each file is slower and correct.
 *
 * SAFETY. Read-only with respect to video: it opens each file with `ffprobe` and
 * writes only `metadata.video_width`, `metadata.video_height` and
 * `metadata.duration_seconds`, merging into whatever metadata the row already holds.
 * No file is moved, re-encoded or deleted, and no row is removed — a clip that fails
 * the floor afterwards is hidden by the listing filter, not destroyed. Rows that
 * already carry a duration are skipped, so the script is idempotent and re-runnable.
 *
 * Usage, inside the backend container:
 *   node dist/scripts/backfillRecordingGeometry.js            # report only
 *   node dist/scripts/backfillRecordingGeometry.js --go       # write metadata
 *   node dist/scripts/backfillRecordingGeometry.js --go --limit 25
 */
import fs from 'fs';
import path from 'path';
import { sequelize } from '../config/database';
import RoomResource from '../models/RoomResource';
import { ROOM_RECORDING_DIR } from '../config/upload';
import { probeRecording } from '../services/communityRooms/recordingProbe';
import {
  judgeRecordingSubstance,
  durationFromResourceMetadata,
  MIN_SUBSTANTIVE_RECORDING_SECONDS,
} from '../services/recordingSubstance';

const GO = process.argv.includes('--go');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) || 0 : 0;

interface Row {
  id: string;
  size_bytes: number | null;
  storage_key: string | null;
  metadata: Record<string, unknown> | null;
  title: string | null;
}

async function main(): Promise<void> {
  const rows = (await RoomResource.findAll({
    where: { resource_type: 'recording' },
    order: [['created_at', 'ASC']],
  })) as unknown as Row[];

  console.log(`recordings: ${rows.length}   mode: ${GO ? 'WRITE' : 'report only'}   floor: ${MIN_SUBSTANTIVE_RECORDING_SECONDS}s`);

  let measured = 0;
  let skippedHasDuration = 0;
  let missingFile = 0;
  let unprobeable = 0;
  let belowFloor = 0;
  let written = 0;

  for (const row of rows) {
    if (LIMIT && measured >= LIMIT) break;

    if (durationFromResourceMetadata(row.metadata) !== null) {
      skippedHasDuration += 1;
      continue;
    }
    if (!row.storage_key) { missingFile += 1; continue; }

    const filePath = path.join(ROOM_RECORDING_DIR, row.storage_key);
    if (!fs.existsSync(filePath)) {
      missingFile += 1;
      console.log(`  MISSING  ${row.id}  ${row.storage_key}`);
      continue;
    }

    const geometry = await probeRecording(filePath);
    measured += 1;
    if (!geometry) {
      unprobeable += 1;
      console.log(`  UNPROBEABLE  ${row.id}  ${row.storage_key}`);
      continue;
    }

    const verdict = judgeRecordingSubstance({ durationSeconds: geometry.durationSeconds });
    if (!verdict.substantive) belowFloor += 1;

    const seconds = geometry.durationSeconds === null ? 'unknown' : geometry.durationSeconds.toFixed(1);
    console.log(
      `  ${verdict.substantive ? 'keep' : 'HIDE'}  ${seconds.padStart(8)}s  `
      + `${String(row.size_bytes ?? 0).padStart(11)}b  ${geometry.width}x${geometry.height}  `
      + `${String(row.title || '').slice(0, 44)}`,
    );

    if (!GO) continue;

    // Merge, never replace: a class recording's row already carries zoom_uuid,
    // source, part and recording_type, and the swap of a downscaled file records
    // original_storage_key here too. Losing any of those to a geometry write would
    // break idempotency on the next ingest sweep.
    await RoomResource.update(
      {
        metadata: {
          ...(row.metadata || {}),
          video_width: geometry.width,
          video_height: geometry.height,
          duration_seconds: geometry.durationSeconds,
        },
      },
      { where: { id: row.id } },
    );
    written += 1;
  }

  console.log('\n--- summary ---');
  console.log(`already measured (skipped): ${skippedHasDuration}`);
  console.log(`probed now:                 ${measured}`);
  console.log(`  of which below the floor: ${belowFloor}  (these become hidden in the Recordings tab)`);
  console.log(`  unprobeable:              ${unprobeable}`);
  console.log(`file missing on disk:       ${missingFile}`);
  console.log(`metadata rows written:      ${written}${GO ? '' : '  (report-only run; pass --go to write)'}`);
}

main()
  .then(() => sequelize.close())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfillRecordingGeometry failed:', err?.message || err);
    process.exit(1);
  });
