import { isReadOnlySession } from '../../components/campus/campusApi';
import type { NavGroup } from './today/ShellNav';

/**
 * AF2.7 item 1 — the Management Portal bridge is NOT offered during an admin's
 * read-only "View as member" session.
 *
 * ## The bug this exists to make impossible
 *
 * Reported by Ali on 2026-10-20, mid-rollout: "when I click to see their account and then I
 * click on Mgmt Portal, it takes me to mine instead of theirs so I can't see their Mgmt portal".
 *
 * The mechanism is a tab boundary, not an authorization hole:
 *
 *   1. "View as member" stores the impersonated participant JWT in **sessionStorage**
 *      (`VIEW_AS_TOKEN_KEY`), deliberately — localStorage is shared across every tab of this
 *      origin, so writing it there would clobber the admin's own real session everywhere.
 *   2. Both Management Portal entries open in a **new tab** (`newTab: true` in PortalShell's
 *      MGMT_NAV_GROUP, `target="_blank"` in AdminLink).
 *   3. sessionStorage does not cross tabs. The new tab therefore finds no view-as token, and
 *      `getParticipantToken()` falls back to `localStorage.participant_token` — the ADMIN'S OWN.
 *   4. `POST /api/portal/mgmt/enter` resolves `req.participant.sub` from that token, so it mints
 *      an admin session for the admin, and lands on the admin's own management portal.
 *
 * Every step succeeds. No error is raised, nothing 403s, and the page renders perfectly — it is
 * simply a different person's portal than the one the viewer believes they opened. That silence
 * is the defect: a surface that substitutes your own identity is worse than one that refuses,
 * because the viewer has no signal they are being shown the wrong thing.
 *
 * ## Why the fix is "refuse", not "show theirs"
 *
 * Opening the impersonated person's management portal read-only would mean minting a read-only
 * ADMIN token and teaching the entire admin surface to honour it. The admin surface has no
 * read-only mode, and inventing one to satisfy a P2 cosmetic-adjacent ticket would be a large,
 * security-sensitive refactor. The ticket explicitly allows either outcome; this is the branch
 * with the smaller blast radius and the testable guarantee.
 *
 * ## What this does and does not guarantee
 *
 * GUARANTEED: no view-as tab offers a link into the bridge, and the bridge landing itself
 * refuses when the tab it runs in holds a read-only token. The reported path is closed by
 * construction — there is no link to click.
 *
 * NOT GUARANTEED, and it cannot be: a brand-new tab opened by hand carries no view-as token and
 * is genuinely the admin's own session, so showing them their own portal there is correct, not a
 * leak. Cross-tab detection is impossible by design here, which is the same property that keeps
 * view-as from clobbering the real session.
 */

/** The one-line reason, shown wherever the entry would otherwise have been offered. */
export const MGMT_BRIDGE_BLOCKED_REASON = 'Not available while you are viewing as someone else.';

/**
 * Why the Management Portal bridge is unavailable right now, or null when it is fine to offer.
 *
 * Returns a string rather than a boolean so every call site shows the SAME sentence, instead of
 * each one inventing its own wording for the same state.
 */
export function mgmtBridgeBlockedReason(): string | null {
  return isReadOnlySession() ? MGMT_BRIDGE_BLOCKED_REASON : null;
}

/**
 * The nav groups contributed by the management bridge: the group when it may be offered, and
 * nothing at all when it may not.
 *
 * Pure, and separate from PortalShell, so "a view-as session is offered no route into the
 * bridge" is assertable without mounting the whole portal shell.
 */
export function mgmtNavGroupsFor(
  isMgmt: boolean,
  blockedReason: string | null,
  group: NavGroup,
): NavGroup[] {
  if (!isMgmt || blockedReason) return [];
  return [group];
}
