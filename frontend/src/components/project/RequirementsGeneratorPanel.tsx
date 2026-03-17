import React, { useEffect, useState, useCallback } from 'react';
import portalApi from '../../utils/portalApi';

type GenerationMode = 'professional' | 'autonomous';

interface JobStatus {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  mode: string;
  artifact_submission_id: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const MODE_INFO: Record<GenerationMode, { label: string; time: string; description: string }> = {
  professional: {
    label: 'Professional',
    time: '~15 minutes',
    description: 'Focused and thorough. Covers all key systems, integrations, and data flows.',
  },
  autonomous: {
    label: 'Autonomous',
    time: '~30 minutes',
    description: 'Comprehensive deep-dive. Covers edge cases, failure modes, and scaling considerations.',
  },
};

function RequirementsGeneratorPanel({ onComplete }: { onComplete?: () => void }) {
  const [mode, setMode] = useState<GenerationMode>('professional');
  const [userPrompt, setUserPrompt] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollJob = useCallback((id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await portalApi.get(`/api/portal/project/requirements/job/${id}`);
        const status = res.data as JobStatus;
        setJobStatus(status);

        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(interval);
          if (status.status === 'completed' && onComplete) {
            onComplete();
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [onComplete]);

  useEffect(() => {
    if (jobId) {
      const cleanup = pollJob(jobId);
      return cleanup;
    }
  }, [jobId, pollJob]);

  const handleGenerate = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await portalApi.post('/api/portal/project/requirements/generate', {
        mode,
        user_prompt: userPrompt || undefined,
      });
      setJobId(res.data.job_id);
      setJobStatus({ id: res.data.job_id, status: 'queued', mode, artifact_submission_id: null, error_message: null, created_at: new Date().toISOString(), completed_at: null });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start generation');
    } finally {
      setStarting(false);
    }
  };

  // Job in progress or completed
  if (jobStatus) {
    return (
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span><i className="bi bi-file-earmark-code me-2"></i>Requirements Document Generation</span>
          <span className="badge" style={{
            background: jobStatus.status === 'completed' ? 'var(--color-accent)' :
              jobStatus.status === 'failed' ? 'var(--color-secondary)' : 'var(--color-primary)',
          }}>
            {jobStatus.status === 'queued' ? 'Queued' :
              jobStatus.status === 'running' ? 'Generating...' :
                jobStatus.status === 'completed' ? 'Complete' : 'Failed'}
          </span>
        </div>
        <div className="card-body">
          {(jobStatus.status === 'queued' || jobStatus.status === 'running') && (
            <div className="text-center py-4">
              <div className="spinner-border mb-3" style={{ color: 'var(--color-primary)', width: '2.5rem', height: '2.5rem' }} role="status">
                <span className="visually-hidden">Generating...</span>
              </div>
              <p className="fw-semibold mb-1" style={{ color: 'var(--color-primary)' }}>
                Generating System Requirements Document
              </p>
              <p className="small text-muted mb-2">
                Mode: {MODE_INFO[jobStatus.mode as GenerationMode]?.label || jobStatus.mode} ({MODE_INFO[jobStatus.mode as GenerationMode]?.time || 'estimated time'})
              </p>
              <p className="small text-muted mb-0">
                This runs in the background. You can navigate away and check back later.
              </p>
            </div>
          )}

          {jobStatus.status === 'completed' && (
            <div className="text-center py-3">
              <i className="bi bi-check-circle-fill fs-1 d-block mb-2" style={{ color: 'var(--color-accent)' }}></i>
              <p className="fw-semibold mb-1" style={{ color: 'var(--color-accent)' }}>
                Document Generated Successfully
              </p>
              <p className="small text-muted mb-3">
                Your System Requirements Specification has been saved as a project artifact.
              </p>
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={() => { setJobStatus(null); setJobId(null); }}
              >
                Generate Another Version
              </button>
            </div>
          )}

          {jobStatus.status === 'failed' && (
            <div className="text-center py-3">
              <i className="bi bi-exclamation-triangle-fill fs-1 d-block mb-2" style={{ color: 'var(--color-secondary)' }}></i>
              <p className="fw-semibold mb-1" style={{ color: 'var(--color-secondary)' }}>
                Generation Failed
              </p>
              <p className="small text-muted mb-3">
                {jobStatus.error_message || 'An unexpected error occurred.'}
              </p>
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={() => { setJobStatus(null); setJobId(null); setError(null); }}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Initial generation form
  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold">
        <i className="bi bi-file-earmark-code me-2"></i>Generate Requirements Document
      </div>
      <div className="card-body">
        <p className="small text-muted mb-3">
          Generate a comprehensive AI system requirements document based on your project data and artifacts.
          The document will be saved as a project artifact with full versioning support.
        </p>

        {error && (
          <div className="alert alert-danger py-2 small mb-3">{error}</div>
        )}

        {/* Mode selection */}
        <div className="mb-3">
          <label className="form-label small fw-medium">Generation Mode</label>
          <div className="d-flex gap-2">
            {(Object.keys(MODE_INFO) as GenerationMode[]).map(m => (
              <button
                key={m}
                className={`btn btn-sm flex-fill ${mode === m ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setMode(m)}
              >
                <div className="fw-semibold">{MODE_INFO[m].label}</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>{MODE_INFO[m].time}</div>
              </button>
            ))}
          </div>
          <div className="small text-muted mt-1">{MODE_INFO[mode].description}</div>
        </div>

        {/* Optional custom prompt */}
        <div className="mb-3">
          <label className="form-label small fw-medium">Custom Instructions (Optional)</label>
          <textarea
            className="form-control form-control-sm"
            rows={3}
            placeholder="Add specific requirements or focus areas for the document..."
            value={userPrompt}
            onChange={e => setUserPrompt(e.target.value)}
          />
        </div>

        <button
          className="btn btn-sm btn-primary w-100"
          onClick={handleGenerate}
          disabled={starting}
        >
          {starting ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status"></span>
              Starting Generation...
            </>
          ) : (
            <>
              <i className="bi bi-play-fill me-1"></i>
              Generate Requirements Document
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default RequirementsGeneratorPanel;
