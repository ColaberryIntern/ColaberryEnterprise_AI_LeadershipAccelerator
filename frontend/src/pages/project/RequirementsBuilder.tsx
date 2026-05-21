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

interface Question {
  text: string;
  category: string;
  answer: 'yes' | 'no' | 'modify' | null;
  modification?: string;
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

// Scope the in-progress draft to the signed-in enrollment, so a draft from one
// account never resumes on another (cross-account bleed was dropping users onto
// a pre-filled idea screen and skipping the chooser).
function draftKey(): string {
  try {
    const t = localStorage.getItem('participant_token') || '';
    const payload = JSON.parse(atob(t.split('.')[1] || ''));
    if (payload && payload.sub) return `requirements_builder_state:${payload.sub}`;
  } catch { /* fall through */ }
  return 'requirements_builder_state';
}

export default function RequirementsBuilder() {
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
      const aiQuestions = (res.data.questions || []).filter((q: any) => q.text && q.category && q.text.length > 10);
      if (aiQuestions.length < 5) throw new Error('Not enough questions generated');
      setQuestions(aiQuestions.slice(0, 12).map((q: any) => ({ text: q.text, category: q.category, answer: null })));
      setPhase('questions');
      setStage('questions');
      setProgress(15);
    } catch (err: any) {
      // Retry once instead of falling back to generic
      try {
        const res2 = await portalApi.post('/api/portal/project/requirements/expand-questions', { idea: originalIdea.trim() });
        const q2 = (res2.data.questions || []).filter((q: any) => q.text && q.category);
        if (q2.length >= 3) {
          setQuestions(q2.slice(0, 12).map((q: any) => ({ text: q.text, category: q.category, answer: null })));
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
      // Fold the questionnaire answers into the idea so the Architect actually
      // uses them (previously it built from the bare idea alone).
      const capabilities = questions
        .filter(q => q.answer === 'yes' || q.answer === 'modify')
        .map(q => `- [${q.category}] ${q.answer === 'modify' ? (q.modification || q.text) : q.text}`);
      const enrichedIdea = capabilities.length
        ? `${originalIdea.trim()}\n\nDESIRED CAPABILITIES (from the user's answers):\n${capabilities.join('\n')}`
        : originalIdea.trim();
      const projectName = originalIdea.trim().split('\n')[0].slice(0, 60);
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

  const handleAnswer = (answer: 'yes' | 'no' | 'modify') => {
    if (answer === 'modify') { setShowModify(true); return; }
    const updated = [...questions];
    updated[currentQ] = { ...updated[currentQ], answer };
    setQuestions(updated);
    setShowModify(false);
    setModifyText('');
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setProgress(15 + Math.round(((currentQ + 1) / questions.length) * 25));
    }
  };

  const handleModifySubmit = () => {
    const updated = [...questions];
    updated[currentQ] = { ...updated[currentQ], answer: 'modify', modification: modifyText };
    setQuestions(updated);
    setShowModify(false);
    setModifyText('');
    if (currentQ < questions.length - 1) setCurrentQ(currentQ + 1);
  };

  const handleGenerate = async () => {
    setPhase('generating');
    setStage('generating');
    setProgress(42);
    setProgressMsg('Building your requirements specification...');
    setError(null);

    const capabilities = questions
      .filter(q => q.answer === 'yes' || q.answer === 'modify')
      .map(q => ({ category: q.category, description: q.answer === 'modify' ? q.modification : q.text }));
    const capText = capabilities.map(c => `- [${c.category}] ${c.description}`).join('\n');

    try {
      const res = await portalApi.post('/api/portal/project/requirements/generate', {
        mode: 'professional',
        user_prompt: `ORIGINAL IDEA:\n${originalIdea}\n\nDESIRED CAPABILITIES:\n${capText}\n\nGenerate comprehensive requirements covering the original idea and all selected capabilities. The requirements document should be at least 6000 words and cover functional requirements, non-functional requirements, system architecture, data models, API specifications, and user interface requirements.`,
      });
      const jid = res.data.job_id;
      if (!jid) { setError('No job ID returned — generation may not have started'); setPhase('questions'); return; }
      setJobId(jid);
      setProgressMsg('Job started — generating your requirements document...');

      let pollCount = 0;
      pollRef.current = setInterval(async () => {
        pollCount++;
        try {
          const s = (await portalApi.get(`/api/portal/project/requirements/job/${jid}`)).data;
          if (s.status === 'completed') {
            clearInterval(pollRef.current);
            const doc = s.result?.content || s.result?.document || s.result || '';
            setGeneratedDoc(typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2));
            setPhase('review');
            setStage('review');
            setProgress(92);
          } else if (s.status === 'failed') {
            clearInterval(pollRef.current);
            setError(s.error || 'Generation failed');
            setPhase('questions');
          } else {
            const pct = s.progress || Math.min(42 + pollCount * 3, 89);
            setProgress(pct);
            setProgressMsg(s.message || `Generating requirements... (${Math.round(pct)}%)`);
            setStage(pct < 55 ? 'outline' : pct < 75 ? 'sections' : 'refinement');
          }
        } catch (pollErr: any) {
          console.warn('[RequirementsBuilder] Poll error:', pollErr?.message);
        }
        // Timeout after 15 minutes (the 2-pass expand legitimately runs longer
        // than a single call; the backend bounds each LLM call to ~4 min).
        if (pollCount > 300) {
          clearInterval(pollRef.current);
          setError('Generation timed out. Please try again.');
          setPhase('questions');
        }
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start generation');
      setPhase('questions');
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

  const answeredCount = questions.filter(q => q.answer !== null).length;
  const selectedCount = questions.filter(q => q.answer === 'yes' || q.answer === 'modify').length;

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
                <div className="d-flex align-items-center gap-2"><i className="bi bi-buildings" style={{ color: '#3b82f6', fontSize: 18 }}></i><span className="fw-semibold" style={{ fontSize: 14 }}>A full project</span><span className="badge ms-auto" style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 10 }}>~15 min</span></div>
                <div className="text-muted mt-1" style={{ fontSize: 11.5 }}>The AI Project Architect designs the complete system. Explore a live preview of your AI agent org while it builds.</div>
              </button>
              <button className="btn text-start py-3" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, paddingLeft: 18, paddingRight: 18 }}
                onClick={() => { setBuildType('autonomous'); setPhase('idea'); setError(null); }}>
                <div className="d-flex align-items-center gap-2"><i className="bi bi-stars" style={{ color: '#8b5cf6', fontSize: 18 }}></i><span className="fw-semibold" style={{ fontSize: 14 }}>Fully autonomous</span><span className="badge ms-auto" style={{ background: '#f3e8ff', color: '#7c3aed', fontSize: 10 }}>deepest</span></div>
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

              {/* Question */}
              <p className="mb-1" style={{ fontSize: 12, color: '#3b82f6', fontWeight: 500 }}>
                Based on your idea, would you like your system to be able to...
              </p>
              <h6 className="fw-bold mb-1" style={{ fontSize: 16 }}>{questions[currentQ].text}</h6>
              <span className="badge mb-3" style={{ background: '#3b82f620', color: '#3b82f6', fontSize: 10 }}>{questions[currentQ].category}</span>

              {/* Answer buttons */}
              {!showModify ? (
                <div className="d-flex gap-3 mb-2">
                  <button className="btn flex-grow-1 py-3" style={{ background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 10, border: 'none' }} onClick={() => handleAnswer('yes')}>
                    <i className="bi bi-check-lg me-2"></i>Yes
                  </button>
                  <button className="btn flex-grow-1 py-3" style={{ background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 10, border: 'none' }} onClick={() => handleAnswer('no')}>
                    <i className="bi bi-x-lg me-2"></i>No
                  </button>
                </div>
              ) : (
                <div className="mb-2">
                  <textarea className="form-control mb-2" rows={2} placeholder="How would you modify this?" value={modifyText} onChange={e => setModifyText(e.target.value)} style={{ fontSize: 13, borderRadius: 8 }} />
                  <div className="d-flex gap-2">
                    <button className="btn btn-primary btn-sm" style={{ borderRadius: 6, fontSize: 12 }} onClick={handleModifySubmit} disabled={!modifyText.trim()}>Save</button>
                    <button className="btn btn-outline-secondary btn-sm" style={{ borderRadius: 6, fontSize: 12 }} onClick={() => setShowModify(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {!showModify && (
                <button className="btn btn-link text-muted p-0" style={{ fontSize: 11 }} onClick={() => handleAnswer('modify')}>
                  <i className="bi bi-pencil me-1"></i>Yes, but modified...
                </button>
              )}

              <div className="d-flex justify-content-between mt-3 pt-2" style={{ borderTop: '1px solid #f1f5f9' }}>
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 11 }} disabled={currentQ === 0} onClick={() => setCurrentQ(currentQ - 1)}>
                  <i className="bi bi-arrow-left me-1"></i>Previous
                </button>
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 11 }} onClick={() => handleAnswer('no')}>
                  Skip <i className="bi bi-arrow-right ms-1"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Selected badges */}
          {selectedCount > 0 && (
            <div className="d-flex flex-wrap gap-1 mb-3">
              {questions.filter(q => q.answer === 'yes' || q.answer === 'modify').map((q, i) => (
                <span key={i} className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 10 }}><i className="bi bi-check me-1"></i>{q.category}</span>
              ))}
            </div>
          )}

          {/* Generate (workflow) or continue to repo (full/autonomous) */}
          {answeredCount >= 5 && (
            <button className="btn w-100 py-3" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 10, border: 'none' }}
              onClick={buildType === 'workflow' ? handleGenerate : () => { setError(null); setPhase('repo'); }}>
              {buildType === 'workflow'
                ? <><i className="bi bi-lightning-charge-fill me-2"></i>Generate My Requirements ({selectedCount} capabilities)</>
                : <><i className="bi bi-arrow-right-circle me-2"></i>Continue — connect your repo ({selectedCount} capabilities)</>}
            </button>
          )}

          {error && <div className="alert alert-danger small mt-3">{error}</div>}
        </div>
      )}

      {/* CONNECT REPO (full / autonomous) */}
      {phase === 'repo' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-1" style={{ fontSize: 16 }}>Connect your repository</h6>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>
              {buildType === 'autonomous' ? 'Cory will run its deepest build' : 'Cory will design your full system'} into this repo (~15 min). You'll watch a live preview of your AI agent organization while it builds.
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
                disabled={!repoUrl.trim() || startingBuild} onClick={handleFullBuild}>
                {startingBuild ? <><span className="spinner-border spinner-border-sm me-2"></span>Starting…</> : <>{buildType === 'autonomous' ? 'Start autonomous build' : 'Start full build'} <i className="bi bi-arrow-right ms-1"></i></>}
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
            <button className="btn btn-primary" style={{ borderRadius: 8, fontWeight: 600, fontSize: 13 }} onClick={() => navigate('/portal/project/blueprint')}>
              View your system <i className="bi bi-arrow-right ms-1"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
