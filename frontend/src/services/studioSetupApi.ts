import api from '../utils/api';

/**
 * studioSetupApi — D4 (P4-01), the configuration a Colaberry Live class needs before it airs.
 *
 * Mirrors `backend/src/services/broadcast/studioSetupService.ts` exactly. Two calls: read
 * everything the screen renders from a session id, and apply a change.
 *
 * ## Why the read returns the whole screen
 *
 * Studio setup opens in its own browser tab from the admin nav, so it begins with no in-app
 * state at all - no cached session, no prior navigation, nothing passed in props. Whatever is
 * not in this payload cannot be rendered. That is the deep-link contract, and it is why this
 * client has no "merge with what we already had" path.
 */

export type BroadcastAccessMode = 'free' | 'paid' | 'preview' | 'private';

export interface StudioOccurrence {
  id: string;
  access_mode: BroadcastAccessMode;
  editorial_state: string;
  version: number;
  /** Null means real, correctly gated, and unplayable. Worth warning about on screen. */
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
  occurrence: StudioOccurrence | null;
  /** The server's answer, not something the screen infers. One rule, one place. */
  canSetAccessMode: boolean;
}

/**
 * Everything the write can refuse for.
 *
 * These codes NEVER reach a person. `REFUSAL_COPY` below turns each into a sentence; printing a
 * server reason code to a user is a copy-rule violation in this repo, and these in particular
 * would be meaningless to the operator they are shown to.
 */
export type StudioRefusal =
  | 'no_room'
  | 'undeterminable_start'
  | 'already_aired'
  | 'cancelled'
  | 'no_live_input'
  | 'producer_is_presenter'
  | 'access_mode_is_permanent'
  | 'version_conflict'
  | 'invalid_body';

export interface StudioWriteInput {
  presenter_enrollment_id?: string | null;
  producer_enrollment_id?: string | null;
  guest_access?: boolean | null;
  access_mode?: BroadcastAccessMode;
  expected_version?: number;
  create?: boolean;
}

export interface StudioWriteOutcome {
  ok: boolean;
  refusal?: StudioRefusal;
  config?: StudioConfig;
}

/**
 * What each refusal means to the person who caused it.
 *
 * Every sentence says what went wrong AND what to do next, because an error that only names the
 * problem leaves an operator stuck. `access_mode_is_permanent` is the longest on purpose: it is
 * the one with no in-product fix, so the sentence has to be honest that this needs someone with
 * database access rather than implying a button exists.
 */
export const REFUSAL_COPY: Record<StudioRefusal, string> = {
  no_room:
    'This class has no room yet, so there is nothing for the broadcast to attach to. '
    + 'Check that community rooms are switched on, then try again.',
  undeterminable_start:
    'The start time could not be worked out from this session. Set a date and a start time on '
    + 'the session, then come back.',
  already_aired:
    'This class has already gone on air, so its broadcast cannot be set up again.',
  cancelled:
    'This broadcast was cancelled, and a cancelled airing cannot be put back on air. The class '
    + 'needs a new session to be broadcast.',
  no_live_input:
    'No live input could be reserved, so the broadcast would exist and be unplayable. This is '
    + 'usually a provider configuration problem rather than anything about this class.',
  producer_is_presenter:
    'The producer has to be someone other than the presenter. Whoever is teaching cannot also '
    + 'watch the stream health and run the show.',
  access_mode_is_permanent:
    'Who can watch was set when this broadcast was created and cannot be changed from any '
    + 'screen. Fixing it means deleting the broadcast and creating it again, which needs '
    + 'someone with database access.',
  version_conflict:
    'Someone else changed this broadcast while you were working. Reload the page to see their '
    + 'changes before saving yours.',
  invalid_body:
    'Something in the form was not understood. Reload the page and try again.',
};

export async function getStudioConfig(sessionId: string): Promise<StudioConfig> {
  const { data } = await api.get(`/api/admin/accelerator/sessions/${sessionId}/studio`);
  return data.config as StudioConfig;
}

/**
 * Apply a change. A refusal is a normal answer here, not an exception: the server returns 400 or
 * 409 with a machine-readable reason, and the screen renders the matching sentence. Only an
 * unexpected failure is rethrown.
 */
export async function patchStudioConfig(
  sessionId: string,
  input: StudioWriteInput,
): Promise<StudioWriteOutcome> {
  try {
    const { data } = await api.patch(
      `/api/admin/accelerator/sessions/${sessionId}/studio`,
      input,
    );
    return { ok: true, config: data.config as StudioConfig };
  } catch (err: any) {
    const status = err?.response?.status;
    const reason = err?.response?.data?.reason as StudioRefusal | undefined;
    if ((status === 400 || status === 409) && reason) {
      return { ok: false, refusal: reason, config: err.response.data.config ?? undefined };
    }
    throw err;
  }
}

export interface StudioSessionRow {
  id: string;
  title: string;
  session_date: string | null;
  start_time: string | null;
  cohort_id: string;
  cohort_name: string | null;
  /** Null when the class has no broadcast yet. That is the common case on this list. */
  editorial_state: string | null;
  access_mode: string | null;
}

/**
 * The classes an operator can configure.
 *
 * This call exists because an admin nav entry is static and cannot carry a session id. The menu
 * link lands on the index, the operator picks a class, and the detail screen is deep-linkable
 * from there.
 */
export async function listStudioSessions(): Promise<StudioSessionRow[]> {
  const { data } = await api.get('/api/admin/accelerator/live/sessions');
  return data.sessions as StudioSessionRow[];
}

export interface StudioStaff {
  enrollment_id: string;
  name: string;
  email: string;
}

/**
 * Who can be named presenter or producer, searched by name or email.
 *
 * Returns an EMPTY LIST on a bad shape and THROWS on a failed request, deliberately. The
 * picker renders those two differently - "nobody called that" against "the lookup is not
 * answering" - and it can only do that if this does not flatten them into one.
 */
export async function searchStudioStaff(q: string): Promise<StudioStaff[]> {
  const res = await api.get<{ staff?: StudioStaff[] }>(
    `/api/admin/accelerator/live/staff?q=${encodeURIComponent(q)}`,
  );
  return Array.isArray(res.data?.staff) ? res.data.staff : [];
}
