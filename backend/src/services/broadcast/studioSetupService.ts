import { sequelize } from '../../config/database';
import LiveSession from '../../models/LiveSession';
import { BroadcastAccessMode } from '../../models/BroadcastOccurrence';
import { ensureOccurrenceForSession, EnsureRefusal } from './broadcastSessionOccurrence';

/**
 * studioSetupService — D4 (P4-01), the configuration a class needs before it can air.
 *
 * Until this existed, the whole of broadcast configuration was one checkbox on the Accelerator
 * admin page. Three decisions the show depends on were implicit, impossible, or decided by the
 * class's TITLE. Studio setup makes them explicit and refuses to create a broadcast until they
 * are made.
 *
 * ## The one thing that cannot be undone
 *
 * `access_mode` is write-once. The schema says so — `ensureBroadcastSchema.ts:101-102`, "a later
 * policy edit is a new version, never an in-place widening of who could watch" — and the
 * surrounding facts make it final in practice: `uq_broadcast_source_ref` permits exactly one
 * occurrence per session for all time, and `cancelled` is terminal with no outbound transition
 * (`broadcastStateMachine.ts:49`).
 *
 * So an operator who picks the wrong access mode CANNOT fix it from any screen, ever. Recovery is
 * a deliberate database action: delete the `broadcast_source_refs` row and the occurrence, which
 * cascades. That is why `canSetAccessMode` is part of the read, why the write refuses a change
 * rather than attempting one, and why the screen demands an acknowledgement before Create
 * unlocks. The checkbox is not ceremony; it is the only protection a user has here.
 */

export interface StudioOccurrence {
  id: string;
  access_mode: BroadcastAccessMode;
  editorial_state: string;
  version: number;
  /** Null means real, correctly gated and unplayable. The 20 October finding. */
  provider_session_id: string | null;
}

export interface StudioConfig {
  session: {
    id: string;
    title: string;
    cohort_id: string;
    session_date: string | null;
    start_time: string | null;
    end_time: string | null;
  };
  presenter_enrollment_id: string | null;
  producer_enrollment_id: string | null;
  guest_access: boolean | null;
  /** The occurrence this session is linked to, or null when it has never been created. */
  occurrence: StudioOccurrence | null;
  /**
   * Whether the access mode is still choosable. False once an occurrence exists, because the
   * decision is write-once. The screen reads this rather than inferring it from `occurrence`,
   * so the rule lives in one place and the UI cannot drift from the server's answer.
   */
  canSetAccessMode: boolean;
}

/** Everything the write can refuse for, each with a reason a person can act on. */
export type StudioWriteRefusal =
  | EnsureRefusal
  | 'producer_is_presenter'
  | 'access_mode_is_permanent'
  | 'version_conflict';

export interface StudioWriteResult {
  ok: boolean;
  refusal?: StudioWriteRefusal;
  config?: StudioConfig;
}

export interface StudioWriteInput {
  presenter_enrollment_id?: string | null;
  producer_enrollment_id?: string | null;
  guest_access?: boolean | null;
  access_mode?: BroadcastAccessMode;
  /** Required when an occurrence already exists, so two tabs cannot overwrite each other. */
  expected_version?: number;
  /** When true, create the occurrence. Absent means save the configuration only. */
  create?: boolean;
}

export interface StudioSessionRow {
  id: string;
  title: string;
  session_date: string | null;
  start_time: string | null;
  cohort_id: string;
  cohort_name: string | null;
  /** Null when this class has no broadcast yet. */
  editorial_state: string | null;
  access_mode: string | null;
}

/**
 * The classes an operator might want to configure.
 *
 * A nav entry is static, so it cannot carry a session id — which is why this list exists at all.
 * Without it, "reach Studio setup from the admin menu" has nowhere to land.
 *
 * Scoped to a window around today rather than every session ever taught: the operator is setting
 * up a class that is about to happen or just did, and a list of several hundred historical
 * sessions would bury the handful that matter. The window is generous on the past side because a
 * class that aired yesterday is still something you might open to check what it was set to.
 *
 * LEFT JOIN, deliberately: a session with no broadcast must still appear, because configuring one
 * for the first time is the whole point of the screen. An INNER JOIN would show only classes that
 * are already set up.
 */
export async function listStudioSessions(): Promise<StudioSessionRow[]> {
  const [rows] = await sequelize.query(
    `SELECT s.id,
            s.title,
            s.session_date,
            s.start_time,
            s.cohort_id,
            c.name AS cohort_name,
            o.editorial_state,
            o.access_mode
       FROM live_sessions s
       LEFT JOIN cohorts c ON c.id = s.cohort_id
       LEFT JOIN broadcast_source_refs r
              ON r.source_type = 'live_session' AND r.source_id = s.id
       LEFT JOIN broadcast_occurrences o ON o.id = r.occurrence_id
      WHERE s.session_date >= (CURRENT_DATE - INTERVAL '30 days')
        AND s.session_date <= (CURRENT_DATE + INTERVAL '120 days')
      ORDER BY s.session_date ASC, s.start_time ASC
      LIMIT 200`,
  );
  return rows as StudioSessionRow[];
}

/**
 * The occurrence for a session, reached the only way this schema allows.
 *
 * There is no session column on `broadcast_occurrences`; `broadcast_source_refs` is the link.
 * Anything that tries to join directly is looking for a column that does not exist.
 */
async function occurrenceForSession(sessionId: string): Promise<StudioOccurrence | null> {
  const [rows] = await sequelize.query(
    `SELECT o.id, o.access_mode, o.editorial_state, o.version, o.provider_session_id
       FROM broadcast_source_refs r
       JOIN broadcast_occurrences o ON o.id = r.occurrence_id
      WHERE r.source_type = 'live_session' AND r.source_id = :sid
      LIMIT 1`,
    { replacements: { sid: sessionId } },
  );
  const list = rows as StudioOccurrence[];
  return list.length ? list[0] : null;
}

/**
 * Everything the screen renders, from a session id alone.
 *
 * That is the whole contract: Studio setup opens in its own browser tab, so it starts with no
 * in-app state whatsoever. If a field is not in this payload the screen cannot show it, and the
 * deep link is broken for that field. Returns null when the session does not exist.
 */
export async function readStudioConfig(sessionId: string): Promise<StudioConfig | null> {
  const s = await LiveSession.findByPk(sessionId);
  if (!s) return null;

  const occurrence = await occurrenceForSession(sessionId);

  return {
    session: {
      id: String(s.get('id')),
      title: String(s.get('title') || ''),
      cohort_id: String(s.get('cohort_id') || ''),
      session_date: (s.get('session_date') as string) ?? null,
      start_time: (s.get('start_time') as string) ?? null,
      end_time: (s.get('end_time') as string) ?? null,
    },
    presenter_enrollment_id: (s.get('presenter_enrollment_id') as string) ?? null,
    producer_enrollment_id: (s.get('producer_enrollment_id') as string) ?? null,
    guest_access: (s.get('guest_access') as boolean) ?? null,
    occurrence,
    canSetAccessMode: occurrence === null,
  };
}

/**
 * Apply a configuration change, and optionally create the broadcast.
 *
 * Every refusal is returned rather than thrown, because every one of them is an expected answer
 * the screen must render as a sentence. A thrown error here would become a 500 and tell the
 * operator nothing.
 */
export async function writeStudioConfig(
  sessionId: string,
  input: StudioWriteInput,
): Promise<StudioWriteResult> {
  const current = await readStudioConfig(sessionId);
  if (!current) return { ok: false };

  /*
   * Producer must not be the presenter, refused SERVER-SIDE.
   *
   * The screen blocks it too, but a rule enforced only in the browser is a rule you do not have.
   * The reason it exists at all: the presenter cannot watch stream health and teach at the same
   * time, which is what FC4.2 is about.
   *
   * Resolved against what the write WOULD leave behind, not against the body alone, so sending
   * only one of the two fields cannot sneak past by leaving the other unmentioned.
   */
  const presenter = input.presenter_enrollment_id !== undefined
    ? input.presenter_enrollment_id : current.presenter_enrollment_id;
  const producer = input.producer_enrollment_id !== undefined
    ? input.producer_enrollment_id : current.producer_enrollment_id;
  if (presenter && producer && presenter === producer) {
    return { ok: false, refusal: 'producer_is_presenter' };
  }

  // Write-once, and the refusal has to be explicit. Quietly ignoring the field would leave an
  // operator believing they had changed something permanent.
  if (input.access_mode !== undefined && !current.canSetAccessMode) {
    if (input.access_mode !== current.occurrence?.access_mode) {
      return { ok: false, refusal: 'access_mode_is_permanent' };
    }
  }

  // Optimistic concurrency, but only where there is a version to conflict on.
  if (current.occurrence && input.expected_version !== undefined
      && input.expected_version !== current.occurrence.version) {
    return { ok: false, refusal: 'version_conflict' };
  }

  const patch: Record<string, unknown> = {};
  if (input.presenter_enrollment_id !== undefined) patch.presenter_enrollment_id = input.presenter_enrollment_id;
  if (input.producer_enrollment_id !== undefined) patch.producer_enrollment_id = input.producer_enrollment_id;
  if (input.guest_access !== undefined) patch.guest_access = input.guest_access;
  if (Object.keys(patch).length) {
    await LiveSession.update(patch, { where: { id: sessionId } });
  }

  if (input.create) {
    const session = await LiveSession.findByPk(sessionId);
    /*
     * The room is RESOLVED, not read off the session: `live_sessions` has no `room_id` column.
     * `room_id` is the only key joining a broadcast occurrence to anything else in the portal,
     * and `resolveRoomId` reaches it through `ensureRoomForSession`, which returns the room
     * whether it created one or found one — so this is safe to call for an existing session and
     * safe to call twice.
     *
     * It returns null when community rooms are switched off, which `ensureOccurrenceForSession`
     * then refuses with `no_room`. That refusal reaching the operator as a sentence is the whole
     * point of returning refusals rather than throwing.
     *
     * Imported lazily to match how acceleratorService itself reaches across these modules, and
     * to keep this service loadable in a test without dragging the room stack in.
     */
    const { resolveRoomId } = await import('../acceleratorService');
    const roomId = await resolveRoomId({ id: sessionId });
    const result = await ensureOccurrenceForSession(
      session as any,
      roomId,
      input.access_mode ?? 'private',
    );
    if (result.outcome === 'refused') {
      // The configuration above is already saved. That is deliberate: an operator who fixes the
      // room and presses Create again should not have to re-enter everything.
      return {
        ok: false,
        refusal: result.reason,
        config: await readStudioConfig(sessionId) ?? undefined,
      };
    }
  }

  return { ok: true, config: await readStudioConfig(sessionId) ?? undefined };
}
