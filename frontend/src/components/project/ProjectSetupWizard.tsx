/**
 * ProjectSetupWizard — Guided setup flow (Repository-First)
 *
 * Flow:
 * 1. Decision: "Do you have requirements?" → Yes/No
 * 2a. YES → Upload requirements + GitHub → Activate
 * 2b. NO → Idea Capture → GitHub → Start Architect Build → Demo Page
 */
import React, { useState, useCallback, useRef } from 'react';
import portalApi from '../../utils/portalApi';

interface SetupStatus {
  requirements_loaded: boolean;
  claude_md_loaded: boolean;
  github_connected: boolean;
  activated: boolean;
  architect_slug?: string;
  build_started_at?: string;
}

interface Props {
  initialStatus?: SetupStatus | null;
  onActivated: () => void;
}

type WizardStep = 'decision' | 'idea' | 'upload' | 'github' | 'github_for_build' | 'starting_build' | 'activating' | 'complete';

export default function ProjectSetupWizard({ initialStatus, onActivated }: Props) {
  const init = initialStatus || { requirements_loaded: false, claude_md_loaded: false, github_connected: false, activated: false };

  const getInitialStep = (): WizardStep => {
    if (init.activated) return 'complete';
    if ((init as any).architect_slug) return 'starting_build'; // Build in progress → redirect to demo
    if (init.requirements_loaded && init.github_connected) return 'activating';
    if (init.requirements_loaded) return 'github';
    return 'decision';
  };

  const [step, setStep] = useState<WizardStep>(getInitialStep());
  const [status, setStatus] = useState<SetupStatus>(init);
  const [idea, setIdea] = useState('');
  const [reqContent, setReqContent] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressBatch, setProgressBatch] = useState<{ batch: number; total: number } | null>(null);
  const [activationResult, setActivationResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileRead = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => { if (e.target?.result) setReqContent(e.target.result as string); };
    reader.readAsText(file);
  }, []);

  // Upload requirements (manual path)
  const handleUploadRequirements = async () => {
    if (!reqContent.trim()) return;
    setSaving(true); setError(null);
    try {
      await portalApi.post('/api/portal/project/setup/requirements', { content: reqContent.trim() });
      setStatus(prev => ({ ...prev, requirements_loaded: true }));
      setStep('github');
    } catch (err: any) { setError(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  // Connect GitHub (for upload path — then activate)
  const handleConnectGithub = async () => {
    if (!repoUrl.trim()) return;
    setSaving(true); setError(null);
    try {
      await portalApi.post('/api/portal/project/setup/github', { repo_url: repoUrl.trim(), access_token: accessToken.trim() || undefined });
      setStatus(prev => ({ ...prev, github_connected: true }));
      handleActivate();
    } catch (err: any) { setError(err.response?.data?.error || 'Failed to connect'); }
    finally { setSaving(false); }
  };

  // Connect GitHub + Start Architect Build (for AI path)
  const handleStartBuild = async () => {
    if (!repoUrl.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await portalApi.post('/api/portal/project/architect-build', {
        idea: idea.trim(),
        repoUrl: repoUrl.trim(),
        accessToken: accessToken.trim() || undefined,
      });
      if (res.data.slug) {
        // Redirect to demo page
        window.location.href = '/portal/project/demo';
      } else {
        setError('Build failed to start');
      }
    } catch (err: any) { setError(err.response?.data?.error || 'Failed to start build'); }
    finally { setSaving(false); }
  };

  // Activate (for upload path)
  const handleActivate = async () => {
    setStep('activating'); setError(null); setProgressMsg('Starting activation...');
    try {
      await portalApi.post('/api/portal/project/setup/activate');
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const res = await portalApi.get('/api/portal/project/setup/activation-progress');
          const p = res.data;
          if (p.status === 'complete') { clearInterval(pollInterval); setActivationResult(p); setStep('complete'); setTimeout(() => onActivated(), 1500); }
          else if (p.status === 'failed') { clearInterval(pollInterval); setError(p.error || 'Failed'); setStep('github'); }
          else { setProgressMsg(p.message || 'Processing...'); if (p.percent != null) setProgressPercent(p.percent); if (p.batch != null) setProgressBatch({ batch: p.batch, total: p.total_batches }); }
          if (pollCount > 20 && pollCount % 5 === 0) {
            try { const pr = await portalApi.get('/api/portal/project'); if (pr.data?.setup_status?.activated) { clearInterval(pollInterval); setStep('complete'); setTimeout(() => onActivated(), 500); } } catch {}
          }
        } catch {}
      }, 3000);
      setTimeout(() => { clearInterval(pollInterval); setStep('complete'); setTimeout(() => onActivated(), 500); }, 180000);
    } catch (err: any) { setError(err.response?.data?.error || 'Activation failed'); setStep('github'); }
  };

  // If build is in progress, redirect to demo
  if (step === 'starting_build' || (init as any).architect_slug) {
    window.location.href = '/portal/project/demo';
    return <div className="text-center py-5"><div className="spinner-border text-primary"></div><p className="text-muted mt-2">Redirecting to your build...</p></div>;
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div className="text-center mb-5">
        <div className="mx-auto mb-3" style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #1a365d, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-rocket-takeoff" style={{ fontSize: 28, color: '#fff' }}></i>
        </div>
        <h3 className="fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>Let's Get Your Project Started</h3>
        <p className="text-muted" style={{ fontSize: 14, maxWidth: 420, margin: '0 auto' }}>
          {step === 'decision' ? 'First, we need your project requirements to begin.'
            : step === 'idea' ? 'Tell us about your project idea.'
            : step === 'upload' ? 'Upload your requirements document.'
            : step === 'github' || step === 'github_for_build' ? 'Connect your code repository.'
            : step === 'activating' ? 'Building your project environment...'
            : 'Your project is ready!'}
        </p>
      </div>

      {/* DECISION */}
      {step === 'decision' && (
        <div className="text-center">
          <h5 className="fw-bold mb-4" style={{ fontSize: 18 }}>Do you already have a Requirements document?</h5>
          <div className="d-flex flex-column gap-3" style={{ maxWidth: 400, margin: '0 auto' }}>
            <button className="btn py-3" style={{ background: 'var(--color-primary)', color: '#fff', fontWeight: 600, fontSize: 15, borderRadius: 12, border: 'none' }}
              onClick={() => setStep('upload')}>
              <i className="bi bi-file-earmark-check me-2" style={{ fontSize: 18 }}></i>Yes, I Have One
            </button>
            <button className="btn py-3" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontWeight: 600, fontSize: 15, borderRadius: 12, border: 'none', boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)' }}
              onClick={() => setStep('idea')}>
              <i className="bi bi-lightning-charge-fill me-2" style={{ fontSize: 18 }}></i>No, Build It With AI
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>Cory will design your system in minutes</div>
            </button>
          </div>
        </div>
      )}

      {/* IDEA CAPTURE */}
      {step === 'idea' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-2" style={{ fontSize: 16 }}>What are you looking to build?</h6>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>Describe your idea in detail. The more you share, the better we can design your system.</p>
            <textarea className="form-control mb-3" rows={6} placeholder="Example: I want to build a platform that tracks website visitors, identifies high-value leads, and automatically sends personalized follow-up emails..."
              value={idea} onChange={e => setIdea(e.target.value)} style={{ fontSize: 13, borderRadius: 8, lineHeight: 1.6 }} />
            <div className="d-flex justify-content-between align-items-center">
              <button className="btn btn-outline-secondary btn-sm" style={{ borderRadius: 8 }} onClick={() => setStep('decision')}>
                <i className="bi bi-arrow-left me-1"></i>Back
              </button>
              <button className="btn btn-primary" style={{ fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '8px 20px' }}
                onClick={() => setStep('github_for_build')} disabled={idea.trim().length < 30}>
                Continue <i className="bi bi-arrow-right ms-1"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD */}
      {step === 'upload' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-3" style={{ fontSize: 16 }}><i className="bi bi-file-earmark-text me-2" style={{ color: 'var(--color-primary)' }}></i>Upload Requirements</h6>
            <div className="border rounded p-3 text-center mb-3" style={{ borderStyle: 'dashed', cursor: 'pointer', background: '#f8fafc' }}
              onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFileRead(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}>
              <i className="bi bi-cloud-upload d-block mb-1" style={{ fontSize: 24, color: '#3b82f6' }}></i>
              <span className="text-muted" style={{ fontSize: 12 }}>Drag a file here or click to browse</span>
              <input ref={fileInputRef} type="file" accept=".md,.txt,.markdown" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFileRead(e.target.files[0]); }} />
            </div>
            <textarea className="form-control mb-3" rows={6} placeholder="Or paste your requirements document here..." value={reqContent} onChange={e => setReqContent(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            {error && <div className="alert alert-danger small py-2 mb-3">{error}</div>}
            <div className="d-flex justify-content-between">
              <button className="btn btn-outline-secondary btn-sm" style={{ borderRadius: 8 }} onClick={() => setStep('decision')}><i className="bi bi-arrow-left me-1"></i>Back</button>
              <button className="btn btn-primary" style={{ borderRadius: 8, fontWeight: 600 }} onClick={handleUploadRequirements} disabled={saving || !reqContent.trim()}>
                {saving ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving...</> : <>Continue <i className="bi bi-arrow-right ms-1"></i></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GITHUB (for upload path) */}
      {step === 'github' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <div className="d-flex align-items-center gap-2 mb-1"><i className="bi bi-check-circle-fill" style={{ color: '#10b981' }}></i><span className="text-muted" style={{ fontSize: 12 }}>Requirements saved</span></div>
            <h6 className="fw-bold mb-3" style={{ fontSize: 16 }}><i className="bi bi-github me-2"></i>Connect GitHub Repository</h6>
            <input type="text" className="form-control mb-2" placeholder="https://github.com/your-org/your-repo" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} style={{ fontSize: 13 }} />
            <input type="password" className="form-control mb-3" placeholder="Access token (for private repos)" value={accessToken} onChange={e => setAccessToken(e.target.value)} style={{ fontSize: 13 }} />
            {error && <div className="alert alert-danger small py-2 mb-3">{error}</div>}
            <button className="btn w-100 py-3" style={{ background: repoUrl.trim() ? '#10b981' : '#e2e8f0', color: repoUrl.trim() ? '#fff' : '#9ca3af', fontWeight: 600, fontSize: 15, borderRadius: 12, border: 'none' }}
              onClick={handleConnectGithub} disabled={saving || !repoUrl.trim()}>
              {saving ? <><span className="spinner-border spinner-border-sm me-2"></span>Connecting...</> : <><i className="bi bi-lightning-charge me-2"></i>Connect & Activate</>}
            </button>
          </div>
        </div>
      )}

      {/* GITHUB (for AI build path — connects + starts Architect build) */}
      {step === 'github_for_build' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <div className="d-flex align-items-center gap-2 mb-1"><i className="bi bi-check-circle-fill" style={{ color: '#10b981' }}></i><span className="text-muted" style={{ fontSize: 12 }}>Idea captured</span></div>
            <h6 className="fw-bold mb-2" style={{ fontSize: 16 }}><i className="bi bi-github me-2"></i>Connect Your Repository</h6>
            <p className="text-muted mb-3" style={{ fontSize: 12 }}>We'll connect your repo and start building your AI system requirements in the background.</p>
            <input type="text" className="form-control mb-2" placeholder="https://github.com/your-org/your-repo" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} style={{ fontSize: 13 }} />
            <input type="password" className="form-control mb-3" placeholder="Access token (for private repos)" value={accessToken} onChange={e => setAccessToken(e.target.value)} style={{ fontSize: 13 }} />
            {error && <div className="alert alert-danger small py-2 mb-3">{error}</div>}
            <button className="btn w-100 py-3" style={{ background: repoUrl.trim() ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : '#e2e8f0', color: repoUrl.trim() ? '#fff' : '#9ca3af', fontWeight: 700, fontSize: 15, borderRadius: 12, border: 'none', boxShadow: repoUrl.trim() ? '0 4px 15px rgba(99, 102, 241, 0.3)' : 'none' }}
              onClick={handleStartBuild} disabled={saving || !repoUrl.trim()}>
              {saving ? <><span className="spinner-border spinner-border-sm me-2"></span>Starting Build...</> : <><i className="bi bi-rocket-takeoff me-2"></i>Start Building My System</>}
            </button>
          </div>
        </div>
      )}

      {/* ACTIVATING */}
      {step === 'activating' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body py-5 text-center">
            <div className="spinner-border text-primary mb-3" style={{ width: 48, height: 48 }}></div>
            <h5 className="fw-bold mb-1">Building Your Project</h5>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>{progressMsg}</p>
            <div className="progress mb-2" style={{ height: 10, borderRadius: 8 }}>
              <div className="progress-bar progress-bar-striped progress-bar-animated" style={{ width: `${Math.max(progressPercent, 5)}%`, background: '#10b981' }} />
            </div>
            <div className="d-flex justify-content-between text-muted" style={{ fontSize: 10 }}>
              <span>{progressBatch ? `Batch ${progressBatch.batch} of ${progressBatch.total}` : 'Initializing...'}</span>
              <span>{progressPercent}%</span>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETE */}
      {step === 'complete' && (
        <div className="card border-0 shadow-sm" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="card-body text-center py-5">
            <i className="bi bi-check-circle-fill d-block mb-3" style={{ fontSize: 48, color: '#10b981' }}></i>
            <h4 className="fw-bold mb-2" style={{ color: '#059669' }}>Project Activated!</h4>
            <p className="text-muted" style={{ fontSize: 13 }}>{activationResult?.requirements_count ? `${activationResult.requirements_count} requirements parsed` : 'Your project is ready to build'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
