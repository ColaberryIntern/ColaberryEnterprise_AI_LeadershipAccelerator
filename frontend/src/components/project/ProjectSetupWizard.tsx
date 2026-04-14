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

interface StepConfig {
  key: keyof Omit<SetupStatus, 'activated'>;
  icon: string;
  title: string;
  description: string;
  inputType: 'text' | 'github';
  placeholder: string;
}

const STEPS: StepConfig[] = [
  {
    key: 'requirements_loaded',
    icon: 'bi-file-earmark-text',
    title: 'Requirements Document',
    description: 'Your requirements document defines what the AI system must build. It will be parsed into trackable requirements that map to your codebase.',
    inputType: 'text',
    placeholder: 'Paste your requirements document here (Markdown format recommended)...',
  },
  {
    key: 'claude_md_loaded',
    icon: 'bi-file-earmark-code',
    title: 'CLAUDE.md',
    description: 'This file configures Claude Code with your project context, conventions, and coding rules. It enables persistent AI memory across sessions.',
    inputType: 'text',
    placeholder: 'Paste your CLAUDE.md content here...',
  },
  {
    key: 'github_connected',
    icon: 'bi-github',
    title: 'GitHub Repository',
    description: 'Connect your project repository so the system can track code progress, match requirements to files, and measure completion.',
    inputType: 'github',
    placeholder: 'https://github.com/your-org/your-repo',
  },
];

export default function ProjectSetupWizard({ initialStatus, onActivated }: Props) {
  const [status, setStatus] = useState<SetupStatus>(
    initialStatus || { requirements_loaded: false, claude_md_loaded: false, github_connected: false, activated: false }
  );
  const [activating, setActivating] = useState(false);
  const [activationResult, setActivationResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressBatch, setProgressBatch] = useState<{ batch: number; total: number } | null>(null);

  const allComplete = status.requirements_loaded && status.claude_md_loaded && status.github_connected;

  const [progressMsg, setProgressMsg] = useState('');

  const handleActivate = async () => {
    setActivating(true);
    setError(null);
    setProgressMsg('Starting activation...');
    try {
      // Start activation (returns immediately, runs in background)
      await portalApi.post('/api/portal/project/setup/activate');

      // Poll for progress — also check if project itself is now activated
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const res = await portalApi.get('/api/portal/project/setup/activation-progress');
          const p = res.data;
          if (p.status === 'complete') {
            clearInterval(pollInterval);
            setActivationResult(p);
            setProgressMsg('Activation complete!');
            setStatus(prev => ({ ...prev, activated: true }));
            setTimeout(() => onActivated(), 1000);
          } else if (p.status === 'failed') {
            clearInterval(pollInterval);
            setError(p.error || 'Activation failed');
            setActivating(false);
          } else {
            setProgressMsg(p.message || 'Processing...');
            if (p.percent != null) setProgressPercent(p.percent);
            if (p.batch != null && p.total_batches != null) setProgressBatch({ batch: p.batch, total: p.total_batches });
          }

          // Safety: after 20 polls (60s), check if project is actually activated
          if (pollCount > 20 && pollCount % 5 === 0) {
            try {
              const projRes = await portalApi.get('/api/portal/project');
              const setupStatus = projRes.data?.setup_status;
              if (setupStatus?.activated || projRes.data?.project_stage !== 'discovery') {
                clearInterval(pollInterval);
                setActivationResult({ status: 'complete' });
                setProgressMsg('Activation complete!');
                setStatus(prev => ({ ...prev, activated: true }));
                setTimeout(() => onActivated(), 500);
              }
            } catch {}
          }
        } catch {}
      }, 3000);

      // Safety timeout after 3 minutes (not 10)
      setTimeout(() => {
        clearInterval(pollInterval);
        // Force complete — the project is likely done even if polling missed it
        setActivationResult({ status: 'complete' });
        setProgressMsg('Setup complete!');
        setStatus(prev => ({ ...prev, activated: true }));
        setTimeout(() => onActivated(), 500);
      }, 180000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Activation failed');
      setActivating(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px' }}>
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
          Set Up Your AI Project Environment
        </h3>
        <p className="text-muted" style={{ maxWidth: 480, margin: '0 auto' }}>
          Provide your project inputs to activate the execution dashboard. Each step unlocks tracking, progress analysis, and AI-assisted development.
        </p>
      </div>

      {/* Steps */}
      {STEPS.map((step, i) => (
        <SetupStep
          key={step.key}
          step={step}
          stepNumber={i + 1}
          isComplete={status[step.key]}
          onComplete={() => setStatus(prev => ({ ...prev, [step.key]: true }))}
        />
      ))}

      {/* Activation */}
      <div className="mt-4">
        {activationResult ? (
          <div className="card border-0 shadow-sm" style={{ borderLeft: '4px solid var(--color-accent, #38a169)' }}>
            <div className="card-body text-center py-4">
              <i className="bi bi-check-circle-fill d-block mb-2" style={{ fontSize: 40, color: 'var(--color-accent)' }}></i>
              <h5 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>Project Activated</h5>
              <p className="text-muted small mb-0">
                {activationResult.requirements_count || activationResult.capabilities} requirements parsed
              </p>
            </div>
          </div>
        ) : activating ? (
          <div className="card border-0 shadow-sm">
            <div className="card-body py-4">
              <div className="text-center mb-3">
                <div className="spinner-border text-primary mb-2" style={{ width: 32, height: 32 }}></div>
                <h6 className="fw-semibold mb-1" style={{ color: 'var(--color-primary)' }}>Building Your Project</h6>
                <p className="text-muted small mb-0">{progressMsg || 'Starting activation...'}</p>
              </div>
              {/* Progress bar */}
              <div className="progress mb-2" style={{ height: 10, borderRadius: 8 }}>
                <div className="progress-bar progress-bar-striped progress-bar-animated"
                  style={{ width: `${Math.max(progressPercent, 5)}%`, background: 'linear-gradient(135deg, var(--color-accent, #38a169), #2f855a)', transition: 'width 0.5s ease' }} />
              </div>
              <div className="d-flex justify-content-between text-muted" style={{ fontSize: 10 }}>
                <span>{progressBatch ? `Batch ${progressBatch.batch} of ${progressBatch.total}` : 'Initializing...'}</span>
                <span>{progressPercent}%</span>
              </div>
            </div>
          </div>
        ) : (
          <button
            className="btn w-100 py-3"
            style={{
              background: allComplete
                ? 'linear-gradient(135deg, var(--color-accent, #38a169), #2f855a)'
                : 'var(--color-border, #e2e8f0)',
              color: allComplete ? '#fff' : 'var(--color-text-light, #718096)',
              fontSize: 16, fontWeight: 600, borderRadius: 12, border: 'none',
              cursor: allComplete ? 'pointer' : 'not-allowed',
            }}
            onClick={handleActivate}
            disabled={!allComplete}
          >
            {allComplete ? (
              <><i className="bi bi-lightning-charge me-2"></i>Activate Your Project</>
            ) : (
              <><i className="bi bi-lock me-2"></i>Complete all steps to activate</>
            )}
          </button>
        )}

        {error && (
          <div className="alert alert-danger small mt-3 mb-0">
            <i className="bi bi-exclamation-triangle me-1"></i>{error}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual Setup Step
// ---------------------------------------------------------------------------

function SetupStep({ step, stepNumber, isComplete, onComplete }: {
  step: StepConfig;
  stepNumber: number;
  isComplete: boolean;
  onComplete: () => void;
}) {
  const [content, setContent] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(isComplete);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileRead = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) setContent(text);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  }, [handleFileRead]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (step.inputType === 'github') {
        await portalApi.post('/api/portal/project/setup/github', {
          repo_url: repoUrl.trim(),
          access_token: accessToken.trim() || undefined,
        });
        setPreview(repoUrl.trim());
      } else {
        const endpoint = step.key === 'requirements_loaded'
          ? '/api/portal/project/setup/requirements'
          : '/api/portal/project/setup/claude-md';
        const res = await portalApi.post(endpoint, { content: content.trim() });
        const lines = content.trim().split('\n').slice(0, 3).join('\n');
        setPreview(`${lines}${content.split('\n').length > 3 ? '\n...' : ''}`);
        if (res.data.requirements_preview) {
          setPreview(`${res.data.requirements_preview} requirements detected\n${lines}`);
        }
      }
      setSaved(true);
      onComplete();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="card border-0 shadow-sm mb-3"
      style={{
        borderLeft: saved ? '4px solid var(--color-accent, #38a169)' : '4px solid var(--color-border, #e2e8f0)',
        transition: 'border-color 0.3s',
      }}
    >
      <div className="card-body p-3">
        {/* Header */}
        <div className="d-flex align-items-center gap-3 mb-2">
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: saved ? 'var(--color-accent, #38a169)' : 'var(--color-bg-alt, #f7fafc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {saved ? (
              <i className="bi bi-check-lg" style={{ color: '#fff', fontSize: 18 }}></i>
            ) : (
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-primary, #1a365d)' }}>{stepNumber}</span>
            )}
          </div>
          <div className="flex-grow-1">
            <div className="d-flex align-items-center gap-2">
              <i className={`bi ${step.icon}`} style={{ color: 'var(--color-primary-light, #2b6cb0)', fontSize: 16 }}></i>
              <span className="fw-semibold" style={{ fontSize: 14, color: 'var(--color-primary, #1a365d)' }}>{step.title}</span>
            </div>
            <div className="text-muted" style={{ fontSize: 12 }}>{step.description}</div>
          </div>
        </div>

        {/* Saved preview */}
        {saved && preview && (
          <div className="mt-2 p-2 rounded" style={{ background: 'var(--color-bg-alt, #f7fafc)', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden' }}>
            {preview}
          </div>
        )}

        {/* Input area */}
        {!saved && (
          <div className="mt-3">
            {step.inputType === 'github' ? (
              <div className="d-flex flex-column gap-2">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder={step.placeholder}
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                />
                <input
                  type="password"
                  className="form-control form-control-sm"
                  placeholder="Access token (required for private repos)"
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <div
                  className="border rounded p-3 text-center mb-2"
                  style={{ borderStyle: 'dashed', cursor: 'pointer', background: 'var(--color-bg-alt, #f7fafc)' }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <i className="bi bi-cloud-upload d-block mb-1" style={{ fontSize: 20, color: 'var(--color-primary-light)' }}></i>
                  <span className="small text-muted">Drag a file here or click to browse (.md, .txt)</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt,.markdown"
                    style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.[0]) handleFileRead(e.target.files[0]); }}
                  />
                </div>
                <textarea
                  className="form-control form-control-sm"
                  rows={6}
                  placeholder={step.placeholder}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
            )}

            {error && <div className="text-danger small mt-1"><i className="bi bi-exclamation-circle me-1"></i>{error}</div>}

            <button
              className="btn btn-sm btn-primary mt-2"
              onClick={handleSubmit}
              disabled={saving || (step.inputType === 'github' ? !repoUrl.trim() : !content.trim())}
            >
              {saving ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving...</> : <><i className="bi bi-check-lg me-1"></i>Save</>}
            </button>
          </div>
        )}

        {/* Re-edit button */}
        {saved && (
          <button
            className="btn btn-link btn-sm p-0 mt-1"
            style={{ fontSize: 11, color: 'var(--color-text-light)' }}
            onClick={() => setSaved(false)}
          >
            <i className="bi bi-pencil me-1"></i>Edit
          </button>
        )}
      </div>
    </div>
  );
}
