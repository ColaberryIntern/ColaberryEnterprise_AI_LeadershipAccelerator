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
import { Link, useNavigate } from 'react-router-dom';
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

// Fallback questions if AI generation fails
const FALLBACK_QUESTIONS: Array<{ text: string; category: string }> = [
  { text: 'predict user behavior based on historical data?', category: 'Intelligence' },
  { text: 'trigger automated workflows when conditions are met?', category: 'Automation' },
  { text: 'integrate with external APIs or third-party services?', category: 'Integration' },
  { text: 'make autonomous decisions without human approval?', category: 'Autonomy' },
  { text: 'detect anomalies or unusual patterns in real-time?', category: 'Monitoring' },
  { text: 'generate reports and dashboards automatically?', category: 'Reporting' },
  { text: 'handle user authentication and role-based access?', category: 'Security' },
  { text: 'process and store large volumes of data?', category: 'Data' },
  { text: 'send automated notifications (email, SMS, push)?', category: 'Communication' },
  { text: 'support multiple user types with different interfaces?', category: 'UX' },
];

export default function RequirementsBuilder() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'idea' | 'loading_questions' | 'questions' | 'generating' | 'review' | 'complete'>('idea');
  const [originalIdea, setOriginalIdea] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [modifyText, setModifyText] = useState('');
  const [showModify, setShowModify] = useState(false);

  // Generation state
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
        if (state.originalIdea) setOriginalIdea(state.originalIdea);
        if (state.questions?.length > 0) setQuestions(state.questions);
        if (state.currentQ) setCurrentQ(state.currentQ);
        // Only restore phase if idea was captured (prevents skipping idea-first flow)
        if (state.originalIdea && state.phase && state.phase !== 'loading_questions') setPhase(state.phase);
        else if (!state.originalIdea) { /* stay at 'idea' phase */ }
        if (state.generatedDoc) setGeneratedDoc(state.generatedDoc);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('requirements_builder_state', JSON.stringify({ originalIdea, questions, currentQ, phase, generatedDoc }));
    } catch {}
  }, [originalIdea, questions, currentQ, phase, generatedDoc]);

  // Submit idea and generate dynamic questions
  const handleIdeaSubmit = async () => {
    if (originalIdea.trim().length < 30) return;
    setPhase('loading_questions');
    setStage('loading_questions');
    setProgress(10);
    setError(null);

    try {
      // Use dedicated expansion endpoint — generates idea-specific questions via LLM
      const res = await portalApi.post('/api/portal/project/requirements/expand-questions', { idea: originalIdea.trim() });
      const aiQuestions = res.data.questions || [];
      const finalQuestions = aiQuestions.length >= 5 ? aiQuestions.slice(0, 12) : FALLBACK_QUESTIONS;
      setQuestions(finalQuestions.map((q: any) => ({ text: q.text, category: q.category, answer: null })));
      setPhase('questions');
      setStage('questions');
      setProgress(15);
    } catch {
      // Fallback to static questions
      setQuestions(FALLBACK_QUESTIONS.map(q => ({ ...q, answer: null })));
      setPhase('questions');
      setStage('questions');
      setProgress(15);
    }
  };

  // Answer a question
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

  // Start generation
  const handleGenerate = async () => {
    setPhase('generating');
    setStage('generating');
    setProgress(40);
    setProgressMsg('Building your requirements specification...');
    setError(null);

    const capabilities = questions
      .filter(q => q.answer === 'yes' || q.answer === 'modify')
      .map(q => ({ category: q.category, description: q.answer === 'modify' ? q.modification : q.text, priority: q.answer === 'yes' ? 'high' : 'medium' }));

    const capabilityContext = capabilities.map(c => `- [${c.category}] ${c.description} (${c.priority} priority)`).join('\n');

    try {
      const res = await portalApi.post('/api/portal/project/requirements/generate', {
        mode: 'professional',
        additional_context: `ORIGINAL IDEA:\n${originalIdea}\n\nDESIRED CAPABILITIES:\n${capabilityContext}\n\nGenerate comprehensive requirements covering the original idea and all selected capabilities.`,
      });
      const jid = res.data.job_id;
      setJobId(jid);

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await portalApi.get(`/api/portal/project/requirements/job/${jid}`);
          const s = statusRes.data;
          if (s.status === 'completed') {
            clearInterval(pollRef.current);
            setGeneratedDoc(s.result?.content || s.result?.document || '');
            setPhase('review');
            setStage('review');
            setProgress(90);
          } else if (s.status === 'failed') {
            clearInterval(pollRef.current);
            setError(s.error || 'Generation failed');
            setPhase('questions');
          } else {
            const pct = s.progress || (s.batch && s.total_batches ? Math.round((s.batch / s.total_batches) * 40) + 45 : 50);
            setProgress(Math.min(pct, 89));
            setProgressMsg(s.message || 'Generating requirements...');
            if (pct < 55) setStage('outline');
            else if (pct < 75) setStage('sections');
            else setStage('refinement');
          }
        } catch {}
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start generation');
      setPhase('questions');
    }
  };

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  // Save
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await portalApi.post('/api/portal/project/setup/requirements', { content: generatedDoc });
      setPhase('complete');
      setStage('complete');
      setProgress(100);
      localStorage.removeItem('requirements_builder_state');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  const answeredCount = questions.filter(q => q.answer !== null).length;
  const selectedCount = questions.filter(q => q.answer === 'yes' || q.answer === 'modify').length;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div className="d-flex align-items-center gap-3">
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-robot" style={{ fontSize: 22, color: '#fff' }}></i>
          </div>
          <div>
            <h4 className="fw-bold mb-0" style={{ color: 'var(--color-primary)', fontSize: 18 }}>Build Your Requirements</h4>
            <span className="text-muted" style={{ fontSize: 11 }}>Cory will design your system specification</span>
          </div>
        </div>
        <Link to="/portal/project/blueprint" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10, borderRadius: 6 }}>
          <i className="bi bi-arrow-left me-1"></i>Back
        </Link>
      </div>

      {/* Progress Bar */}
      {phase !== 'idea' && (
        <div className="mb-4">
          <div className="d-flex justify-content-between mb-1">
            <span className="fw-medium" style={{ fontSize: 11, color: 'var(--color-primary)' }}>{STAGE_LABELS[stage] || ''}</span>
            <span className="fw-semibold" style={{ fontSize: 11, color: progress === 100 ? '#059669' : '#3b82f6' }}>{progress}%</span>
          </div>
          <div className="progress" style={{ height: 6, borderRadius: 6 }}>
            <div className="progress-bar" style={{ width: `${progress}%`, background: progress === 100 ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: 6, transition: 'width 0.5s ease' }}></div>
          </div>
          {progressMsg && phase === 'generating' && <div className="text-muted mt-1" style={{ fontSize: 10 }}>{progressMsg}</div>}
        </div>
      )}

      {/* PHASE: Idea Capture */}
      {phase === 'idea' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h5 className="fw-bold mb-2" style={{ color: 'var(--color-text)', fontSize: 18 }}>
              What are you looking to build?
            </h5>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>
              Describe your idea in as much detail as possible. The more you share, the better we can design your system.
            </p>
            <textarea
              className="form-control mb-3"
              rows={6}
              placeholder="Example: I want to build a platform that tracks website visitors, identifies high-value leads, and automatically sends personalized follow-up emails based on their behavior..."
              value={originalIdea}
              onChange={e => setOriginalIdea(e.target.value)}
              style={{ fontSize: 13, borderRadius: 10, lineHeight: 1.6 }}
            />
            <div className="d-flex justify-content-between align-items-center">
              <span className="text-muted" style={{ fontSize: 10 }}>
                {originalIdea.length < 30 ? `${30 - originalIdea.length} more characters needed` : <><i className="bi bi-check-circle text-success me-1"></i>Ready</>}
              </span>
              <button
                className="btn"
                style={{
                  background: originalIdea.trim().length >= 30 ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : '#e2e8f0',
                  color: originalIdea.trim().length >= 30 ? '#fff' : '#9ca3af',
                  fontWeight: 600, fontSize: 14, borderRadius: 10, border: 'none', padding: '10px 24px',
                  cursor: originalIdea.trim().length >= 30 ? 'pointer' : 'not-allowed',
                }}
                onClick={handleIdeaSubmit}
                disabled={originalIdea.trim().length < 30}
              >
                Continue <i className="bi bi-arrow-right ms-1"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE: Loading questions */}
      {phase === 'loading_questions' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4 text-center">
            <div className="spinner-border text-primary mb-3" style={{ width: 40, height: 40 }}></div>
            <h6 className="fw-bold mb-1">Analyzing your idea...</h6>
            <p className="text-muted mb-0" style={{ fontSize: 12 }}>Cory is designing questions specific to your project</p>
          </div>
        </div>
      )}

      {/* PHASE: Questions */}
      {phase === 'questions' && questions.length > 0 && (
        <div>
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              {/* Idea summary */}
              <div className="p-2 mb-3" style={{ background: '#f0f4ff', borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
                <div className="fw-medium" style={{ fontSize: 10, color: '#3b82f6' }}>Your idea</div>
                <div style={{ fontSize: 11, color: '#475569' }}>{originalIdea.length > 120 ? originalIdea.substring(0, 120) + '...' : originalIdea}</div>
              </div>

              <div className="mb-3" style={{ fontSize: 10, color: '#64748b' }}>
                Question {currentQ + 1} of {questions.length} · {answeredCount} answered
              </div>

              {/* Current question */}
              <div className="mb-4">
                <div className="fw-medium mb-1" style={{ fontSize: 12, color: '#3b82f6' }}>
                  Based on your idea, would you like your system to be able to...
                </div>
                <h5 className="fw-bold mb-0" style={{ fontSize: 17, color: 'var(--color-text)' }}>
                  {questions[currentQ].text}
                </h5>
                <span className="badge mt-2" style={{ background: '#3b82f620', color: '#3b82f6', fontSize: 9 }}>{questions[currentQ].category}</span>
              </div>

              {/* Answer buttons — BIG */}
              {!showModify ? (
                <div className="d-flex gap-3">
                  <button className="btn flex-grow-1 py-3" style={{ background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 16, borderRadius: 12, border: 'none' }} onClick={() => handleAnswer('yes')}>
                    <i className="bi bi-check-lg me-2"></i>Yes
                  </button>
                  <button className="btn flex-grow-1 py-3" style={{ background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 16, borderRadius: 12, border: 'none' }} onClick={() => handleAnswer('no')}>
                    <i className="bi bi-x-lg me-2"></i>No
                  </button>
                </div>
              ) : (
                <div>
                  <textarea className="form-control mb-2" rows={2} placeholder="How would you modify this?" value={modifyText} onChange={e => setModifyText(e.target.value)} style={{ fontSize: 12, borderRadius: 8 }} />
                  <div className="d-flex gap-2">
                    <button className="btn btn-primary btn-sm" style={{ borderRadius: 6 }} onClick={handleModifySubmit} disabled={!modifyText.trim()}>Save</button>
                    <button className="btn btn-outline-secondary btn-sm" style={{ borderRadius: 6 }} onClick={() => setShowModify(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {!showModify && (
                <button className="btn btn-link text-muted p-0 mt-2" style={{ fontSize: 11 }} onClick={() => handleAnswer('modify')}>
                  <i className="bi bi-pencil me-1"></i>Yes, but modified...
                </button>
              )}

              {/* Navigation */}
              <div className="d-flex justify-content-between mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 10 }} disabled={currentQ === 0} onClick={() => setCurrentQ(currentQ - 1)}>
                  <i className="bi bi-arrow-left me-1"></i>Previous
                </button>
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 10 }} onClick={() => handleAnswer('no')}>
                  Skip <i className="bi bi-arrow-right ms-1"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Selected capabilities */}
          {selectedCount > 0 && (
            <div className="d-flex flex-wrap gap-1 mb-3">
              {questions.filter(q => q.answer === 'yes' || q.answer === 'modify').map((q, i) => (
                <span key={i} className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 9 }}><i className="bi bi-check me-1"></i>{q.category}</span>
              ))}
            </div>
          )}

          {/* Generate button */}
          {answeredCount >= 5 && (
            <button className="btn w-100 py-3" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 12, border: 'none', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)' }} onClick={handleGenerate}>
              <i className="bi bi-lightning-charge-fill me-2"></i>Generate My Requirements ({selectedCount} capabilities)
            </button>
          )}

          {error && <div className="alert alert-danger small mt-3"><i className="bi bi-exclamation-triangle me-1"></i>{error}</div>}
        </div>
      )}

      {/* PHASE: Generating */}
      {phase === 'generating' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-5 text-center">
            <div className="spinner-border text-primary mb-3" style={{ width: 48, height: 48 }}></div>
            <h5 className="fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>Generating Your Requirements</h5>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>{progressMsg || 'This takes a few minutes...'}</p>
          </div>
        </div>
      )}

      {/* PHASE: Review */}
      {phase === 'review' && (
        <div>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body p-4">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h5 className="fw-bold mb-0" style={{ color: 'var(--color-primary)', fontSize: 16 }}>
                  <i className="bi bi-file-earmark-check me-2" style={{ color: '#10b981' }}></i>Your Requirements Are Ready
                </h5>
                <span className="badge bg-success" style={{ fontSize: 10 }}>{generatedDoc.split(/\s+/).length.toLocaleString()} words</span>
              </div>
              <div className="p-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 8, maxHeight: 350, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {generatedDoc || 'No content generated'}
              </div>
            </div>
          </div>
          {error && <div className="alert alert-danger small mb-3"><i className="bi bi-exclamation-triangle me-1"></i>{error}</div>}
          <button className="btn w-100 py-3" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 12, border: 'none' }} onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</> : <><i className="bi bi-check-circle me-2"></i>Save & Continue Setup</>}
          </button>
        </div>
      )}

      {/* PHASE: Complete */}
      {phase === 'complete' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-5 text-center">
            <i className="bi bi-check-circle-fill d-block mb-3" style={{ fontSize: 48, color: '#10b981' }}></i>
            <h4 className="fw-bold mb-2" style={{ color: '#059669' }}>Requirements Saved!</h4>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>Continue setup to connect your repository and activate your project.</p>
            <button className="btn btn-primary" style={{ borderRadius: 10, fontWeight: 600, padding: '10px 24px' }} onClick={() => navigate('/portal/project/blueprint')}>
              <i className="bi bi-arrow-right me-2"></i>Continue Setup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
