import { getOwnedProjectTree } from '../projects/projectReadService';
import PresentationAssignment from '../../models/PresentationAssignment';
import PresentationAttempt from '../../models/PresentationAttempt';
import RoomBooking from '../../models/RoomBooking';
import type { PresentationAttemptMode } from '../../models/PresentationAttempt';
import { presentationTypeLabel } from './takePresentationType';

/**
 * Which room a learner's demo actually happens in.
 *
 * WHY THE BOOKING HANGS OFF THE ATTEMPT, NOT THE ASSIGNMENT. An assignment is "this
 * student must present PREP-3". A student may rehearse it four times and present it
 * once, each in a different room, and the recording of take three has to stay
 * attached to take three. Hanging one `booking_id` off the assignment would make the
 * fourth rehearsal overwrite the first three. `presentation_attempts.booking_id`
 * already exists and is indexed for exactly this, so this module adds no schema.
 *
 * WHY NO JOIN URL IS RETURNED HERE. `roomBookingService.joinBooking` re-checks the
 * caller's entitlement on every single call and is the only sanctioned way to hand
 * out a join link. If this read-path DTO carried the URL, entitlement would be
 * evaluated once at page load and the link would stay valid in the payload after
 * access was revoked. So the DTO carries `meetingReady` — whether a meeting exists —
 * and the student fetches the URL at launch. The provider's privileged host/start
 * URL is never projected anywhere in this file.
 *
 * NOTHING HERE COMPLETES A TASK, and nothing here awards points.
 */

/** A room/session as a learner may see it. Deliberately has no URL field. */
export interface SessionView {
  attemptId: string;
  attemptNo: number;
  mode: PresentationAttemptMode;
  attemptState: string;
  recordingState: string;
  bookingId: string | null;
  roomId: string | null;
  title: string | null;
  /** ISO-8601, or null while the booking is still being scheduled. */
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  /** The booking lifecycle column is `state`, not `status`. */
  bookingState: string | null;
  /**
   * True once the outbox worker has provisioned a meeting. `createBooking` returns
   * BEFORE the link exists, so a UI that assumes a fresh booking is joinable will
   * show a dead button for a few seconds. This flag is what it should gate on.
   */
  meetingReady: boolean;
  recordingPolicy: string | null;
  /**
   * The learner's own takes, in the order they happened, so the panel can offer a
   * player. Ids only — the file is served by its own ownership-checked route and a
   * URL is never put on this payload, for the same reason `meetingReady` is a flag
   * rather than the meeting link.
   *
   * A split recording is genuinely several parts; offering only the first would
   * silently hide the half of a rehearsal that came after the break.
   */
  recordings: Array<PracticeTake>;
}

/**
 * Where a take stands between "only mine" and "my cohort is watching it".
 *
 * THREE STATES, NOT TWO, because the middle one is the one a student gets wrong.
 * Having asked to share, they must not believe it is already public — nor that
 * nothing happened. "Waiting for staff approval" is the honest answer to both, and
 * a boolean cannot express it.
 */
export type TakeShareState = 'private' | 'pending' | 'published';

/**
 * One rehearsal take as the Practice panel shows it.
 *
 * `shareState` exists so the panel can stop calling a take private once it is not.
 * Step 4 labelled every take "Private — only you can see this", which held only until
 * the publish flow existed and then became the most misleading sentence on the page:
 * a student reading it believes a demo their cohort is already watching is for their
 * eyes only. It is an ATTEMPT-level fact, because a showcase is keyed on the attempt
 * rather than on one take, and it is reported at that granularity rather than guessed
 * at a finer one.
 */
export interface PracticeTake {
  id: string;
  partNo: number;
  playbackUrl: string;
  shareState: TakeShareState;
  /**
   * The live showcase for this take, when there is one. The switch needs it to turn
   * sharing back OFF, and carrying it here saves the page a second round trip just
   * to learn the id of something it is already displaying.
   */
  showcaseId: string | null;
  /**
   * Distinct people who have watched, excluding the owner. Only meaningful once
   * published — a private take has no audience by definition — so it is 0 until
   * then rather than null, because a blank where a number belongs reads as a bug.
   */
  viewCount: number;
  /** The sentence shown to the learner, composed server-side so it cannot drift. */
  viewLabel: string;
  /**
   * What kind of presentation this take is, as it will be filed and posted.
   *
   * EFFECTIVE, not raw: the take's own classification when the learner has set
   * one, otherwise the task's Learn-stage template. A learner records several
   * takes in one room and usually means the task's type for all of them, so
   * inheriting keeps the common case at zero clicks — while `typeSource` lets the
   * page say where the answer came from instead of presenting a guess as a choice.
   */
  presentationType: string | null;
  presentationTypeLabel: string | null;
  typeSource: 'take' | 'task' | 'unset';
}

export type SessionResult =
  | { ok: true; session: SessionView | null }
  | { ok: false; reason: 'not_found' };

/**
 * `null` means "your assignment, but nothing is booked yet" — a 200 with no session.
 * `not_found` means "not yours, or no such thing", and the two are deliberately
 * indistinguishable to the caller so probing project ids reveals nothing.
 */
export function toSessionView(
  attempt: PresentationAttempt,
  booking: RoomBooking | null,
  /** Empty for every caller that has not looked them up; never fabricated. */
  recordings: Array<PracticeTake> = [],
): SessionView {
  return {
    attemptId: String(attempt.id),
    attemptNo: attempt.attempt_no,
    mode: (attempt.mode || 'practice_solo') as PresentationAttemptMode,
    attemptState: attempt.attempt_state || 'draft',
    recordingState: attempt.recording_state || 'expected',
    bookingId: attempt.booking_id ? String(attempt.booking_id) : null,
    roomId: attempt.room_id ? String(attempt.room_id) : null,
    title: booking?.title ?? null,
    startAt: booking?.start_at ? new Date(booking.start_at).toISOString() : null,
    endAt: booking?.end_at ? new Date(booking.end_at).toISOString() : null,
    timezone: booking?.timezone ?? null,
    bookingState: booking?.state ?? null,
    // Presence of a link, never the link itself.
    meetingReady: Boolean(booking?.meeting_link),
    recordingPolicy: booking?.recording_policy ?? null,
    recordings,
  };
}

/**
 * The ingested takes for one attempt, earliest part first.
 *
 * `ingested` only: a recording parked in review belongs to nobody yet, and offering
 * it for playback could hand a learner another cohort member's rehearsal.
 */
export async function recordingsForAttempt(
  attemptId: string,
  /** Issuing a playback ticket needs the viewer and the path it will be fetched at. */
  ticketFor?: { enrollmentId: string; projectId: string; storyId: string },
): Promise<Array<PracticeTake>> {
  // THE MODEL, NOT RAW SQL. Everything else in this module reads through models, and
  // a raw query here opened a real connection in a suite that mocks only the models —
  // which is both a broken test and the wrong shape for this file.
  // THE TASK'S TYPE, as the fallback each take inherits. Read once: it is a
  // property of the assignment, not of any one recording.
  const { sequelize } = await import('../../config/database');
  const [taskRows] = await sequelize.query(
    `SELECT asg.template_slug
       FROM presentation_attempts    a
       JOIN presentation_assignments asg ON asg.id = a.assignment_id
      WHERE a.id = :attemptId
      LIMIT 1`,
    { replacements: { attemptId } },
  ) as [Array<{ template_slug: string | null }>, unknown];
  const taskType = taskRows?.[0]?.template_slug || null;

  const { default: PresentationRecording } = await import('../../models/PresentationRecording');
  const rows = await PresentationRecording.findAll({
    where: { attempt_id: attemptId, ingest_status: 'ingested' },
    order: [['part_no', 'ASC'], ['created_at', 'ASC']],
  });
  const { createRecordingTicket } = await import('./recordingTicket');

  // WHERE DOES EACH TAKE STAND? Asked PER RECORDING, because that is what the
  // learner shares. Keyed on the attempt until 2026-10-18, which meant publishing
  // one take marked all of them published — a switch on take three would have
  // flipped takes one and two while appearing to flip one.
  //
  // A LIVE showcase is one not taken back down: `withdrawn_at` matters as much as
  // `published_at`, because a withdrawn demo really is private again. Among live
  // rows, `published_at` separates "waiting for staff" from "they can see it".
  //
  // THROUGH THE MODEL, for the reason stated above: the first version of this used
  // `sequelize.query` and opened a real Postgres connection in suites that mock only
  // the models, taking 4 tests red with `SequelizeConnectionRefusedError`. The
  // warning was already written here and I added the raw query anyway.
  //
  // ONE QUERY FOR THE WHOLE ATTEMPT, not one per take: a rehearsal with six takes
  // should not cost six round trips to render.
  const { default: PresentationShowcase } = await import('../../models/PresentationShowcase');
  const live = await PresentationShowcase.findAll({
    where: { attempt_id: attemptId, withdrawn_at: null },
    attributes: ['id', 'recording_id', 'published_at'],
  });
  const stateByRecording = new Map<string, TakeShareState>();
  const showcaseByRecording = new Map<string, string>();
  for (const s of live || []) {
    if (!s.recording_id) continue;
    stateByRecording.set(String(s.recording_id), s.published_at ? 'published' : 'pending');
    showcaseByRecording.set(String(s.recording_id), String(s.id));
  }

  // Counted once for every take here, rather than per take, for the same reason the
  // showcase lookup is one query.
  const { viewCounts, describeViews } = await import('./recordingViews');
  const counts = await viewCounts((rows || []).map((r: any) => String(r.id)));

  return (rows || []).map((r: any) => {
    const id = String(r.id);
    const takeType = (r as any).presentation_type || null;
    // The URL carries its own authority, because a <video> element cannot send a
    // bearer header. Minted per read, so it expires shortly after the page does.
    const ticket = ticketFor ? createRecordingTicket(id, ticketFor.enrollmentId) : '';
    const base = ticketFor
      ? `/api/portal/projects/${encodeURIComponent(ticketFor.projectId)}/tasks/${encodeURIComponent(ticketFor.storyId)}/recordings/${encodeURIComponent(id)}/file`
      : '';
    return {
      id,
      partNo: Number(r.part_no) || 1,
      playbackUrl: base ? `${base}?t=${encodeURIComponent(ticket)}` : '',
      // Absent from the map means no live showcase names this take: private.
      shareState: stateByRecording.get(id) ?? 'private',
      showcaseId: showcaseByRecording.get(id) ?? null,
      viewCount: counts[id] ?? 0,
      viewLabel: describeViews(counts[id] ?? 0),
      presentationType: takeType || taskType || null,
      presentationTypeLabel: presentationTypeLabel(takeType || taskType),
      // Said plainly so the page can distinguish "you chose this" from "this came
      // from your task", rather than showing an inherited value as a decision.
      typeSource: takeType ? 'take' : (taskType ? 'task' : 'unset'),
    };
  });
}

/** The assignment row for a task the caller demonstrably owns, or null. */
async function ownedAssignment(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<PresentationAssignment | null> {
  // Ownership first, every time, through the same helper the rest of the projects
  // surface uses. Checking the assignment row's own columns instead would trust a
  // table this module also writes.
  const tree = await getOwnedProjectTree(enrollmentId, projectId);
  if (!tree) return null;
  return PresentationAssignment.findOne({ where: { project_id: projectId, story_id: storyId } });
}

/**
 * The session a learner should be looking at for one demo-prep task.
 *
 * "One assignment resolves to one room/session" is resolved as the HIGHEST attempt
 * number that actually carries a booking — not the newest row by timestamp. Attempt
 * numbers are allocated against a unique `(assignment_id, attempt_no)` index, so they
 * are a total order even when two rows are written in the same millisecond, which
 * `created_at` is not.
 */
export async function resolveSessionForAssignment(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<SessionResult> {
  const assignment = await ownedAssignment(enrollmentId, projectId, storyId);
  if (!assignment) return { ok: false, reason: 'not_found' };

  const attempts = await PresentationAttempt.findAll({
    where: { assignment_id: assignment.id },
    order: [['attempt_no', 'DESC']],
  });
  const booked = attempts.find((a) => a.booking_id);
  if (!booked) return { ok: true, session: null };

  const booking = await RoomBooking.findByPk(String(booked.booking_id));

  // A booking that names a DIFFERENT project is an inconsistency, not something to
  // render. Showing it would leak another project's room title and timing into this
  // student's page. A cohort booking legitimately names no project at all, so only a
  // mismatch is rejected — an absent `related_project_id` is fine.
  if (booking && booking.related_project_id && String(booking.related_project_id) !== String(projectId)) {
    return { ok: true, session: toSessionView(booked, null) };
  }

  // Looked up only on the single-session read, which is the one the Practice panel
  // calls. The list and the create paths deliberately leave it empty rather than
  // issue a query per attempt for something those screens do not render.
  const takes = await recordingsForAttempt(String(booked.id), { enrollmentId, projectId, storyId });
  return { ok: true, session: toSessionView(booked, booking, takes) };
}

/**
 * Every attempt for the task, newest first — the Practice stage's history list.
 *
 * Bookings are fetched in ONE query rather than per attempt: a student with eight
 * rehearsals would otherwise cost nine round trips to render one panel.
 */
export async function listSessionsForAssignment(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<{ ok: true; sessions: SessionView[] } | { ok: false; reason: 'not_found' }> {
  const assignment = await ownedAssignment(enrollmentId, projectId, storyId);
  if (!assignment) return { ok: false, reason: 'not_found' };

  const attempts = await PresentationAttempt.findAll({
    where: { assignment_id: assignment.id },
    order: [['attempt_no', 'DESC']],
  });
  if (attempts.length === 0) return { ok: true, sessions: [] };

  const ids = Array.from(new Set(attempts.map((a) => a.booking_id).filter(Boolean))) as string[];
  const bookings = ids.length ? await RoomBooking.findAll({ where: { id: ids } }) : [];
  const byId = new Map(bookings.map((b) => [String(b.id), b]));

  return {
    ok: true,
    sessions: attempts.map((a) => {
      const b = a.booking_id ? byId.get(String(a.booking_id)) ?? null : null;
      // Same cross-project guard as the single resolve above.
      const safe = b && b.related_project_id && String(b.related_project_id) !== String(projectId) ? null : b;
      return toSessionView(a, safe);
    }),
  };
}
