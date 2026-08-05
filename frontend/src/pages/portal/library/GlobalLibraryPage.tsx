import React, { useEffect, useState } from 'react';
import PortalShell from '../today/PortalShell';
import CondensedHeaderCard from '../today/CondensedHeaderCard';
import '../today/TodayShell.css';
import '../rooms/rooms.css';
import RoomFilesPanel from '../rooms/RoomFilesPanel';
import { fetchLibrary, LibraryView } from '../../../services/roomsApi';

// The Global Library — files visible to everyone in the program, independent
// of any single room. Backed by a well-known public "Global Library" room on
// the server (see roomService.ensureGlobalLibraryRoom); this page just
// resolves that room's id via GET /library and reuses RoomFilesPanel.
const GlobalLibraryPage: React.FC = () => {
  const [view, setView] = useState<LibraryView | null | 'error'>(null);

  useEffect(() => {
    fetchLibrary().then(setView).catch(() => setView('error'));
  }, []);

  return (
    <PortalShell
      condensedSlot={<CondensedHeaderCard label="Belong" title="Library" />}
    >
      {(condensed) => (
        <>
      <div className={`te-condense-body${condensed ? ' is-condensed' : ''}`}>
      <div className="page-h" style={{ marginBottom: 12 }}>
        <div className="crumbs0">Belong</div>
        <h1 style={{ margin: 0 }}>Library</h1>
        <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Documents shared with everyone in the program.</div>
      </div>
      </div>

      {view === null && <div className="rm-empty">Loading…</div>}
      {view === 'error' && <div className="rm-empty">The library isn’t available right now.</div>}
      {view && view !== 'error' && (
        <RoomFilesPanel roomId={view.room_id} canUpload={view.can_upload} />
      )}
        </>
      )}
    </PortalShell>
  );
};

export default GlobalLibraryPage;
