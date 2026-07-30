// ============================================================================
// Class Kit service — assembles the per-session instructor "Class Kit" (session
// facts + roster count + a student check-in QR) and the minimal, non-sensitive
// info a not-yet-logged-in student sees after scanning that QR.
//
// The QR encodes an ABSOLUTE check-in URL so a phone camera can open it directly.
// The base origin mirrors the exact logic portalHandoffService uses for its
// handoff URL (env.frontendUrl, falling back to the public app origin) so the
// two QR flows always point at the same host.
// ============================================================================
import QRCode from 'qrcode';
import { env } from '../config/env';
import { Cohort, Enrollment, LiveSession, CommunityRoom } from '../models';

/**
 * Absolute app origin for building QR/deep-link URLs. Mirrors
 * portalHandoffService's portalBaseUrl() so both handoff and check-in QRs
 * resolve to the same host.
 */
function appBaseUrl(): string {
  return env.frontendUrl || 'https://enterprise.colaberry.ai';
}

export interface SessionKit {
  session: {
    id: string;
    session_number: number;
    title: string;
    session_date: string;
    start_time: string;
    end_time: string;
    status: string;
  };
  meeting_link: string | null;
  cohort_name: string;
  roster_count: number;
  checkin_url: string;
  qr_svg: string;
}

/**
 * Build the instructor Class Kit for one session. Returns null if the session
 * does not exist (caller maps that to a 404).
 */
export async function buildSessionKit(sessionId: string): Promise<SessionKit | null> {
  const session = await LiveSession.findByPk(sessionId);
  if (!session) return null;

  const [cohort, roster_count] = await Promise.all([
    Cohort.findByPk(session.cohort_id, { attributes: ['name'] }),
    Enrollment.count({ where: { cohort_id: session.cohort_id } }),
  ]);

  const checkin_url = `${appBaseUrl()}/portal/class-checkin/${session.id}`;
  const qr_svg = await QRCode.toString(checkin_url, { type: 'svg', margin: 1, width: 280 });

  return {
    session: {
      id: session.id,
      session_number: session.session_number,
      title: session.title,
      session_date: session.session_date,
      start_time: session.start_time,
      end_time: session.end_time,
      status: session.status,
    },
    meeting_link: session.meeting_link ?? null,
    cohort_name: cohort?.name ?? '',
    roster_count,
    checkin_url,
    qr_svg,
  };
}

export interface CheckinInfo {
  title: string;
  session_date: string;
  start_time: string;
  cohort_name: string;
  room_id: string | null;
}

/**
 * Minimal, non-sensitive info for the public pre-login check-in landing page a
 * student reaches by scanning the Class Kit QR. Deliberately omits the meeting
 * link (the Meet is only revealed after the student logs in + checks in, via
 * the session's Colaberry Commons room). Returns null if the session does not
 * exist (→ 404). `room_id` is a bare UUID, not sensitive on its own — the
 * room's own cohort-membership check gates real access once the student
 * navigates there authenticated.
 */
export async function getCheckinInfo(sessionId: string): Promise<CheckinInfo | null> {
  const session = await LiveSession.findByPk(sessionId, {
    attributes: ['title', 'session_date', 'start_time', 'cohort_id'],
    include: [{ model: CommunityRoom, as: 'communityRoom', attributes: ['id'], required: false }],
  });
  if (!session) return null;

  const cohort = await Cohort.findByPk(session.cohort_id, { attributes: ['name'] });

  return {
    title: session.title,
    session_date: session.session_date,
    start_time: session.start_time,
    cohort_name: cohort?.name ?? '',
    room_id: (session as any).communityRoom?.id ?? null,
  };
}
