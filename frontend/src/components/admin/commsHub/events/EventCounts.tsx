import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '../../shell';
import { getEventCounts, type HubCount, type HubEventCounts } from '../../../../services/commsHubApi';

/**
 * Three numbers on the event (CH9.7): registered, watched live, watched the replay. A number is shown
 * only when it is known; otherwise the reason ("Not streamed yet."), never a made-up 0.
 */
export const LIVE_VS_REPLAY = 'Live and replay are told apart by when each person first started watching.';

function Tile({ label, count }: { label: string; count: HubCount }): React.ReactElement {
  return (
    <div className="ch-count-tile">
      <div className="ch-count-label">{label}</div>
      {count.value !== null
        ? <div className="ch-count-value">{count.value.toLocaleString('en-US')}</div>
        : <div className="ch-count-reason">{count.reason ?? 'Not known.'}</div>}
    </div>
  );
}

export default function EventCounts({ eventId }: { eventId: string }): React.ReactElement {
  const [counts, setCounts] = useState<HubEventCounts | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    getEventCounts(eventId).then(setCounts, () => setFailed(true));
  }, [eventId]);
  useEffect(() => { load(); }, [load]);
  return (
    <SectionCard title="Who came" icon="group-line">
      {failed && (
        <div className="alert alert-warning d-flex align-items-center justify-content-between" role="alert">
          <span>The counts did not load.</span>
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={load}>Try again</button>
        </div>
      )}
      {!failed && !counts && <p className="text-muted mb-0" role="status">Loading...</p>}
      {counts && (
        <>
          <div className="ch-count-row" data-testid="ch-event-counts">
            <Tile label="Registered" count={counts.registered} />
            <Tile label="Watched live" count={counts.watched_live} />
            <Tile label="Watched the replay" count={counts.watched_replay} />
          </div>
          <p className="text-muted small mt-2 mb-0">{LIVE_VS_REPLAY}</p>
        </>
      )}
    </SectionCard>
  );
}
