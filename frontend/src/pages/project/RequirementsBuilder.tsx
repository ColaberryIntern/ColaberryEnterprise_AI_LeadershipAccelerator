/**
 * RequirementsBuilder — AI-guided requirements generation (idea-first)
 *
 * Flow:
 * 1. Idea Capture — "What are you looking to build?"
 * 2. Dynamic Questions — AI generates questions based on the idea
 * 3. Generation — Multi-pass AI generation with progress
 * 4. Review + Save — Preview and inject into project
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import { requirementsDraftKey as draftKey } from '../../utils/requirementsDraft';

interface QuestionOption { letter: string; label: string; description: string; }
interface Question {
  phase?: string;
  category: string;
  text: string;
  options: QuestionOption[];
  selected: string | null; // 'A' | 'B' | 'C'
  note?: string;
}

// Parse the expand-questions response into A/B/C "AI System Discovery Framework"
// questions (baseline / intermediate / advanced suggested option choices).
function normalizeQuestions(raw: any[]): Question[] {
  return (raw || [])
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
      selected: null as string | null,
    }));
}

// Selected sophistication levels → capability lines for the generation prompt
// and the enriched Architect idea.
function buildCapabilityLines(questions: Question[]): string[] {
  return questions.filter(q => q.selected).map(q => {
    const opt = q.options.find(o => o.letter === q.selected);
    const note = q.note ? ` (note: ${q.note})` : '';
    return `- [${q.category}] ${opt?.letter}. ${opt?.label} — ${opt?.description}${note}`;
  });
}

const STAGE_LABELS: Record<string, string> = {
  idea: 'Capturing Your Vision',
  loading_questions: 'Analyzing Your Idea...',
  questions: 'Designing Capabilities',
  generating: 'Generating Requirements',
  outline: 'Creating Document Outline',
  sections: 'Expanding Sections',
  refinement: 'Refining & Polishing',
  review: 'Ready for Review',
  saving: 'Saving to Project',
  complete: 'Complete!',
};

// A concise project name from the idea (first line, quotes/punctuation trimmed)
// so the project switcher is legible instead of every project being the org name.
function deriveProjectName(idea: string): string {
  const first = (idea || '').trim().split('\n')[0].replace(/^[\s"'“”]+|[\s"'“”:.]+$/g, '');
  return first.slice(0, 60) || 'AI System';
}

interface RequirementsBuilderProps {
  // Called when the build completes and the user clicks "View your system".
  // Lets the host (CoryHome) re-fetch onboarding state so it swaps the inline
  // builder for the dashboard — navigating to /portal/home alone is a no-op
  // when the builder is ALREADY rendered at /portal/home.
  onComplete?: () => void;
}

export default function RequirementsBuilder({ onComplete }: RequirementsBuilderProps = {}) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'choose' | 'idea' | 'loading_questions' | 'questions' | 'generating' | 'review' | 'building' | 'complete' | 'repo'>('choose');
  // Build tier chosen on the first screen: workflow (fast regular LLM), full
  // (Architect, professional), or autonomous (Architect, deepest setting).
  const [buildType, setBuildType] = useState<'workflow' | 'full' | 'autonomous' | null>(null);
  const [originalIdea, setOriginalIdea] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [modifyText, setModifyText] = useState('');
  const [showModify, setShowModify] = useState(false);
  const [stage, setStage] = useState('idea');
  const [progress, setProgress] = useState(5);
  const [progressMsg, setProgressMsg] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [generatedDoc, setGeneratedDoc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<any>(null);

  // Full / autonomous Architect build branch (questions → repo → architect-build → live demo preview)
  const [repoUrl, setRepoUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [startingBuild, setStartingBuild] = useState(false);

  // Resume support
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey());
      if (saved) {
        const state = JSON.parse(saved);
        // Only resume drafts created by the current 3-tier flow (they record a
        // buildType). Older/stale drafts have no buildType — discard them so the
        // user always starts at the chooser instead of a pre-filled idea screen.
        if (!state.buildType) { localStorage.removeItem(draftKey()); return; }
        // Discard drafts whose questions predate the A/B/C framework (no
        // `options`) — restoring them would crash the new option renderer.
        if (Array.isArray(state.questions) && state.questions.length > 0 && !state.questions[0]?.options) {
          localStorage.removeItem(draftKey());
          return;
        }
        const hasIdea = state.originalIdea && state.originalIdea.trim().length > 0;
        const hasDoc = state.generatedDoc && state.generatedDoc.trim().length > 10;
        const validPhase = state.phase && !['loading_questions', 'generating'].includes(state.phase);
        const phaseNeedsDoc = state.phase === 'review' || state.phase === 'complete';
        if (hasIdea) setOriginalIdea(state.originalIdea);
        if (state.questions?.length > 0 && hasIdea) setQuestions(state.questions);
        if (state.currentQ && hasIdea) setCurrentQ(state.currentQ);
        if (state.buildType) setBuildType(state.buildType);
        if (hasIdea && validPhase && !(phaseNeedsDoc && !hasDoc)) setPhase(state.phase);
        if (hasDoc) setGeneratedDoc(state.generatedDoc);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(draftKey(), JSON.stringify({ originalIdea, questions, currentQ, phase, generatedDoc, buildType })); } catch {}
  }, [originalIdea, questions, currentQ, phase, generatedDoc, buildType]);

  // Submit idea → generate dynamic questions
  const handleIdeaSubmit = async () => {
    if (originalIdea.trim().length < 30) return;
    setPhase('loading_questions');
    setStage('loading_questions');
    setProgress(10);
    setError(null);

    try {
      const res = await portalApi.post('/api/portal/project/requirements/expand-questions', { idea: originalIdea.trim() });
      const aiQuestions = normalizeQuestions(res.data.questions || []);
      if (aiQuestions.length < 5) throw new Error('Not enough questions generated');
      setQuestions(aiQuestions.slice(0, 12));
      setPhase('questions');
      setStage('questions');
      setProgress(15);
    } catch (err: any) {
      // Retry once instead of falling back to generic
      try {
        const res2 = await portalApi.post('/api/portal/project/requirements/expand-questions', { idea: originalIdea.trim() });
        const q2 = normalizeQuestions(res2.data.questions || []);
        if (q2.length >= 3) {
          setQuestions(q2.slice(0, 12));
          setPhase('questions');
          setStage('questions');
          setProgress(15);
          return;
        }
      } catch {}
      setError('Could not generate questions. Please try again.');
      setPhase('idea');
      setStage('idea');
      setProgress(5);
    }
  };

  // Full build: kick off the AI Project Architect (the thorough ~15-min build)
  // and hand the user to the live system-preview demo while it runs. The demo
  // generates the AI-organization preview from the same idea, so it's useful
  // immediately and does not depend on the requirements document or repo.
  const handleFullBuild = async () => {
    if (originalIdea.trim().length < 30 || !repoUrl.trim()) return;
    setStartingBuild(true);
    setError(null);
    try {
      // Fold the selected sophistication levels into the idea so the Architect
      // actually uses them (previously it built from the bare idea alone).
      const capabilities = buildCapabilityLines(questions);
      const enrichedIdea = capabilities.length
        ? `${originalIdea.trim()}\n\nSelected Sophistication Levels (AI System Discovery Framework):\n${capabilities.join('\n')}`
        : originalIdea.trim();
      const projectName = deriveProjectName(originalIdea);
      await portalApi.post('/api/portal/project/architect-build', {
        idea: enrichedIdea,
        repoUrl: repoUrl.trim(),
        accessToken: accessToken.trim() || undefined,
        projectName,
        mode: buildType === 'autonomous' ? 'autonomous' : 'professional',
      });
      // Clear the draft so resume doesn't compete with the build.
      localStorage.removeItem(draftKey());
      window.location.href = '/portal/project/demo';
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not start the build. Check the repository URL (and access token for private repos) and try again.');
      setStartingBuild(false);
    }
  };

  // Workflow build: connect the repo (so the system can sync), then generate the
  // requirements doc. Build-out (handleSave) then syncs the repo + computes the checks.
  const handleWorkflowBuild = async () => {
    if (originalIdea.trim().length < 30 || !repoUrl.trim()) return;
    setStartingBuild(true);
    setError(null);
    try {
      await portalApi.post('/api/portal/project/setup/github', {
        repo_url: repoUrl.trim(),
        access_token: accessToken.trim() || undefined,
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not connect the repository. Check the URL (and access token for private repos).');
      setStartingBuild(false);
      return;
    }
    setStartingBuild(false);
    handleGenerate();
  };

  // Select a suggested option (A/B/C) for the current question, then advance.
  const handleSelect = (letter: string) => {
    const updated = [...questions];
    updated[currentQ] = { ...updated[currentQ], selected: letter };
    setQuestions(updated);
    setShowModify(false);
    setModifyText(updated[currentQ].note || '');
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setProgress(15 + Math.round(((currentQ + 1) / questions.length) * 25));
    }
  };

  // Attach an optional clarifying note to the current question's choice.
  const handleNoteSubmit = () => {
    const updated = [...questions];
    updated[currentQ] = { ...updated[currentQ], note: modifyText.trim() || undefined };
    setQuestions(updated);
    setShowModify(false);
    setModifyText('');
  };

  // Workflow tier: kick off requirements generation, then hand the user to the
  // live system-preview demo while it generates + builds out server-side. This
  // mirrors the Full/Autonomous handoff (handleFullBuild) so all three tiers
  // wait in the same place. The backend persists workflow_job_id + build_idea,
  // and the architect-status poll / build poller finalize the doc and build-out
  // even if the tab closes — so we don't poll inline here.
  const handleGenerate = async () => {
    setStartingBuild(true);
    setError(null);
    const capText = buildCapabilityLines(questions).join('\n');
    try {
      await portalApi.post('/api/portal/project/requirements/generate', {
        mode: 'professional',
        project_name: deriveProjectName(originalIdea),
        idea: originalIdea,
        user_prompt: `ORIGINAL IDEA:\n${originalIdea}\n\nSELECTED SOPHISTICATION LEVELS (AI System Discovery Framework):\n${capText}\n\nGenerate comprehensive requirements covering the original idea and the selected sophistication levels. The requirements document should be at least 6000 words and cover functional requirements, non-functional requirements, system architecture, data models, API specifications, and user interface requirements.`,
      });
      localStorage.removeItem(draftKey());
      window.location.href = '/portal/project/demo';
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start generation');
      setStartingBuild(false);
    }
  };

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await portalApi.post('/api/portal/project/setup/requirements', { content: generatedDoc });
      localStorage.removeItem(draftKey());
      // Build out the workflow into capabilities (no repo needed) before handoff —
      // otherwise the user lands on an empty Blueprint with 0 capabilities.
      setPhase('building');
      setStage('saving');
      setProgress(92);
      setProgressMsg('Building your system...');
      await portalApi.post('/api/portal/project/setup/activate', {});
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const p = (await portalApi.get('/api/portal/project/setup/activation-progress')).data;
          if (typeof p.percent === 'number') setProgress(Math.max(92, Math.min(99, p.percent)));
          if (p.message) setProgressMsg(p.message);
          if (p.status === 'complete') break;
          if (p.status === 'failed') { setError(p.message || 'Build-out did not complete; you can retry from the Blueprint.'); break; }
        } catch { /* keep polling */ }
      }
      setProgress(100);
      setPhase('complete');
      setStage('complete');
    } catch (err: any) { setError(err.response?.data?.error || 'Failed to save'); setPhase('review'); }
    finally { setSaving(false); }
  };

  const answeredCount = questions.filter(q => q.selected !== null).length;
  const selectedCount = answeredCount;

  // Consistent font: 13px body, 11px muted, 16px headings
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div className="d-flex align-items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-robot" style={{ fontSize: 20, color: '#fff' }}></i>
          </div>
          <h5 className="fw-bold mb-0" style={{ color: 'var(--color-primary)', fontSize: 16 }}>Build Your Requirements</h5>
        </div>
        <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }} onClick={() => { if (phase !== 'choose') { setError(null); setPhase('choose'); } else { navigate('/portal/project/blueprint'); } }}>
          <i className="bi bi-arrow-left me-1"></i>Back
        </button>
      </div>

      {/* Progress */}
      {phase !== 'idea' && phase !== 'choose' && (
        <div className="mb-4">
          <div className="d-flex justify-content-between mb-1">
            <span style={{ fontSize: 11, color: 'var(--color-primary)', fontWeight: 500 }}>{STAGE_LABELS[stage] || ''}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: progress === 100 ? '#059669' : '#3b82f6' }}>{progress}%</span>
          </div>
          <div className="progress" style={{ height: 6, borderRadius: 6 }}>
            <div className="progress-bar" style={{ width: `${progress}%`, background: progress === 100 ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: 6, transition: 'width 0.5s ease' }}></div>
          </div>
          {progressMsg && phase === 'generating' && <div className="text-muted mt-1" style={{ fontSize: 11 }}>{progressMsg}</div>}
        </div>
      )}

      {/* CHOOSE BUILD TYPE */}
      {phase === 'choose' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-1" style={{ fontSize: 16 }}>How big is what you're building?</h6>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>Pick the path that fits. You'll describe your idea and answer a few questions next either way.</p>
            <div className="d-flex flex-column gap-2">
              <button className="btn text-start py-3" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, paddingLeft: 18, paddingRight: 18 }}
                onClick={() => { setBuildType('workflow'); setPhase('idea'); setError(null); }}>
                <div className="d-flex align-items-center gap-2"><i className="bi bi-diagram-2" style={{ color: '#10b981', fontSize: 18 }}></i><span className="fw-semibold" style={{ fontSize: 14 }}>A workflow</span><span className="badge ms-auto" style={{ background: '#dcfce7', color: '#15803d', fontSize: 10 }}>~5 min</span></div>
                <div className="text-muted mt-1" style={{ fontSize: 11.5 }}>A focused automation. Cory drafts a tailored requirements doc fast — no repo needed.</div>
              </button>
              <button className="btn text-start py-3" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, paddingLeft: 18, paddingRight: 18 }}
                onClick={() => { setBuildType('full'); setPhase('idea'); setError(null); }}>
                <div className="d-flex align-items-center gap-2"><i className="bi bi-buildings" style={{ color: '#3b82f6', fontSize: 18 }}></i><span className="fw-semibold" style={{ fontSize: 14 }}>A full project</span><span className="badge ms-auto" style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 10 }}>~13 min</span></div>
                <div className="text-muted mt-1" style={{ fontSize: 11.5 }}>The AI Project Architect designs the complete system. Explore a live preview of your AI agent org while it builds.</div>
              </button>
              <button className="btn text-start py-3" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, paddingLeft: 18, paddingRight: 18 }}
                onClick={() => { setBuildType('autonomous'); setPhase('idea'); setError(null); }}>
                <div className="d-flex align-items-center gap-2"><i className="bi bi-stars" style={{ color: '#8b5cf6', fontSize: 18 }}></i><span className="fw-semibold" style={{ fontSize: 14 }}>Fully autonomous</span><span className="badge ms-auto" style={{ background: '#f3e8ff', color: '#7c3aed', fontSize: 10 }}>~21 min · deepest</span></div>
                <div className="text-muted mt-1" style={{ fontSize: 11.5 }}>Same as a full project, but the Architect runs its most thorough setting for the most in-depth specification.</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IDEA CAPTURE */}
      {phase === 'idea' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-2" style={{ fontSize: 16 }}>What are you looking to build?</h6>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>
              Describe your idea in as much detail as possible. The more you share, the better we can design your system.
            </p>
            <textarea
              className="form-control mb-3"
              rows={6}
              placeholder="Example: I want to build a platform that tracks website visitors, identifies high-value leads, and automatically sends personalized follow-up emails based on their behavior..."
              value={originalIdea}
              onChange={e => setOriginalIdea(e.target.value)}
              style={{ fontSize: 13, borderRadius: 8, lineHeight: 1.6 }}
            />
            {error && <div className="alert alert-danger small py-2 mb-3">{error}</div>}
            <div className="d-flex justify-content-between align-items-center">
              <span className="text-muted" style={{ fontSize: 11 }}>
                {originalIdea.length < 30 ? `${30 - originalIdea.length} more characters needed` : <><i className="bi bi-check-circle text-success me-1"></i>Ready</>}
              </span>
              <button className="btn btn-primary" style={{ fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '8px 20px' }}
                onClick={handleIdeaSubmit} disabled={originalIdea.trim().length < 30}>
                Continue <i className="bi bi-arrow-right ms-1"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOADING QUESTIONS */}
      {phase === 'loading_questions' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4 text-center">
            <div className="spinner-border text-primary mb-3" style={{ width: 36, height: 36 }}></div>
            <h6 className="fw-bold mb-1" style={{ fontSize: 14 }}>Analyzing your idea...</h6>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>Cory is designing questions specific to your project</p>
          </div>
        </div>
      )}

      {/* QUESTIONS */}
      {phase === 'questions' && questions.length > 0 && (
        <div>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body p-4">
              {/* Idea context */}
              <div className="p-2 mb-3" style={{ background: '#f0f4ff', borderRadius: 6, borderLeft: '3px solid #3b82f6' }}>
                <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 500 }}>Your idea</div>
                <div style={{ fontSize: 12, color: '#475569' }}>{originalIdea.length > 100 ? originalIdea.substring(0, 100) + '...' : originalIdea}</div>
              </div>

              <div className="text-muted mb-3" style={{ fontSize: 11 }}>
                Question {currentQ + 1} of {questions.length} · {answeredCount} answered
              </div>

              {/* Question + A/B/C suggested option choices */}
              <p className="mb-1" style={{ fontSize: 12, color: '#3b82f6', fontWeight: 500 }}>
                Based on your idea — pick the level that fits best
              </p>
              <h6 className="fw-bold mb-1" style={{ fontSize: 16 }}>{questions[currentQ].text}</h6>
              <span className="badge mb-3" style={{ background: '#3b82f620', color: '#3b82f6', fontSize: 10 }}>{questions[currentQ].category}</span>

              <div className="d-flex flex-column gap-2 mb-2">
                {questions[currentQ].options.map(opt => {
                  const active = questions[currentQ].selected === opt.letter;
                  return (
                    <button
                      key={opt.letter}
                      className="btn text-start p-3"
                      style={{ background: active ? '#10b98120' : '#f8fafc', border: active ? '2px solid #10b981' : '2px solid #e2e8f0', borderRadius: 10, fontSize: 13, lineHeight: 1.5 }}
                      onClick={() => handleSelect(opt.letter)}>
                      <div className="d-flex align-items-start gap-2">
                        <span className="badge d-flex align-items-center justify-content-center flex-shrink-0"
                          style={{ background: active ? '#10b981' : '#94a3b8', color: '#fff', width: 24, height: 24, borderRadius: '50%', fontSize: 12, fontWeight: 700, marginTop: 1 }}>{opt.letter}</span>
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

              {/* Optional clarifying note for the chosen level */}
              {!showModify ? (
                <button className="btn btn-link text-muted p-0" style={{ fontSize: 11 }} onClick={() => { setModifyText(questions[currentQ].note || ''); setShowModify(true); }}>
                  <i className="bi bi-pencil me-1"></i>{questions[currentQ].note ? 'Edit note' : 'Add a note'}
                </button>
              ) : (
                <div className="mb-2">
                  <textarea className="form-control mb-2" rows={2} placeholder="Add a clarifying note for this choice (optional)" value={modifyText} onChange={e => setModifyText(e.target.value)} style={{ fontSize: 13, borderRadius: 8 }} />
                  <div className="d-flex gap-2">
                    <button className="btn btn-primary btn-sm" style={{ borderRadius: 6, fontSize: 12 }} onClick={handleNoteSubmit}>Save note</button>
                    <button className="btn btn-outline-secondary btn-sm" style={{ borderRadius: 6, fontSize: 12 }} onClick={() => setShowModify(false)}>Cancel</button>
                  </div>
                </div>
              )}

              <div className="d-flex justify-content-between mt-3 pt-2" style={{ borderTop: '1px solid #f1f5f9' }}>
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 11 }} disabled={currentQ === 0} onClick={() => setCurrentQ(currentQ - 1)}>
                  <i className="bi bi-arrow-left me-1"></i>Previous
                </button>
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 11 }} disabled={currentQ >= questions.length - 1} onClick={() => setCurrentQ(currentQ + 1)}>
                  Skip <i className="bi bi-arrow-right ms-1"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Selected levels */}
          {selectedCount > 0 && (
            <div className="d-flex flex-wrap gap-1 mb-3">
              {questions.filter(q => q.selected).map((q, i) => (
                <span key={i} className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 10 }}><i className="bi bi-check me-1"></i>{q.category}: {q.selected}</span>
              ))}
            </div>
          )}

          {/* All tiers continue to the repo step (the repo is synced after the build). */}
          {answeredCount >= 5 && (
            <button className="btn w-100 py-3" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 10, border: 'none' }}
              onClick={() => { setError(null); setPhase('repo'); }}>
              <i className="bi bi-arrow-right-circle me-2"></i>Continue — connect your repo ({selectedCount} levels)
            </button>
          )}

          {error && <div className="alert alert-danger small mt-3">{error}</div>}
        </div>
      )}

      {/* CONNECT REPO (all tiers) */}
      {phase === 'repo' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-1" style={{ fontSize: 16 }}>Connect your repository</h6>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>
              {buildType === 'workflow'
                ? 'Cory drafts your requirements (~5 min) and syncs them against this repo so progress, coverage, and gaps are tracked against your real code.'
                : `${buildType === 'autonomous' ? 'Cory will run its deepest build' : 'Cory will design your full system'} into this repo (${buildType === 'autonomous' ? '~21 min' : '~13 min'}). You'll watch a live preview of your AI agent organization while it builds.`}
            </p>
            <label className="text-muted" style={{ fontSize: 11, fontWeight: 600 }}>GitHub repository <span style={{ color: '#ef4444' }}>*</span></label>
            <input className="form-control form-control-sm mt-1" placeholder="https://github.com/your-org/your-repo" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} style={{ fontSize: 13, borderRadius: 6 }} />
            <input className="form-control form-control-sm mt-2" placeholder="Access token (only for private repos)" value={accessToken} onChange={e => setAccessToken(e.target.value)} style={{ fontSize: 13, borderRadius: 6 }} />
            {error && <div className="alert alert-danger small py-2 mt-3 mb-0">{error}</div>}
            <div className="d-flex justify-content-between align-items-center mt-3">
              <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 12 }} onClick={() => { setError(null); setPhase('questions'); }} disabled={startingBuild}>
                <i className="bi bi-arrow-left me-1"></i>Back
              </button>
              <button className="btn py-2 px-4" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 10, border: 'none' }}
                disabled={!repoUrl.trim() || startingBuild} onClick={buildType === 'workflow' ? handleWorkflowBuild : handleFullBuild}>
                {startingBuild ? <><span className="spinner-border spinner-border-sm me-2"></span>Starting…</> : <>{buildType === 'workflow' ? 'Generate my requirements' : buildType === 'autonomous' ? 'Start autonomous build' : 'Start full build'} <i className="bi bi-arrow-right ms-1"></i></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GENERATING */}
      {phase === 'generating' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-5 text-center">
            <div className="spinner-border text-primary mb-3" style={{ width: 44, height: 44 }}></div>
            <h6 className="fw-bold mb-2" style={{ fontSize: 15 }}>Generating Your Requirements</h6>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>{progressMsg || 'This takes a few minutes...'}</p>
          </div>
        </div>
      )}

      {/* REVIEW */}
      {phase === 'review' && (
        <div>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body p-4">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h6 className="fw-bold mb-0" style={{ fontSize: 15 }}>
                  <i className="bi bi-file-earmark-check me-2" style={{ color: '#10b981' }}></i>Your Requirements Are Ready
                </h6>
                <span className="badge bg-success" style={{ fontSize: 10 }}>{generatedDoc.split(/\s+/).length.toLocaleString()} words</span>
              </div>
              <div className="p-3" style={{ background: '#f8fafc', borderRadius: 8, maxHeight: 350, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {generatedDoc || 'No content generated'}
              </div>
            </div>
          </div>
          {error && <div className="alert alert-danger small mb-3">{error}</div>}
          <button className="btn w-100 py-3" style={{ background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 10, border: 'none' }} onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</> : <><i className="bi bi-check-circle me-2"></i>Save & Continue Setup</>}
          </button>
        </div>
      )}

      {/* BUILDING (workflow build-out) */}
      {phase === 'building' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-5 text-center">
            <div className="spinner-border text-primary mb-3" style={{ width: 44, height: 44 }}></div>
            <h6 className="fw-bold mb-2" style={{ fontSize: 15 }}>Building your system</h6>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>{progressMsg || 'Organizing your requirements into capabilities...'}</p>
          </div>
        </div>
      )}

      {/* COMPLETE */}
      {phase === 'complete' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-5 text-center">
            <i className="bi bi-check-circle-fill d-block mb-3" style={{ fontSize: 44, color: '#10b981' }}></i>
            <h5 className="fw-bold mb-2" style={{ color: '#059669', fontSize: 16 }}>Your system is ready!</h5>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>Your requirements are saved and organized into capabilities. Open your Blueprint to see what&rsquo;s next.</p>
            <button className="btn btn-primary" style={{ borderRadius: 8, fontWeight: 600, fontSize: 13 }} onClick={() => {
              // Clear the draft so a refresh doesn't re-resume the finished flow.
              try { localStorage.removeItem(draftKey()); } catch { /* ignore */ }
              if (onComplete) {
                // Host (CoryHome) re-fetches onboarding state → swaps this inline
                // builder for the dashboard. Navigating to /portal/home alone is a
                // no-op here because the builder IS rendered at /portal/home.
                onComplete();
              } else {
                navigate('/portal/home');
              }
            }}>
              View your system <i className="bi bi-arrow-right ms-1"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
