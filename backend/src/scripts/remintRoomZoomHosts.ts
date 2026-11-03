/**
 * Move the internship timetable rooms onto their own Zoom hosts, by re-minting.
 *
 * ── WHY THIS SCRIPT HAD TO EXIST ──────────────────────────────────────────────────
 * The host pool only ever applies at meeting CREATION. Every room link here was
 * minted before the pool existed, with no host, so all of them belong to the single
 * `ZOOM_HOST_EMAIL` — and a Zoom user hosts one meeting at a time. The Monday standup
 * therefore could not open while a public session was live; you had to end one to
 * start the other. Registering and verifying hosts does nothing for a room that
 * already holds a link. Re-minting is the only path, and `ensureInternshipMeetingRooms`
 * is exported but called from nowhere, so there was no way to run it.
 *
 * ── IT CHANGES JOIN URLS, AND ORPHANS THE OLD ONES ───────────────────────────────
 * A new meeting means a new join URL. The OLD Zoom meeting is NOT deleted — it stays
 * alive on the old host, so a bookmarked or calendared link still joins it, silently,
 * while everyone else is in the new one. Announce the change, and retire the old
 * meetings deliberately. This script reports the orphans it leaves rather than
 * leaving them to be discovered.
 *
 * ── ORDER MATTERS, AND SO DOES THE RESTORE PATH ──────────────────────────────────
 *   1. The target host is RESERVED first. `reserveRoomHost` returns an existing
 *      reservation before it ever calls `pickLeastLoaded`, so writing the reservation
 *      up front makes the destination deterministic and known before Zoom is called.
 *   2. The link is cleared, because `ensureRoomLink` returns early when one exists.
 *   3. Only then is `ensureInternshipMeetingRooms` run — the one thing that both mints
 *      and re-stamps `required_meetings[].join_url`, so the campus and the agenda do
 *      not keep serving a dead link.
 *   4. If the mint fails, `applyRoomLinks` falls back to the default's null join_url
 *      and the room is left with NO link, which is strictly worse than the collision.
 *      So the old links are captured first, restored on failure, and the schedule is
 *      re-stamped after the restore.
 *
 * ── PROOF, NOT INFERENCE ─────────────────────────────────────────────────────────
 * Passing `hostEmail` is not evidence the meeting landed there. Each new meeting id is
 * looked for under its reserved host AND under the old default host. Because a
 * year-long meeting that has already started may not be listed under `type=scheduled`
 * at all, the CURRENT ids are looked up BEFORE any mutation as a control: if the
 * control cannot see them either, a post-mint "not found" proves nothing in either
 * direction, and that is reported as inconclusive rather than dressed up as a pass.
 *
 * ── Running it ───────────────────────────────────────────────────────────────────
 *   npx ts-node src/scripts/remintRoomZoomHosts.ts ai-internship-standup=program.101@colaberry.com \
 *     colaberry-ai-sessions=program.102@colaberry.com --dry-run
 *
 * `--dry-run` reads and runs the control only; it writes nothing. Run it first.
 * Each host must already be registered AND verified (`zoomHosts.ts list`), or the
 * reservation points at a host the pool will not allocate.
 *
 * SCOPE: the two internship timetable rooms only. The other community rooms share a
 * host too, but nothing re-stamps a schedule for them, so they need a different path.
 */
import { sequelize } from '../config/database';
import { env } from '../config/env';
import { ensureInternshipMeetingRooms } from '../services/internship/internshipMeetingRooms';
import { listUpcomingMeetingsWithAgenda, extractZoomMeetingId, isZoomConfigured } from '../services/zoomService';
import { listHosts } from '../services/zoom/zoomHostRegistry';
import { parseRemintArgs, REMINT_USAGE } from './lib/remintArgs';
import { remintPreconditionError } from './lib/remintPreconditions';

interface RoomRow {
  id: string;
  slug: string;
  name: string;
  meeting_link: string | null;
  reserved_host: string | null;
}

const DEFAULT_HOST = String(env.zoomHostEmail || '').trim().toLowerCase();

async function readRooms(slugs: readonly string[]): Promise<RoomRow[]> {
  const [rows] = await sequelize.query(
    `SELECT id, slug, name, meeting_link,
            NULLIF(metadata->>'zoom_host_email', '') AS reserved_host
       FROM community_rooms WHERE slug IN (:slugs) ORDER BY slug`,
    { replacements: { slugs: [...slugs] } },
  );
  return rows as RoomRow[];
}

async function servedMeetings(): Promise<Array<Record<string, unknown>>> {
  const [rows] = await sequelize.query(
    `SELECT settings_json->'required_meetings' AS meetings
       FROM cohorts WHERE cohort_type = 'ai_internship' ORDER BY created_at DESC LIMIT 1`,
  );
  const first = (rows as Array<{ meetings?: Array<Record<string, unknown>> }>)[0];
  return first?.meetings ?? [];
}

/** Is `id` among this host's scheduled meetings? `null` means the lookup itself failed. */
async function hostHasMeeting(hostEmail: string, id: string): Promise<boolean | null> {
  try {
    const list = await listUpcomingMeetingsWithAgenda(hostEmail);
    return list.some((m) => String(m.id) === String(id));
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.log(`    (lookup failed for ${hostEmail}: ${e?.message ?? 'unknown error'})`);
    return null;
  }
}

async function main(): Promise<number> {
  const parsed = parseRemintArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    return 2;
  }
  const { targets, dryRun } = parsed.args;
  const hostOf = new Map(targets.map((t) => [t.slug, t.hostEmail]));
  const slugs = targets.map((t) => t.slug);

  if (!isZoomConfigured()) {
    console.error('Zoom is not configured in this environment; a re-mint would clear links and mint nothing.');
    return 1;
  }

  // Every target host must be registered, enabled and verified. Reserving a host the
  // pool will refuse to allocate makes the mint fall back to the default host, which
  // re-mints the room straight back onto the identity it was moving off — quietly.
  const precondition = remintPreconditionError(targets, await listHosts());
  if (precondition) {
    console.error(precondition);
    return 1;
  }

  const before = await readRooms(slugs);
  const missing = slugs.filter((s) => !before.some((r) => r.slug === s));
  if (missing.length) { console.error(`room slug not found: ${missing.join(', ')}`); return 1; }

  console.log('=== BEFORE ===');
  for (const r of before) {
    console.log(`  ${r.slug}`);
    console.log(`    reserved_host ${r.reserved_host ?? `NONE (link belongs to ${DEFAULT_HOST})`}`);
    console.log(`    meeting_id    ${extractZoomMeetingId(r.meeting_link) ?? 'NONE'}`);
    console.log(`    target host   ${hostOf.get(r.slug)}`);
  }

  console.log('');
  console.log(`=== CONTROL: are the CURRENT meetings visible under ${DEFAULT_HOST}? ===`);
  let controlWorks = false;
  for (const r of before) {
    const id = extractZoomMeetingId(r.meeting_link);
    if (!id) { console.log(`  ${r.slug}: no id to check`); continue; }
    const seen = await hostHasMeeting(DEFAULT_HOST, id);
    if (seen === true) controlWorks = true;
    console.log(`  ${r.slug} (id ${id}): ${seen === null ? 'LOOKUP FAILED' : seen ? 'VISIBLE' : 'NOT VISIBLE'}`);
  }
  console.log(`  => the listing method ${controlWorks
    ? 'CAN see this class of meeting, so the post-mint check is readable'
    : 'CANNOT see these meetings, so a post-mint "not found" will prove NOTHING'}`);

  if (dryRun) {
    console.log('');
    console.log('DRY RUN: nothing written.');
    return 0;
  }

  // The restore point. Held in memory for this process only; the mint and the
  // restore both happen inside this run, so persisting it would outlive its use.
  const backup = before.map((r) => ({ slug: r.slug, id: r.id, meeting_link: r.meeting_link }));

  for (const r of before) {
    await sequelize.query(
      `UPDATE community_rooms
          SET metadata = COALESCE(metadata, '{}'::jsonb)
                         || jsonb_build_object('zoom_host_email', :host),
              meeting_link = NULL,
              updated_at = NOW()
        WHERE id = :id`,
      { replacements: { id: r.id, host: hostOf.get(r.slug) } },
    );
    console.log(`  reserved ${r.slug} -> ${hostOf.get(r.slug)}, link cleared`);
  }

  console.log('');
  console.log('=== minting ===');
  const result = await ensureInternshipMeetingRooms();
  console.log(`  interns_room: ${result.interns_room.join_url ? 'minted' : 'NULL'}`);
  console.log(`  public_room:  ${result.public_room.join_url ? 'minted' : 'NULL'}`);
  console.log(`  intern memberships seeded: ${result.intern_members}`);

  const after = await readRooms(slugs);
  const blank = after.filter((r) => !r.meeting_link);
  if (blank.length) {
    console.log('');
    console.log(`!! MINT FAILED for: ${blank.map((r) => r.slug).join(', ')} — RESTORING`);
    for (const b of blank) {
      const old = backup.find((x) => x.slug === b.slug);
      if (!old?.meeting_link) { console.log(`   no old link to restore for ${b.slug}`); continue; }
      await sequelize.query(
        'UPDATE community_rooms SET meeting_link = :link, updated_at = NOW() WHERE id = :id',
        { replacements: { id: b.id, link: old.meeting_link } },
      );
      console.log(`   restored ${b.slug}`);
    }
    // Re-stamp so the campus serves the restored link rather than the null one the
    // failed run just wrote into the schedule.
    await ensureInternshipMeetingRooms();
    console.log('   cohort schedule re-stamped with the restored links');
    return 1;
  }

  console.log('');
  console.log('=== AFTER ===');
  for (const r of after) {
    const old = backup.find((x) => x.slug === r.slug);
    console.log(`  ${r.slug}`);
    console.log(`    reserved_host ${r.reserved_host ?? 'NONE'}`);
    console.log(`    meeting_id    ${extractZoomMeetingId(r.meeting_link) ?? 'NONE'}`);
    console.log(`    url changed   ${old?.meeting_link !== r.meeting_link}`);
  }
  const ids = after.map((r) => extractZoomMeetingId(r.meeting_link));
  console.log(`  the rooms now hold DIFFERENT meetings: ${new Set(ids).size === ids.length}`);

  console.log('');
  console.log('=== what the cohort now serves ===');
  for (const m of await servedMeetings()) {
    console.log(`    ${String(m.day).padEnd(10)}${String(m.time).padEnd(9)}`
      + `room=${String(m.room_slug ?? 'NONE').padEnd(24)}`
      + `join=${m.join_url ? 'set' : 'NULL'}`);
  }

  console.log('');
  console.log('=== PROOF: who owns the new meetings ===');
  for (const r of after) {
    const id = extractZoomMeetingId(r.meeting_link);
    const target = String(hostOf.get(r.slug));
    if (!id) { console.log(`  ${r.slug}: no meeting id to check`); continue; }
    const onTarget = await hostHasMeeting(target, id);
    const onOld = await hostHasMeeting(DEFAULT_HOST, id);
    console.log(`  ${r.slug} (new id ${id})`);
    console.log(`    under ${target.padEnd(28)}${onTarget === null ? 'LOOKUP FAILED' : onTarget ? 'PRESENT' : 'absent'}`);
    console.log(`    under ${DEFAULT_HOST.padEnd(28)}${onOld === null ? 'LOOKUP FAILED' : onOld ? 'PRESENT' : 'absent'}`);
    console.log(`    => ${onTarget === true && onOld === false
      ? 'OWNED BY THE NEW HOST'
      : onTarget === true
        ? 'present under the new host, but the old host lists it too — read the two lines above'
        : controlWorks
          ? 'NOT CONFIRMED on the new host, and the control works, so this is a real negative'
          : 'INCONCLUSIVE — the listing method cannot see this class of meeting'}`);
  }

  console.log('');
  console.log(`=== ORPHANS: the old meetings, still alive on ${DEFAULT_HOST} ===`);
  for (const b of backup) {
    const oldId = extractZoomMeetingId(b.meeting_link);
    if (!oldId) continue;
    const stillThere = await hostHasMeeting(DEFAULT_HOST, oldId);
    console.log(`  ${b.slug} old id ${oldId}: ${stillThere === null
      ? 'LOOKUP FAILED'
      : stillThere ? 'STILL EXISTS — a bookmarked link still joins it' : 'not listed'}`);
  }
  console.log('');
  console.log('Announce the new links. The old meetings above are not deleted.');
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((err: unknown) => {
      const e = err as { constructor?: { name?: string }; message?: string };
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'backend',
        event: 'room_host_remint_failed', outcome: 'failure',
        error_class: e?.constructor?.name ?? 'Error', context: { message: e?.message },
      }));
      console.error(REMINT_USAGE);
      process.exitCode = 1;
    })
    .finally(async () => { try { await sequelize.close(); } catch { /* already closed */ } });
}
