import { useEffect, useState } from 'react';
import { fetchSettings } from '../../services/portalSettingsApi';

/**
 * The signed-in participant's organization, when they own or manage one.
 *
 * Drives the conditional "Your company" nav group in the portal shell and the
 * business-account tabs in Settings. Cached module-wide so it only fetches
 * settings once per session (mirrors `useIsExplorer`).
 *
 * WHY THIS RETURNS THE ORG AND NOT JUST A BOOLEAN. It previously kept only
 * `is_org_manager` and discarded `account.org`, which the same response already
 * carries — so the sidebar had no way to show the company's actual name and fell
 * back to a hardcoded "Your company" for everyone. The extra data was already on
 * the wire; only the hook was throwing it away.
 */
export interface ManagedOrg {
  id: string;
  name: string;
  /**
   * False when the stored name is only the fallback to the person's own name,
   * because no company was typed at signup. Callers must not display the name
   * when this is false — see resolveManagedOrg in portalSettingsService.
   */
  has_real_name: boolean;
}

interface OrgManagerState {
  isManager: boolean;
  org: ManagedOrg | null;
  /** False until the first fetch settles, so callers can avoid flashing a label. */
  loaded: boolean;
}

const EMPTY: OrgManagerState = { isManager: false, org: null, loaded: false };

let cached: OrgManagerState | null = null;

export function useOrgManager(): OrgManagerState {
  const [state, setState] = useState<OrgManagerState>(cached ?? EMPTY);

  useEffect(() => {
    if (cached !== null) {
      setState(cached);
      return undefined;
    }
    let alive = true;
    fetchSettings()
      .then((s) => {
        cached = {
          isManager: !!s.account.is_org_manager,
          org: s.account.org ?? null,
          loaded: true,
        };
        if (alive) setState(cached);
      })
      .catch(() => {
        /* default: not a manager — hide the company nav. Deliberately does NOT
           cache the failure, so a transient error retries on the next mount
           rather than hiding the company section for the rest of the session. */
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/**
 * True when the participant owns or manages an organization.
 * Kept as a thin wrapper so existing call sites need no change.
 */
export function useIsOrgManager(): boolean {
  return useOrgManager().isManager;
}

/**
 * The label to show for the company section: the real company name when one was
 * supplied at signup, otherwise the generic fallback.
 *
 * Centralised so the sidebar group header, the nav item and the page heading
 * cannot drift apart — they previously each hardcoded their own copy of the
 * string.
 */
export function companyLabel(org: ManagedOrg | null, fallback = 'Your company'): string {
  return org && org.has_real_name && org.name.trim() ? org.name.trim() : fallback;
}

/** Reset the cached state (e.g. on logout / account switch). */
export function resetOrgManagerCache(): void {
  cached = null;
}
