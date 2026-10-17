import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchCampusFlags } from './campusApi';
import type { CampusPresence } from './campusApi';
import { useCampusPresencePoll } from './useCampusPresencePoll';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import type { BuildingId } from './campusMap';
import { CampusSettings, readCampusSettings, writeCampusSettings } from './campusSettings';

/**
 * CampusContext - the one place campus state lives (Basecamp C1).
 *
 * It is designed to sit BESIDE <Outlet/> in routes/portalRoutes.tsx (mounted in
 * C3), like LiveMiniPlayer, because ~18 pages render their own PortalShell and
 * remount it on every navigation. Nothing persistent can live inside the shell.
 *
 * THE PROVIDER RENDERS ONLY ITS CHILDREN. No wrapper element, no portal, no
 * effect on layout. With the campus off, wrapping the portal in this provider
 * changes nothing a learner can see - __tests__/campusNoChange.test.tsx proves
 * the HTML is byte-identical.
 *
 * The flag is fetched once per mount and fails closed (see campusApi.ts).
 * `active` is the only value later phases should branch on: the server says the
 * campus is available AND the learner has not chosen classic nav.
 */

export interface CampusState {
  /** Server answer for this participant; false until it arrives. */
  enabled: boolean;
  /** True once the flag request has settled (either way). */
  ready: boolean;
  settings: CampusSettings;
  /** enabled && settings.nav === 'campus'. */
  active: boolean;
  updateSettings: (patch: Partial<CampusSettings>) => void;
  /** Which full-screen campus layer is open (C2): the walkable map, the list view, or none. */
  layer: CampusLayer;
  /** Building the map should walk to when it opens, if any. */
  mapFocus: BuildingId | null;
  openMap: (focus?: BuildingId) => void;
  openList: () => void;
  closeLayer: () => void;
  /** C4: who is in each building (null until the first read), and whether the last read failed. */
  presence: CampusPresence | null;
  presenceError: boolean;
}

export type CampusLayer = 'none' | 'map' | 'list';

const noop = () => { /* no provider */ };
const OFF: CampusState = {
  enabled: false, ready: false, active: false,
  settings: { nav: 'campus', workplaceNames: false, reduceMotion: false },
  updateSettings: noop, layer: 'none', mapFocus: null, openMap: noop, openList: noop, closeLayer: noop,
  presence: null, presenceError: false,
};

const Ctx = createContext<CampusState>(OFF);

export function CampusProvider({ children }: { children?: React.ReactNode }): React.ReactElement {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<CampusSettings>(() => readCampusSettings());

  // Signed out (login, signup, verify, handoff, class-checkin all share this layout): no request at
  // all, campus off. Re-runs when sign-in state changes, so signing in without a reload still reads
  // the flag, and signing out turns the campus off.
  const { isAuthenticated } = useParticipantAuth();
  useEffect(() => {
    if (!isAuthenticated) { setEnabled(false); setReady(true); return undefined; }
    let alive = true;
    fetchCampusFlags().then((f) => { if (alive) { setEnabled(f.campus); setReady(true); } });
    return () => { alive = false; };
  }, [isAuthenticated]);

  const updateSettings = useCallback((patch: Partial<CampusSettings>) => {
    setSettings((prev) => { const next = { ...prev, ...patch }; writeCampusSettings(next); return next; });
  }, []);

  const [layer, setLayer] = useState<CampusLayer>('none');
  const [mapFocus, setMapFocus] = useState<BuildingId | null>(null);
  const openMap = useCallback((focus?: BuildingId) => { setMapFocus(focus ?? null); setLayer('map'); }, []);
  const openList = useCallback(() => setLayer('list'), []);
  const closeLayer = useCallback(() => { setLayer('none'); setMapFocus(null); }, []);

  const active = enabled && settings.nav === 'campus';
  const { presence, presenceError } = useCampusPresencePoll(active);

  const value = useMemo<CampusState>(
    () => ({ enabled, ready, settings, active, updateSettings, layer, mapFocus, openMap, openList, closeLayer, presence, presenceError }),
    [enabled, ready, settings, active, updateSettings, layer, mapFocus, openMap, openList, closeLayer, presence, presenceError],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Campus state; outside a provider it reads as off, so any component can call it safely. */
export function useCampus(): CampusState {
  return useContext(Ctx);
}
