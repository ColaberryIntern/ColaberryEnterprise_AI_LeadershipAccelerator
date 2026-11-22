import React from 'react';
import AdminLink from '../AdminLink';
import { roomHref, opensInPlace, type HqRoom } from './hqModel';
import { mgmtBridgeBlockedReason } from '../../../pages/portal/mgmtBridgeGate';

/**
 * Whether this room's link goes through the Management Portal bridge: the one shape of the three
 * below that can substitute an identity, and so the only one view-as withholds.
 *
 * Exported because the row's own "Open in admin ↗" chip has to agree with it, and because
 * the component reads it too, so the chip and the link cannot disagree.
 */
export const roomGoesThroughBridge = (room: HqRoom): boolean => !opensInPlace(room) && !room.external;

/**
 * Why this room cannot be opened right now, or null when it can.
 *
 * ## AF12.15, reported by Ali on 2026-11-21 from his own view-as screenshot
 *
 * The refusal above was complete and the row was correctly dead: `aria-disabled`, the reason on
 * `title`, the reason in the accessible name, and `.is-disabled` greying it in `hq.css`. But
 * `AdminLink` renders the CALLER'S children unchanged, and those children end in a chip that
 * still read "Open in admin ↗". So a blocked room announced an action it would not perform,
 * next to badge-locked rooms that honestly showed a padlock.
 *
 * That is not merely cosmetic: the two states have different causes and different fixes. A badge
 * lock means ask an admin for the section; a view-as block means leave view-as. A room that shows
 * neither, while promising to open, sends the viewer to look for a fault that isn't there.
 *
 * Returning the reason rather than a boolean keeps the sentence in one place (mgmtBridgeGate),
 * and returning null for the non-bridge shapes keeps view-as itself working: a member's own
 * cockpit and a Career Prep door open in the SAME tab, which is the whole point of view-as.
 */
export const roomBridgeBlockedReason = (room: HqRoom): string | null => (
  roomGoesThroughBridge(room) ? mgmtBridgeBlockedReason() : null
);

/**
 * AF2.7b — the ONE anchor every campus HQ room is drawn with, so the view-as rule reaches the
 * tower.
 *
 * ## The leak this closes
 *
 * `mgmtBridgeGate.ts` records the bug Ali reported on 2026-10-20: a room opened in a new tab
 * carries none of this tab's sessionStorage view-as token, so the new tab resolves the ADMIN'S
 * OWN localStorage token and bridges as the admin. Successfully. Silently. As the wrong person.
 *
 * The fix was to put the refusal in `AdminLink`, the one leaf the four campus surfaces of the
 * time rendered, and its own comment says why: *"a fifth call site added later inherits the rule
 * instead of having to remember it."*
 *
 * The HQ elevator was built two days later and did not render that leaf. `HqPanel` and
 * `HqInside` each hand-rolled `<a target="_blank" href={roomHref(r)}>`, which is exactly the
 * shape the rule exists to forbid, and Ali hit it again on 2026-11-19 from the Staff Office
 * floor. So this file is the leaf for the tower: the two HQ surfaces render it, and a third
 * inherits the rule rather than having to remember it.
 *
 * ## Why it is not just AdminLink
 *
 * An HQ room is one of three things, and only one of them goes through the bridge:
 *
 *   - `opensInPlace` — a member's own cockpit or a Career Prep staff door. A portal route in the
 *     SAME tab, so the view-as token is still there and the viewer sees the member's page, which
 *     is the whole point of view-as. Blocking it would remove the feature rather than fix it.
 *   - `external` — its own URL, never `/portal/mgmt-enter`. No identity of ours is bridged.
 *   - anything else — `roomHref` returns `mgmtBridgeTo(r.path)`. THIS is the leak, and only this.
 *
 * A call site that wants a room's URL is a call site that is about to draw an anchor, so
 * `hqRoomLinkIsTheLeaf` pins who may call `roomHref` under `components/campus` and checks that
 * each of them renders a guarded leaf. A new one fails the build.
 */
export default function HqRoomLink({ room, className, testId, ariaLabel, children }: {
  room: HqRoom;
  className: string;
  testId?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  const inPlace = opensInPlace(room);
  const href = roomHref(room);
  // Not through the bridge, so there is no identity to substitute and nothing to withhold.
  // Asked via `roomGoesThroughBridge` rather than re-testing the two shapes here, so the chip
  // the caller draws and the link this returns can never disagree about what is blocked.
  if (!roomGoesThroughBridge(room)) {
    return (
      <a
        className={className}
        href={href}
        target={inPlace ? undefined : '_blank'}
        rel={inPlace ? undefined : 'noopener noreferrer'}
        aria-label={ariaLabel}
        data-testid={testId}
      >
        {children}
      </a>
    );
  }
  // `isMgmt` is true because the caller only draws a link for a room the badge already opens;
  // a room it does not open is rendered as the locked button, never as this.
  return (
    <AdminLink label={room.label} route={href} className={className} isMgmt testId={testId} ariaLabel={ariaLabel}>
      {children}
    </AdminLink>
  );
}
