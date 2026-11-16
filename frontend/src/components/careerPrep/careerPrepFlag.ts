import axios from 'axios';
import { useEffect, useState } from 'react';
import { getParticipantToken } from '../../utils/participantToken';

/**
 * Whether Career Prep (v27) is on for the signed-in participant. The server decides (campus on AND
 * the enrollment on the career_prep allow-list); this only asks.
 *
 * FAIL CLOSED, and deliberately NOT through the shared portalApi client, for the same reason as
 * campusApi.fetchCampusFlags: its 401 interceptor ends the session, and a feature-flag read must
 * never be able to do that. Any error, timeout or odd body reads as off.
 */
export const CAREER_PREP_FLAGS_TIMEOUT_MS = 10_000;

export async function fetchCareerPrepFlag(): Promise<boolean> {
  const token = getParticipantToken();
  if (!token) return false;
  try {
    const { data } = await axios.get<unknown>(`${process.env.REACT_APP_API_URL || ''}/api/portal/career-prep/flags`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: CAREER_PREP_FLAGS_TIMEOUT_MS,
    });
    return !!data && typeof data === 'object' && (data as { careerPrep?: unknown }).careerPrep === true;
  } catch {
    return false;
  }
}

/** null while loading, then true or false. Components render nothing until it is true. `enabled` false (e.g. not a
 *  student) asks nothing and reads false (CP5.1: the campus card does not ask for explorers, partners or staff). */
export function useCareerPrepFlag(enabled = true): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) { setOn(false); return undefined; }
    let live = true;
    fetchCareerPrepFlag().then((v) => { if (live) setOn(v); });
    return () => { live = false; };
  }, [enabled]);
  return enabled ? on : false;
}
