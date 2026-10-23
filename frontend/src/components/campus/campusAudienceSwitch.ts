import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { getParticipantToken } from '../../utils/participantToken';
import { CAMPUS_FLAGS_TIMEOUT_MS } from './campusApi';
import type { CampusAudience } from './campusMap';

/**
 * Previewing the campus as another account type (WP-7, Ali 2026-10-23: switch by clicking the account chip; by default only staff).
 *
 * The SERVER decides who may (GET /api/portal/campus/audience-switch: campus staff, or an enrollment in CAMPUS_AUDIENCE_SWITCH_IDS).
 * The choice itself is a per-browser convenience in localStorage, honored only while the server says yes, so a stale value can
 * never change anyone else's campus. It changes only how the campus is drawn; every server check still uses the real account.
 */
export const VIEW_AS_KEY = 'colaberry.campus.viewAs';
export const AUDIENCES: CampusAudience[] = ['member', 'explorer', 'business', 'staff'];
export const AUDIENCE_LABEL: Record<CampusAudience, string> = { member: 'Member', explorer: 'Explorer', business: 'Business', staff: 'Staff' };

/** May this account switch? Any failure (signed out, network, refusal, odd body) is "no". */
export async function fetchAudienceSwitch(): Promise<boolean> {
  const token = getParticipantToken();
  if (!token) return false;
  try {
    const { data } = await axios.get<unknown>(`${process.env.REACT_APP_API_URL || ''}/api/portal/campus/audience-switch`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: CAMPUS_FLAGS_TIMEOUT_MS,
    });
    return !!data && typeof data === 'object' && (data as { allowed?: unknown }).allowed === true;
  } catch {
    return false;
  }
}

export function readViewAs(): CampusAudience | null {
  try {
    const v = window.localStorage.getItem(VIEW_AS_KEY);
    return AUDIENCES.includes(v as CampusAudience) ? (v as CampusAudience) : null;
  } catch {
    return null;
  }
}

export function writeViewAs(v: CampusAudience | null): void {
  try { if (v) window.localStorage.setItem(VIEW_AS_KEY, v); else window.localStorage.removeItem(VIEW_AS_KEY); } catch { /* no storage: the choice lasts this visit */ }
}

/** The audience the campus draws: the preview when allowed and chosen, otherwise the real one. */
export function effectiveAudience(real: CampusAudience, allowed: boolean, viewAs: CampusAudience | null): CampusAudience {
  return allowed && viewAs ? viewAs : real;
}

export interface AudienceSwitchState {
  /** The server says this account may switch. */
  audienceSwitch: boolean;
  /** The account type being previewed (null: your own). Only honored while audienceSwitch is true. */
  viewAs: CampusAudience | null;
  setViewAs: (v: CampusAudience | null) => void;
  /** C13: the campus is on for this viewer (so the audience hook asks the server only then). */
  active?: boolean;
}

/**
 * The switch state for the audience hook (useCampusAudience), in its own context so that hook stays light (it is used far from the
 * campus tree); CampusProvider fills it with useAudienceSwitch below. Outside the campus: nobody is previewing.
 */
export const AudienceSwitchContext = createContext<AudienceSwitchState>({ audienceSwitch: false, viewAs: null, setViewAs: () => undefined });
export const useAudienceSwitchState = (): AudienceSwitchState => useContext(AudienceSwitchContext);

/** Asks the server once per campus session; until it answers, nobody is previewing. */
export function useAudienceSwitch(active: boolean): AudienceSwitchState {
  const [audienceSwitch, setAudienceSwitch] = useState(false);
  const [viewAs, setViewAsState] = useState<CampusAudience | null>(() => readViewAs());
  useEffect(() => {
    if (!active) { setAudienceSwitch(false); return undefined; }
    let alive = true;
    fetchAudienceSwitch().then((ok) => { if (alive) setAudienceSwitch(ok); });
    return () => { alive = false; };
  }, [active]);
  const setViewAs = useCallback((v: CampusAudience | null) => { writeViewAs(v); setViewAsState(v); }, []);
  return { audienceSwitch, viewAs, setViewAs };
}
