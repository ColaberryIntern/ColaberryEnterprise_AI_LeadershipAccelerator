import { sequelize } from '../../config/database';
import { assertZoomConfigured, getZoomAccessToken, getZoomGrantedScopes } from '../zoom/zoomApiClient';
import { centralDateKey } from '../centralDate';

/**
 * Career Prep v27, CP9.1 (execution contract E6, "Recording control is fail-safe on Zoom permissions"). Turning a
 * meeting's recording on is a PATCH (`meeting:update:meeting:admin`, classic `meeting:write:admin`) followed by a GET
 * read-back (`meeting:read:meeting:admin`, classic `meeting:read:admin`). `zoomService.updateMeeting` is unused on main,
 * so the Zoom app may not have the update scope. Before any recording change, this checks the scope string the EXISTING
 * server-to-server token response already carries (zoomApiClient.getZoomGrantedScopes): read-only, no request of its own,
 * no Zoom setting changed. BOTH scopes are required; a response with no scope field is "cannot tell", treated as missing.
 *
 * Missing: the caller never attempts the change (the interview runs unrecorded, roomService.ts) and escalateScopeMissing
 * writes ONE placement_events row and ONE escalation log line per Central day (a keyed insert, so two interviews, two
 * processes or a retry still make one), naming the fix for Ali.
 */
export const UPDATE_SCOPES = ['meeting:update:meeting:admin', 'meeting:write:admin'] as const;
export const READ_SCOPES = ['meeting:read:meeting:admin', 'meeting:read:admin'] as const;

export interface ScopeCheck { ok: boolean; missing: string[]; reason: 'ok' | 'missing' | 'cannot_tell' }

/** Pure: which of the two scopes (named by its granular form) the granted list lacks. null = cannot tell = both. */
export function missingRecordingScopes(granted: readonly string[] | null): string[] {
  const has = (want: readonly string[]) => !!granted && want.some((s) => granted.includes(s));
  return [...(has(UPDATE_SCOPES) ? [] : [UPDATE_SCOPES[0]]), ...(has(READ_SCOPES) ? [] : [READ_SCOPES[0]])];
}

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>, errorClass?: string, extra: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'backend', event,
    outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), ...extra, context });
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}

/** Make sure a token was fetched (the existing token call, cached), then read its scopes. Any failure = cannot tell. */
export async function checkRecordingScopes(): Promise<ScopeCheck> {
  try {
    await getZoomAccessToken();
  } catch (err) {
    log('warn', 'placement_zoom_scope_unreadable', {}, (err as Error)?.name && (err as Error).name !== 'Error' ? (err as Error).name : 'UpstreamUnavailable');
    return { ok: false, missing: missingRecordingScopes(null), reason: 'cannot_tell' };
  }
  const granted = getZoomGrantedScopes();
  const missing = missingRecordingScopes(granted);
  return { ok: missing.length === 0, missing, reason: granted === null ? 'cannot_tell' : missing.length ? 'missing' : 'ok' };
}

export const scopeAction = (missing: readonly string[]): string =>
  `Ali: add scope ${missing.join(' and ')} to the Zoom server-to-server app`;

/**
 * Once per Central day: one keyed placement_events row; the escalation line is logged only by the insert that made it.
 * true = this call wrote it. A database failure still logs the line (loud beats silent; it may then repeat that day).
 */
export async function escalateScopeMissing(missing: readonly string[], now: Date = new Date()): Promise<boolean> {
  const day = centralDateKey(now.getTime());
  const action = scopeAction(missing);
  let wrote = true;
  try {
    const [rows] = await sequelize.query(
      `INSERT INTO placement_events (subject_type, subject_id, event, from_state, to_state, actor, payload, source_event_id)
       VALUES ('zoom_app', 'recording-scope', 'zoom_scope_missing', NULL, NULL, 'platform', CAST(:payload AS jsonb), :src) ON CONFLICT DO NOTHING RETURNING id`,
      { replacements: { payload: JSON.stringify({ missing, action, day }), src: `zoom_scope_missing:${day}` } });
    wrote = (rows as unknown[]).length > 0;
  } catch (err) {
    log('error', 'placement_zoom_scope_event_failed', { day }, (err as Error)?.name || 'UpstreamUnavailable');
  }
  if (wrote) log('error', 'placement_zoom_scope_missing', { missing, day }, 'ZoomScopeMissing', { action });
  return wrote;
}

/** Boot (placementBoot SCHEDULERS): check once and log the result; never throws, never blocks boot, changes nothing. */
export async function runScopePreflight(): Promise<ScopeCheck | null> {
  try { assertZoomConfigured(); } catch {
    log('info', 'placement_zoom_scope_preflight', { result: 'skipped', reason: 'zoom not configured' });
    return null;
  }
  const r = await checkRecordingScopes();
  if (r.ok) log('info', 'placement_zoom_scope_preflight', { result: 'ok' });
  else log('warn', 'placement_zoom_scope_preflight', { result: r.reason, missing: r.missing, action: scopeAction(r.missing) }, 'ZoomScopeMissing');
  return r;
}
