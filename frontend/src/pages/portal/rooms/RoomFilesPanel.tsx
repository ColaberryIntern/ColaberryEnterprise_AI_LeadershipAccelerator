import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchRoomResources, uploadRoomFile, createRoomResource, deleteRoomResource, downloadRoomResource,
  RoomResource, BookingCard,
} from '../../../services/roomsApi';
import { fmtCentralDateTime } from '../today/shellUtils';

type CreatableResourceType = 'link' | 'recording' | 'recap' | 'note';

// Docs & Files body — shared between a room's "Docs & Files" tab (RoomPane)
// and the Global Library page. Purely presentational + upload; the caller
// resolves which room this is (a normal room or the well-known library room)
// and whether uploads are allowed (server-computed can_upload/can_upload_resource).

// Exported so other upload entry points into this same feature (the Chat tab's
// attach button in RoomPane) validate against the identical rule set the
// dropzone enforces here, instead of a second copy that could drift.
export const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.rtf,.txt,.md,.csv,.png,.jpg,.jpeg,.webp';
export const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/rtf', 'text/rtf', 'text/plain', 'text/markdown', 'text/csv',
  'image/png', 'image/jpeg', 'image/webp',
]);
export const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.rtf', '.txt', '.md', '.csv', '.png', '.jpg', '.jpeg', '.webp']);
export const MAX_SIZE = 50 * 1024 * 1024;

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

function resourceIcon(r: RoomResource): string {
  if (r.resource_type === 'file') return '📄';
  if (r.resource_type === 'link') return '🔗';
  if (r.resource_type === 'recording') return '▶️';
  return '📝'; // recap / note
}

const RoomFilesPanel: React.FC<{ roomId: string; canUpload: boolean; bookings?: BookingCard[] }> = ({ roomId, canUpload, bookings }) => {
  const [scope, setScope] = useState<string>('all'); // 'all' | 'none' | bookingId
  const [resources, setResources] = useState<RoomResource[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkType, setLinkType] = useState<CreatableResourceType>('link');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkBody, setLinkBody] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  const load = useCallback(async () => {
    setResources(null);
    try {
      const bookingId = scope === 'all' ? undefined : (scope as string);
      setResources(await fetchRoomResources(roomId, bookingId ? { bookingId } : undefined));
    } catch { setResources([]); }
  }, [roomId, scope]);
  useEffect(() => { load(); }, [load]);

  const selectedBooking = bookings?.find((b) => b.id === scope);

  const handleFile = useCallback(async (file: File) => {
    if (!ALLOWED_MIMES.has(file.type) && !ALLOWED_EXT.has(extOf(file.name))) {
      setUploadError('Accepted file types: PDF, Word, PowerPoint, Excel, RTF, Text, Markdown, CSV, PNG, JPG, WEBP');
      return;
    }
    if (file.size > MAX_SIZE) { setUploadError('File must be under 50MB.'); return; }
    setUploading(true); setUploadError('');
    try {
      const bookingId = scope !== 'all' && scope !== 'none' ? scope : undefined;
      await uploadRoomFile(roomId, file, { bookingId });
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setUploadError(msg || 'Upload failed. Please try again.');
    } finally { setUploading(false); }
  }, [roomId, scope, load]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const submitLink = async () => {
    if (addBusy) return;
    if ((linkType === 'link' || linkType === 'recording') && !linkUrl.trim()) return;
    if ((linkType === 'recap' || linkType === 'note') && !linkBody.trim()) return;
    setAddBusy(true);
    try {
      const bookingId = scope !== 'all' && scope !== 'none' ? scope : undefined;
      await createRoomResource(roomId, { resource_type: linkType, booking_id: bookingId, title: linkTitle || undefined, url: linkUrl || undefined, body: linkBody || undefined });
      setLinkTitle(''); setLinkUrl(''); setLinkBody(''); setShowAddLink(false);
      await load();
    } catch { /* surfaced via the disabled/empty state; keep the form open to retry */ }
    finally { setAddBusy(false); }
  };

  const doDelete = async (resourceId: string) => {
    if (!window.confirm('Remove this file? This cannot be undone.')) return;
    try { await deleteRoomResource(roomId, resourceId); await load(); }
    catch { window.alert('Could not remove this file.'); }
  };

  return (
    <div className="rm-files">
      {bookings && bookings.length > 0 && (
        <div className="rm-files-scope">
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Filter by class">
            <option value="all">All files</option>
            <option value="none">Room files (not tied to a class)</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>{b.title}{b.start_at ? ` — ${fmtCentralDateTime(b.start_at)}` : ''}</option>
            ))}
          </select>
          {selectedBooking?.related_room_id && (
            <Link to={`/portal/rooms/${selectedBooking.related_room_id}`} className="rm-files-recap-link">
              ▶ View class recap &amp; recording
            </Link>
          )}
        </div>
      )}

      <div className="rm-reslist">
        {resources === null && <div className="rm-empty">Loading files…</div>}
        {resources !== null && resources.length === 0 && <div className="rm-empty">No files yet.</div>}
        {resources?.map((r) => (
          <div key={r.id} className="rm-resrow">
            <span className="rm-res-icon">{resourceIcon(r)}</span>
            <div className="rm-res-main">
              {r.resource_type === 'file' ? (
                <button type="button" className="rm-res-title" onClick={() => downloadRoomResource(roomId, r)}>{r.title || 'Untitled file'}</button>
              ) : r.resource_type === 'link' || r.resource_type === 'recording' ? (
                <a className="rm-res-title" href={r.url || '#'} target="_blank" rel="noopener noreferrer">{r.title || r.url}</a>
              ) : (
                <div className="rm-res-title">{r.title || (r.resource_type === 'recap' ? 'Recap' : 'Note')}</div>
              )}
              {r.body && r.resource_type !== 'file' && <div className="rm-res-body">{r.body}</div>}
              <div className="rm-res-meta">{fmtCentralDateTime(r.created_at)}</div>
            </div>
            {r.can_delete && <button type="button" className="rm-res-del" onClick={() => doDelete(r.id)} aria-label="Remove file">🗑</button>}
          </div>
        ))}
      </div>

      {canUpload && (
        <div className="rm-uploader">
          <div
            className={`rm-dropzone${uploading ? ' busy' : ''}`}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('rm-file-input')?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('rm-file-input')?.click(); } }}
          >
            {uploading ? 'Uploading…' : 'Drag & drop a file here, or click to browse'}
            <div className="rm-dropzone-hint">PDF, Word, PowerPoint, Excel, RTF, Text, Markdown, CSV, PNG, JPG, WEBP — max 50MB</div>
            <input id="rm-file-input" type="file" accept={ACCEPT} className="rm-file-input-hidden" onChange={handleFileInput} />
          </div>
          {uploadError && <div className="rm-upload-error">{uploadError}</div>}

          {!showAddLink && (
            <button type="button" className="te-btn ghost sm" onClick={() => setShowAddLink(true)}>+ Add a link, recording, or note</button>
          )}
          {showAddLink && (
            <div className="rm-addlink">
              <select value={linkType} onChange={(e) => setLinkType(e.target.value as CreatableResourceType)}>
                <option value="link">Link</option>
                <option value="recording">Video recording (link)</option>
                <option value="note">Note</option>
                <option value="recap">Recap</option>
              </select>
              <input placeholder="Title (optional)" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
              {(linkType === 'link' || linkType === 'recording') && (
                <input placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              )}
              {(linkType === 'note' || linkType === 'recap') && (
                <textarea placeholder="Write it here…" value={linkBody} onChange={(e) => setLinkBody(e.target.value)} />
              )}
              <div className="rm-addlink-actions">
                <button type="button" className="te-btn ghost sm" onClick={() => setShowAddLink(false)}>Cancel</button>
                <button type="button" className="te-btn cherry sm" onClick={submitLink} disabled={addBusy}>{addBusy ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RoomFilesPanel;
