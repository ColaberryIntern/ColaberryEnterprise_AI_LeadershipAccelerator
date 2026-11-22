import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import { ROOM_LINK_GRACE_MS } from './roomLink';
import { roomProvider, type RecordingMode, type RecordingSeen } from './roomProvider';
import { escalateScopeMissing } from './zoomScopePreflight';
import { recordingNote, type RecState, type RoomView } from './roomView';

/**
 * Career Prep v27, CP9.1 (kit F5; execution contract "Safety rules"): the interview room's consent gate and its
 * recording rule. The room routes (routes/placementRoomRoutes.ts) are the ONLY place the provider's join link leaves the
 * server, and they get it only from openRoom below.
 *
 *   window      the room opens 10 minutes before the start and closes 2 hours after the end (the employer link's own
 *               expiry). Only a BOOKED interview at the booked time: the employer's link is signed over the end time,
 *               so a link for an earlier booking of a rescheduled interview answers 'moved', never the new meeting.
 *   consent     one decision per party (candidate, employer), the FIRST stands (interview_consents UNIQUE, ON CONFLICT
 *               DO NOTHING). Any decline = unrecorded, the flag stored (recording_consent 'declined'), no replay; the
 *               interview still goes ahead (D3). The join link is given only AFTER the caller's own decision is stored.
 *   recording   ON only through applyConsent, only at n of n consent (EXPECTED_PARTIES), and only for the CURRENT
 *               meeting (recording_meeting_id), so a rebook's new meeting (created off) is decided again. It runs under
 *               the interview row lock (taken FIRST, nothing else locked before it), so two parties consenting at the
 *               same moment see each other's decision and exactly one wins the 'pending' claim; the Zoom calls happen
 *               after the commit. Zoom scope missing (E6): no change attempted, 'unavailable', one escalation a day.
 *   read-back   the join link is given only when what Zoom says about the meeting's recording matches consent: 'on'
 *               only when recording_consent is 'on' for this meeting, 'off' otherwise. Recording on without full consent
 *               (a host account forcing it on, E5) or "cannot tell" withholds the link and opens one review item.
 * A pending claim that died (a crashed process) lapses after PENDING_LEASE_SECONDS and is claimed again.
 */
export const EXPECTED_PARTIES = ['candidate', 'employer'] as const;
export type Party = (typeof EXPECTED_PARTIES)[number];
export type Decision = 'consent' | 'decline';
export const OPENS_BEFORE_MS = 10 * 60_000;
export const PENDING_LEASE_SECONDS = 120;

export type Caller = { party: 'candidate'; enrollmentId: string } | { party: 'employer'; endMs: number };
export type RoomResult = { status: 'ok'; view: RoomView } | { status: 'not_found' | 'moved' | 'not_booked' | 'ended' | 'not_ready' } | { status: 'not_open'; opensAt: string };
type Gate = Exclude<RoomResult, { status: 'ok' }>;

interface Row { id: string; enrollment_id: string; state: string; company: string | null; position: string | null; starts_at: Date | string | null;
  minutes: number | null; room_provider_id: string | null; room_url: string | null; recording_consent: RecState | null;
  recording_meeting_id: string | null; readback_meeting_id: string | null; readback_recording: 'on' | 'off' | null }
interface DecisionRow { party: Party; party_ref: string; decision: Decision }

function log(level: 'warn' | 'error', event: string, context: Record<string, unknown>, errorClass: string): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event, outcome: 'failure', error_class: errorClass, context });
  if (level === 'error') console.error(line); else console.warn(line);
}
const errClass = (e: unknown) => ((e as Error)?.name && (e as Error).name !== 'Error' ? (e as Error).name : 'UpstreamUnavailable');
const q = async <T>(sql: string, replacements: Record<string, unknown>, transaction?: Transaction): Promise<T[]> =>
  (await sequelize.query(sql, { replacements, ...(transaction ? { transaction } : {}) }))[0] as T[];

/**
 * One decision per SIDE: an interview belongs to one learner, and the employer side holds one signed link (shared by the
 * contact and every interviewer), so the party is the reference. A per-interviewer consent would need its own identity.
 */
export const partyRef = (c: Caller): string => c.party;

const COLS = `i.id, i.enrollment_id, i.state, i.company, i.position, i.starts_at, i.minutes, i.room_provider_id, i.room_url, i.recording_consent,
  i.recording_meeting_id, i.readback_meeting_id, i.readback_recording`;
async function load(c: Caller, id: string): Promise<Row | undefined> {
  if (c.party === 'candidate') return (await q<Row>(`SELECT ${COLS} FROM placement_interviews i WHERE i.id = :id AND i.enrollment_id = :e`, { id, e: c.enrollmentId }))[0];
  return (await q<Row>(`SELECT ${COLS} FROM placement_interviews i WHERE i.id = :id`, { id }))[0];
}
const decisionsFor = (id: string, t?: Transaction) =>
  q<DecisionRow>('SELECT party, party_ref, decision FROM interview_consents WHERE interview_id = :id ORDER BY id', { id }, t);

/** Every room rule that does not depend on consent; null = the room is open to this caller. */
export function gate(r: Row | undefined, c: Caller, now: Date): Gate | null {
  if (!r) return { status: 'not_found' };
  const start = r.starts_at ? new Date(r.starts_at).getTime() : NaN;
  const end = start + Number(r.minutes ?? 30) * 60_000;
  if (c.party === 'employer' && end !== c.endMs) return { status: 'moved' };
  if (r.state !== 'booked' || Number.isNaN(start)) return { status: 'not_booked' };
  if (now.getTime() < start - OPENS_BEFORE_MS) return { status: 'not_open', opensAt: new Date(start - OPENS_BEFORE_MS).toISOString() };
  if (now.getTime() > end + ROOM_LINK_GRACE_MS) return { status: 'ended' };
  if (!r.room_provider_id || !r.room_url) return { status: 'not_ready' };
  return null;
}

/** The recording state that applies to the CURRENT meeting ('declined' applies to every meeting of the interview). */
export function currentState(r: Pick<Row, 'recording_consent' | 'recording_meeting_id' | 'room_provider_id'>): RecState | null {
  if (r.recording_consent === 'declined') return 'declined';
  return r.recording_meeting_id && r.recording_meeting_id === r.room_provider_id ? r.recording_consent : null;
}
const allConsented = (ds: DecisionRow[]) => EXPECTED_PARTIES.every((p) => ds.some((d) => d.party === p && d.decision === 'consent'));

const CLAIM = `UPDATE placement_interviews SET recording_consent = 'pending', recording_meeting_id = room_provider_id, recording_changed_at = NOW()
  WHERE id = :id AND state = 'booked' AND room_provider_id IS NOT NULL AND recording_consent IS DISTINCT FROM 'declined'
    AND (recording_meeting_id IS DISTINCT FROM room_provider_id OR recording_consent IS NULL
      OR (recording_consent = 'pending' AND recording_changed_at < NOW() - INTERVAL '${PENDING_LEASE_SECONDS} seconds'))
  RETURNING room_provider_id`;

/** Under the interview row lock: store this decision (first stands), then decline, wait, or claim the turn-on. */
async function decideLocked(id: string, party: Party, decision: Decision, ref: string): Promise<{ kind: 'gone' | 'declined' | 'waiting' | 'settled' } | { kind: 'claimed'; meetingId: string }> {
  return sequelize.transaction(async (t) => {
    if (!(await q('SELECT id FROM placement_interviews WHERE id = :id AND state = \'booked\' FOR UPDATE', { id }, t)).length) return { kind: 'gone' as const };
    await q(`INSERT INTO interview_consents (interview_id, party, party_ref, decision, decided_at) VALUES (:id, :party, :ref, :decision, NOW())
      ON CONFLICT (interview_id, party_ref) DO NOTHING`, { id, party, ref, decision }, t);
    const ds = await decisionsFor(id, t);
    if (ds.some((d) => d.decision === 'decline')) {
      await q(`UPDATE placement_interviews SET recording_consent = 'declined', recording_changed_at = NOW() WHERE id = :id AND recording_consent IS DISTINCT FROM 'declined'`, { id }, t);
      return { kind: 'declined' as const };
    }
    if (!allConsented(ds)) return { kind: 'waiting' as const };
    const won = await q<{ room_provider_id: string }>(CLAIM, { id }, t);
    return won[0] ? { kind: 'claimed' as const, meetingId: won[0].room_provider_id } : { kind: 'settled' as const };
  });
}

const FINISH = `UPDATE placement_interviews SET recording_consent = :state, recording_changed_at = NOW()
  WHERE id = :id AND recording_meeting_id = :m AND recording_consent = 'pending'`;
const FINISH_SEEN = `UPDATE placement_interviews SET recording_consent = :state, recording_changed_at = NOW(), readback_meeting_id = :m, readback_recording = :seen, readback_at = NOW()
  WHERE id = :id AND recording_meeting_id = :m AND recording_consent = 'pending'`;

/** After the commit: scope check, the change, the read-back. 'on' only when Zoom then SAYS it is on. */
async function turnOn(id: string, meetingId: string, mode: RecordingMode, now: Date): Promise<RecState> {
  const scopes = await roomProvider.canSetRecording();
  if (!scopes.ok) {
    await q(FINISH, { state: 'unavailable', id, m: meetingId });
    await escalateScopeMissing(scopes.missing, now).catch((e: unknown) => log('error', 'placement_zoom_scope_escalation_failed', { interview_id: id }, errClass(e)));
    return 'unavailable';
  }
  try { await roomProvider.setRecording(meetingId, mode); } catch (err) { log('error', 'placement_room_set_recording_failed', { interview_id: id }, errClass(err)); }
  const seen = await roomProvider.recording(meetingId); // read back even after a failure: the change may have applied
  const state: RecState = seen === 'on' ? 'on' : 'failed';
  await q(FINISH_SEEN, { state, id, m: meetingId, seen });
  return state;
}

/**
 * THE ONLY WAY RECORDING TURNS ON (contract: "Recording is off from the moment a room exists"). Records the party's
 * decision; at n of n consent, for the current meeting, asks the provider for recording on, once.
 */
export async function applyConsent(interviewId: string, party: Party, decision: Decision, ref: string = party, now: Date = new Date()): Promise<RecState | 'waiting' | 'gone' | 'settled'> {
  const d = await decideLocked(interviewId, party, decision, ref);
  if (d.kind !== 'claimed') return d.kind;
  return turnOn(interviewId, d.meetingId, 'cloud', now);
}

const READBACK = `UPDATE placement_interviews SET readback_meeting_id = :m, readback_recording = :seen, readback_at = NOW()
  WHERE id = :id AND room_provider_id = :m AND readback_recording IS NULL AND recording_consent IS DISTINCT FROM 'pending'`;

/** What Zoom says about the current meeting's recording: the stored read-back, else one GET now (stored when it answered). */
async function seenNow(r: Row): Promise<RecordingSeen> {
  const m = r.room_provider_id as string;
  if (r.readback_meeting_id === m && r.readback_recording) return r.readback_recording;
  const seen = await roomProvider.recording(m);
  if (seen) await q(READBACK, { m, seen, id: r.id });
  return seen;
}

async function withhold(r: Row, seen: RecordingSeen, expected: 'on' | 'off'): Promise<RoomView['join']> {
  const reason = seen === null ? 'cannot_tell' : 'mismatch';
  log('warn', 'placement_room_join_withheld', { interview_id: r.id, seen, expected }, 'RecordingMismatch');
  await q(`INSERT INTO placement_review_items (kind, source_event_id, enrollment_id, interview_id, summary)
    VALUES ('recording_mismatch', :src, :e, :id, CAST(:sum AS jsonb)) ON CONFLICT DO NOTHING`,
  { src: `recording_mismatch:${r.id}:${r.room_provider_id}:${seen ?? 'unknown'}`, e: r.enrollment_id, id: r.id,
    sum: JSON.stringify({ title: 'Meeting recording does not match consent', seen, expected, company: r.company }) })
    .catch((e: unknown) => log('error', 'placement_room_review_item_failed', { interview_id: r.id }, errClass(e)));
  return { status: 'withheld', url: null, reason: reason === 'cannot_tell'
    ? 'We could not confirm the meeting\'s recording setting. A recruiter is checking it; try again in a few minutes.'
    : 'The meeting\'s recording setting does not match everyone\'s choice. A recruiter is checking it; try again in a few minutes.' };
}

async function joinFor(r: Row, mine: Decision | null): Promise<RoomView['join']> {
  if (!mine) return { status: 'decide_first', url: null, reason: 'Choose whether this interview may be recorded first.' };
  const cur = currentState(r);
  if (cur === 'pending') return { status: 'starting', url: null, reason: 'Turning the recording on. This takes a few seconds.' };
  const expected = cur === 'on' ? 'on' : 'off';
  const seen = await seenNow(r);
  if (seen !== expected) return withhold(r, seen, expected);
  return { status: 'ready', url: r.room_url, reason: null };
}

function viewOf(r: Row, c: Caller, ds: DecisionRow[], mine: Decision | null, join: RoomView['join']): RoomView {
  const start = new Date(r.starts_at as Date);
  const consented = EXPECTED_PARTIES.filter((p) => ds.some((d) => d.party === p && d.decision === 'consent')).length;
  const cur = currentState(r);
  return { interviewId: r.id, you: c.party, company: r.company, role: r.position, startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + Number(r.minutes ?? 30) * 60_000).toISOString(), opensAt: new Date(start.getTime() - OPENS_BEFORE_MS).toISOString(),
    yourDecision: mine,
    consent: { consented, of: EXPECTED_PARTIES.length, declined: ds.some((d) => d.decision === 'decline'), label: `RECORDING ${consented} OF ${EXPECTED_PARTIES.length} CONSENTED` },
    recording: { status: cur === null ? 'off' : cur === 'pending' ? 'starting' : cur, note: recordingNote(cur) }, join };
}

/** The room for this caller: the gate, then (once the caller has decided) the join link if the read-back matches. */
export async function openRoom(c: Caller, id: string, now: Date = new Date()): Promise<RoomResult> {
  let r = await load(c, id);
  const g = gate(r, c, now);
  if (g) return g;
  let ds = await decisionsFor(id);
  const mine = ds.find((d) => d.party_ref === partyRef(c))?.decision ?? null;
  const cur = currentState(r as Row);
  if (mine && allConsented(ds) && (cur === null || cur === 'pending')) { // a rebook's new meeting, or a lapsed claim
    await applyConsent(id, c.party, mine, partyRef(c), now);
    r = await load(c, id);
    const g2 = gate(r, c, now);
    if (g2) return g2;
    ds = await decisionsFor(id);
  }
  return { status: 'ok', view: viewOf(r as Row, c, ds, mine, await joinFor(r as Row, mine)) };
}

/** The caller decides (the first decision stands), then sees the room as openRoom does. Closed rooms take no decision. */
export async function decide(c: Caller, id: string, decision: Decision, now: Date = new Date()): Promise<RoomResult> {
  const g = gate(await load(c, id), c, now);
  if (g) return g;
  const out = await applyConsent(id, c.party, decision, partyRef(c), now);
  if (out === 'gone') return { status: 'not_booked' };
  return openRoom(c, id, now);
}
