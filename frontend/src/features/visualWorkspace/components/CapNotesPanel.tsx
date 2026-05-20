/**
 * CapNotesPanel — sidebar section for cap-level free-form notes.
 *
 * Phase A (2026-05-20): companion to the region-pin critiques. Operators
 * leave a whole-cap note ("this whole cap is the wrong cardinality") that
 * isn't tied to a single pixel region. Persists on blur via PATCH
 * /visual-review/session/:id/notes.
 *
 * Below the textarea, surfaces prior notes for the same bp_id (cap) so the
 * operator can see what they (or earlier sessions) wrote about this cap
 * before. Collapsed by default; expands on click.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import portalApi from '../../../utils/portalApi';

interface CapNote {
  session_id: string;
  page_route: string;
  opened_at: string;
  notes: string;
}

interface Props {
  sessionId: string | null;
  bpId: string | null;
  notes: string;
  onPersist: (notes: string) => Promise<void>;
}

const CapNotesPanel: React.FC<Props> = ({ sessionId, bpId, notes, onPersist }) => {
  const [draft, setDraft] = useState(notes);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [priorNotes, setPriorNotes] = useState<CapNote[]>([]);
  const [showPrior, setShowPrior] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) setDraft(notes);
  }, [notes]);

  useEffect(() => {
    if (!bpId) { setPriorNotes([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ bp_id: bpId });
        if (sessionId) params.set('exclude', sessionId);
        const r = await portalApi.get(`/api/portal/project/visual-review/cap-notes?${params.toString()}`);
        if (cancelled) return;
        setPriorNotes((r.data?.notes || []) as CapNote[]);
      } catch { /* silent — empty prior list is fine */ }
    })();
    return () => { cancelled = true; };
  }, [bpId, sessionId]);

  const handleBlur = useCallback(async () => {
    if (!dirtyRef.current) return;
    setSaving(true);
    try {
      await onPersist(draft);
      dirtyRef.current = false;
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }, [draft, onPersist]);

  const status = saving
    ? 'Saving…'
    : savedAt
      ? 'Saved'
      : draft && dirtyRef.current
        ? 'Unsaved'
        : '';

  return (
    <div className="vw-sidebar-section">
      <h6 className="vw-sidebar-section-title d-flex align-items-center justify-content-between">
        <span><i className="bi bi-pencil-square me-1"></i>Cap-level note</span>
        {status && (
          <span style={{ fontSize: 10, color: 'var(--color-text-light)', fontWeight: 400 }}>{status}</span>
        )}
      </h6>
      <textarea
        className="form-control form-control-sm"
        placeholder="A note about this whole cap (not tied to a region). Saves on blur."
        rows={4}
        value={draft}
        onChange={(e) => { dirtyRef.current = true; setDraft(e.target.value); }}
        onBlur={handleBlur}
        style={{ fontSize: 12, resize: 'vertical' }}
        disabled={!sessionId}
      />
      {priorNotes.length > 0 && (
        <button
          type="button"
          className="btn btn-sm btn-link p-0 mt-2"
          style={{ fontSize: 11, textDecoration: 'none' }}
          onClick={() => setShowPrior(v => !v)}
        >
          <i className={`bi ${showPrior ? 'bi-chevron-down' : 'bi-chevron-right'} me-1`}></i>
          {priorNotes.length} earlier note{priorNotes.length === 1 ? '' : 's'} for this cap
        </button>
      )}
      {showPrior && priorNotes.length > 0 && (
        <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
          {priorNotes.map(n => (
            <div
              key={n.session_id}
              style={{
                fontSize: 11,
                padding: '6px 8px',
                marginBottom: 4,
                backgroundColor: 'var(--color-bg-alt)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
              }}
            >
              <div style={{ color: 'var(--color-text-light)', marginBottom: 2 }}>
                {new Date(n.opened_at).toLocaleDateString()} · {n.page_route}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text)' }}>
                {n.notes}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CapNotesPanel;
