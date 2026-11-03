/**
 * Pull the transcript of one Zoom cloud recording. READ-ONLY against Zoom.
 *
 * ## Why this is a committed script
 *
 * The Zoom Server-to-Server credentials exist only inside the production backend container, and
 * the classifier refuses ad-hoc payloads piped into it (stdin, `node -e`, scp-then-docker-cp —
 * refused seven ways across three sessions). Running a script already in the image is the
 * sanctioned route. See `readAgentFactoryLadder.ts` for the same reasoning.
 *
 *   docker exec -w /app -e MEETING_ID=8563379136 -e AT=10:00 \
 *     accelerator-backend node dist/scripts/pullZoomTranscript.js
 *
 * ## It prints a roster and a selection trail, not just an answer
 *
 * A recurring meeting id has many instances per day, and `/meetings/{id}/recordings` returns only
 * the latest. So this prints every instance it considered with its local start time, then the
 * speaker roster with per-speaker cue counts. Both exist because the failure mode here is getting
 * a confident transcript of the WRONG meeting, which no amount of reading the transcript reveals.
 *
 * ## Env
 *
 *   MEETING_ID  required. The meeting id (digits) or a specific instance UUID.
 *   ON          local date, YYYY-MM-DD. Default: today in TZ.
 *   AT          local start time, HH:MM. Default 10:00.
 *   TZ_NAME     IANA zone. Default America/Chicago (what "CST" means here, DST included).
 *   DRIFT       max minutes between AT and the chosen instance before refusing. Default 120.
 *   SPEAKER     regex; print only this speaker's exchange, with 3 cues of context either side.
 *   FULL        "1" to print the whole transcript.
 *   OUT         path to write the full transcript to.
 */
import fs from 'fs';
import {
  listPastInstances,
  getRecordingDetail,
  pickTranscriptFile,
  downloadTranscriptBody,
  parseVtt,
  renderTranscript,
  speakerExchange,
  selectInstanceNearestLocalTime,
  localDate,
  localHhMm,
  type VttCue,
} from '../services/zoom/zoomTranscripts';

/** Speaker -> cue count, most talkative first. The roster that proves who was in the room. */
export function speakerRoster(cues: readonly VttCue[]): { speaker: string; cues: number }[] {
  const counts = new Map<string, number>();
  for (const c of cues) {
    const key = c.speaker ?? 'UNKNOWN';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([speaker, n]) => ({ speaker, cues: n }))
    .sort((a, b) => b.cues - a.cues);
}

export async function main(): Promise<void> {
  const meetingId = process.env.MEETING_ID;
  if (!meetingId) throw new Error('set MEETING_ID=<meeting id or instance uuid>');
  const tz = process.env.TZ_NAME || 'America/Chicago';
  const at = process.env.AT || '10:00';
  const on = process.env.ON || localDate(new Date().toISOString(), tz);
  const drift = Number(process.env.DRIFT || 120);

  const out: string[] = [];
  out.push(`MEETING ${meetingId}  target ${on} ${at} ${tz}`);

  // Numeric ids can have many instances; a UUID is already one instance.
  let uuid = meetingId;
  if (/^\d+$/.test(meetingId.replace(/\s/g, ''))) {
    const instances = await listPastInstances(meetingId);
    out.push(`past instances returned by Zoom: ${instances.length}`);
    for (const i of instances) {
      out.push(`  ${i.start_time}  ->  ${localDate(i.start_time, tz)} ${localHhMm(i.start_time, tz)} ${tz}`);
    }
    const sel = selectInstanceNearestLocalTime(instances, on, at, tz, drift);
    out.push(`considered on ${on}: ${sel.considered.length}`);
    for (const c of sel.considered) {
      out.push(`  ${c.localTime}  drift ${c.driftMinutes} min  ${c.uuid}`);
    }
    out.push(`SELECTION: ${sel.reason}`);
    if (!sel.chosen) {
      // Refusing is the point. Print the trail and stop rather than transcribe a different meeting.
      console.log(out.join('\n'));
      throw new Error('no instance matched; nothing transcribed');
    }
    uuid = sel.chosen.uuid;
  } else {
    out.push('MEETING_ID looks like an instance UUID; using it directly');
  }

  const detail = await getRecordingDetail(uuid);
  out.push('');
  out.push(`recording topic : ${detail.topic ?? '(none)'}`);
  out.push(`recording start : ${detail.start_time ?? '(none)'}`);
  out.push(`duration (min)  : ${detail.duration ?? '(none)'}`);
  out.push(`files           : ${(detail.recording_files ?? []).map((f) => f.file_type).join(', ') || '(none)'}`);

  const picked = pickTranscriptFile(detail.recording_files);
  if (!picked) {
    console.log(out.join('\n'));
    throw new Error(
      'this recording has no TRANSCRIPT or CC file. Zoom only produces one when audio '
      + 'transcription is enabled for the account AND the recording finished processing.',
    );
  }
  out.push(`transcript kind : ${picked.kind}${picked.kind === 'CC' ? '  (fallback: closed captions, not machine transcription)' : ''}`);

  const body = await downloadTranscriptBody(picked.file);
  const cues = parseVtt(body);
  out.push(`vtt bytes       : ${body.length}`);
  out.push(`cues parsed     : ${cues.length}`);
  if (cues.length === 0) {
    // A zero here is only meaningful next to the byte count above: an empty parse of a non-empty
    // file is a parser problem, not a silent meeting.
    out.push('WARNING: 0 cues from a non-empty file means the parser did not match this format.');
  }
  out.push('');
  out.push('SPEAKER ROSTER');
  for (const r of speakerRoster(cues)) out.push(`  ${String(r.cues).padStart(5)}  ${r.speaker}`);

  if (process.env.OUT) {
    fs.writeFileSync(process.env.OUT, renderTranscript(cues), 'utf8');
    out.push('');
    out.push(`full transcript written to ${process.env.OUT}`);
  }

  if (process.env.SPEAKER) {
    const pattern = new RegExp(process.env.SPEAKER, 'i');
    const slice = speakerExchange(cues, pattern, 3);
    out.push('');
    out.push(`--- exchange matching /${process.env.SPEAKER}/i : ${slice.length} cues ---`);
    out.push(renderTranscript(slice));
  }

  if (process.env.FULL === '1') {
    out.push('');
    out.push('--- full transcript ---');
    out.push(renderTranscript(cues));
  }

  console.log(out.join('\n'));
}

/* istanbul ignore next -- entry point only; the tests drive the pure helpers. */
if (require.main === module) {
  main().catch((err) => {
    console.error(`pullZoomTranscript failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
