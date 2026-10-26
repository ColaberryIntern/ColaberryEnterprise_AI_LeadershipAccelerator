/**
 * Collect the evidence from one airing, in one command.
 *
 * WHY THIS EXISTS. Six features shipped in the week to 24 Oct and not one has run against a live
 * stream: occurrence creation binding an input (L5.4/L7.1), heartbeat measurement (L4.9), the
 * provider health loop (L5.5), the recording capture and the replay publish (L8.4), the auto-end
 * (L7.4) and clip markers (L7.3). A single airing can prove all six — but only if somebody
 * actually looks, and the looking is eight separate queries nobody wants to retype at the end of
 * a test they have just finished running.
 *
 * READ-ONLY. It writes nothing and changes nothing. Safe to run during an airing as well as
 * after one.
 *
 * EVERY ROW CARRIES ITS OWN CONTROL where a zero would otherwise be ambiguous. A count of 0 can
 * mean "the feature did not work" or "nothing has aired yet", and those call for completely
 * different responses — so the script says which, rather than leaving a number to be
 * misread.
 *
 * Usage, on the prod backend:
 *   docker exec accelerator-backend node /app/dist/scripts/broadcastTestEvidence.js
 *   ...or against one airing:  OCCURRENCE=<uuid> node ...
 */
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PASS = 'PROVEN ';
const FAIL = 'NOT YET';
const INFO = '       ';

function row(state, ticket, claim, detail) {
  console.log(`  ${state}  ${ticket.padEnd(11)} ${claim.padEnd(38)} ${detail}`);
}

async function q(sql, replacements = {}) {
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}

async function main() {
  const only = process.env.OCCURRENCE || null;
  const scope = only ? 'AND o.id = :occ' : '';
  const reps = only ? { occ: only } : {};

  console.log('\nCOLABERRY LIVE - evidence from the airing'
    + (only ? `  (occurrence ${only.slice(0, 8)}...)` : '  (all occurrences)'));
  console.log('='.repeat(96));

  // The denominator for everything below. With no airing at all, every zero further down means
  // "nothing has run yet" rather than "the feature is broken", and saying so up front stops the
  // rest of the report being read as a wall of failures.
  const occs = await q(
    `SELECT o.id, o.title, o.editorial_state, o.provider, o.provider_session_id,
            o.provider_instance_uuid, o.content_started_at, o.ended_at, o.end_reason,
            o.provider_health, o.access_mode
       FROM broadcast_occurrences o
      WHERE 1=1 ${scope}
      ORDER BY o.created_at DESC
      LIMIT 10`, reps);

  if (!occs.length) {
    console.log('\n  NO OCCURRENCES AT ALL. Nothing has aired, so every check below would read');
    console.log('  zero for the same uninformative reason. Create a session with Broadcast ticked.\n');
    await sequelize.close();
    return;
  }

  console.log(`\n  ${occs.length} occurrence(s). Most recent first:\n`);
  occs.forEach((o) => {
    console.log(`    ${String(o.id).slice(0, 8)}  ${String(o.title || '').slice(0, 38).padEnd(38)}`
      + `  ${o.editorial_state.padEnd(13)} health=${o.provider_health}  access=${o.access_mode}`);
  });

  const target = occs[0];
  const id = target.id;
  console.log(`\n  Judging the most recent: ${String(id).slice(0, 8)} — "${String(target.title || '').slice(0, 40)}"\n`);
  console.log('-'.repeat(96));

  // L5.4 / L7.1 — the occurrence exists and is bound to something playable.
  row(target.provider_session_id ? PASS : FAIL, 'L5.4/L7.1',
    'occurrence bound to a live input',
    target.provider_session_id ? `${String(target.provider_session_id).slice(0, 8)}...` : 'provider_session_id is null');

  /**
   * L5.5 — DELIBERATELY NOT scored pass/fail from provider_health alone.
   *
   * The first version of this script did, and it read Test 2 as PROVEN: that occurrence
   * carries `provider_health = ready`. But Test 2 aired on 20 Oct, days before L5.5 existed,
   * and the value was hand-fed by a producer command. The column records THAT health was
   * set, never WHO set it, so a green mark here would have been a false positive in the one
   * tool whose whole job is to stop those.
   *
   * What actually distinguishes the loop is its log line, which this cannot read from SQL.
   */
  row(INFO, 'L5.5',
    'provider health (source unknown here)',
    `provider_health = ${target.provider_health}`
    + ' - confirm the LOOP by: docker logs accelerator-backend | grep broadcast_health_reported');

  // L8.4 — the recording was captured while it was on air.
  row(target.provider_instance_uuid ? PASS : FAIL, 'L8.4',
    'recording captured while on air',
    target.provider_instance_uuid ? `${String(target.provider_instance_uuid).slice(0, 8)}...` : 'provider_instance_uuid is null');

  // L8.4 — and published, so entitlement will actually allow a replay.
  row(target.editorial_state === 'replay_ready' ? PASS : INFO, 'L8.4',
    'replay published',
    target.editorial_state === 'replay_ready'
      ? 'editorial_state = replay_ready'
      : `editorial_state = ${target.editorial_state} (watchable states: live, reconnecting, replay_ready)`);

  // L7.4 — it ended itself rather than needing an engineer.
  row(target.end_reason === 'auto_stream_gone' ? PASS : INFO, 'L7.4',
    'ended itself after the stream stopped',
    target.end_reason
      ? `end_reason = ${target.end_reason}${target.end_reason === 'producer' ? ' (a person ended it)' : ''}`
      : 'end_reason is null (has not ended, or ended before L7.4)');

  // L7.3 — advancing the timeline wrote clip markers.
  const [clips] = await q(
    `SELECT count(*)::int AS n, COALESCE(min(timecode_seconds), 0)::int AS first,
            COALESCE(max(timecode_seconds), 0)::int AS last
       FROM broadcast_clip_markers WHERE occurrence_id = :id`, { id });
  row(clips.n > 0 ? PASS : FAIL, 'L7.3',
    'clip markers written on advance',
    clips.n > 0 ? `${clips.n} markers, ${clips.first}s to ${clips.last}s` : '0 markers');

  // L4.9 — measurement recorded something. Scoped to this occurrence so an older airing's
  // rows cannot make a silent failure look like a success.
  const [beats] = await q(
    `SELECT (SELECT count(*)::int FROM broadcast_viewer_sessions WHERE occurrence_id = :id) AS tabs,
            (SELECT count(*)::int FROM broadcast_viewer_people   WHERE occurrence_id = :id) AS people`, { id });
  row(beats.tabs > 0 ? PASS : FAIL, 'L4.9',
    'viewer heartbeats recorded',
    `${beats.tabs} tab sessions, ${beats.people} people`);

  // The anchor every clip timecode is measured from. A null here explains an empty clip list
  // completely, so it is reported as a cause rather than left for someone to deduce.
  row(target.content_started_at ? INFO : FAIL, 'L7.3/L5.1',
    'content anchor set',
    target.content_started_at
      ? new Date(target.content_started_at).toISOString()
      : 'content_started_at is null - NO clip marker could have been recorded');

  console.log('-'.repeat(96));

  if (clips.n > 0) {
    console.log('\n  THE CLIP LIST\n');
    const list = await q(
      `SELECT slide_index, timecode_seconds, label, segment_label
         FROM broadcast_clip_markers WHERE occurrence_id = :id
        ORDER BY timecode_seconds ASC LIMIT 40`, { id });
    list.forEach((c) => {
      const mm = String(Math.floor(c.timecode_seconds / 60)).padStart(2, '0');
      const ss = String(c.timecode_seconds % 60).padStart(2, '0');
      console.log(`    ${mm}:${ss}  #${String(c.slide_index).padEnd(3)} ${String(c.label || '').slice(0, 58)}`
        + (c.segment_label ? `   [${c.segment_label}]` : ''));
    });
  }

  console.log('\n  Anything marked NOT YET is a real gap for that ticket, not a reporting quirk.\n');
  await sequelize.close();
}
main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
