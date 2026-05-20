/**
 * WalkSummaryPage — Phase C (2026-05-20).
 *
 * Shown at the end of a walk (or any time the operator clicks "Summary →"
 * in the walk chrome). Groups caps by verdict and lists the operator's
 * cap-level notes. The "Compile follow-up prompt" button gathers
 * everything into a Markdown prompt the operator pastes into Claude
 * Code's next session.
 *
 * URL: /portal/walk-caps/summary?session=<uuid>.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

type Verdict = 'pending' | 'reviewed' | 'follow_up' | 'skip';

interface CapItem {
  index: number;
  cap_id: string;
  name: string;
  frontend_route: string | null;
  verdict: Verdict;
  cap_level_note: string | null;
  visited_at: string | null;
  decided_at: string | null;
}

interface WalkDetail {
  id: string;
  started_at: string;
  closed_at: string | null;
  filter: string;
  cap_queue: string[];
  caps: CapItem[];
  counts: Record<Verdict, number>;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  reviewed: 'Reviewed',
  follow_up: 'Needs follow-up',
  skip: 'Skipped',
  pending: 'Not yet visited',
};

const VERDICT_ICON: Record<Verdict, string> = {
  reviewed: 'bi-check-circle text-success',
  follow_up: 'bi-flag text-warning',
  skip: 'bi-arrow-right-circle text-secondary',
  pending: 'bi-circle text-muted',
};

const WalkSummaryPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const walkId = searchParams.get('session');

  const [walk, setWalk] = useState<WalkDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!walkId) return;
    setLoading(true);
    (async () => {
      try {
        const r = await portalApi.get(`/api/portal/project/walk/${encodeURIComponent(walkId)}`);
        setWalk(r.data?.walk as WalkDetail);
      } catch (err: any) {
        setError(err?.response?.data?.error || err?.message || 'Failed to load walk');
      } finally {
        setLoading(false);
      }
    })();
  }, [walkId]);

  const grouped = useMemo(() => {
    const g: Record<Verdict, CapItem[]> = { reviewed: [], follow_up: [], skip: [], pending: [] };
    if (!walk) return g;
    for (const cap of walk.caps) g[cap.verdict].push(cap);
    return g;
  }, [walk]);

  const compiledPrompt = useMemo(() => {
    if (!walk) return '';
    const followUps = grouped.follow_up;
    const reviewed = grouped.reviewed;
    const lines: string[] = [];
    lines.push(`# Walk summary (${new Date(walk.started_at).toLocaleString()})`);
    lines.push('');
    lines.push(`Filter: \`${walk.filter}\` · ${walk.caps.length} caps queued`);
    lines.push('');
    lines.push(`Counts: ${walk.counts.reviewed} reviewed · ${walk.counts.follow_up} follow-up · ${walk.counts.skip} skipped · ${walk.counts.pending} pending`);
    lines.push('');
    if (followUps.length > 0) {
      lines.push('## Needs follow-up');
      lines.push('');
      for (const cap of followUps) {
        lines.push(`### ${cap.name}${cap.frontend_route ? ` — \`${cap.frontend_route}\`` : ''}`);
        if (cap.cap_level_note) {
          lines.push('');
          lines.push(cap.cap_level_note);
        } else {
          lines.push('');
          lines.push('_no note_');
        }
        lines.push('');
      }
    }
    if (reviewed.some(c => c.cap_level_note)) {
      lines.push('## Reviewed (with notes)');
      lines.push('');
      for (const cap of reviewed.filter(c => c.cap_level_note)) {
        lines.push(`### ${cap.name}${cap.frontend_route ? ` — \`${cap.frontend_route}\`` : ''}`);
        lines.push('');
        lines.push(cap.cap_level_note || '');
        lines.push('');
      }
    }
    if (grouped.pending.length > 0) {
      lines.push('## Not yet visited');
      lines.push('');
      for (const cap of grouped.pending) {
        lines.push(`- ${cap.name}${cap.frontend_route ? ` (\`${cap.frontend_route}\`)` : ''}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }, [walk, grouped]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(compiledPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — operator can select+copy manually */ }
  }, [compiledPrompt]);

  if (!walkId) {
    return (
      <div className="container py-4">
        <div className="alert alert-warning">
          No walk session in URL. <a href="/portal/walk-caps">Start one</a>.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container py-5 text-center text-muted">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading summary…</span>
        </div>
      </div>
    );
  }

  if (error || !walk) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger">{error || 'Walk not found'}</div>
      </div>
    );
  }

  return (
    <div className="container py-4" style={{ maxWidth: 980 }}>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600 }}>
            Walk summary
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-primary)', marginTop: 4 }}>
            {walk.caps.length} caps · filter "{walk.filter}"
          </h2>
          <div className="small text-muted">
            Started {new Date(walk.started_at).toLocaleString()}
            {walk.closed_at && ` · closed ${new Date(walk.closed_at).toLocaleString()}`}
          </div>
        </div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => navigate(`/portal/walk-caps?session=${walk.id}`)}
          >
            <i className="bi bi-arrow-left me-1"></i>Back to walk
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleCopy}
            disabled={!compiledPrompt}
          >
            <i className="bi bi-clipboard me-1"></i>
            {copied ? 'Copied!' : 'Copy compiled prompt'}
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body py-3">
          <div className="d-flex gap-3 flex-wrap">
            <span><i className={`bi ${VERDICT_ICON.reviewed} me-1`}></i><strong>{walk.counts.reviewed}</strong> reviewed</span>
            <span><i className={`bi ${VERDICT_ICON.follow_up} me-1`}></i><strong>{walk.counts.follow_up}</strong> follow-up</span>
            <span><i className={`bi ${VERDICT_ICON.skip} me-1`}></i><strong>{walk.counts.skip}</strong> skipped</span>
            <span><i className={`bi ${VERDICT_ICON.pending} me-1`}></i><strong>{walk.counts.pending}</strong> pending</span>
          </div>
        </div>
      </div>

      {(['follow_up', 'reviewed', 'skip', 'pending'] as Verdict[]).map(verdict => {
        const caps = grouped[verdict];
        if (caps.length === 0) return null;
        return (
          <div key={verdict} className="card border-0 shadow-sm mb-3">
            <div className="card-header bg-white fw-semibold">
              <i className={`bi ${VERDICT_ICON[verdict]} me-2`}></i>
              {VERDICT_LABEL[verdict]} ({caps.length})
            </div>
            <ul className="list-group list-group-flush">
              {caps.map(cap => (
                <li key={cap.cap_id} className="list-group-item">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="fw-medium">{cap.name}</div>
                      {cap.frontend_route && (
                        <div className="small text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                          {cap.frontend_route}
                        </div>
                      )}
                      {cap.cap_level_note && (
                        <div className="mt-2 small" style={{
                          backgroundColor: 'var(--color-bg-alt)',
                          padding: '6px 10px',
                          borderRadius: 4,
                          borderLeft: '3px solid var(--color-primary-light)',
                          whiteSpace: 'pre-wrap',
                        }}>
                          {cap.cap_level_note}
                        </div>
                      )}
                    </div>
                    {cap.frontend_route && (
                      <a
                        href={`/portal/visual-workspace?bp=${cap.cap_id}&route=${encodeURIComponent(cap.frontend_route)}`}
                        className="btn btn-sm btn-link"
                        style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                      >
                        Critique →
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {compiledPrompt && (
        <details className="mt-4">
          <summary className="small text-muted" style={{ cursor: 'pointer' }}>
            Preview compiled prompt
          </summary>
          <pre style={{
            background: 'var(--color-bg-alt)',
            padding: '1rem',
            borderRadius: 4,
            border: '1px solid var(--color-border)',
            fontSize: 12,
            maxHeight: 400,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}>
            {compiledPrompt}
          </pre>
        </details>
      )}
    </div>
  );
};

export default WalkSummaryPage;
