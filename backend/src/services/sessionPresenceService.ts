/**
 * sessionPresenceService.ts — a named join/leave event log powering the
 * instructor deck's live ticker ("Ali M. entering the classroom" etc.).
 *
 * "Virtual Building" events are a PROXY for Google Meet presence, not real
 * telemetry — Google gives this app no live Meet join/leave webhook (Calendar-
 * scope only; see [[reference_meet_link_requires_impersonation]] and the
 * recording-ingest note in sessionKitDocService history). "Enter" fires on the
 * portal's Join-meeting click; "leave" fires best-effort on page unload/hide,
 * so it can miss (browser killed, network drop) or double-fire (tab
 * backgrounded then resumed) — it is a UX flourish, not an attendance record.
 * Real attendance/credit stays entirely in liveSessionAttendanceService.ts.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

export type PresenceEventType = 'classroom_enter' | 'virtual_building_enter' | 'virtual_building_leave';

export interface PresenceEvent {
  name: string;
  type: PresenceEventType;
  at: string;
}

/** "Ali Muwwakkil" -> "Ali M." — first name + last initial, safe to project
 * on the shared instructor screen. Falls back gracefully on odd input. */
export function formatDisplayName(fullName: string | null | undefined): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A student';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Best-effort — never throws into the caller's join/leave critical path. */
export async function recordPresenceEvent(
  sessionId: string, enrollmentId: string, type: PresenceEventType, displayName: string,
): Promise<void> {
  try {
    await sequelize.query(
      `INSERT INTO session_presence_events (session_id, enrollment_id, event_type, display_name)
         VALUES (:sid, :eid, :type, :name)`,
      { replacements: { sid: sessionId, eid: enrollmentId, type, name: displayName } },
    );
  } catch (err) {
    console.warn('[presence] recordPresenceEvent failed (non-fatal):', (err as Error).message);
  }
}

/** Most-recent-first, capped — the deck's ticker polls this alongside live-state. */
export async function getRecentPresenceEvents(sessionId: string, limit = 20): Promise<PresenceEvent[]> {
  const rows = await sequelize.query<{ display_name: string; event_type: string; created_at: string }>(
    `SELECT display_name, event_type, created_at FROM session_presence_events
      WHERE session_id = :sid ORDER BY created_at DESC LIMIT :lim`,
    { replacements: { sid: sessionId, lim: limit }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({ name: r.display_name, type: r.event_type as PresenceEventType, at: String(r.created_at) }));
}
