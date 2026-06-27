/**
 * ProjectSetupWizard — Guided setup flow (Repository-First)
 *
 * AI Build Flow:
 * 1. Decision: "Do you have requirements?" → Yes/No
 * 2. Idea Capture: "What are you building?"
 * 3. 10 Questions: AI-generated expansion questions to refine idea
 * 4. GitHub: Connect repo (required before build)
 * 5. Start Build → Redirect to Demo Page
 *
 * Upload Flow:
 * 1. Decision → Upload → GitHub → Activate
 */
import React, { useState, useCallback, useRef } from 'react';
import portalApi from '../../utils/portalApi';
import { PROJECT_MODES, ProjectMode } from './ProjectModeSelector';

interface SetupStatus {
  requirements_loaded: boolean;
  claude_md_loaded: boolean;
  github_connected: boolean;
  activated: boolean;
  architect_slug?: string;
}

interface Props {
  initialStatus?: SetupStatus | null;
  onActivated: () => void;
}

interface QuestionOption {
  letter: string;
  label: string;
  description: string;
}

interface Question {
  phase: string;
  category: string;
  text: string;
  options: QuestionOption[];
  selected: string | null;   // option letter (A/B/C) or null
  note?: string;             // optional follow-up clarification
}

type WizardStep = 'decision' | 'idea' | 'loading_questions' | 'questions' | 'upload' | 'github' | 'github_for_build' | 'starting_build' | 'activating' | 'complete' | 'brownfield_connect' | 'brownfield_discovering' | 'brownfield_review';

interface BrownfieldDiscoveryResult {
  capabilitiesCreated: number;
  capabilities: Array<{
    id: string;
    name: string;
    description: string;
    file_count: number;
    layers: { backend: number; frontend: number; agents: number; models: number };
  }>;
  totalFilesAnalyzed: number;
  detectedStack: string[];
}

export default function ProjectSetupWizard({ initialStatus, onActivated }: Props) {
  const init = initialStatus || { requirements_loaded: false, claude_md_loaded: false, github_connected: false, activated: false };

  const getInitialStep = (): WizardStep => {
    if (init.activated) return 'complete';
    if ((init as any).architect_slug) return 'starting_build';
    if (init.requirements_loaded && init.github_connected) return 'activating';
    if (init.requirements_loaded) return 'github';
    return 'decision';
  };

  const [step, setStep] = useState<WizardStep>(getInitialStep());
  const [status, setStatus] = useState<SetupStatus>(init);
  const [idea, setIdea] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [noteText, setNoteText] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [reqContent, setReqContent] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressBatch, setProgressBatch] = useState<{ batch: number; total: number } | null>(null);
  const [activationResult, setActivationResult] = useState<any>(null);
  // Target tier — sets what "100% complete" will mean across the project.
  // Default Production: backend + frontend + models, 90% coverage. Higher
  // tiers (Enterprise, Autonomous) add layers and don't gate the lower ones —
  // those become enhancement suggestions after 100%.
  const [targetMode, setTargetMode] = useState<ProjectMode>('production');
  const [brownfieldResult, setBrownfieldResult] = useState<BrownfieldDiscoveryResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist the chosen target_mode before kicking off activation/build so
  // enrichCapability uses the right thresholds from the very first BP read.
  const persistTargetMode = async () => {
    try {
      await portalApi.put('/api/portal/project/target-mode', { mode: targetMode, cascade: true });
    } catch { /* non-blocking — model default is already 'production' */ }
  };

  const handleFileRead = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => { if (e.target?.result) setReqContent(e.target.result as string); };
    reader.readAsText(file);
  }, []);

  // Normalize the AI System Discovery Framework response from the
  // backend. Each question has 3 multiple-choice options (A/B/C)
  // representing baseline → intermediate → advanced sophistication
  // for one of the 9 framework dimensions.
  const normalizeQuestions = (raw: any[]): Question[] => raw
    .filter((q: any) => q && q.text && Array.isArray(q.options) && q.options.length >= 3)
    .map((q: any) => ({
      phase: String(q.phase || ''),
      category: String(q.category || ''),
      text: String(q.text || ''),
      options: q.options.slice(0, 3).map((o: any, i: number) => ({
        letter: String(o.letter || ['A', 'B', 'C'][i]),
        label: String(o.label || ''),
        description: String(o.description || ''),
      })),
      selected: null,
    }));

  const handleIdeaSubmit = async () => {
    if (idea.trim().length < 30) return;
    setStep('loading_questions');
    setError(null);
    try {
      const res = await portalApi.post('/api/portal/project/requirements/expand-questions', { idea: idea.trim() });
      const normalized = normalizeQuestions(res.data.questions || []);
      if (normalized.length < 3) throw new Error('Not enough questions');
      setQuestions(normalized);
      setCurrentQ(0);
      setShowNote(false);
      setNoteText('');
      setStep('questions');
    } catch {
      try {
        const res2 = await portalApi.post('/api/portal/project/requirements/expand-questions', { idea: idea.trim() });
        const normalized = normalizeQuestions(res2.data.questions || []);
        if (normalized.length >= 3) { setQuestions(normalized); setCurrentQ(0); setShowNote(false); setNoteText(''); setStep('questions'); return; }
      } catch {}
      setError('Could not generate questions. Please try again.');
      setStep('idea');
    }
  };

  const handleSelect = (letter: string) => {
    const updated = [...questions];
    updated[currentQ] = { ...updated[currentQ], selected: letter };
    setQuestions(updated);
    setShowNote(false);
    setNoteText(updated[currentQ].note || '');
    if (currentQ < questions.length - 1) setCurrentQ(currentQ + 1);
  };

  const handleNoteSave = () => {
    const updated = [...questions];
    updated[currentQ] = { ...updated[currentQ], note: noteText.trim() || undefined };
    setQuestions(updated);
    setShowNote(false);
  };

  const answeredCount = questions.filter(q => q.selected !== null).length;
  // Capabilities flagged as B or C count toward the "selected sophistication"
  // pill row. A is baseline and isn't surfaced as a selected capability.
  const selectedCount = questions.filter(q => q.selected === 'B' || q.selected === 'C').length;

  // Build the refined idea from selected options. Pass the selected
  // option's label + description per phase so the downstream
  // requirements generator has the user's chosen sophistication levels.
  const buildRefinedIdea = (): string => {
    const lines = questions.filter(q => q.selected).map(q => {
      const opt = q.options.find(o => o.letter === q.selected);
      const note = q.note ? ` (note: ${q.note})` : '';
      return `- [${q.category}] ${opt?.letter}. ${opt?.label} — ${opt?.description}${note}`;
    }).join('\n');
    return `${idea.trim()}\n\nSelected Sophistication Levels (AI System Discovery Framework):\n${lines}`;
  };

  // Upload requirements + connect GitHub in one step, then activate.
  // Both fields are collected on the same screen so the user provides
  // their requirements doc and repo together when they choose
  // "I already have a Requirements document".
  const handleUploadRequirements = async () => {
    if (!reqContent.trim() || !repoUrl.trim()) return;
    setSaving(true); setError(null);
    try {
      await portalApi.post('/api/portal/project/setup/requirements', { content: reqContent.trim() });
      setStatus(prev => ({ ...prev, requirements_loaded: true }));
      await portalApi.post('/api/portal/project/setup/github', { repo_url: repoUrl.trim(), access_token: accessToken.trim() || undefined });
      setStatus(prev => ({ ...prev, github_connected: true }));
      handleActivate();
    } catch (err: any) { setError(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  // Brownfield: connect repo + run discovery in one shot.
  const handleBrownfieldDiscover = async () => {
    if (!repoUrl.trim()) return;
    setStep('brownfield_discovering'); setError(null);
    try {
      await persistTargetMode();
      const res = await portalApi.post('/api/portal/project/setup/brownfield-discover', {
        repo_url: repoUrl.trim(),
        access_token: accessToken.trim() || undefined,
      });
      setBrownfieldResult(res.data);
      setStep('brownfield_review');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Discovery failed');
      setStep('brownfield_connect');
    }
  };

  // Connect GitHub (legacy path — used when requirements were already
  // saved in a prior session and only the repo is missing).
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

  // Connect GitHub + Start Architect Build (AI path)
  const handleStartBuild = async () => {
    if (!repoUrl.trim()) return;
    setSaving(true); setError(null);
    try {
      await persistTargetMode();
      const refinedIdea = buildRefinedIdea();
      const res = await portalApi.post('/api/portal/project/architect-build', {
        idea: refinedIdea,
        repoUrl: repoUrl.trim(),
        accessToken: accessToken.trim() || undefined,
      });
      if (res.data.slug) {
        window.location.href = '/portal/project/demo';
      } else { setError('Build failed to start'); }
    } catch (err: any) { setError(err.response?.data?.error || 'Failed to start build'); }
    finally { setSaving(false); }
  };

  // Activate (upload path)
  const handleActivate = async () => {
    setStep('activating'); setError(null); setProgressMsg('Starting activation...');
    try {
      await persistTargetMode();
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
      // Hard cutoff: 10 minutes. Real builds (large repos, many
       // requirements) can exceed 3 minutes — we used to give up too
       // early and the spinner ran forever in the user's eyes even
       // though backend activation eventually finished.
       setTimeout(() => { clearInterval(pollInterval); setStep('complete'); setTimeout(() => onActivated(), 500); }, 600000);
    } catch (err: any) { setError(err.response?.data?.error || 'Activation failed'); setStep('github'); }
  };

  // Redirect to demo if build in progress
  if (step === 'starting_build' || (init as any).architect_slug) {
    window.location.href = '/portal/project/demo';
    return <div className="text-center py-5"><div className="spinner-border text-primary"></div><p className="text-muted mt-2">Redirecting to your build...</p></div>;
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div className="text-center mb-5">
        <div className="mx-auto mb-3" style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #FB2832, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-rocket-takeoff" style={{ fontSize: 28, color: '#fff' }}></i>
        </div>
        <h3 className="fw-bold mb-2" style={{ color: '#FB2832' }}>Let's Get Your Project Started</h3>
      </div>

      {/* DECISION */}
      {step === 'decision' && (
        <div className="text-center">
          <h5 className="fw-bold mb-4" style={{ fontSize: 18 }}>How would you like to start?</h5>
          <div className="d-flex flex-column gap-3" style={{ maxWidth: 460, margin: '0 auto' }}>
            <button className="btn py-3 text-start" style={{ background: '#FB2832', color: '#fff', fontWeight: 600, fontSize: 15, borderRadius: 12, border: 'none', paddingLeft: 20, paddingRight: 20 }} onClick={() => setStep('upload')}>
              <i className="bi bi-file-earmark-check me-2"></i>I have a Requirements document
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>Upload your build guide and connect your repo</div>
            </button>
            <button className="btn py-3 text-start" style={{ background: 'linear-gradient(135deg, #3b82f6, #367895)', color: '#fff', fontWeight: 600, fontSize: 15, borderRadius: 12, border: 'none', boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)', paddingLeft: 20, paddingRight: 20 }} onClick={() => setStep('idea')}>
              <i className="bi bi-lightning-charge-fill me-2"></i>Build it with AI
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>Cory will design your system from your idea</div>
            </button>
            <button className="btn py-3 text-start" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontWeight: 600, fontSize: 15, borderRadius: 12, border: 'none', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.25)', paddingLeft: 20, paddingRight: 20 }} onClick={() => setStep('brownfield_connect')}>
              <i className="bi bi-git me-2"></i>I have an existing codebase
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>Point at a mature repo — we'll discover what's already built</div>
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
            {error && <div className="alert alert-danger small py-2 mb-3">{error}</div>}
            <div className="d-flex justify-content-between align-items-center">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setStep('decision')}><i className="bi bi-arrow-left me-1"></i>Back</button>
              <button className="btn" style={{ fontSize: 13, fontWeight: 600, borderRadius: 8, background: '#FB2832', color: '#fff', border: 'none' }} onClick={handleIdeaSubmit} disabled={idea.trim().length < 30}>
                Continue <i className="bi bi-arrow-right ms-1"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOADING QUESTIONS */}
      {step === 'loading_questions' && (
        <div className="card border-0 shadow-sm"><div className="card-body p-4 text-center">
          <div className="spinner-border text-primary mb-3" style={{ width: 36, height: 36 }}></div>
          <h6 className="fw-bold mb-1" style={{ fontSize: 14 }}>Analyzing your idea...</h6>
          <p className="text-muted mb-0" style={{ fontSize: 12 }}>Cory is designing questions specific to your project</p>
        </div></div>
      )}

      {/* QUESTIONS — AI System Discovery Framework, multiple choice */}
      {step === 'questions' && questions.length > 0 && (() => {
        const q = questions[currentQ];
        const selectedOpt = q.options.find(o => o.letter === q.selected);
        return (
        <div>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body p-4">
              <div className="p-2 mb-3" style={{ background: '#f0f4ff', borderRadius: 6, borderLeft: '3px solid #3b82f6' }}>
                <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 500 }}>Your idea</div>
                <div style={{ fontSize: 12, color: '#475569' }}>{idea.length > 100 ? idea.substring(0, 100) + '...' : idea}</div>
              </div>

              <div className="text-muted mb-3" style={{ fontSize: 11 }}>
                Phase {currentQ + 1} of {questions.length} · {answeredCount} answered
              </div>

              <span className="badge mb-2" style={{ background: '#3b82f620', color: '#3b82f6', fontSize: 10 }}>{q.category}</span>
              <h6 className="fw-bold mb-3" style={{ fontSize: 16, lineHeight: 1.4 }}>{q.text}</h6>

              <div className="d-flex flex-column gap-2 mb-3">
                {q.options.map(opt => {
                  const active = q.selected === opt.letter;
                  return (
                    <button
                      key={opt.letter}
                      className="btn text-start p-3"
                      style={{
                        background: active ? '#10b98120' : '#f8fafc',
                        border: active ? '2px solid #10b981' : '2px solid #e2e8f0',
                        borderRadius: 10,
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                      onClick={() => handleSelect(opt.letter)}
                    >
                      <div className="d-flex align-items-start gap-2">
                        <span
                          className="badge d-flex align-items-center justify-content-center flex-shrink-0"
                          style={{ background: active ? '#10b981' : '#94a3b8', color: '#fff', width: 24, height: 24, borderRadius: '50%', fontSize: 12, fontWeight: 700, marginTop: 1 }}
                        >
                          {opt.letter}
                        </span>
                        <div>
                          <div className="fw-semibold mb-1" style={{ fontSize: 13, color: '#0f172a' }}>{opt.label}</div>
                          <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{opt.description}</div>
                        </div>
                        {active && <i className="bi bi-check-circle-fill ms-auto" style={{ color: '#10b981', fontSize: 16 }}></i>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedOpt && !showNote && !q.note && (
                <button className="btn btn-link text-muted p-0" style={{ fontSize: 11 }} onClick={() => { setNoteText(''); setShowNote(true); }}>
                  <i className="bi bi-pencil me-1"></i>Add a clarification (optional)
                </button>
              )}
              {selectedOpt && q.note && !showNote && (
                <div className="p-2 mb-2" style={{ background: '#fef9c3', borderRadius: 6, fontSize: 11, color: '#713f12' }}>
                  <i className="bi bi-pencil me-1"></i>Note: {q.note}
                  <button className="btn btn-link btn-sm p-0 ms-2" style={{ fontSize: 10 }} onClick={() => { setNoteText(q.note || ''); setShowNote(true); }}>edit</button>
                </div>
              )}
              {showNote && (
                <div className="mb-2">
                  <textarea className="form-control mb-2" rows={2} placeholder="Anything specific to your project we should capture about this choice?" value={noteText} onChange={e => setNoteText(e.target.value)} style={{ fontSize: 13, borderRadius: 8 }} />
                  <div className="d-flex gap-2">
                    <button className="btn btn-sm" style={{ background: '#FB2832', color: '#fff', border: 'none' }} onClick={handleNoteSave}>Save note</button>
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowNote(false)}>Cancel</button>
                  </div>
                </div>
              )}

              <div className="d-flex justify-content-between mt-3 pt-2" style={{ borderTop: '1px solid #f1f5f9' }}>
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 11 }} disabled={currentQ === 0} onClick={() => { setCurrentQ(currentQ - 1); setShowNote(false); }}>
                  <i className="bi bi-arrow-left me-1"></i>Previous
                </button>
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 11 }} disabled={currentQ >= questions.length - 1} onClick={() => { setCurrentQ(currentQ + 1); setShowNote(false); }}>
                  Skip <i className="bi bi-arrow-right ms-1"></i>
                </button>
              </div>
            </div>
          </div>

          {selectedCount > 0 && (
            <div className="d-flex flex-wrap gap-1 mb-3">
              {questions.filter(qq => qq.selected === 'B' || qq.selected === 'C').map((qq, i) => (
                <span key={i} className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 10 }}>
                  <i className="bi bi-check me-1"></i>{qq.category}: {qq.selected}
                </span>
              ))}
            </div>
          )}

          {answeredCount >= 5 && (
            <button className="btn w-100 py-3" style={{ background: 'linear-gradient(135deg, #3b82f6, #367895)', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 10, border: 'none' }} onClick={() => setStep('github_for_build')}>
              Continue to Repository <i className="bi bi-arrow-right ms-2"></i>
            </button>
          )}
        </div>
        );
      })()}

      {/* UPLOAD — requirements doc + GitHub repo on the same screen */}
      {step === 'upload' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-3" style={{ fontSize: 16 }}><i className="bi bi-file-earmark-text me-2"></i>Upload Requirements</h6>
            <div className="border rounded p-3 text-center mb-3" style={{ borderStyle: 'dashed', cursor: 'pointer', background: '#f8fafc' }}
              onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFileRead(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}>
              <i className="bi bi-cloud-upload d-block mb-1" style={{ fontSize: 24, color: '#3b82f6' }}></i>
              <span className="text-muted" style={{ fontSize: 12 }}>Drag a file here or click to browse</span>
              <input ref={fileInputRef} type="file" accept=".md,.txt,.markdown" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFileRead(e.target.files[0]); }} />
            </div>
            <textarea className="form-control mb-4" rows={6} placeholder="Or paste your requirements document here..." value={reqContent} onChange={e => setReqContent(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />

            <h6 className="fw-bold mb-2" style={{ fontSize: 16 }}><i className="bi bi-github me-2"></i>Connect GitHub Repository</h6>
            <p className="text-muted mb-2" style={{ fontSize: 12 }}>We'll read this repo to discover existing code as Business Processes.</p>
            <input type="text" className="form-control mb-2" placeholder="https://github.com/your-org/your-repo" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} />
            <input type="password" className="form-control mb-3" placeholder="Access token (for private repos)" value={accessToken} onChange={e => setAccessToken(e.target.value)} />
            {renderTargetTierPicker(targetMode, setTargetMode)}

            {error && <div className="alert alert-danger small py-2 mb-3">{error}</div>}
            <div className="d-flex justify-content-between">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setStep('decision')}><i className="bi bi-arrow-left me-1"></i>Back</button>
              <button className="btn" style={{ fontWeight: 600, background: '#FB2832', color: '#fff', border: 'none' }} onClick={handleUploadRequirements} disabled={saving || !reqContent.trim() || !repoUrl.trim()}>
                {saving ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving...</> : <>Continue <i className="bi bi-arrow-right ms-1"></i></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BROWNFIELD: Connect existing repo */}
      {step === 'brownfield_connect' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-2" style={{ fontSize: 16 }}>
              <i className="bi bi-git me-2" style={{ color: '#10b981' }}></i>Point at your existing codebase
            </h6>
            <p className="text-muted mb-3" style={{ fontSize: 12, lineHeight: 1.5 }}>
              We'll read your repo's file tree and let an LLM identify the business capabilities that already exist (e.g. authentication, lead pipeline, reporting). They'll be created as Business Processes marked <strong>Foundation Built</strong> — Cory will then recommend ways to <em>improve, verify, or extend</em> what's there instead of asking you to build from scratch.
            </p>

            <div className="alert alert-info py-2 mb-3" style={{ fontSize: 11 }}>
              <i className="bi bi-info-circle me-1"></i>
              Best for repos with at least 30+ source files and a recognizable structure (services/, components/, routes/, models/). Smaller projects, use one of the other options.
            </div>

            <label className="form-label fw-medium mb-1" style={{ fontSize: 12 }}>GitHub repository URL</label>
            <input type="text" className="form-control mb-2" placeholder="https://github.com/your-org/your-repo" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />

            <label className="form-label fw-medium mb-1" style={{ fontSize: 12 }}>Access token <span className="text-muted">(required for private repos)</span></label>
            <input type="password" className="form-control mb-3" placeholder="ghp_..." value={accessToken} onChange={e => setAccessToken(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />

            {renderTargetTierPicker(targetMode, setTargetMode)}

            {error && <div className="alert alert-danger small py-2 mb-3">{error}</div>}

            <div className="d-flex justify-content-between">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setStep('decision')}>
                <i className="bi bi-arrow-left me-1"></i>Back
              </button>
              <button
                className="btn py-2"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontWeight: 600, fontSize: 13, borderRadius: 8, border: 'none' }}
                disabled={!repoUrl.trim()}
                onClick={handleBrownfieldDiscover}
              >
                <i className="bi bi-search me-1"></i>Discover existing capabilities
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BROWNFIELD: Discovering (spinner) */}
      {step === 'brownfield_discovering' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body py-5 text-center">
            <div className="spinner-border text-success mb-3" style={{ width: 48, height: 48 }}></div>
            <h5 className="fw-bold mb-1">Reading your codebase</h5>
            <p className="text-muted mb-3" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Pulling the file tree, scanning for feature boundaries, and identifying business capabilities. This usually takes 30-60 seconds.
            </p>
            <div className="text-muted small" style={{ fontSize: 11 }}>
              <i className="bi bi-arrow-repeat me-1"></i>Connecting to GitHub<br />
              <i className="bi bi-arrow-repeat me-1"></i>Reading file tree<br />
              <i className="bi bi-arrow-repeat me-1"></i>Asking the LLM to group files into capabilities
            </div>
          </div>
        </div>
      )}

      {/* BROWNFIELD: Review discovered capabilities */}
      {step === 'brownfield_review' && brownfieldResult && (
        <div className="card border-0 shadow-sm" style={{ maxWidth: 720, margin: '0 auto' }}>
          <div className="card-body p-4">
            <div className="d-flex align-items-center gap-2 mb-2">
              <i className="bi bi-check-circle-fill" style={{ color: '#10b981', fontSize: 22 }}></i>
              <h5 className="fw-bold mb-0">Discovery complete</h5>
            </div>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>
              Found <strong>{brownfieldResult.capabilitiesCreated} capabilities</strong> across {brownfieldResult.totalFilesAnalyzed.toLocaleString()} files.
              {brownfieldResult.detectedStack.length > 0 && (
                <> Detected stack: {brownfieldResult.detectedStack.map((s, i) => <span key={i} className="badge bg-secondary ms-1" style={{ fontSize: 9 }}>{s}</span>)}</>
              )}
            </p>

            <div className="mb-3" style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              {brownfieldResult.capabilities.map((c, i) => (
                <div key={c.id} className="p-3" style={{ borderBottom: i < brownfieldResult.capabilities.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <div className="fw-semibold" style={{ fontSize: 13 }}>{c.name}</div>
                    <div className="d-flex gap-1">
                      {c.layers.backend > 0 && <span className="badge" style={{ background: '#3b82f620', color: '#3b82f6', fontSize: 9 }}>Backend ({c.layers.backend})</span>}
                      {c.layers.frontend > 0 && <span className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 9 }}>Frontend ({c.layers.frontend})</span>}
                      {c.layers.agents > 0 && <span className="badge" style={{ background: '#36789520', color: '#367895', fontSize: 9 }}>Agents ({c.layers.agents})</span>}
                      {c.layers.models > 0 && <span className="badge" style={{ background: '#f59e0b20', color: '#92400e', fontSize: 9 }}>Models ({c.layers.models})</span>}
                    </div>
                  </div>
                  {c.description && <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.5 }}>{c.description}</div>}
                </div>
              ))}
            </div>

            <div className="alert alert-success py-2 mb-3" style={{ fontSize: 11 }}>
              <i className="bi bi-info-circle me-1"></i>
              These capabilities are marked <strong>Foundation Built</strong>. Cory will recommend <em>improve / verify / extend</em> tasks for them, not <em>build-from-scratch</em>.
            </div>

            <div className="d-flex justify-content-between">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => { setBrownfieldResult(null); setStep('brownfield_connect'); }}>
                <i className="bi bi-arrow-clockwise me-1"></i>Re-run discovery
              </button>
              <button
                className="btn py-2"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontWeight: 600, fontSize: 13, borderRadius: 8, border: 'none' }}
                onClick={() => onActivated()}
              >
                <i className="bi bi-arrow-right me-1"></i>Open the Blueprint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GITHUB (upload path) */}
      {step === 'github' && (
        <div className="card border-0 shadow-sm"><div className="card-body p-4">
          <div className="d-flex align-items-center gap-2 mb-1"><i className="bi bi-check-circle-fill" style={{ color: '#10b981' }}></i><span className="text-muted" style={{ fontSize: 12 }}>Requirements saved</span></div>
          <h6 className="fw-bold mb-3" style={{ fontSize: 16 }}><i className="bi bi-github me-2"></i>Connect GitHub Repository</h6>
          <input type="text" className="form-control mb-2" placeholder="https://github.com/your-org/your-repo" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} />
          <input type="password" className="form-control mb-3" placeholder="Access token (for private repos)" value={accessToken} onChange={e => setAccessToken(e.target.value)} />
          {renderTargetTierPicker(targetMode, setTargetMode)}
          {error && <div className="alert alert-danger small py-2 mb-3">{error}</div>}
          <button className="btn w-100 py-3" style={{ background: repoUrl.trim() ? '#10b981' : '#e2e8f0', color: repoUrl.trim() ? '#fff' : '#9ca3af', fontWeight: 600, fontSize: 15, borderRadius: 12, border: 'none' }} onClick={handleConnectGithub} disabled={saving || !repoUrl.trim()}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2"></span>Connecting...</> : <><i className="bi bi-lightning-charge me-2"></i>Connect & Activate</>}
          </button>
        </div></div>
      )}

      {/* GITHUB (AI build path) */}
      {step === 'github_for_build' && (
        <div className="card border-0 shadow-sm"><div className="card-body p-4">
          <div className="d-flex align-items-center gap-2 mb-1"><i className="bi bi-check-circle-fill" style={{ color: '#10b981' }}></i><span className="text-muted" style={{ fontSize: 12 }}>Idea refined ({selectedCount} capabilities selected)</span></div>
          <h6 className="fw-bold mb-2" style={{ fontSize: 16 }}><i className="bi bi-github me-2"></i>Connect Your Repository</h6>
          <p className="text-muted mb-3" style={{ fontSize: 12 }}>We'll connect your repo and start building your AI system.</p>
          <input type="text" className="form-control mb-2" placeholder="https://github.com/your-org/your-repo" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} />
          <input type="password" className="form-control mb-3" placeholder="Access token (for private repos)" value={accessToken} onChange={e => setAccessToken(e.target.value)} />
          {renderTargetTierPicker(targetMode, setTargetMode)}
          {error && <div className="alert alert-danger small py-2 mb-3">{error}</div>}
          <button className="btn w-100 py-3" style={{ background: repoUrl.trim() ? 'linear-gradient(135deg, #3b82f6, #367895)' : '#e2e8f0', color: repoUrl.trim() ? '#fff' : '#9ca3af', fontWeight: 700, fontSize: 15, borderRadius: 12, border: 'none', boxShadow: repoUrl.trim() ? '0 4px 15px rgba(99, 102, 241, 0.3)' : 'none' }}
            onClick={handleStartBuild} disabled={saving || !repoUrl.trim()}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2"></span>Starting Build...</> : <><i className="bi bi-rocket-takeoff me-2"></i>Start Building My System</>}
          </button>
        </div></div>
      )}

      {/* ACTIVATING */}
      {step === 'activating' && (
        <div className="card border-0 shadow-sm"><div className="card-body py-5 text-center">
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
        </div></div>
      )}

      {/* COMPLETE */}
      {step === 'complete' && (
        <div className="card border-0 shadow-sm" style={{ borderLeft: '4px solid #10b981' }}><div className="card-body text-center py-5">
          <i className="bi bi-check-circle-fill d-block mb-3" style={{ fontSize: 48, color: '#10b981' }}></i>
          <h4 className="fw-bold mb-2" style={{ color: '#059669' }}>Project Activated!</h4>
        </div></div>
      )}
    </div>
  );
}

/**
 * Inline picker shown on the GitHub steps. Lets the user pick what tier
 * "100% complete" should mean. Default is Production. Higher tiers become
 * enhancement suggestions after 100% rather than gating the lower tiers.
 */
function renderTargetTierPicker(
  targetMode: ProjectMode,
  setTargetMode: (m: ProjectMode) => void,
) {
  return (
    <div className="mb-3">
      <div className="d-flex align-items-center gap-2 mb-1">
        <span className="fw-semibold" style={{ fontSize: 12, color: '#FB2832' }}>
          <i className="bi bi-sliders me-1"></i>Target tier
        </span>
        <span className="text-muted" style={{ fontSize: 10 }}>What "100% complete" means for this project</span>
      </div>
      <div className="d-flex gap-1">
        {PROJECT_MODES.map(m => {
          const active = targetMode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              className="btn btn-sm flex-fill"
              style={{ fontSize: 10, padding: '6px 4px', lineHeight: 1.2, ...(active ? { background: '#FB2832', color: '#fff', border: 'none' } : { border: '1px solid #6c757d', color: '#6c757d', background: 'transparent' }) }}
              onClick={() => setTargetMode(m.value)}
              title={m.desc}
            >
              <i className={`bi ${m.icon} me-1`}></i>{m.label}
              {active && <i className="bi bi-check-lg ms-1"></i>}
            </button>
          );
        })}
      </div>
      <div className="text-muted mt-1" style={{ fontSize: 10 }}>
        {PROJECT_MODES.find(m => m.value === targetMode)?.desc}. You can change this later from the Blueprint header.
      </div>
    </div>
  );
}
