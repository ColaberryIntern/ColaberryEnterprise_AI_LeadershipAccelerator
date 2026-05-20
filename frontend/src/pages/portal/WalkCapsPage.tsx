/**
 * WalkCapsPage — Phase B (2026-05-20).
 *
 * Guided walk through a cap queue. Operator picks a filter, the backend
 * builds the queue, then this page steps through one cap at a time:
 *   - Chrome row: "Cap X of N · Name · /route"
 *   - Live iframe preview of the cap's route
 *   - Free-form note textarea (auto-saves on blur via verdict patch)
 *   - Verdict buttons: Reviewed / Needs follow-up / Skip
 *   - Prev / Next navigation
 *
 * URL shape: /portal/walk-caps?session=<uuid>. Refresh-safe — current
 * index lives server-side. No session param ⇒ picker view.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

type Verdict = 'pending' | 'reviewed' | 'follow_up' | 'skip';
type Filter = 'all' | 'pending_review' | 'top_10' | 'with_notes';

interface CapItem {
  index: number;
  cap_id: string;
  name: string;
  frontend_route: string | null;
  usability_frontend: string | null;
  verdict: Verdict;
  cap_level_note: string | null;
  visual_review_session_id: string | null;
  visited_at: string | null;
  decided_at: string | null;
}

interface WalkDetail {
  id: string;
  project_id: string;
  filter: string;
  current_index: number;
  cap_queue: string[];
  caps: CapItem[];
  counts: Record<Verdict, number>;
}

const FILTER_OPTIONS: { value: Filter; label: string; help: string }[] = [
  { value: 'all', label: 'All caps with a page', help: 'Every active cap that has a frontend_route' },
  { value: 'pending_review', label: 'Pending UI review', help: 'Pages built but UI review not yet completed' },
  { value: 'top_10', label: 'Top 10 (alphabetical)', help: 'First 10 by name — quick spot check' },
  { value: 'with_notes', label: 'Has prior notes', help: 'Caps where you (or another operator) already left a cap-level note' },
];

const PREVIEW_ORIGIN =
  process.env.REACT_APP_VISUAL_WORKSPACE_ORIGIN ||
  process.env.REACT_APP_PREVIEW_ORIGIN ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8888');

const WalkCapsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const walkId = searchParams.get('session');

  const [walk, setWalk] = useState<WalkDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [picker, setPicker] = useState<{ filter: Filter; creating: boolean; error: string | null }>({
    filter: 'pending_review', creating: false, error: null,
  });

  const refresh = useCallback(async () => {
    if (!walkId) { setWalk(null); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/walk/${encodeURIComponent(walkId)}`);
      setWalk(r.data?.walk as WalkDetail);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load walk');
    } finally {
      setLoading(false);
    }
  }, [walkId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const startWalk = useCallback(async () => {
    setPicker(p => ({ ...p, creating: true, error: null }));
    try {
      const r = await portalApi.post('/api/portal/project/walk', { filter: picker.filter });
      const id = r.data?.id;
      if (id) {
        const next = new URLSearchParams(searchParams);
        next.set('session', id);
        setSearchParams(next, { replace: true });
      }
    } catch (err: any) {
      setPicker(p => ({ ...p, creating: false, error: err?.response?.data?.error || err?.message || 'Failed to start' }));
    }
  }, [picker.filter, searchParams, setSearchParams]);

  const current = useMemo<CapItem | null>(() => {
    if (!walk) return null;
    return walk.caps[walk.current_index] || null;
  }, [walk]);

  const setIndex = useCallback(async (idx: number) => {
    if (!walk) return;
    const clamped = Math.max(0, Math.min(idx, walk.caps.length - 1));
    setWalk(prev => prev ? { ...prev, current_index: clamped } : prev);
    try {
      await portalApi.patch(`/api/portal/project/walk/${encodeURIComponent(walk.id)}/index`, { index: clamped });
    } catch { /* index-update failure is non-fatal; next refresh recovers */ }
  }, [walk]);

  const setVerdict = useCallback(async (verdict: Verdict, capLevelNote?: string) => {
    if (!walk || !current) return;
    setWalk(prev => prev ? {
      ...prev,
      caps: prev.caps.map(c => c.cap_id === current.cap_id ? { ...c, verdict, cap_level_note: capLevelNote ?? c.cap_level_note } : c),
      counts: { ...prev.counts, [current.verdict]: Math.max(0, prev.counts[current.verdict] - 1), [verdict]: prev.counts[verdict] + 1 },
    } : prev);
    try {
      const body: any = { verdict };
      if (typeof capLevelNote === 'string') body.cap_level_note = capLevelNote;
      await portalApi.patch(
        `/api/portal/project/walk/${encodeURIComponent(walk.id)}/cap/${encodeURIComponent(current.cap_id)}/verdict`,
        body,
      );
    } catch { /* surfaced on next refresh */ }
  }, [walk, current]);

  if (!walkId) {
    return (
      <div className="container py-4" style={{ maxWidth: 720 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-primary)' }}>
          <i className="bi bi-collection me-2"></i>Walk caps
        </h2>
        <p className="text-muted small mb-4">
          Step through every cap one at a time. Leave a verdict + note per cap.
          The URL stays shareable — refresh or close the tab, come back later.
        </p>
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="mb-3">
              <label className="form-label small fw-medium">Which caps to walk?</label>
              {FILTER_OPTIONS.map(opt => (
                <div className="form-check" key={opt.value}>
                  <input
                    className="form-check-input"
                    type="radio"
                    name="filter"
                    id={`filter-${opt.value}`}
                    checked={picker.filter === opt.value}
                    onChange={() => setPicker(p => ({ ...p, filter: opt.value }))}
                  />
                  <label className="form-check-label" htmlFor={`filter-${opt.value}`}>
                    <span className="fw-medium">{opt.label}</span>
                    <span className="text-muted small d-block">{opt.help}</span>
                  </label>
                </div>
              ))}
            </div>
            {picker.error && (
              <div className="alert alert-warning py-2 small">{picker.error}</div>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={startWalk}
              disabled={picker.creating}
            >
              {picker.creating ? 'Starting…' : 'Start walk'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !walk) {
    return (
      <div className="container py-5 text-center text-muted">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading walk…</span>
        </div>
      </div>
    );
  }

  if (error || !walk) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger">{error || 'Walk not found'}</div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => {
          const next = new URLSearchParams(searchParams);
          next.delete('session');
          setSearchParams(next, { replace: true });
        }}>Start a new walk</button>
      </div>
    );
  }

  return (
    <div className="container-fluid py-3" style={{ maxWidth: 1400 }}>
      <WalkChrome
        walk={walk}
        current={current}
        onPrev={() => setIndex(walk.current_index - 1)}
        onNext={() => setIndex(walk.current_index + 1)}
        onJumpToSummary={() => navigate(`/portal/walk-caps/summary?session=${walk.id}`)}
      />
      {current && (
        <CapPanel
          walkId={walk.id}
          cap={current}
          onVerdict={setVerdict}
          previewOrigin={PREVIEW_ORIGIN}
        />
      )}
    </div>
  );
};

interface ChromeProps {
  walk: WalkDetail;
  current: CapItem | null;
  onPrev: () => void;
  onNext: () => void;
  onJumpToSummary: () => void;
}

const WalkChrome: React.FC<ChromeProps> = ({ walk, current, onPrev, onNext, onJumpToSummary }) => {
  const total = walk.caps.length;
  const idx = walk.current_index;
  const pct = total > 0 ? Math.round(((idx + 1) / total) * 100) : 0;
  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-body py-2">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600 }}>
              Walk · {walk.filter.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-primary)' }}>
              Cap {idx + 1} of {total} · {current?.name || '(missing)'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontFamily: 'var(--font-mono)' }}>
              {current?.frontend_route || '(no route)'}
            </div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-success-subtle text-success">✓ {walk.counts.reviewed}</span>
            <span className="badge bg-warning-subtle text-warning">⚠ {walk.counts.follow_up}</span>
            <span className="badge bg-light text-muted">↷ {walk.counts.skip}</span>
            <span className="badge bg-secondary-subtle text-secondary">• {walk.counts.pending}</span>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onPrev} disabled={idx === 0}>
              <i className="bi bi-chevron-left"></i> Prev
            </button>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={onNext} disabled={idx >= total - 1}>
              Next <i className="bi bi-chevron-right"></i>
            </button>
            <button type="button" className="btn btn-sm btn-link" onClick={onJumpToSummary}>
              Summary →
            </button>
          </div>
        </div>
        <div className="progress mt-2" style={{ height: 3 }}>
          <div className="progress-bar bg-primary" role="progressbar" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
};

interface CapPanelProps {
  walkId: string;
  cap: CapItem;
  previewOrigin: string;
  onVerdict: (v: Verdict, capLevelNote?: string) => Promise<void>;
}

const CapPanel: React.FC<CapPanelProps> = ({ walkId, cap, previewOrigin, onVerdict }) => {
  const [draftNote, setDraftNote] = useState(cap.cap_level_note || '');
  const dirtyRef = useRef(false);
  const navigate = useNavigate();

  // Reset note state when the cap changes
  useEffect(() => {
    setDraftNote(cap.cap_level_note || '');
    dirtyRef.current = false;
  }, [cap.cap_id, cap.cap_level_note]);

  const previewSrc = useMemo(() => {
    if (!cap.frontend_route) return null;
    const r = cap.frontend_route;
    return `${previewOrigin.replace(/\/$/, '')}${r.startsWith('/') ? r : `/${r}`}`;
  }, [cap.frontend_route, previewOrigin]);

  const persistNote = useCallback(async () => {
    if (!dirtyRef.current) return;
    await onVerdict(cap.verdict, draftNote);
    dirtyRef.current = false;
  }, [draftNote, cap.verdict, onVerdict]);

  const verdictButton = (v: Verdict, label: string, icon: string, klass: string) => (
    <button
      type="button"
      className={`btn ${cap.verdict === v ? klass : `btn-outline-${klass.replace('btn-', '')}`} btn-sm`}
      onClick={() => onVerdict(v, dirtyRef.current ? draftNote : undefined)}
    >
      <i className={`bi ${icon} me-1`}></i>{label}
    </button>
  );

  return (
    <div className="row g-3">
      <div className="col-lg-8">
        <div className="card border-0 shadow-sm" style={{ overflow: 'hidden' }}>
          <div className="card-header bg-white d-flex align-items-center justify-content-between py-2">
            <span className="small text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
              {previewSrc || 'no preview route'}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => navigate(`/portal/visual-workspace?bp=${cap.cap_id}&route=${encodeURIComponent(cap.frontend_route || '')}`)}
              disabled={!cap.frontend_route}
              title="Open the Visual Workspace for region-level critique"
            >
              <i className="bi bi-pencil-square me-1"></i>Critique this page
            </button>
          </div>
          {previewSrc ? (
            <iframe
              key={cap.cap_id}
              src={previewSrc}
              title={cap.name}
              style={{ width: '100%', height: 'calc(100vh - 280px)', border: 0, display: 'block' }}
            />
          ) : (
            <div className="p-5 text-center text-muted">
              <i className="bi bi-link-slash" style={{ fontSize: 32 }}></i>
              <div className="mt-2">This cap has no frontend route — nothing to preview.</div>
            </div>
          )}
        </div>
      </div>
      <div className="col-lg-4">
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <h6 className="fw-semibold mb-3">Verdict</h6>
            <div className="d-flex gap-2 flex-wrap mb-3">
              {verdictButton('reviewed', 'Reviewed', 'bi-check-circle', 'btn-success')}
              {verdictButton('follow_up', 'Follow-up', 'bi-flag', 'btn-warning')}
              {verdictButton('skip', 'Skip', 'bi-arrow-right-circle', 'btn-secondary')}
            </div>
            <hr />
            <h6 className="fw-semibold mb-2">Cap-level note</h6>
            <p className="small text-muted mb-2">
              About this whole cap, not a region. Saves on blur and survives walk close.
            </p>
            <textarea
              className="form-control form-control-sm"
              rows={6}
              value={draftNote}
              onChange={(e) => { dirtyRef.current = true; setDraftNote(e.target.value); }}
              onBlur={persistNote}
              placeholder="e.g. the cardinality is wrong here, this should be 1:N not N:N…"
              style={{ fontSize: 12 }}
            />
            {cap.visited_at && (
              <div className="small text-muted mt-2">
                Visited {new Date(cap.visited_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalkCapsPage;
