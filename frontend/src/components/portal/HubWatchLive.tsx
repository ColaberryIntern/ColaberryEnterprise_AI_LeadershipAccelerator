import React from 'react';
import { useBroadcastPlayer } from '../../contexts/BroadcastPlayerContext';
import type { OpenHouseView } from '../../services/onboardingApi';

/**
 * CH5.3: "Watch live" for a Communications Hub event that is streaming now, shared by every place
 * the member event feed is shown (the Events page cards and the Schedule calendar). It opens the
 * occurrence in the portal's own player, the same call BroadcastWatchButton and the replay list
 * make; when that stream is already playing it says so rather than offering a button that would
 * restart it.
 */
export function watchOccurrenceId(ev: Pick<OpenHouseView, 'is_live' | 'live_occurrence_id'>): string | null {
  return ev.is_live && ev.live_occurrence_id ? ev.live_occurrence_id : null;
}

interface Props { ev: Pick<OpenHouseView, 'id' | 'title' | 'is_live' | 'live_occurrence_id'>; className?: string; playingClassName?: string }

export default function HubWatchLive({ ev, className = 'evt-btn', playingClassName = 'evt-going' }: Props): React.ReactElement | null {
  const { open, session } = useBroadcastPlayer();
  const liveId = watchOccurrenceId(ev);
  if (!liveId) return null;
  if (session?.occurrenceId === liveId) return <span className={playingClassName} data-testid={`evt-watching-${ev.id}`}>Playing now</span>;
  return (
    <button type="button" className={className} data-testid={`evt-watch-${ev.id}`} onClick={() => open({ occurrenceId: liveId, asset: 'master.m3u8', title: ev.title })}>
      Watch live
    </button>
  );
}
