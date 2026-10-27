import type { DiscoveryState } from '../../hooks/useBroadcastDiscovery';

/**
 * Whether the portal sidebar shows a "Replays" tab (L8.3).
 *
 * A two-term boolean in its own file, because the second term is the one a future edit will
 * want to delete. `disabled` alone reads like the whole answer — "broadcasting is not off, so
 * show the tab" — and it is wrong twice over:
 *
 *   - `disabled` starts FALSE, before anything has been asked. Gating on `!disabled` puts the
 *     tab in every student's sidebar for the first moment of every page load and then removes
 *     it when the 404 arrives. With `BROADCAST_ENABLED` dark — the documented default, and the
 *     state production is in today — that flash is the only thing the tab ever does.
 *   - outside the discovery provider the fallback is `disabled: true, answered: false`, so both
 *     terms independently answer "no". A placement that forgets the provider gets no tab rather
 *     than a link to a route that 404s.
 *
 * The tab is NOT gated on anything being live. A replay list is interesting precisely when
 * nothing is airing, so `broadcasts.length` is not part of this.
 */
export function showReplaysTab(state: Pick<DiscoveryState, 'answered' | 'disabled'>): boolean {
  return state.answered && !state.disabled;
}

export default showReplaysTab;
