/**
 * ProjectSetupWizard — Guided setup flow
 *
 * Flow:
 * 1. Decision: "Do you have requirements?" → Yes/No
 * 2a. YES → Upload requirements + GitHub repo → Activate
 * 2b. NO → Redirect to /portal/project/requirements-builder
 * 3. After requirements saved → GitHub step → Activate
 *
 * CLAUDE.md is hidden from user (backend still supports it).
 */
import React, { useState, useCallback, useRef } from 'react';
import portalApi from '../../utils/portalApi';

interface SetupStatus {
  requirements_loaded: boolean;
  claude_md_loaded: boolean;
  github_connected: boolean;
  activated: boolean;
}

interface Props {
  initialStatus?: SetupStatus | null;
  onActivated: () => void;
}

type WizardStep = 'decision' | 'upload' | 'github' | 'activating' | 'complete';

export default function ProjectSetupWizard({ initialStatus, onActivated }: Props) {
  const init = initialStatus || { requirements_loaded: false, claude_md_loaded: false, github_connected: false, activated: false };

  // Determine starting step based on existing status
  const getInitialStep = (): WizardStep => {
    if (init.activated) return 'complete';
    if (init.requirements_loaded && init.github_connected) return 'activating';
    if (init.requirements_loaded) return 'github';
    return 'decision';
  };

  const [step, setStep] = useState<WizardStep>(getInitialStep());
  const [status, setStatus] = useState<SetupStatus>(init);

  // Upload state
  const [reqContent, setReqContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // GitHub state
  const [repoUrl, setRepoUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [githubSaving, setGithubSaving] = useState(false);

  // Activation state
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMsg, setProgressMsg] = useState('Starting activation...');
  const [progressBatch, setProgressBatch] = useState<{ batch: number; total: number } | null>(null);
  const [activationResult, setActivationResult] = useState<any>(null);

  const handleFileRead = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => { const text = e.target?.result as string; if (text) setReqContent(text); };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  }, [handleFileRead]);

  // Save requirements
  const handleUploadRequirements = async () => {
    if (!reqContent.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await portalApi.post('/api/portal/project/setup/requirements', { content: reqContent.trim() });
      setStatus(prev => ({ ...prev, requirements_loaded: true }));
      setStep('github');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save requirements');
    } finally { setSaving(false); }
  };

  // Save GitHub
  const handleConnectGithub = async () => {
    if (!repoUrl.trim()) return;
    setGithubSaving(true);
    setError(null);
    try {
      await portalApi.post('/api/portal/project/setup/github', {
        repo_url: repoUrl.trim(),
        access_token: accessToken.trim() || undefined,
      });
      setStatus(prev => ({ ...prev, github_connected: true }));
      // Auto-activate after GitHub connected
      handleActivate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to connect repository');
    } finally { setGithubSaving(false); }
  };

  // Activate project
  const handleActivate = async () => {
    setStep('activating');
    setError(null);
    setProgressMsg('Starting activation...');
    try {
      await portalApi.post('/api/portal/project/setup/activate');
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const res = await portalApi.get('/api/portal/project/setup/activation-progress');
          const p = res.data;
          if (p.status === 'complete') {
            clearInterval(pollInterval);
            setActivationResult(p);
            setStep('complete');
            setTimeout(() => onActivated(), 1500);
          } else if (p.status === 'failed') {
            clearInterval(pollInterval);
            setError(p.error || 'Activation failed');
            setStep('github');
          } else {
            setProgressMsg(p.message || 'Processing...');
            if (p.percent != null) setProgressPercent(p.percent);
            if (p.batch != null && p.total_batches != null) setProgressBatch({ batch: p.batch, total: p.total_batches });
          }
          if (pollCount > 20 && pollCount % 5 === 0) {
            try {
              const projRes = await portalApi.get('/api/portal/project');
              if (projRes.data?.setup_status?.activated || projRes.data?.project_stage !== 'discovery') {
                clearInterval(pollInterval);
                setActivationResult({ status: 'complete' });
                setStep('complete');
                setTimeout(() => onActivated(), 500);
              }
            } catch {}
          }
        } catch {}
      }, 3000);
      setTimeout(() => { clearInterval(pollInterval); setActivationResult({ status: 'complete' }); setStep('complete'); setTimeout(() => onActivated(), 500); }, 180000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Activation failed');
      setStep('github');
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div className="text-center mb-5">
        <div className="mx-auto mb-3" style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--color-primary, #1a365d), var(--color-primary-light, #2b6cb0))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className="bi bi-rocket-takeoff" style={{ fontSize: 28, color: '#fff' }}></i>
        </div>
        <h3 className="fw-bold mb-2" style={{ color: 'var(--color-primary, #1a365d)' }}>
          Let's Get Your Project Started
        </h3>
        <p className="text-muted" style={{ maxWidth: 420, margin: '0 auto', fontSize: 14 }}>
          {step === 'decision' ? 'First, we need your project requirements to begin.'
            : step === 'upload' ? 'Upload your requirements document to continue.'
            : step === 'github' ? 'Connect your code repository so we can track progress.'
            : step === 'activating' ? 'Building your project environment...'
            : 'Your project is ready!'}
        </p>
      </div>

      {/* Progress indicator */}
      {step !== 'decision' && (
        <div className="d-flex justify-content-center gap-2 mb-4">
          {['Requirements', 'Repository', 'Activate'].map((label, i) => {
            const stepIdx = step === 'upload' ? 0 : step === 'github' ? 1 : 2;
            const isActive = i === stepIdx;
            const isDone = i < stepIdx || step === 'complete';
            return (
              <div key={label} className="d-flex align-items-center gap-1">
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 600,
                  background: isDone ? '#10b981' : isActive ? 'var(--color-primary)' : '#e2e8f0',
                  color: isDone || isActive ? '#fff' : '#9ca3af',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isDone ? <i className="bi bi-check"></i> : i + 1}
                </div>
                <span style={{ fontSize: 11, color: isActive ? 'var(--color-primary)' : '#9ca3af', fontWeight: isActive ? 600 : 400 }}>{label}</span>
                {i < 2 && <div style={{ width: 30, height: 2, background: isDone ? '#10b981' : '#e2e8f0', margin: '0 4px' }}></div>}
              </div>
            );
          })}
        </div>
      )}

      {/* STEP: Decision */}
      {step === 'decision' && (
        <div className="text-center">
          <h5 className="fw-bold mb-4" style={{ color: 'var(--color-text)', fontSize: 18 }}>
            Do you already have a Requirements document?
          </h5>
          <div className="d-flex flex-column gap-3" style={{ maxWidth: 400, margin: '0 auto' }}>
            <button
              className="btn py-3"
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                borderRadius: 12,
                border: 'none',
              }}
              onClick={() => setStep('upload')}
            >
              <i className="bi bi-file-earmark-check me-2" style={{ fontSize: 18 }}></i>
              Yes, I Have One
            </button>
            <button
              className="btn py-3"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                borderRadius: 12,
                border: 'none',
                boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)',
              }}
              onClick={() => { window.location.href = '/portal/project/requirements-builder'; }}
            >
              <i className="bi bi-lightning-charge-fill me-2" style={{ fontSize: 18 }}></i>
              No, Build It With AI
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>
                Cory will design your requirements in minutes
              </div>
            </button>
          </div>
        </div>
      )}

      {/* STEP: Upload */}
      {step === 'upload' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-file-earmark-text" style={{ color: 'var(--color-primary)', fontSize: 18 }}></i>
              <h5 className="fw-bold mb-0" style={{ fontSize: 16, color: 'var(--color-primary)' }}>Upload Requirements Document</h5>
            </div>
            <div
              className="border rounded p-3 text-center mb-3"
              style={{ borderStyle: 'dashed', cursor: 'pointer', background: 'var(--color-bg-alt, #f7fafc)' }}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <i className="bi bi-cloud-upload d-block mb-1" style={{ fontSize: 24, color: 'var(--color-primary-light)' }}></i>
              <span className="text-muted" style={{ fontSize: 12 }}>Drag a file here or click to browse (.md, .txt)</span>
              <input ref={fileInputRef} type="file" accept=".md,.txt,.markdown" style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) handleFileRead(e.target.files[0]); }} />
            </div>
            <textarea
              className="form-control mb-3"
              rows={8}
              placeholder="Or paste your requirements document here (Markdown format recommended)..."
              value={reqContent}
              onChange={e => setReqContent(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            {error && <div className="alert alert-danger small py-2 mb-3"><i className="bi bi-exclamation-triangle me-1"></i>{error}</div>}
            <div className="d-flex justify-content-between">
              <button className="btn btn-outline-secondary" style={{ borderRadius: 8 }} onClick={() => setStep('decision')}>
                <i className="bi bi-arrow-left me-1"></i>Back
              </button>
              <button
                className="btn btn-primary"
                style={{ borderRadius: 8, fontWeight: 600 }}
                onClick={handleUploadRequirements}
                disabled={saving || !reqContent.trim()}
              >
                {saving ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving...</> : <><i className="bi bi-arrow-right me-1"></i>Continue</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP: GitHub */}
      {step === 'github' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <div className="d-flex align-items-center gap-2 mb-1">
              <i className="bi bi-check-circle-fill" style={{ color: '#10b981', fontSize: 16 }}></i>
              <span className="text-muted" style={{ fontSize: 12 }}>Requirements saved</span>
            </div>
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-github" style={{ color: 'var(--color-primary)', fontSize: 18 }}></i>
              <h5 className="fw-bold mb-0" style={{ fontSize: 16, color: 'var(--color-primary)' }}>Connect GitHub Repository</h5>
            </div>
            <p className="text-muted mb-3" style={{ fontSize: 12 }}>
              Connect your project repository so the system can track code progress, match requirements to files, and measure completion.
            </p>
            <input
              type="text"
              className="form-control mb-2"
              placeholder="https://github.com/your-org/your-repo"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              style={{ fontSize: 13 }}
            />
            <input
              type="password"
              className="form-control mb-3"
              placeholder="Access token (required for private repos)"
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              style={{ fontSize: 13 }}
            />
            {error && <div className="alert alert-danger small py-2 mb-3"><i className="bi bi-exclamation-triangle me-1"></i>{error}</div>}
            <button
              className="btn w-100 py-3"
              style={{
                background: repoUrl.trim() ? 'linear-gradient(135deg, #10b981, #059669)' : '#e2e8f0',
                color: repoUrl.trim() ? '#fff' : '#9ca3af',
                fontWeight: 600,
                fontSize: 15,
                borderRadius: 12,
                border: 'none',
                cursor: repoUrl.trim() ? 'pointer' : 'not-allowed',
              }}
              onClick={handleConnectGithub}
              disabled={githubSaving || !repoUrl.trim()}
            >
              {githubSaving ? (
                <><span className="spinner-border spinner-border-sm me-2"></span>Connecting...</>
              ) : (
                <><i className="bi bi-lightning-charge me-2"></i>Connect & Activate Project</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP: Activating */}
      {step === 'activating' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body py-5">
            <div className="text-center mb-4">
              <div className="spinner-border text-primary mb-3" style={{ width: 48, height: 48 }}></div>
              <h5 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>Building Your Project</h5>
              <p className="text-muted mb-0" style={{ fontSize: 13 }}>{progressMsg}</p>
            </div>
            <div className="progress mb-2" style={{ height: 10, borderRadius: 8 }}>
              <div className="progress-bar progress-bar-striped progress-bar-animated"
                style={{ width: `${Math.max(progressPercent, 5)}%`, background: 'linear-gradient(135deg, #10b981, #059669)', transition: 'width 0.5s ease' }} />
            </div>
            <div className="d-flex justify-content-between text-muted" style={{ fontSize: 10 }}>
              <span>{progressBatch ? `Batch ${progressBatch.batch} of ${progressBatch.total}` : 'Initializing...'}</span>
              <span>{progressPercent}%</span>
            </div>
          </div>
        </div>
      )}

      {/* STEP: Complete */}
      {step === 'complete' && (
        <div className="card border-0 shadow-sm" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="card-body text-center py-5">
            <i className="bi bi-check-circle-fill d-block mb-3" style={{ fontSize: 48, color: '#10b981' }}></i>
            <h4 className="fw-bold mb-2" style={{ color: '#059669' }}>Project Activated!</h4>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>
              {activationResult?.requirements_count ? `${activationResult.requirements_count} requirements parsed` : 'Your project is ready to build'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
