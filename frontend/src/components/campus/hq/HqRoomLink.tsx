import React from 'react';
import AdminLink from '../AdminLink';
import { roomHref, opensInPlace, type HqRoom } from './hqModel';

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
  if (inPlace || room.external) {
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
