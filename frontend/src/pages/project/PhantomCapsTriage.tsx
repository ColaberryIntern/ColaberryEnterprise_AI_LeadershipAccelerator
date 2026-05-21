/**
 * PhantomCapsTriage — 2026-05-21.
 *
 * Lists capabilities that have no implementation across any layer + no
 * requirements (brownfield over-extraction or LLM hallucinations during
 * cap discovery). Operator triages each one:
 *   - Merge into another cap (combines linked_* + requirements + agent maps)
 *   - Mark as planned (suppresses from phantom list; cap stays visible)
 *   - Delete (soft-archive)
 *
 * URL: /portal/project/phantoms
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

interface MergeSuggestion {
  id: string;
  name: string;
}

interface Phantom {
  id: string;
  name: string;
  description: string | null;
  source: string;
  keyword_attributed_files: { backend: number; frontend: number; agents: number };
  merge_suggestions: MergeSuggestion[];
}

interface PhantomsResponse {
  count: number;
  total_active_caps: number;
  phantoms: Phantom[];
}

const PhantomCapsTriage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<PhantomsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/capabilities/phantoms');
      setData(r.data as PhantomsResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load phantom caps');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const triage = useCallback(async (capId: string, action: 'merge_into' | 'delete' | 'mark_planned', targetCapId?: string) => {
    setActing(capId + ':' + action);
    try {
      await portalApi.post(`/api/portal/project/capabilities/${encodeURIComponent(capId)}/triage`, {
        action,
        target_cap_id: targetCapId,
      });
      await refresh();
    } catch (err: any) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Failed — try again');
    } finally {
      setActing(null);
    }
  }, [refresh]);

  if (loading) {
    return (
      <div className="container py-5 text-center text-muted">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading phantom caps…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  return (
    <div className="container py-4" style={{ maxWidth: 880 }}>
      <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600 }}>
            Triage
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-primary)', marginTop: 4 }}>
            Phantom capabilities
          </h2>
          <div className="small text-muted">
            {data?.count || 0} phantom{(data?.count || 0) === 1 ? '' : 's'} of {data?.total_active_caps || 0} active caps.
            These have no implementation across any layer and no requirements — review and merge / mark planned / delete.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => navigate('/portal/project/system?tab=bps')}
        >
          <i className="bi bi-arrow-left me-1"></i>Back to BPs
        </button>
      </div>

      {data && data.count === 0 && (
        <div className="card border-0 shadow-sm" style={{ background: '#f0fdf4', borderLeft: '3px solid #15803d !important' }}>
          <div className="card-body text-center py-4">
            <i className="bi bi-check-circle-fill text-success" style={{ fontSize: 28 }}></i>
            <div className="fw-semibold mt-2">No phantom caps.</div>
            <div className="small text-muted mt-1">Every active cap has either confirmed implementation or requirements.</div>
          </div>
        </div>
      )}

      {data?.phantoms.map(p => (
        <div key={p.id} className="card border-0 shadow-sm mb-3">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-start mb-2 gap-2 flex-wrap">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="fw-semibold" style={{ fontSize: 15 }}>{p.name}</div>
                <div className="small text-muted mt-1">
                  source: <code style={{ background: 'var(--color-bg-alt)', padding: '0 4px', borderRadius: 3, fontSize: 11 }}>{p.source}</code>
                  {' · '}
                  keyword-attributed: BE {p.keyword_attributed_files.backend} · FE {p.keyword_attributed_files.frontend} · AG {p.keyword_attributed_files.agents}
                </div>
              </div>
            </div>
            {p.description && (
              <div className="small mb-3" style={{ color: 'var(--color-text)', fontStyle: 'italic' }}>
                {p.description}
              </div>
            )}

            {p.merge_suggestions.length > 0 && (
              <div className="mb-2">
                <div className="small fw-semibold mb-2">Possible merge targets (similar name with real implementation):</div>
                <div className="d-flex flex-wrap gap-2">
                  {p.merge_suggestions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      disabled={acting === p.id + ':merge_into'}
                      onClick={() => triage(p.id, 'merge_into', s.id)}
                      style={{ fontSize: 12 }}
                    >
                      <i className="bi bi-arrow-right me-1"></i>Merge into {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="d-flex gap-2 mt-3 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={acting === p.id + ':mark_planned'}
                onClick={() => triage(p.id, 'mark_planned')}
                title="Keep the cap visible but mark as planned future work — won't show as a phantom again"
              >
                <i className="bi bi-bookmark me-1"></i>Mark as planned
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                disabled={acting === p.id + ':delete'}
                onClick={() => {
                  if (window.confirm(`Archive "${p.name}"? Any merged requirements + agents will be lost. This is reversible by setting applicability_status='active' in the DB.`)) {
                    triage(p.id, 'delete');
                  }
                }}
              >
                <i className="bi bi-trash me-1"></i>Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PhantomCapsTriage;
