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

export default function RequirementsBuilder() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'idea' | 'loading_questions' | 'questions' | 'generating' | 'review' | 'complete'>('idea');
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

  // Resume support
  useEffect(() => {
    try {
      const saved = localStorage.getItem('requirements_builder_state');
      if (saved) {
        const state = JSON.parse(saved);
        const hasIdea = state.originalIdea && state.originalIdea.trim().length > 0;
        const hasDoc = state.generatedDoc && state.generatedDoc.trim().length > 10;
        const validPhase = state.phase && !['loading_questions', 'generating'].includes(state.phase);
        const phaseNeedsDoc = state.phase === 'review' || state.phase === 'complete';
        if (hasIdea) setOriginalIdea(state.originalIdea);
        if (state.questions?.length > 0 && hasIdea) setQuestions(state.questions);
        if (state.currentQ && hasIdea) setCurrentQ(state.currentQ);
        if (hasIdea && validPhase && !(phaseNeedsDoc && !hasDoc)) setPhase(state.phase);
        if (hasDoc) setGeneratedDoc(state.generatedDoc);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('requirements_builder_state', JSON.stringify({ originalIdea, questions, currentQ, phase, generatedDoc })); } catch {}
  }, [originalIdea, questions, currentQ, phase, generatedDoc]);

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
        additional_context: `ORIGINAL IDEA:\n${originalIdea}\n\nDESIRED CAPABILITIES:\n${capText}\n\nGenerate comprehensive requirements covering the original idea and all selected capabilities.`,
      });
      const jid = res.data.job_id;
      setJobId(jid);

      pollRef.current = setInterval(async () => {
        try {
          const s = (await portalApi.get(`/api/portal/project/requirements/job/${jid}`)).data;
          if (s.status === 'completed') {
            clearInterval(pollRef.current);
            setGeneratedDoc(s.result?.content || s.result?.document || '');
            setPhase('review');
            setStage('review');
            setProgress(92);
          } else if (s.status === 'failed') {
            clearInterval(pollRef.current);
            setError(s.error || 'Generation failed');
            setPhase('questions');
          } else {
            const pct = s.progress || 50;
            setProgress(Math.min(pct, 89));
            setProgressMsg(s.message || 'Generating requirements...');
            setStage(pct < 55 ? 'outline' : pct < 75 ? 'sections' : 'refinement');
          }
        } catch {}
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
      setPhase('complete');
      setStage('complete');
      setProgress(100);
      localStorage.removeItem('requirements_builder_state');
    } catch (err: any) { setError(err.response?.data?.error || 'Failed to save'); }
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
        <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }} onClick={() => navigate('/portal/project/blueprint')}>
          <i className="bi bi-arrow-left me-1"></i>Back
        </button>
      </div>

      {/* Progress */}
      {phase !== 'idea' && (
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

          {/* Generate */}
          {answeredCount >= 5 && (
            <button className="btn w-100 py-3" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 10, border: 'none' }} onClick={handleGenerate}>
              <i className="bi bi-lightning-charge-fill me-2"></i>Generate My Requirements ({selectedCount} capabilities)
            </button>
          )}

          {error && <div className="alert alert-danger small mt-3">{error}</div>}
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

      {/* COMPLETE */}
      {phase === 'complete' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-5 text-center">
            <i className="bi bi-check-circle-fill d-block mb-3" style={{ fontSize: 44, color: '#10b981' }}></i>
            <h5 className="fw-bold mb-2" style={{ color: '#059669', fontSize: 16 }}>Requirements Saved!</h5>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>Continue setup to connect your repository and activate.</p>
            <button className="btn btn-primary" style={{ borderRadius: 8, fontWeight: 600, fontSize: 13 }} onClick={() => navigate('/portal/project/blueprint')}>
              Continue Setup <i className="bi bi-arrow-right ms-1"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
