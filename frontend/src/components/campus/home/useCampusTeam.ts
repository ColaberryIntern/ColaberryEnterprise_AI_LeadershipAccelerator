import { useEffect, useState } from 'react';
import portalApi from '../../../utils/portalApi';

/**
 * C23 WP-9: the partner's company and team size (GET /api/portal/campus/team), for "Partner visit · Acme", the gate's ID card
 * and "2 of your 9 people". company is null unless it is a real company name; team_size never counts the viewer. Null until it
 * loads and on any failure: every caller then keeps its plain line, never a guessed number.
 */
export interface CampusTeam { company: string | null; team_size: number }

const TIMEOUT_MS = 10_000;

export function parseCampusTeam(data: unknown): CampusTeam | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { company?: unknown; team_size?: unknown };
  const size = typeof d.team_size === 'number' && Number.isInteger(d.team_size) && d.team_size >= 0 ? d.team_size : null;
  if (size === null) return null;
  const company = typeof d.company === 'string' && d.company.trim() ? d.company.trim() : null;
  return { company, team_size: size };
}

export async function fetchCampusTeam(): Promise<CampusTeam | null> {
  try {
    const { data } = await portalApi.get<unknown>('/api/portal/campus/team', { timeout: TIMEOUT_MS });
    return parseCampusTeam(data);
  } catch {
    return null;
  }
}

/** Only a business viewer asks; everyone else gets null without a request. */
export function useCampusTeam(enabled: boolean): CampusTeam | null {
  const [team, setTeam] = useState<CampusTeam | null>(null);
  useEffect(() => {
    if (!enabled) { setTeam(null); return; }
    let alive = true;
    fetchCampusTeam().then((t) => { if (alive) setTeam(t); });
    return () => { alive = false; };
  }, [enabled]);
  return team;
}
