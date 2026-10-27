import React from 'react';
import PortalShell from '../today/PortalShell';
import CondensedHeaderCard from '../today/CondensedHeaderCard';
import ReplayList from './ReplayList';
import { useReplayDiscovery } from '../../../hooks/useReplayDiscovery';
import { useParticipantAuth } from '../../../contexts/ParticipantAuthContext';
import './ReplaysPage.css';

/**
 * Replays — a student finds the class they missed (L8.3).
 *
 * The ticket's signal is one sentence: a student finds last week's class and plays it. Before
 * this page there was no answer to "where do I watch that back", however complete and tested
 * the playback path underneath already was.
 *
 * IT REUSES THE PLAYER, NOT A SECOND ONE. `useBroadcastPlayer().open` — called from
 * `ReplayList` — is the same seam the live badge and the room Watch button use, and the grant
 * it triggers resolves the recording's own uid (L8.4) rather than a dead live input. There is
 * no replay-specific transport on this page at all.
 *
 * This file is only the wiring: the shell, the auth gate and the fetch. Every rendering
 * decision lives in `ReplayList`, which is testable without standing up the shell.
 */
export default function ReplaysPage(): React.ReactElement {
  const { isAuthenticated } = useParticipantAuth();
  // Auth-gated for the reason the live discovery provider is: an unauthenticated request to
  // this endpoint answers 401, and `portalApi`'s interceptor turns that into a redirect to
  // login — which, on a login page, is a redirect to itself. `portalLoginHref.ts` records two
  // production incidents of that class.
  const state = useReplayDiscovery(isAuthenticated);

  return (
    <PortalShell
      condensedSlot={(
        <CondensedHeaderCard
          tone="leaf"
          label="Replays"
          title="Classes you can watch back"
          sub="Recordings of past live classes"
        />
      )}
    >
      <ReplayList
        replays={state.replays}
        disabled={state.disabled}
        unavailable={state.unavailable}
        loading={state.loading}
        retentionDays={state.retentionDays}
      />
    </PortalShell>
  );
}
