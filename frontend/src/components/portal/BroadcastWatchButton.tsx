import React from 'react';
import { useRoomBroadcast } from '../../contexts/BroadcastDiscoveryContext';
import { useBroadcastPlayer } from '../../contexts/BroadcastPlayerContext';

/**
 * "Watch here" for a room whose class is being broadcast — the in-app alternative to opening
 * a meeting in a new tab.
 *
 * WHY IT IS A COMPONENT AND NOT FOUR COPIES OF AN ONCLICK. Every placement needs the same
 * three decisions: is anything airing for THIS room, may this viewer watch it, and is it
 * already playing. Getting any of them wrong is a user-visible defect — offering a dead
 * button, naming a broadcast the viewer cannot see, or putting a second "Watch" beside a
 * video that is already running. One component, one set of early returns.
 *
 * IT DOES NOT REPLACE "JOIN CLASS". A broadcast is one-way; the meeting link is two-way. A
 * student who wants to speak still needs the meeting, so this sits BESIDE that button rather
 * than instead of it. Replacing the join escape outright would take participation away from
 * everyone in order to give watching to some.
 *
 * ON `can_watch: false`. No button. The entitlement path (preview, upgrade, locked) is the
 * badge's job — it has the room to explain itself — and a "Watch" button that answers 402 is
 * worse than no button. Nothing here fabricates an affordance for content the server has
 * already said no to.
 *
 * ON TITLES. Anything in the discovery list is safe to name: `projectDiscovery` omits a
 * private occurrence entirely for a viewer who is not room-eligible, rather than returning a
 * shell with the title stripped. So this never has to decide what it may display.
 */

export interface BroadcastWatchButtonProps {
  /**
   * The room this surface is showing. `room_id` is the ONLY key that joins a broadcast
   * occurrence to anything else in the portal — `BroadcastOccurrence` carries no live-session,
   * event or cohort id — so a surface without one cannot use this component, and must not
   * pretend it knows which event is airing.
   */
  roomId: string | null | undefined;
  /** Defaults to the shared pill used across the portal. */
  className?: string;
  /** Override for a surface whose wording needs to differ. */
  label?: string;
}

export default function BroadcastWatchButton({
  roomId, className = 'te-btn cherry sm', label = '▶ Watch here',
}: BroadcastWatchButtonProps): React.ReactElement | null {
  const airing = useRoomBroadcast(roomId);
  const { open, session } = useBroadcastPlayer();

  if (!airing || !airing.can_watch) return null;
  // Already playing this one: a second button would reopen the same session and restart it.
  if (session?.occurrenceId === airing.id) return null;

  return (
    <button
      type="button"
      className={className}
      data-testid="broadcast-watch"
      onClick={() => open({
        occurrenceId: airing.id,
        // The grant is per-asset and discovery carries no asset slug, so the live manifest
        // name is the contract both sides already assume (`LiveNowBadge` uses the same).
        asset: 'master.m3u8',
        title: airing.title,
      })}
    >
      {label}
    </button>
  );
}
