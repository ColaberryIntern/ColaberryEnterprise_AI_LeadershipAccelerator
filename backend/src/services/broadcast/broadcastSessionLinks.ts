/**
 * The audience-facing entry points for a session, and the server's answer to "what is
 * happening right now".
 *
 * Without these, every show needs somebody to assemble links by hand before it can be
 * promoted. L7.2.
 *
 * ONE PERSISTENT QR, NOT ONE PER MOMENT. The check-in URL already exists, is already encoded
 * into a QR by the Class Kit, and is already posted into the session's room when it goes live.
 * It is printable and shareable precisely because it never changes. Minting a new QR per
 * moment would make every previously shared link wrong the instant the moment moved — which is
 * the failure mode the ticket names. So the QR keeps its stable URL, and the SERVER resolves
 * what that URL should show.
 *
 * THE SPLIT IS DELIBERATE. Building the URLs is string work and costs nothing, so it belongs
 * on the Class Kit, which a dozen call sites already read. Resolving the moment costs a
 * database query, and `buildSessionKit` is polled roughly every 2.5 seconds by the live-state
 * endpoint — so the moment lives in its own function and only the callers that need it pay.
 */
import { sequelize } from '../../config/database';
import { env } from '../../config/env';
import { sessionCheckinUrl } from '../email/sessionReminderEmail';

/** Mirrors sessionKitService's appBaseUrl so every QR flow resolves to the same host. */
export function appOrigin(base?: string): string {
  return (base || env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/+$/, '');
}

/**
 * Where a viewer watches on a laptop.
 *
 * URL SHAPE IS ALI'S DECISION — it appears in marketing. `/portal/live/<sessionId>` is the
 * proposal: it reads aloud, it sits under the portal the viewer already signs into, and it is
 * keyed on the SESSION rather than the occurrence so a printed or scheduled link survives the
 * show being re-timed or re-created. Changing it means changing these two functions.
 */
export function sessionWorkspaceUrl(sessionId: string, base?: string): string {
  return `${appOrigin(base)}/portal/live/${encodeURIComponent(sessionId)}`;
}

/** The phone surface. The experience itself is L4.7; this only names where it lives. */
export function sessionCompanionUrl(sessionId: string, base?: string): string {
  return `${appOrigin(base)}/portal/live/${encodeURIComponent(sessionId)}/companion`;
}

/** The persistent, printable entry point. Reused, never re-minted. */
export function sessionPersistentUrl(sessionId: string, base?: string): string {
  return sessionCheckinUrl(sessionId, appOrigin(base));
}

export interface SessionLinks {
  workspace_url: string;
  companion_url: string;
  /** The QR target. Stable for the life of the session. */
  persistent_url: string;
}

export function buildSessionLinks(sessionId: string, base?: string): SessionLinks {
  return {
    workspace_url: sessionWorkspaceUrl(sessionId, base),
    companion_url: sessionCompanionUrl(sessionId, base),
    persistent_url: sessionPersistentUrl(sessionId, base),
  };
}

/**
 * What the persistent URL should show right now.
 *
 * `not_started` is a real answer, not a failure. A session promoted a week early will be
 * scanned a week early, and a viewer who meets an error page concludes the link is broken and
 * does not come back.
 */
export type SessionMoment = 'not_started' | 'live' | 'ended' | 'unknown';

export interface MomentResult {
  moment: SessionMoment;
  occurrenceId: string | null;
  /** Only set when there is something to watch. */
  watchUrl: string | null;
}

/** Discovery treats exactly these as on air; the moment resolver must not disagree. */
const ON_AIR = ['live', 'reconnecting'];
const FINISHED = ['ended', 'processing', 'replay_ready'];

/**
 * Resolve the current moment from the occurrence linked to this session.
 *
 * Fails to `unknown` rather than throwing: this answers a public-facing landing page, and a
 * database blip should render "we cannot tell you right now" rather than a stack trace.
 */
export async function resolveSessionMoment(
  sessionId: string,
  base?: string,
): Promise<MomentResult> {
  try {
    const [rows] = await sequelize.query(
      `SELECT o.id, o.editorial_state
         FROM broadcast_source_refs r
         JOIN broadcast_occurrences o ON o.id = r.occurrence_id
        WHERE r.source_type = 'live_session' AND r.source_id = :sid
        LIMIT 1`,
      { replacements: { sid: sessionId } },
    );
    const row = (rows as Array<{ id: string; editorial_state: string }>)[0];

    // No occurrence is not an error either: live was simply never enabled for this session.
    if (!row) return { moment: 'not_started', occurrenceId: null, watchUrl: null };

    if (ON_AIR.includes(row.editorial_state)) {
      return { moment: 'live', occurrenceId: row.id, watchUrl: sessionWorkspaceUrl(sessionId, base) };
    }
    if (FINISHED.includes(row.editorial_state)) {
      return { moment: 'ended', occurrenceId: row.id, watchUrl: null };
    }
    return { moment: 'not_started', occurrenceId: row.id, watchUrl: null };
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'broadcast',
      event: 'session_moment_unresolved', outcome: 'failure',
      error_class: err?.name ?? 'UnexpectedError',
      context: { sessionId },
    }));
    return { moment: 'unknown', occurrenceId: null, watchUrl: null };
  }
}
