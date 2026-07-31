import React, { useCallback, useEffect, useState } from 'react';
import { fetchRoomResources, downloadRoomResource, RoomResource } from '../../../services/roomsApi';
import { fmtCentralDateTime } from '../today/shellUtils';

function fmtBytes(n: number | null): string {
  if (!n) return '';
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

// Recordings tab — a filtered, read-only view of this room's resources
// (resource_type: 'recording'). Recordings are captured automatically from
// each class's Google Meet call and hosted on our own storage
// (sessionRecordingService); a resource with a storage_key downloads through
// the same authenticated route Docs & Files uses, one with only a url (a
// manually-pasted link, still possible via Docs & Files) opens externally.
const RoomRecordingsPanel: React.FC<{ roomId: string }> = ({ roomId }) => {
  const [resources, setResources] = useState<RoomResource[] | null>(null);

  const load = useCallback(async () => {
    setResources(null);
    try { setResources(await fetchRoomResources(roomId, { resourceType: 'recording' })); }
    catch { setResources([]); }
  }, [roomId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="rm-files">
      <div className="rm-reslist">
        {resources === null && <div className="rm-empty">Loading recordings…</div>}
        {resources !== null && resources.length === 0 && (
          <div className="rm-empty">No recordings yet. They show up here automatically after each class.</div>
        )}
        {resources?.map((r) => (
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
