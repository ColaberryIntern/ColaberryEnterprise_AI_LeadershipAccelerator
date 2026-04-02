import React, { useState } from 'react';
import portalApi from '../../utils/portalApi';

interface SessionSummary {
  lastAction: string | null;
  lastActionAt: string | null;
  currentTask: string | null;
  requirementsRemaining: number;
  completionPct: number;
}

interface WorkstationLauncherProps {
  compact?: boolean;
}

export default function WorkstationLauncher({ compact = false }: WorkstationLauncherProps) {
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLaunch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalApi.get('/api/portal/project/workstation-context');
      const { prompt, repoUrl, sessionSummary } = res.data;
      setSession(sessionSummary);

      // Copy prompt to clipboard
      try { await navigator.clipboard.writeText(prompt); } catch {}
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);

      // Show toast
      const toast = document.createElement('div');
      toast.innerHTML = `
        <div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;
          background:#1a365d;color:#fff;padding:14px 24px;border-radius:10px;
          box-shadow:0 4px 20px rgba(0,0,0,0.25);font-size:14px;font-weight:500;
          display:flex;align-items:center;gap:10px;max-width:480px;
          animation:wkToastIn 0.3s ease">
          <span style="font-size:20px">🚀</span>
          <div>
            <div style="font-weight:600">Workstation prompt copied</div>
            <div style="font-size:12px;opacity:0.85;margin-top:2px">
              Paste into Claude Code to continue building. ${sessionSummary.requirementsRemaining} requirements remaining.
            </div>
          </div>
        </div>
        <style>@keyframes wkToastIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 5000);

      // Open repo if available
      if (repoUrl) {
        window.open(repoUrl, '_blank');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load workstation context');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      await portalApi.post('/api/portal/project/claude-md/push');
      const syncToast = document.createElement('div');
      syncToast.innerHTML = `
        <div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;
          background:#059669;color:#fff;padding:12px 20px;border-radius:10px;
          box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:13px;font-weight:500;
          animation:wkToastIn 0.3s ease">
          ✅ CLAUDE.md synced to repository
        </div>
        <style>@keyframes wkToastIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>
      `;
      document.body.appendChild(syncToast);
      setTimeout(() => syncToast.remove(), 3000);
    } catch {} finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <button
        className="btn btn-sm d-flex align-items-center gap-2 px-3 py-2"
        style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none',
        }}
        onClick={handleLaunch}
        disabled={loading}
      >
        {loading ? (
          <><span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14 }}></span> Loading...</>
        ) : (
          <><i className="bi bi-terminal me-1"></i> Open AI Workstation</>
        )}
      </button>
    );
  }

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body p-3">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary, #1a365d)', fontSize: 14 }}>
            <i className="bi bi-terminal me-2"></i>AI Workstation
          </h6>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, color: 'var(--color-text-light, #718096)' }}
            onClick={handleSync}
            disabled={loading}
            title="Sync CLAUDE.md to repo"
          >
            <i className="bi bi-arrow-repeat me-1"></i>Sync
          </button>
        </div>

        {session && (
          <div className="mb-3">
            <div className="d-flex justify-content-between small mb-2">
              <span className="text-muted">Progress</span>
              <span className="fw-semibold">{session.completionPct}%</span>
            </div>
            <div className="progress" style={{ height: 6 }}>
              <div className="progress-bar" style={{
                width: `${session.completionPct}%`,
                background: 'linear-gradient(90deg, #10b981, #059669)',
              }} />
            </div>
            {session.currentTask && (
              <div className="mt-2 small text-muted">
                <i className="bi bi-arrow-right-circle me-1"></i>
                {session.currentTask}
              </div>
            )}
            {session.lastAction && (
              <div className="mt-1 small" style={{ color: '#059669' }}>
                <i className="bi bi-check-circle me-1"></i>
                Last: {session.lastAction}
              </div>
            )}
          </div>
        )}

        <button
          className="btn w-100 d-flex align-items-center justify-content-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 600, border: 'none',
            padding: '10px 16px',
          }}
          onClick={handleLaunch}
          disabled={loading}
        >
          {loading ? (
            <><span className="spinner-border spinner-border-sm"></span> Preparing...</>
          ) : copied ? (
            <><i className="bi bi-check-lg"></i> Copied — Paste in Claude Code</>
          ) : (
            <><i className="bi bi-terminal"></i> Open AI Workstation</>
          )}
        </button>

        {error && (
          <div className="alert alert-warning small mt-2 mb-0 py-1 px-2">
            <i className="bi bi-exclamation-triangle me-1"></i>{error}
          </div>
        )}
      </div>
    </div>
  );
}
