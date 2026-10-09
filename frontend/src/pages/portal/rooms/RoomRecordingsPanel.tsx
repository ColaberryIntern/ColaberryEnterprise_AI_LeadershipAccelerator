import React, { useCallback, useEffect, useState } from 'react';
import { fetchRoomResources, downloadRoomResource, RoomResource } from '../../../services/roomsApi';
import { fmtCentralDateTime } from '../today/shellUtils';

function fmtBytes(n: number | null): string {
  if (!n) return '';
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

/**
 * Recordings tab — a filtered, read-only view of this room's resources
 * (resource_type: 'recording'). Recordings are captured automatically from each
 * class's video call and hosted on our own storage (sessionRecordingService); a
 * resource with a storage_key downloads through the same authenticated route Docs &
 * Files uses, one with only a url opens externally.
 *
 * A FAILED REQUEST IS NOT AN EMPTY LIST. This panel used to `catch { setResources([]) }`,
 * so a network error, an expired session or a 500 all rendered as "No recordings yet.
 * They show up here automatically after each class." — telling a student their class
 * was never recorded when in fact we simply failed to ask. The two states look
 * identical and mean opposite things: one says stop looking, the other says try
 * again. They are now separate, and the error one offers the retry.
 */

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; items: RoomResource[] }
  | { kind: 'error' };

const RoomRecordingsPanel: React.FC<{ roomId: string }> = ({ roomId }) => {
  const [state, setState] = useState<Load>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', items: await fetchRoomResources(roomId, { resourceType: 'recording' }) });
    } catch {
      setState({ kind: 'error' });
    }
  }, [roomId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="rm-files">
      <div className="rm-reslist">
        {state.kind === 'loading' && <div className="rm-empty" data-testid="rec-loading">Loading recordings…</div>}

        {state.kind === 'error' && (
          <div className="rm-empty" data-testid="rec-error">
            <div>Could not load recordings. This does not mean the class was not recorded.</div>
            <button type="button" className="rm-btn" onClick={() => { void load(); }} data-testid="rec-retry">
              Try again
            </button>
          </div>
        )}

        {state.kind === 'ready' && state.items.length === 0 && (
          <div className="rm-empty" data-testid="rec-empty">
            No recordings yet. They show up here automatically after each class.
          </div>
        )}

        {state.kind === 'ready' && state.items.map((r) => (
          <div key={r.id} className="rm-resrow">
            <span className="rm-res-icon">▶️</span>
            <div className="rm-res-main">
              {r.storage_key ? (
                <button type="button" className="rm-res-title" onClick={() => downloadRoomResource(roomId, r)}>
                  {r.title || 'Class recording'}
                </button>
              ) : (
                <a className="rm-res-title" href={r.url || '#'} target="_blank" rel="noopener noreferrer">
                  {r.title || r.url}
                </a>
              )}
              <div className="rm-res-meta">
                {fmtCentralDateTime(r.created_at)}{r.size_bytes ? ` · ${fmtBytes(r.size_bytes)}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RoomRecordingsPanel;
