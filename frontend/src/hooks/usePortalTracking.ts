import { useEffect, useRef } from 'react';
import { getParticipantToken } from '../utils/participantToken';
import { getVisitorFingerprint, initTracker } from '../utils/tracker';

const API = process.env.REACT_APP_API_URL || '';

interface PortalSessionDecision {
  track: boolean;
  identified?: boolean;
  needsFingerprint?: boolean;
  reason?: string;
}

/**
 * Start tracking a signed-in portal session, but only if the server says we may.
 *
 * WHY THIS EXISTS. The portal emitted nothing: `initTracker()` runs only in the public
 * layouts, so a person stopped generating events the moment they signed in. That is why
 * none of the Explorers appeared in the visitor data — not a broken join, but nothing
 * listening past the login wall.
 *
 * THE BROWSER DECIDES NOTHING. It does not decide whether this person may be tracked,
 * and it does not say who they are. Both come from the participant token, server-side.
 * A client that decided either could opt a subscriber back into collection, or bind its
 * browser to somebody else's journey by naming their lead id.
 *
 * TWO STEPS, ON PURPOSE. The first call sends whatever fingerprint already exists —
 * frequently none, for someone who came straight to the portal. Only after the server
 * says yes do we call `initTracker()`, which is what mints a fingerprint, and then call
 * back to bind it. So a subscriber, a staff member, or an impersonating admin never has
 * a device identifier written to their browser at all. Doing it in one step would mean
 * fingerprinting everyone in order to discover who we should not have fingerprinted.
 */
export function usePortalTracking(): void {
  // React 18 StrictMode mounts effects twice in development. Without this the portal
  // would post the decision request twice per mount and start the tracker twice.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    async function decide(fingerprint: string | null): Promise<PortalSessionDecision | null> {
      const token = getParticipantToken();
      if (!token) return null;
      try {
        const res = await fetch(`${API}/api/t/portal-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(fingerprint ? { fingerprint } : {}),
        });
        if (!res.ok) return null;
        return (await res.json()) as PortalSessionDecision;
      } catch {
        // A tracking outage must never affect the portal. No retry: this is analytics,
        // and a failed decision simply means this session is not recorded.
        return null;
      }
    }

    (async () => {
      const existing = getVisitorFingerprint();
      const first = await decide(existing);
      if (cancelled || !first || !first.track) return;

      initTracker();

      // Only when we arrived without one: bind the fingerprint the tracker just minted.
      if (first.needsFingerprint) {
        const minted = getVisitorFingerprint();
        if (minted && !cancelled) await decide(minted);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
