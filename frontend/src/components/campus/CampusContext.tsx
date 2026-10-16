import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchCampusFlags } from './campusApi';
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
}

const OFF: CampusState = {
  enabled: false, ready: false, active: false,
  settings: { nav: 'campus', workplaceNames: false, reduceMotion: false },
  updateSettings: () => { /* no provider: nothing to update */ },
};

const Ctx = createContext<CampusState>(OFF);

export function CampusProvider({ children }: { children?: React.ReactNode }): React.ReactElement {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<CampusSettings>(() => readCampusSettings());

  useEffect(() => {
    let alive = true;
    fetchCampusFlags().then((f) => { if (alive) { setEnabled(f.campus); setReady(true); } });
    return () => { alive = false; };
  }, []);

  const updateSettings = useCallback((patch: Partial<CampusSettings>) => {
    setSettings((prev) => { const next = { ...prev, ...patch }; writeCampusSettings(next); return next; });
  }, []);

  const value = useMemo<CampusState>(
    () => ({ enabled, ready, settings, active: enabled && settings.nav === 'campus', updateSettings }),
    [enabled, ready, settings, updateSettings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Campus state; outside a provider it reads as off, so any component can call it safely. */
export function useCampus(): CampusState {
  return useContext(Ctx);
}
