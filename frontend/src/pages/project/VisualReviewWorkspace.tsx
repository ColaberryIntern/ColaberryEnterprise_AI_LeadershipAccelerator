/**
 * VisualReviewWorkspace — DEPRECATED.
 *
 * This was the legacy two-pane critique surface. It has been superseded by
 * the productized Visual Engineering Workspace at:
 *
 *   frontend/src/features/visualWorkspace/VisualWorkspacePage.tsx
 *   route: /portal/visual-workspace
 *
 * The legacy file is retained for rollback safety only — no live route
 * points here, no nav surface exposes it, and the deprecation banner
 * below redirects any user who lands here via a stale bookmark or deep
 * link. Do not extend this file. Do not import from it. Future cleanup
 * will delete it once the new workspace has been validated in production.
 *
 * Backend endpoints used here (`/api/portal/project/visual-review/*`)
 * remain in service — the new workspace consumes them through
 * `useVisualReviewSession`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import { useVisualReviewSession } from '../../hooks/useVisualReviewSession';

const KIND_OPTIONS = ['spacing', 'alignment', 'color', 'typography', 'interaction', 'accessibility', 'hierarchy', 'responsiveness', 'workflow', 'copy'] as const;
const SEVERITY_OPTIONS = ['low', 'medium', 'high'] as const;

interface SessionStub { id: string; bp_id: string | null; page_route: string; status: string; opened_at: string; ux_score_before: number | null; ux_score_after: number | null; }

const VisualReviewWorkspace: React.FC = () => {
  const [sessions, setSessions] = useState<SessionStub[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('http://localhost:8888');
  const [routeInput, setRouteInput] = useState<string>('/');

  const session = useVisualReviewSession(activeId);

  const refreshSessions = useCallback(async () => {
    try {
      const r = await portalApi.get('/api/portal/project/visual-review/sessions');
      setSessions((r.data?.sessions || []) as SessionStub[]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void refreshSessions(); }, [refreshSessions]);

  const openNewSession = useCallback(async () => {
    try {
      const r = await portalApi.post('/api/portal/project/visual-review/session', {
        page_route: routeInput,
      });
      const id = r.data?.id;
      if (id) {
        setActiveId(id);
        await refreshSessions();
      }
    } catch { /* errors surfaced inline */ }
  }, [routeInput, refreshSessions]);

  const previewSrc = useMemo(() => {
    if (!session.data?.session?.page_route) return previewUrl;
    return `${previewUrl.replace(/\/$/, '')}${session.data.session.page_route}`;
  }, [previewUrl, session.data]);

  return (
    <div className="container-fluid p-0" style={{ minHeight: '100vh', background: 'var(--color-bg-alt)' }}>
      {/* Deprecation banner — this surface has been superseded. */}
      <div
        role="alert"
        style={{
          background: 'var(--color-warning-bg)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
          padding: '0.65rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          fontSize: 13,
        }}
      >
        <div>
          <strong style={{ color: 'var(--color-warning)' }}>
            <i className="bi bi-exclamation-triangle me-2"></i>
            Legacy critique surface
          </strong>
          <span style={{ color: 'var(--color-text)', marginLeft: 8 }}>
            This page has been replaced by the productized critique workspace. Please use the new surface for all visual reviews.
          </span>
        </div>
        <Link
          to="/portal/visual-workspace"
          className="btn btn-sm"
          style={{ whiteSpace: 'nowrap', background: '#FB2832', color: '#fff', border: 'none' }}
        >
          <i className="bi bi-bullseye me-1"></i>Open Critique workspace
        </Link>
      </div>

      <div className="row g-0" style={{ minHeight: '100vh' }}>
        <div className="col-lg-8 p-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white d-flex flex-wrap gap-2 align-items-center">
              <span className="fw-semibold"><i className="bi bi-eye me-2"></i>Page preview</span>
              <input
                className="form-control form-control-sm"
                style={{ flex: '1 1 200px' }}
                placeholder="Preview origin (e.g. http://localhost:8888)"
                value={previewUrl}
                onChange={e => setPreviewUrl(e.target.value)}
              />
              <input
                className="form-control form-control-sm"
                style={{ flex: '1 1 200px' }}
                placeholder="Route (e.g. /admin/dashboard)"
                value={routeInput}
                onChange={e => setRouteInput(e.target.value)}
                disabled={!!session.data}
              />
              {!session.data && (
                <button className="btn btn-sm" style={{ background: '#FB2832', color: '#fff', border: 'none' }} onClick={() => void openNewSession()}>Open review</button>
              )}
              {session.data && (
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setActiveId(null)}>Close</button>
              )}
            </div>
            <div className="card-body p-0" style={{ minHeight: 600 }}>
              <iframe
                title="Visual review preview"
                src={previewSrc}
                style={{ width: '100%', height: 'calc(100vh - 110px)', border: 0 }}
              />
            </div>
          </div>
        </div>

        <div className="col-lg-4 p-3">
          {!activeId && (
            <RecentSessionsList sessions={sessions} onPick={setActiveId} />
          )}
          {activeId && session.data && (
            <CritiquePanel
              data={session.data}
              loading={session.loading}
              error={session.error}
              addCritique={session.addCritique}
              decide={session.decide}
              generatePrompt={session.generatePrompt}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const RecentSessionsList: React.FC<{ sessions: SessionStub[]; onPick: (id: string) => void }> = ({ sessions, onPick }) => (
  <div className="card border-0 shadow-sm h-100">
    <div className="card-header bg-white fw-semibold">Recent visual reviews</div>
    <div className="card-body small">
      {sessions.length === 0 && <div className="text-muted">No reviews yet. Open a route on the left to start one.</div>}
      <ul className="list-group list-group-flush">
        {sessions.map(s => (
          <li key={s.id} className="list-group-item d-flex justify-content-between align-items-center px-0">
            <div>
              <div className="fw-semibold">{s.page_route}</div>
              <div className="text-muted">{s.status} · {new Date(s.opened_at).toLocaleString()}</div>
            </div>
            <button className="btn btn-sm" style={{ border: '1px solid #FB2832', color: '#FB2832', background: 'transparent' }} onClick={() => onPick(s.id)}>Open</button>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

const CritiquePanel: React.FC<{
  data: NonNullable<ReturnType<typeof useVisualReviewSession>['data']>;
  loading: boolean;
  error: string | null;
  addCritique: ReturnType<typeof useVisualReviewSession>['addCritique'];
  decide: ReturnType<typeof useVisualReviewSession>['decide'];
  generatePrompt: ReturnType<typeof useVisualReviewSession>['generatePrompt'];
}> = ({ data, loading, error, addCritique, decide, generatePrompt }) => {
  const [kind, setKind] = useState<typeof KIND_OPTIONS[number]>('spacing');
  const [severity, setSeverity] = useState<typeof SEVERITY_OPTIONS[number]>('medium');
  const [description, setDescription] = useState('');
  const [targetSelector, setTargetSelector] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);

  const submit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      await addCritique({
        kind, severity, description,
        target_selector: targetSelector || null,
      });
      setDescription('');
      setTargetSelector('');
    } finally {
      setSubmitting(false);
    }
  };

  const onGenerate = async () => {
    const r = await generatePrompt();
    if (r?.generated_prompt) setGeneratedPrompt(r.generated_prompt);
  };

  const decisionsBySuggestion = new Map<string, string>();
  for (const d of data.decisions || []) if (d.suggestion_id) decisionsBySuggestion.set(d.suggestion_id, d.verdict);

  return (
    <div className="card border-0 shadow-sm h-100" style={{ maxHeight: 'calc(100vh - 24px)', overflowY: 'auto' }}>
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
        <span>Critique · {data.session.page_route}</span>
        <span className="badge bg-secondary">{data.session.status}</span>
      </div>

      <div className="card-body small">
        {error && <div className="alert alert-warning small">{error}</div>}

        <h6 className="text-uppercase text-muted small">Add critique</h6>
        <div className="row g-2 mb-2">
          <div className="col-6">
            <select className="form-select form-select-sm" value={kind} onChange={e => setKind(e.target.value as any)}>
              {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="col-6">
            <select className="form-select form-select-sm" value={severity} onChange={e => setSeverity(e.target.value as any)}>
              {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <input
          className="form-control form-control-sm mb-2"
          placeholder="Target selector (optional)"
          value={targetSelector}
          onChange={e => setTargetSelector(e.target.value)}
        />
        <textarea
          className="form-control form-control-sm mb-2"
          rows={3}
          placeholder="What's wrong? Be specific."
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <button
          className="btn btn-sm w-100 mb-3"
          style={{ background: '#FB2832', color: '#fff', border: 'none' }}
          onClick={() => void submit()}
          disabled={submitting || !description.trim()}
        >{submitting ? 'Saving…' : 'Add critique + generate suggestions'}</button>

        <h6 className="text-uppercase text-muted small mt-3">Critiques ({data.critiques.length})</h6>
        {data.critiques.length === 0 && <div className="text-muted">No critiques yet.</div>}
        {data.critiques.map((c: any) => (
          <div key={c.id} className="border rounded p-2 mb-2">
            <div className="d-flex justify-content-between align-items-start">
              <div>
                <span className="badge bg-light text-dark border me-1">{c.kind}</span>
                <span className={`badge ${severityClass(c.severity)} me-1`}>{c.severity}</span>
              </div>
              {c.target_selector && <code className="small text-truncate" style={{ maxWidth: 200 }}>{c.target_selector}</code>}
            </div>
            <div className="mt-1">{c.description}</div>
            <div className="mt-2">
              {(data.suggestions || []).filter((s: any) => s.critique_id === c.id).map((s: any) => {
                const verdict = decisionsBySuggestion.get(s.id);
                return (
                  <div key={s.id} className="bg-light rounded p-2 mb-1">
                    <div className="d-flex justify-content-between align-items-center">
                      <strong className="small">{s.title}</strong>
                      <span className="badge bg-info text-dark">+{s.expected_ux_impact} UX</span>
                    </div>
                    <div className="small text-muted mt-1">{s.body}</div>
                    {!verdict && (
                      <div className="d-flex gap-1 mt-2">
                        <button className="btn btn-sm btn-success" onClick={() => void decide({ suggestion_id: s.id, verdict: 'accepted' })}>Accept</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => void decide({ suggestion_id: s.id, verdict: 'rejected' })}>Reject</button>
                        <button className="btn btn-sm btn-outline-warning" onClick={() => void decide({ suggestion_id: s.id, verdict: 'deferred' })}>Defer</button>
                      </div>
                    )}
                    {verdict && <div className="small mt-1"><span className={`badge ${verdictClass(verdict)}`}>{verdict}</span></div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {data.critiques.length > 0 && (
          <button className="btn btn-sm w-100 mt-2" style={{ border: '1px solid #FB2832', color: '#FB2832', background: 'transparent' }} onClick={() => void onGenerate()} disabled={loading}>
            <i className="bi bi-lightning me-1"></i>Generate Claude prompt from accepted suggestions
          </button>
        )}

        {generatedPrompt && (
          <div className="mt-3">
            <h6 className="text-uppercase text-muted small">Generated prompt</h6>
            <textarea
              className="form-control form-control-sm"
              rows={12}
              readOnly
              value={generatedPrompt}
            />
            <button
              className="btn btn-sm btn-outline-secondary mt-2"
              onClick={() => navigator.clipboard?.writeText(generatedPrompt)}
            ><i className="bi bi-clipboard me-1"></i>Copy</button>
          </div>
        )}
      </div>
    </div>
  );
};

function severityClass(severity: string): string {
  if (severity === 'high') return 'bg-danger';
  if (severity === 'medium') return 'bg-warning text-dark';
  return 'bg-light text-dark border';
}

function verdictClass(verdict: string): string {
  if (verdict === 'accepted') return 'bg-success';
  if (verdict === 'rejected') return 'bg-secondary';
  return 'bg-warning text-dark';
}

export default VisualReviewWorkspace;
