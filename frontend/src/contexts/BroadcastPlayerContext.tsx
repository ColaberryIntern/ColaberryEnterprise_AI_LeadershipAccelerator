import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useParticipantAuth } from './ParticipantAuthContext';

/**
 * Which broadcast the persistent player is showing, if any.
 *
 * WHY A CONTEXT AND NOT PAGE STATE. The player has to survive navigation, so the thing that
 * remembers what it is playing has to live above the route that changes. This provider sits
 * in the portal LAYOUT route alongside `<Outlet/>`, so both the state and the `<video>`
 * element outlive every page transition.
 *
 * WHAT FILLS IT. Nothing yet, deliberately. Discovery surfaces — the live badge, the Today
 * feature, the event Watch button, the room indicator — are P3-04's job. This provider is the
 * seam they call, and with nothing open the player renders nothing at all, which is also what
 * "flag off" looks like from the client's side.
 */

export interface BroadcastSession {
  occurrenceId: string;
  /** A slug, never a path: the key grammar on the server rejects anything else. */
  asset: string;
  /** Display only. A private occurrence's title must never reach an ineligible viewer. */
  title: string | null;
}

interface BroadcastPlayerContextValue {
  session: BroadcastSession | null;
  open: (session: BroadcastSession) => void;
  close: () => void;
}

const BroadcastPlayerContext = createContext<BroadcastPlayerContextValue>({
  session: null,
  open: () => {},
  close: () => {},
});

export function BroadcastPlayerProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<BroadcastSession | null>(null);
  const { isAuthenticated } = useParticipantAuth();

  const open = useCallback((next: BroadcastSession) => setSession(next), []);
  const close = useCallback(() => setSession(null), []);

  // TEARDOWN ON LOGOUT. The credential in flight belongs to the session that just ended, and
  // a signed URL keeps working until it expires — so the player has to go when the session
  // does, rather than waiting for a navigation that may never come. Dropping the session
  // unmounts the element, which is what stops the adapter and any further range request.
  useEffect(() => {
    if (!isAuthenticated) setSession(null);
  }, [isAuthenticated]);

  const value = useMemo(() => ({ session, open, close }), [session, open, close]);

  return (
    <BroadcastPlayerContext.Provider value={value}>
      {children}
    </BroadcastPlayerContext.Provider>
  );
}

export function useBroadcastPlayer(): BroadcastPlayerContextValue {
  return useContext(BroadcastPlayerContext);
}
