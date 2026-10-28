/**
 * AF2.7 item 1 — the Management Portal bridge is not offered during a read-only view-as session.
 *
 * DEFECT (Ali, 2026-10-20, mid-rollout): "when I click to see their account and then I click on
 * Mgmt Portal, it takes me to mine instead of theirs so I can't see their Mgmt portal".
 *
 * The cause is a tab boundary. The view-as token lives in sessionStorage (deliberately — see
 * VIEW_AS_TOKEN_KEY), both entries open in a NEW TAB, and sessionStorage does not cross tabs, so
 * the new tab falls back to the admin's own localStorage token and bridges as the admin. Nothing
 * errors; it simply shows the wrong person.
 *
 * THE LOAD-BEARING TEST HERE IS THE LAST ONE. It names no nav item: it scans the assembled groups
 * for ANY route into the bridge. A second entry point added later fails it without being edited —
 * which is the failure mode that let this ship in the first place, since there were already two
 * entries (the sidebar and the campus Staff Office) and only one of them was obvious.
 */
import { VIEW_AS_TOKEN_KEY, PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import {
  MGMT_BRIDGE_BLOCKED_REASON,
  mgmtBridgeBlockedReason,
  mgmtNavGroupsFor,
} from '../mgmtBridgeGate';
import type { NavGroup } from '../today/ShellNav';

/** Only the payload matters: the gate reads claims, never verifies a signature. */
const tok = (claims: Record<string, unknown>): string => `h.${btoa(JSON.stringify(claims))}.s`;

const MEMBER_SUB = '624be53e-c2ee-4d24-ae52-4a591da1787f';
const ADMIN_SUB = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';

/** The real shape of the group PortalShell contributes, trimmed to what the gate touches. */
const MGMT_GROUP = {
  grp: 'Employee',
  items: [{ label: 'Management Portal', to: '/portal/mgmt-enter', newTab: true, icon: null }],
} as unknown as NavGroup;

const OTHER_GROUPS = [
  { grp: 'Your day', items: [{ label: 'Today', to: '/portal/today', icon: null }] },
  { grp: 'Build and learn', items: [{ label: 'Projects', to: '/portal/projects', icon: null }] },
] as unknown as NavGroup[];

/** Put this browser into an admin's read-only "View as member" tab. */
function viewingAsMember(): void {
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok({ sub: ADMIN_SUB }));        // the admin's own
  sessionStorage.setItem(VIEW_AS_TOKEN_KEY, tok({ sub: MEMBER_SUB, read_only: true }));
}

/** The admin's ordinary session, in their own tab. */
function ownSession(): void {
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok({ sub: ADMIN_SUB }));
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('mgmtBridgeBlockedReason', () => {
  it('blocks, with a reason, inside a view-as session', () => {
    viewingAsMember();
    expect(mgmtBridgeBlockedReason()).toBe(MGMT_BRIDGE_BLOCKED_REASON);
  });

  // The control. Without it, a gate that returned a reason unconditionally would pass the test
  // above and silently remove the Management Portal from every employee's sidebar.
  it('does NOT block an employee in their own session', () => {
    ownSession();
    expect(mgmtBridgeBlockedReason()).toBeNull();
  });

  it('does not block when there is no token at all', () => {
    expect(mgmtBridgeBlockedReason()).toBeNull();
  });

  it('is driven by the read_only claim, not by the mere presence of a view-as token', () => {
    // A sessionStorage token WITHOUT read_only is not an impersonation, so it must not block.
    sessionStorage.setItem(VIEW_AS_TOKEN_KEY, tok({ sub: MEMBER_SUB }));
    expect(mgmtBridgeBlockedReason()).toBeNull();
  });
});

describe('the nav the shell assembles', () => {
  it('offers the Management Portal to an employee in their own session', () => {
    ownSession();
    expect(mgmtNavGroupsFor(true, mgmtBridgeBlockedReason(), MGMT_GROUP)).toEqual([MGMT_GROUP]);
  });

  it('offers nothing to a student who is not an employee', () => {
    ownSession();
    expect(mgmtNavGroupsFor(false, mgmtBridgeBlockedReason(), MGMT_GROUP)).toEqual([]);
  });

  it('offers nothing during a view-as session even when the member IS an employee', () => {
    // The interns are staff, so `is_mgmt` is true for them and the link really did render.
    viewingAsMember();
    expect(mgmtNavGroupsFor(true, mgmtBridgeBlockedReason(), MGMT_GROUP)).toEqual([]);
  });

  /**
   * NAMES NO NAV ITEM. Asserts the invariant itself: a view-as session is handed no route into
   * the bridge, wherever such a route might come from.
   */
  it('leaves a view-as session with NO route into the bridge anywhere in the nav', () => {
    viewingAsMember();
    const groups = [
      ...mgmtNavGroupsFor(true, mgmtBridgeBlockedReason(), MGMT_GROUP),
      ...OTHER_GROUPS,
    ];
    const routes = groups.flatMap((g) => g.items.map((i) => i.to || ''));
    expect(routes.filter((r) => r.includes('mgmt-enter'))).toEqual([]);
    // Proves the scan is looking at real routes and not at an empty list.
    expect(routes).toContain('/portal/today');
  });

  it('and the same scan DOES find the route in an ordinary session', () => {
    ownSession();
    const groups = [
      ...mgmtNavGroupsFor(true, mgmtBridgeBlockedReason(), MGMT_GROUP),
      ...OTHER_GROUPS,
    ];
    const routes = groups.flatMap((g) => g.items.map((i) => i.to || ''));
    expect(routes.filter((r) => r.includes('mgmt-enter'))).toEqual(['/portal/mgmt-enter']);
  });
});
