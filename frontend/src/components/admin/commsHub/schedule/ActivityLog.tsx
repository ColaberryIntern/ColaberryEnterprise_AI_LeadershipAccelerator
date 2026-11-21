import React, { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage, getActivity, type ActivityRow } from '../../../../services/commsHubApi';
import { SectionCard } from '../../shell';
import { whenOf } from '../board/boardDisplay';

/**
 * Activity log (design 04, CH7.4): the newest hub changes as sentences. `refreshKey` changes when the
 * page did something (cancel, retry, pause, save), so the log shows it without a reload.
 */
export default function ActivityLog({ refreshKey }: { refreshKey: number }): React.ReactElement {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    getActivity(20).then(setRows).catch((err) => setError(apiErrorMessage(err, 'The activity log did not load.')));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  return (
    <SectionCard title="Activity log" icon="file-list-3-line">
      {error && (
        <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2 mb-0" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={load}>Try again</button>
        </div>
      )}
      {!error && !rows && <p className="text-muted mb-0" role="status">Loading...</p>}
      {rows && rows.length === 0 && <p className="text-muted mb-0">Nothing has happened yet.</p>}
      {rows && rows.length > 0 && (
        <ol className="list-unstyled mb-0 ch-activity">
          {rows.map((r) => (
            <li key={r.id} className="ch-activity-row">
              <span className="fw-bold">{r.who} {r.did}</span>
              {r.about && <span className="d-block">{r.about}</span>}
              <span className="small text-muted d-block">{whenOf(r.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
