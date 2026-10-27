import React, { createContext, useContext, useMemo } from 'react';
import { useParticipantAuth } from './ParticipantAuthContext';
import {
  useBroadcastDiscovery,
  type DiscoveryState,
  type DiscoveryDeps,
  type DiscoveryBroadcast,
} from '../hooks/useBroadcastDiscovery';

/**
 * ONE discovery poll per tab, however many places show a live affordance.
 *
 * WHY THIS EXISTS, and it is a capacity argument rather than a tidiness one.
 * `useBroadcastDiscovery` holds every piece of its state in `useState`/`useRef`, so it has no
 * shared cache and no dedupe: each call site is an independent poller with its own timer.
 * `docs/broadcast/ROLLOUT_RUNBOOK.md` projects discovery load as `viewers / 45 s * 680 B` —
 * ONE request per tab per cadence. P3-04 asks for the live state in up to five places at
 * once, and five hooks would be five times that rate, which would make the documented
 * capacity table wrong the moment the placements shipped. A single provider keeps the number
 * in the runbook the number the system actually produces.
 *
 * WHY THE AUTH GATE LIVES HERE. The badge once polled an authenticated endpoint from the
 * portal layout route, which also wraps `/portal/login`, `/portal/signup` and
 * `/portal/verify`. With the flag dark that 404 rendered a permanent "Live status is
 * unavailable" panel on the login screen; with the flag on, a signed-out visitor's 401 drives
 * `portalApi`'s interceptor to `loginHrefPreserving('/portal/login')` — the login page
 * redirecting to itself, a class of incident `portalLoginHref.ts` records twice in production
 * (2026-08-03, 7 students; 2026-08-24, 18). Gating inside the provider means a new placement
 * cannot reintroduce it by forgetting: there is no un-gated path to the endpoint any more.
 *
 * WHY THE DEFAULT IS `disabled: true`. A consumer rendered outside the provider gets the
 * shape that means "render nothing", not an empty-but-live one. An affordance that silently
 * shows an empty list is indistinguishable from one that is working and has nothing to show,
 * and only one of those is true.
 */

const NOOP = (): void => undefined;

/** The shape a consumer outside the provider sees: off, not merely empty. */
export const DISCOVERY_FALLBACK: DiscoveryState = {
  broadcasts: [],
  disabled: true,
  unavailable: false,
  loading: false,
  // Nothing was asked, so nothing was answered. A consumer gating on `answered` outside the
  // provider gets "no" rather than an optimistic "not yet known to be off".
  answered: false,
  refresh: NOOP,
};

const DiscoveryContext = createContext<DiscoveryState>(DISCOVERY_FALLBACK);

export interface BroadcastDiscoveryProviderProps {
  children?: React.ReactNode;
  /**
   * Lets a caller turn discovery off for reasons other than auth — a kill switch, or a
   * surface that must not poll. ANDed with authentication, never substituted for it.
   */
  enabled?: boolean;
  /** Injected for tests. Captured once by the hook, so changing it after mount does nothing. */
  deps?: DiscoveryDeps;
}

export function BroadcastDiscoveryProvider({
  children, enabled = true, deps,
}: BroadcastDiscoveryProviderProps): React.ReactElement {
  const { isAuthenticated } = useParticipantAuth();
  // `isAuthenticated` is only `!!token` and does not inspect expiry, so a stale token still
  // reaches the endpoint — which is why the hook's 401 branch is terminal as well.
  const state = useBroadcastDiscovery(enabled && isAuthenticated, deps ?? {});
  return <DiscoveryContext.Provider value={state}>{children}</DiscoveryContext.Provider>;
}

/** The whole discovery state. Most placements want one of the narrower hooks below. */
export function useDiscoveryState(): DiscoveryState {
  return useContext(DiscoveryContext);
}

/**
 * The airing occurrence for ONE room, or null.
 *
 * `room_id` is the only key that joins a broadcast occurrence to anything else in the portal
 * (`BroadcastOccurrence` carries no live-session, event or cohort id), so this is the only
 * honest way for a page to say "*this* thing is airing" rather than "something is airing".
 * A surface without a room id in scope must not pretend otherwise.
 */
export function useRoomBroadcast(roomId: string | null | undefined): DiscoveryBroadcast | null {
  const { broadcasts } = useDiscoveryState();
  return useMemo(() => {
    /**
     * THE `!roomId` GUARD IS LOAD-BEARING, and not for the obvious reason.
     *
     * `BroadcastOccurrence.room_id` is `allowNull: true` — a broadcast need not belong to a
     * room at all. So without this, a surface that has no room id in scope (EventsPage and
     * CommunityPage are both in exactly that position) would pass `null`, MATCH a roomless
     * broadcast, and render a Watch button for something it cannot claim any relationship
     * to. A surviving mutation found this: my own test passed either way, because no fixture
     * had `room_id: null`.
     */
    if (!roomId) return null;
    /**
     * THERE IS DELIBERATELY NO `disabled` CHECK HERE.
     *
     * It was here, and removing it broke no test — so I enumerated every path that can set
     * it rather than assume, having got that exact call wrong once already this phase.
     * `disabled` becomes true in precisely two places, and both carry an empty list:
     * `useBroadcastDiscovery`'s terminal 404/401 branch, which calls `setBroadcasts([])` on
     * the line after `setDisabled(true)`; and `DISCOVERY_FALLBACK`, which is empty by
     * construction. So `disabled` cannot coexist with a non-empty list, the check could
     * never change an answer, and code whose removal nothing notices cannot be verified.
     *
     * That reasoning depends on an invariant OWNED ELSEWHERE, so it is pinned by a test —
     * "a terminal 404 empties the list as well as disabling". If a future change ever keeps a
     * stale list while disabled, that test fails and says this check is needed again.
     */
    return broadcasts.find((b) => b.room_id === roomId) ?? null;
  }, [broadcasts, roomId]);
}
