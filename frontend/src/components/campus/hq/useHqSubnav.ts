import { useEffect, useState } from 'react';
import axios from 'axios';
import type { NavSubCards } from '../../Layout/adminSubNav';
import { CAMPUS_FLAGS_TIMEOUT_MS } from '../campusApi';
import { getParticipantToken } from '../../../utils/participantToken';

/**
 * C92: the cards behind the admin sidebar's live sub-lists (Gov Contracts, Agents) for this person, from
 * GET /api/portal/campus/hq-subnav (the same server functions the admin sidebar's lists use). Staff only; read once per page
 * load (the building does not need second-by-second freshness). Fail-soft: an error shows the floors without sub-items, never
 * a guessed list.
 */
let cache: Promise<NavSubCards> | null = null;

export function fetchHqSubnav(): Promise<NavSubCards> {
  if (!cache) {
    const token = getParticipantToken();
    cache = axios.get<{ gov?: unknown[]; agents?: unknown[] }>(`${process.env.REACT_APP_API_URL || ''}/api/portal/campus/hq-subnav`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: CAMPUS_FLAGS_TIMEOUT_MS,
    }).then(({ data }) => ({
      gov: Array.isArray(data?.gov) ? (data.gov as NavSubCards['gov']) : [],
      agents: Array.isArray(data?.agents) ? (data.agents as NavSubCards['agents']) : [],
    })).catch(() => { cache = null; return {}; });
  }
  return cache;
}

export function __resetHqSubnavCacheForTests(): void { cache = null; }

export function useHqSubnav(enabled: boolean): NavSubCards {
  const [cards, setCards] = useState<NavSubCards>({});
  useEffect(() => {
    if (!enabled) { setCards({}); return undefined; }
    let live = true;
    fetchHqSubnav().then((c) => { if (live) setCards(c); });
    return () => { live = false; };
  }, [enabled]);
  return cards;
}
