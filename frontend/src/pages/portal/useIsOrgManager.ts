import { useEffect, useState } from 'react';
import { fetchSettings } from '../../services/portalSettingsApi';

/**
 * True when the signed-in participant owns or manages an organization. Drives the
 * conditional "Your company" nav group in the portal shell. Cached module-wide so
 * it only fetches settings once per session (mirrors `useIsExplorer`).
 */
let cached: boolean | null = null;

export function useIsOrgManager(): boolean {
  const [isManager, setIsManager] = useState<boolean>(cached ?? false);
  useEffect(() => {
    if (cached !== null) { setIsManager(cached); return; }
    let alive = true;
    fetchSettings()
      .then((s) => { cached = !!s.account.is_org_manager; if (alive) setIsManager(cached); })
      .catch(() => { /* default: not a manager — hide the company nav */ });
    return () => { alive = false; };
  }, []);
  return isManager;
}

/** Reset the cached flag (e.g. on logout / account switch). */
export function resetOrgManagerCache(): void { cached = null; }
