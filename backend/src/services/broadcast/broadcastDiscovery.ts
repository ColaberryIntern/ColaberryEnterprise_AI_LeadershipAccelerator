import type { BroadcastAccessDecision, BroadcastAccessMode } from './broadcastEntitlement';
import type { EditorialState } from './broadcastStateMachine';

/**
 * What a viewer is allowed to KNOW about what is airing.
 *
 * PURE. The caller loads occurrences and resolves each viewer decision; this decides what
 * leaves the server. Kept separate from the entitlement rule on purpose: "may you watch it"
 * and "may you know it exists" are different questions with different answers, and the second
 * one is the one that leaks.
 *
 * THE RULE THAT MATTERS: a private occurrence the viewer is not room-eligible for is OMITTED
 * ENTIRELY — the title never leaves the process. Not hidden by CSS, not sent-and-not-rendered,
 * not replaced with a placeholder in a payload that still carries the real value somewhere
 * else. The acceptance criterion says the private title must never render for an ineligible
 * viewer, and the only way to be sure of that is for the client never to receive it.
 *
 * A DELIBERATE DIVERGENCE FROM THE ROOM PRECEDENT. `roomVisibility` returns `shell` for a
 * private room — a locked, title-less stub — because the rooms directory is browsable and a
 * stub is how you discover a room exists in order to ask for access. A live ticker is not a
 * directory: there is nothing to request and no join flow, so a stub would only advertise
 * that something is happening behind a door. Omission is the better answer here, and it is a
 * choice rather than an oversight.
 *
 * Free, paid and preview occurrences DO carry their titles, including for a viewer who cannot
 * watch. That is not a leak: the title is the thing that sells the upgrade, and §4 wants the
 * paywall to offer a path rather than pretend the class is not happening.
 */

/** The occurrence fields discovery needs. Deliberately not the whole model. */
export interface DiscoverableOccurrence {
  id: string;
  title: string;
  room_id: string | null;
  access_mode: BroadcastAccessMode;
  editorial_state: EditorialState;
  scheduled_start_at: Date | null;
  content_started_at: Date | null;
  /** The class session this broadcast airs (its `live_session` source ref), when it has one. */
  session_id?: string | null;
}

export interface DiscoveryEntry {
  occurrence: DiscoverableOccurrence;
  decision: BroadcastAccessDecision;
  /** From `resolveRoomEligibility`. True for admins, who are eligible everywhere. */
  roomEligible: boolean;
}

export interface DiscoveryItem {
  id: string;
  title: string;
  access_mode: BroadcastAccessMode;
  editorial_state: EditorialState;
  room_id: string | null;
  /** Epoch ms, so the client does no timezone arithmetic of its own. */
  content_started_at: number | null;
  scheduled_start_at: number | null;
  can_watch: boolean;
  /** Stable code; surfaces drive copy off this, never off a message. */
  reason: BroadcastAccessDecision['reason'];
  offer_upgrade: boolean;
  preview_seconds_remaining: number | null;
  /** The class session, so a surface can check the viewer in when they walk into the room. Null for a broadcast with no session. */
  session_id: string | null;
}

/** A private occurrence is knowable only by someone eligible for its room. */
export function mayKnowAbout(entry: DiscoveryEntry): boolean {
  if (entry.occurrence.access_mode !== 'private') return true;
  return entry.roomEligible;
}

export function projectDiscovery(entries: ReadonlyArray<DiscoveryEntry>): DiscoveryItem[] {
  return entries.filter(mayKnowAbout).map(({ occurrence, decision }) => ({
    id: occurrence.id,
    title: occurrence.title,
    access_mode: occurrence.access_mode,
    editorial_state: occurrence.editorial_state,
    room_id: occurrence.room_id,
    content_started_at: occurrence.content_started_at?.getTime() ?? null,
    scheduled_start_at: occurrence.scheduled_start_at?.getTime() ?? null,
    can_watch: decision.grant !== 'denied',
    reason: decision.reason,
    offer_upgrade: decision.offerUpgrade === true,
    // null, never 0, when the clock has not started — the distinction broadcastMetrics and
    // the entitlement layer both preserve, and collapsing it here would undo that.
    preview_seconds_remaining: decision.previewSecondsRemaining ?? null,
    session_id: occurrence.session_id ?? null,
  }));
}
