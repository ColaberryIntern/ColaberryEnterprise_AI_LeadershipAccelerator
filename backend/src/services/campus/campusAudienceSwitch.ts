import { env } from '../../config/env';
import { parseIdList } from './campusFlag';
import { campusAudienceFor } from './campusAudience';

/**
 * Who may look at the campus as another account type (WP-7, Ali 2026-10-23: "give me the ability to change account types by
 * clicking on 'Business' and switching. By default only staff can make that switch").
 *
 * A PREVIEW, NOT AN IMPERSONATION. The switch changes only how the campus is drawn in that browser (which buildings, which words);
 * every server check still uses the real account, so nothing becomes reachable that was not before.
 *
 * WHO. Campus staff (the same rule as the Staff Office, campusAudienceFor) OR an enrollment listed in CAMPUS_AUDIENCE_SWITCH_IDS
 * (comma-separated; empty by default, so only staff). The list is checked first, so a listed account costs no database read.
 *
 * FAILURE-FIRST. (1) If the audience read fails the answer is "no": a failure must never widen what someone can do. It is logged.
 * (2) No retry: the page asks again on its next load. (3) Recovery: none needed, the campus simply shows the real account.
 * (4) Not handled: nothing else; the list parse cannot throw.
 */
export function onSwitchList(enrollmentId: string | null | undefined, ids: string | null | undefined): boolean {
  const id = (enrollmentId ?? '').trim();
  return !!id && parseIdList(ids).includes(id);
}

export async function mayPreviewAudiences(enrollmentId: string, ids: string = env.campusAudienceSwitchIds): Promise<boolean> {
  if (onSwitchList(enrollmentId, ids)) return true;
  try {
    return (await campusAudienceFor(enrollmentId)) === 'staff';
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'campus_audience_switch_check',
      outcome: 'failure', error_class: e?.name || 'UnknownError', context: { message: String(e?.message ?? '').slice(0, 200) } }));
    return false;
  }
}
