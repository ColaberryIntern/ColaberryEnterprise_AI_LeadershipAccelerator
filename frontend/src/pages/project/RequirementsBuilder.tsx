/**
 * RequirementsBuilder — AI-guided requirements generation
 *
 * 3 phases:
 * 1. Expansion Questions — Cory asks about desired capabilities
 * 2. Generation — Multi-pass AI generation with progress
 * 3. Review + Save — Preview and inject into project
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

const EXPANSION_QUESTIONS: Array<{ text: string; category: string }> = [
  { text: 'Predict user behavior based on historical data?', category: 'Intelligence' },
  { text: 'Trigger automated workflows when conditions are met?', category: 'Automation' },
  { text: 'Integrate with external APIs or third-party services?', category: 'Integration' },
  { text: 'Make autonomous decisions without human approval?', category: 'Autonomy' },
  { text: 'Detect anomalies or unusual patterns in real-time?', category: 'Monitoring' },
  { text: 'Generate reports and dashboards automatically?', category: 'Reporting' },
  { text: 'Handle user authentication and role-based access?', category: 'Security' },
  { text: 'Process and store large volumes of data?', category: 'Data' },
  { text: 'Send automated notifications (email, SMS, push)?', category: 'Communication' },
  { text: 'Support multiple user types with different interfaces?', category: 'UX' },
  { text: 'Track and manage a sales or conversion pipeline?', category: 'Revenue' },
  { text: 'Provide self-service customer support capabilities?', category: 'Support' },
];

const STAGE_LABELS: Record<string, { label: string; percent: number }> = {
  questions: { label: 'Gathering Requirements', percent: 10 },
  generating: { label: 'Starting Generation', percent: 25 },
  outline: { label: 'Creating Document Outline', percent: 35 },
  sections: { label: 'Expanding Sections', percent: 55 },
  refinement: { label: 'Refining & Polishing', percent: 75 },
  saving: { label: 'Saving to Project', percent: 90 },
  complete: { label: 'Complete!', percent: 100 },
};

export default function RequirementsBuilder() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'questions' | 'generating' | 'review' | 'complete'>('questions');
  const [questions, setQuestions] = useState<Question[]>(
    EXPANSION_QUESTIONS.map(q => ({ ...q, answer: null }))
  );
  const [currentQ, setCurrentQ] = useState(0);
  const [modifyText, setModifyText] = useState('');
  const [showModify, setShowModify] = useState(false);

  // Generation state
  const [stage, setStage] = useState('questions');
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
        if (state.questions) setQuestions(state.questions);
        if (state.currentQ) setCurrentQ(state.currentQ);
        if (state.phase) setPhase(state.phase);
        if (state.generatedDoc) setGeneratedDoc(state.generatedDoc);
      }
    } catch {}
  }, []);

  // Save state on changes
  useEffect(() => {
    try {
      localStorage.setItem('requirements_builder_state', JSON.stringify({ questions, currentQ, phase, generatedDoc }));
    } catch {}
  }, [questions, currentQ, phase, generatedDoc]);

  // Answer a question
  const handleAnswer = (answer: 'yes' | 'no' | 'modify') => {
    if (answer === 'modify') {
      setShowModify(true);
      return;
    }
    const updated = [...questions];
    updated[currentQ] = { ...updated[currentQ], answer };
    setQuestions(updated);
    setShowModify(false);
    setModifyText('');

    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setProgress(5 + Math.round(((currentQ + 1) / questions.length) * 15));
    }
  };

  const handleModifySubmit = () => {
    const updated = [...questions];
    updated[currentQ] = { ...updated[currentQ], answer: 'modify', modification: modifyText };
    setQuestions(updated);
    setShowModify(false);
    setModifyText('');
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
    }
  };

  // Start generation
  const handleGenerate = async () => {
    setPhase('generating');
    setStage('generating');
    setProgress(25);
    setProgressMsg('Building capability graph from your answers...');
    setError(null);

    try {
      // Build capability context from answers
      const capabilities = questions
        .filter(q => q.answer === 'yes' || q.answer === 'modify')
        .map(q => ({
          category: q.category,
          description: q.answer === 'modify' ? q.modification : q.text,
          priority: q.answer === 'yes' ? 'high' : 'medium',
        }));

      const capabilityContext = capabilities.map(c => `- [${c.category}] ${c.description} (${c.priority} priority)`).join('\n');

      // Call existing requirements generation endpoint
      const res = await portalApi.post('/api/portal/project/requirements/generate', {
        mode: 'professional',
        additional_context: `The user wants the following capabilities:\n${capabilityContext}\n\nGenerate comprehensive requirements covering all of these capabilities.`,
      });

      const jid = res.data.job_id;
      setJobId(jid);

      // Poll for progress
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await portalApi.get(`/api/portal/project/requirements/job/${jid}`);
          const s = statusRes.data;

          if (s.status === 'completed') {
            clearInterval(pollRef.current);
            setProgress(90);
            setStage('saving');
            setProgressMsg('Generation complete! Preparing your document...');
            setGeneratedDoc(s.result?.content || s.result?.document || '');
            setPhase('review');
            setProgress(95);
          } else if (s.status === 'failed') {
            clearInterval(pollRef.current);
            setError(s.error || 'Generation failed');
            setPhase('questions');
          } else {
            // Update progress based on status
            const pct = s.progress || (s.batch && s.total_batches ? Math.round((s.batch / s.total_batches) * 50) + 30 : 35);
            setProgress(Math.min(pct, 89));
            setProgressMsg(s.message || 'Generating requirements...');
            if (pct < 40) setStage('outline');
            else if (pct < 65) setStage('sections');
            else setStage('refinement');
          }
        } catch { /* continue polling */ }
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start generation');
      setPhase('questions');
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Save generated doc to project
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await portalApi.post('/api/portal/project/setup/requirements', { content: generatedDoc });
      setPhase('complete');
      setProgress(100);
      setStage('complete');
      localStorage.removeItem('requirements_builder_state');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save requirements');
    } finally {
      setSaving(false);
    }
  };

  const answeredCount = questions.filter(q => q.answer !== null).length;
  const stageInfo = STAGE_LABELS[stage] || STAGE_LABELS.questions;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div className="d-flex align-items-center gap-3">
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-robot" style={{ fontSize: 22, color: '#fff' }}></i>
          </div>
          <div>
            <h4 className="fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>Build Your Requirements</h4>
            <span className="text-muted" style={{ fontSize: 12 }}>Cory will help design your system requirements</span>
          </div>
        </div>
        <Link to="/portal/project/blueprint" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }}>
          <i className="bi bi-arrow-left me-1"></i>Back to Setup
        </Link>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="d-flex justify-content-between mb-1">
          <span className="fw-medium" style={{ fontSize: 12, color: 'var(--color-primary)' }}>{stageInfo.label}</span>
          <span className="fw-semibold" style={{ fontSize: 12, color: progress === 100 ? '#059669' : '#3b82f6' }}>{progress}%</span>
        </div>
        <div className="progress" style={{ height: 8, borderRadius: 6 }}>
          <div className="progress-bar" style={{
            width: `${progress}%`,
            background: progress === 100 ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            borderRadius: 6,
            transition: 'width 0.5s ease',
          }}></div>
        </div>
        {progressMsg && <div className="text-muted mt-1" style={{ fontSize: 11 }}>{progressMsg}</div>}
      </div>

      {/* Phase: Questions */}
      {phase === 'questions' && (
        <div>
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <div className="d-flex align-items-center gap-2 mb-3">
                <i className="bi bi-robot" style={{ color: '#3b82f6', fontSize: 16 }}></i>
                <span className="fw-semibold" style={{ fontSize: 13, color: 'var(--color-primary)' }}>
                  Would you like your system to be able to...
                </span>
              </div>

              <div className="mb-3" style={{ fontSize: 10, color: '#64748b' }}>
                Question {currentQ + 1} of {questions.length} · {answeredCount} answered
              </div>

              {/* Current question */}
              <div className="p-3 mb-3" style={{ background: '#f0f4ff', borderRadius: 10, borderLeft: '3px solid #3b82f6' }}>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span className="badge" style={{ background: '#3b82f620', color: '#3b82f6', fontSize: 9 }}>{questions[currentQ].category}</span>
                </div>
                <h6 className="fw-bold mb-0" style={{ fontSize: 15 }}>{questions[currentQ].text}</h6>
              </div>

              {/* Answer buttons */}
              {!showModify ? (
                <div className="d-flex gap-2">
                  <button className="btn btn-sm" style={{ background: '#10b981', color: '#fff', fontWeight: 600, fontSize: 12, padding: '8px 20px', borderRadius: 8 }} onClick={() => handleAnswer('yes')}>
                    <i className="bi bi-check-lg me-1"></i>Yes
                  </button>
                  <button className="btn btn-sm" style={{ background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 12, padding: '8px 20px', borderRadius: 8 }} onClick={() => handleAnswer('no')}>
                    <i className="bi bi-x-lg me-1"></i>No
                  </button>
                  <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8 }} onClick={() => handleAnswer('modify')}>
                    <i className="bi bi-pencil me-1"></i>Yes, but modified...
                  </button>
                </div>
              ) : (
                <div>
                  <textarea
                    className="form-control form-control-sm mb-2"
                    rows={2}
                    placeholder="Describe how you'd modify this capability..."
                    value={modifyText}
                    onChange={e => setModifyText(e.target.value)}
                    style={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <div className="d-flex gap-2">
                    <button className="btn btn-sm btn-primary" style={{ fontSize: 11, borderRadius: 6 }} onClick={handleModifySubmit} disabled={!modifyText.trim()}>Save Modification</button>
                    <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11, borderRadius: 6 }} onClick={() => setShowModify(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Skip / Previous navigation */}
              <div className="d-flex justify-content-between mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 10 }} disabled={currentQ === 0} onClick={() => setCurrentQ(currentQ - 1)}>
                  <i className="bi bi-arrow-left me-1"></i>Previous
                </button>
                <button className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 10 }} onClick={() => { handleAnswer('no'); }}>
                  Skip <i className="bi bi-arrow-right ms-1"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Answered summary */}
          {answeredCount > 0 && (
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-3">
                <div className="fw-semibold small mb-2">Your Capabilities ({questions.filter(q => q.answer === 'yes' || q.answer === 'modify').length} selected)</div>
                <div className="d-flex flex-wrap gap-1">
                  {questions.filter(q => q.answer === 'yes' || q.answer === 'modify').map((q, i) => (
                    <span key={i} className="badge" style={{ background: '#10b98120', color: '#059669', fontSize: 9 }}>
                      <i className="bi bi-check me-1"></i>{q.category}
                    </span>
                  ))}
                  {questions.filter(q => q.answer === 'no').map((q, i) => (
                    <span key={i} className="badge" style={{ background: '#e2e8f020', color: '#94a3b8', fontSize: 9, textDecoration: 'line-through' }}>
                      {q.category}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Generate button */}
          {answeredCount >= 5 && (
            <button className="btn w-100 py-3" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontWeight: 600, fontSize: 14, borderRadius: 12, border: 'none' }} onClick={handleGenerate}>
              <i className="bi bi-lightning-charge me-2"></i>Generate My Requirements ({questions.filter(q => q.answer === 'yes' || q.answer === 'modify').length} capabilities)
            </button>
          )}

          {error && <div className="alert alert-danger small mt-3"><i className="bi bi-exclamation-triangle me-1"></i>{error}</div>}
        </div>
      )}

      {/* Phase: Generating */}
      {phase === 'generating' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4 text-center">
            <div className="spinner-border text-primary mb-3" style={{ width: 48, height: 48 }}></div>
            <h5 className="fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>Generating Your Requirements</h5>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>{progressMsg || 'This takes a few minutes — building a comprehensive specification...'}</p>
            {error && <div className="alert alert-danger small mt-3"><i className="bi bi-exclamation-triangle me-1"></i>{error}</div>}
          </div>
        </div>
      )}

      {/* Phase: Review */}
      {phase === 'review' && (
        <div>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body p-4">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h5 className="fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
                  <i className="bi bi-file-earmark-text me-2"></i>Your Requirements Document
                </h5>
                <span className="badge bg-success" style={{ fontSize: 10 }}>{generatedDoc.split(/\s+/).length.toLocaleString()} words</span>
              </div>
              <div className="p-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 8, maxHeight: 400, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {generatedDoc || 'No content generated'}
              </div>
            </div>
          </div>

          <div className="d-flex gap-2">
            <button className="btn flex-grow-1 py-3" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontWeight: 600, fontSize: 14, borderRadius: 12, border: 'none' }} onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</> : <><i className="bi bi-check-circle me-2"></i>Save & Continue Setup</>}
            </button>
            <button className="btn btn-outline-secondary py-3" style={{ borderRadius: 12, fontSize: 12 }} onClick={() => { setPhase('questions'); setCurrentQ(0); }}>
              <i className="bi bi-arrow-counterclockwise me-1"></i>Start Over
            </button>
          </div>

          {error && <div className="alert alert-danger small mt-3"><i className="bi bi-exclamation-triangle me-1"></i>{error}</div>}
        </div>
      )}

      {/* Phase: Complete */}
      {phase === 'complete' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4 text-center">
            <i className="bi bi-check-circle-fill d-block mb-3" style={{ fontSize: 48, color: '#10b981' }}></i>
            <h5 className="fw-bold mb-2" style={{ color: '#059669' }}>Requirements Saved!</h5>
            <p className="text-muted mb-3" style={{ fontSize: 13 }}>Your AI-generated requirements have been saved to your project. Continue setup to activate.</p>
            <button className="btn btn-primary" style={{ borderRadius: 10, fontWeight: 600 }} onClick={() => navigate('/portal/project/blueprint')}>
              <i className="bi bi-arrow-right me-2"></i>Continue Setup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
