import React, { useEffect, useState, useCallback } from 'react';
import portalApi from '../../utils/portalApi';
import GuidedExecutionPanel from './GuidedExecutionPanel';

interface NextActionData {
  id: string;
  title: string;
  action_type: string;
  reason: string;
  priority_score: number;
  confidence_score: number;
  status: string;
  metadata?: {
    files_suggested?: string[];
    related_artifacts?: string[];
    requirement_key?: string;
    scoring?: {
      status_weight: number;
      dependency_weight: number;
      system_rule_weight: number;
    };
  };
}

const ACTION_TYPE_BADGES: Record<string, { label: string; className: string }> = {
  create_artifact: { label: 'Create Artifact', className: 'bg-primary' },
  update_artifact: { label: 'Update Artifact', className: 'bg-warning text-dark' },
  build_feature: { label: 'Build Feature', className: 'bg-info text-dark' },
  fix_issue: { label: 'Fix Issue', className: 'bg-danger' },
};

function ProjectNextActionPanel() {
  const [action, setAction] = useState<NextActionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<'accepting' | 'completing' | null>(null);
  const [noAction, setNoAction] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [verificationGaps, setVerificationGaps] = useState<string[] | null>(null);
  const [verifying, setVerifying] = useState(false);

  const fetchAction = useCallback(() => {
    setLoading(true);
    portalApi.get('/api/portal/project/next-action')
      .then(res => {
        if (res.data.action) {
          setAction(res.data.action);
          setNoAction(false);
        } else {
          setAction(null);
          setNoAction(true);
        }
      })
      .catch(() => {
        setAction(null);
        setNoAction(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAction(); }, [fetchAction]);

  const handleAccept = async () => {
    if (!action) return;
    setActing('accepting');
    try {
      const res = await portalApi.post('/api/portal/project/next-action/accept', { action_id: action.id });
      setAction(res.data.action);
      setShowGuidance(true);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to accept action');
    } finally { setActing(null); }
  };

  const handleComplete = async () => {
    if (!action) return;
    setVerifying(true);
    setVerificationGaps(null);
    try {
      // Run verification first
      const verifyRes = await portalApi.post('/api/portal/project/verify');
      const summary = verifyRes.data;

      if (summary.not_verified > 0 || summary.verified_partial > 0) {
        // Fetch details to show gaps
        const statusRes = await portalApi.get('/api/portal/project/verification-status');
        const reqs = statusRes.data.requirements || [];
        const gaps = reqs
          .filter((r: any) => r.verification_status !== 'verified_complete')
          .slice(0, 3)
          .map((r: any) => `${r.requirement_key}: ${r.verification_notes || r.verification_status}`);
        setVerificationGaps(gaps);
      }

      // Complete the action regardless (verification is informational)
      setActing('completing');
      setShowGuidance(false);
      await portalApi.post('/api/portal/project/next-action/complete', { action_id: action.id });
      fetchAction();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to complete action');
    } finally {
      setActing(null);
      setVerifying(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid var(--color-primary)' }}>
        <div className="card-body py-3">
          <div className="d-flex align-items-center gap-2">
            <div className="spinner-border spinner-border-sm" style={{ color: 'var(--color-primary)' }} role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <span className="small text-muted">Determining next action...</span>
          </div>
        </div>
      </div>
    );
  }

  // Empty state — all done
  if (noAction || !action) {
    return (
      <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid var(--color-accent)' }}>
        <div className="card-body py-3 d-flex align-items-center gap-2">
          <i className="bi bi-check-circle-fill" style={{ color: 'var(--color-accent)', fontSize: '1.25rem' }}></i>
          <span className="small fw-medium">All requirements are complete. No next action needed.</span>
        </div>
      </div>
    );
  }

  const badge = ACTION_TYPE_BADGES[action.action_type] || { label: action.action_type, className: 'bg-secondary' };
  const confidencePct = Math.round(action.confidence_score * 100);
  const files = action.metadata?.files_suggested || [];
  const artifacts = action.metadata?.related_artifacts || [];
  const reqKey = action.metadata?.requirement_key;
  const isAccepted = action.status === 'accepted';

  return (
    <>
    <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid var(--color-primary)' }}>
      <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
        <div className="fw-semibold small">
          <i className="bi bi-rocket-takeoff me-2" style={{ color: 'var(--color-primary)' }}></i>
          Next Action
          {reqKey && <span className="text-muted ms-2">({reqKey})</span>}
        </div>
        <span className={`badge ${badge.className}`}>{badge.label}</span>
      </div>
      <div className="card-body py-3">
        {/* Title + Confidence */}
        <div className="d-flex justify-content-between align-items-start mb-2">
          <h6 className="fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>{action.title}</h6>
          <span className="small text-nowrap ms-3" style={{ color: confidencePct >= 80 ? 'var(--color-accent)' : 'var(--color-text-light)' }}>
            {confidencePct}% confidence
          </span>
        </div>

        {/* Confidence bar */}
        <div className="progress mb-2" style={{ height: 4 }}>
          <div
            className="progress-bar"
            style={{
              width: `${confidencePct}%`,
              backgroundColor: confidencePct >= 80 ? 'var(--color-accent)' : confidencePct >= 50 ? '#f59e0b' : 'var(--color-secondary)',
            }}
          ></div>
        </div>

        {/* Reason */}
        <p className="small text-muted mb-2">{action.reason}</p>

        {/* Suggested Files */}
        {files.length > 0 && (
          <div className="mb-2">
            <div className="small fw-medium mb-1">
              <i className="bi bi-file-code me-1"></i>Suggested Files
            </div>
            <div className="d-flex flex-wrap gap-1">
              {files.map((f, i) => (
                <code key={i} className="small px-2 py-1 rounded" style={{ background: 'var(--color-bg-alt)', fontSize: '0.75rem' }}>
                  {f}
                </code>
              ))}
            </div>
          </div>
        )}

        {/* Related Artifacts */}
        {artifacts.length > 0 && (
          <div className="mb-3">
            <div className="small fw-medium mb-1">
              <i className="bi bi-collection me-1"></i>Related Artifacts
            </div>
            <div className="d-flex flex-wrap gap-1">
              {artifacts.map((a, i) => (
                <span key={i} className="badge bg-light text-dark border">{a}</span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="d-flex gap-2">
          {!isAccepted ? (
            <button
              className="btn btn-sm btn-primary"
              onClick={handleAccept}
              disabled={!!acting}
            >
              {acting === 'accepting' ? (
                <><span className="spinner-border spinner-border-sm me-1"></span>Starting...</>
              ) : (
                <><i className="bi bi-play-fill me-1"></i>Start Work</>
              )}
            </button>
          ) : (
            <span className="badge bg-primary d-flex align-items-center py-2 px-3">
              <i className="bi bi-check me-1"></i>In Progress
            </span>
          )}
          <button
            className="btn btn-sm btn-outline-success"
            onClick={handleComplete}
            disabled={!!acting || verifying}
          >
            {verifying ? (
              <><span className="spinner-border spinner-border-sm me-1"></span>Verifying...</>
            ) : acting === 'completing' ? (
              <><span className="spinner-border spinner-border-sm me-1"></span>Completing...</>
            ) : (
              <><i className="bi bi-check-circle me-1"></i>Mark Complete</>
            )}
          </button>
        </div>

        {/* Verification gaps */}
        {verificationGaps && verificationGaps.length > 0 && (
          <div className="mt-2 p-2 rounded small" style={{ background: '#fef3c7', border: '1px solid #f59e0b' }}>
            <div className="fw-medium mb-1" style={{ color: '#92400e' }}>
              <i className="bi bi-exclamation-triangle me-1"></i>Verification found gaps:
            </div>
            <ul className="mb-0 ps-3" style={{ color: '#92400e' }}>
              {verificationGaps.map((gap, i) => <li key={i}>{gap}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
    {showGuidance && action && <GuidedExecutionPanel actionId={action.id} />}
    </>
  );
}

export default ProjectNextActionPanel;
