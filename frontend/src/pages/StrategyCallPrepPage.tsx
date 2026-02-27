import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import api from '../utils/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CallInfo {
  id: string;
  name: string;
  email: string;
  company: string;
  scheduled_at: string;
  timezone: string;
}

interface IntelligenceData {
  primary_challenges: string[];
  ai_maturity_level: string;
  team_size: string;
  priority_use_case: string;
  timeline_urgency: string;
  current_tools: string[];
  budget_range: string;
  evaluating_consultants: boolean;
  previous_ai_investment: string;
  specific_questions: string;
  additional_context: string;
  uploaded_file_name: string | null;
  completion_score: number;
  status: string;
}

interface PrepOptions {
  challenges: string[];
  tools: string[];
  maturityLevels: string[];
  teamSizes: string[];
  timelines: string[];
  budgets: string[];
}

/* ------------------------------------------------------------------ */
/*  Client-side completion scoring (mirrors backend)                   */
/* ------------------------------------------------------------------ */

function computeScore(form: FormState, hasFile: boolean): number {
  let s = 0;
  if (form.primary_challenges.length > 0) s += 10;
  if (form.ai_maturity_level) s += 10;
  if (form.team_size) s += 10;
  if (form.priority_use_case.trim()) s += 10;
  if (form.timeline_urgency) s += 10;
  if (form.current_tools.length > 0) s += 10;
  if (hasFile) s += 20;
  if (form.budget_range.trim()) s += 5;
  if (form.evaluating_consultants !== undefined) s += 5;
  if (form.specific_questions.trim()) s += 5;
  if (form.additional_context.trim()) s += 5;
  return s;
}

/* ------------------------------------------------------------------ */
/*  Form state                                                         */
/* ------------------------------------------------------------------ */

interface FormState {
  primary_challenges: string[];
  ai_maturity_level: string;
  team_size: string;
  priority_use_case: string;
  timeline_urgency: string;
  current_tools: string[];
  budget_range: string;
  evaluating_consultants: boolean;
  previous_ai_investment: string;
  specific_questions: string;
  additional_context: string;
}

const INITIAL_FORM: FormState = {
  primary_challenges: [],
  ai_maturity_level: '',
  team_size: '',
  priority_use_case: '',
  timeline_urgency: '',
  current_tools: [],
  budget_range: '',
  evaluating_consultants: false,
  previous_ai_investment: '',
  specific_questions: '',
  additional_context: '',
};

/* ------------------------------------------------------------------ */
/*  Label helpers                                                      */
/* ------------------------------------------------------------------ */

const MATURITY_LABELS: Record<string, string> = {
  exploring: 'Exploring \u2014 researching possibilities',
  experimenting: 'Experimenting \u2014 running small tests',
  piloting: 'Piloting \u2014 active POCs underway',
  scaling: 'Scaling \u2014 expanding proven solutions',
  optimizing: 'Optimizing \u2014 mature AI operations',
};

const TEAM_LABELS: Record<string, string> = {
  '1-10': '1\u201310 employees',
  '11-50': '11\u201350 employees',
  '51-200': '51\u2013200 employees',
  '201-1000': '201\u20131,000 employees',
  '1000+': '1,000+ employees',
};

const TIMELINE_LABELS: Record<string, string> = {
  immediate: 'Immediate \u2014 within 30 days',
  '1-3_months': '1\u20133 months',
  '3-6_months': '3\u20136 months',
  '6-12_months': '6\u201312 months',
  no_timeline: 'No specific timeline',
};

const BUDGET_LABELS: Record<string, string> = {
  under_10k: 'Under $10K',
  '10k-50k': '$10K\u2013$50K',
  '50k-150k': '$50K\u2013$150K',
  '150k-500k': '$150K\u2013$500K',
  '500k+': '$500K+',
  not_defined: 'Not yet defined',
};

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export default function StrategyCallPrepPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  if (!token) return <StaticPrepContent />;

  return <DynamicPrepForm token={token} />;
}

/* ------------------------------------------------------------------ */
/*  Dynamic prep form (token provided)                                 */
/* ------------------------------------------------------------------ */

function DynamicPrepForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [callInfo, setCallInfo] = useState<CallInfo | null>(null);
  const [options, setOptions] = useState<PrepOptions | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [hasFile, setHasFile] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    api
      .get(`/api/strategy-prep/${token}`)
      .then((res) => {
        setCallInfo(res.data.call);
        setOptions(res.data.options);
        if (res.data.intelligence) {
          const intel = res.data.intelligence as IntelligenceData;
          setForm({
            primary_challenges: intel.primary_challenges || [],
            ai_maturity_level: intel.ai_maturity_level || '',
            team_size: intel.team_size || '',
            priority_use_case: intel.priority_use_case || '',
            timeline_urgency: intel.timeline_urgency || '',
            current_tools: intel.current_tools || [],
            budget_range: intel.budget_range || '',
            evaluating_consultants: intel.evaluating_consultants || false,
            previous_ai_investment: intel.previous_ai_investment || '',
            specific_questions: intel.specific_questions || '',
            additional_context: intel.additional_context || '',
          });
          setHasFile(!!intel.uploaded_file_name);
          setFileName(intel.uploaded_file_name || null);
          if (intel.status === 'submitted' || intel.status === 'synthesized') {
            setSubmitted(true);
          }
        }
      })
      .catch(() => setError('Unable to load your strategy call. Please check the link and try again.'))
      .finally(() => setLoading(false));
  }, [token]);

  const score = useMemo(() => computeScore(form, hasFile), [form, hasFile]);

  const toggleChallenge = useCallback((c: string) => {
    setForm((prev) => ({
      ...prev,
      primary_challenges: prev.primary_challenges.includes(c)
        ? prev.primary_challenges.filter((x) => x !== c)
        : [...prev.primary_challenges, c],
    }));
  }, []);

  const toggleTool = useCallback((t: string) => {
    setForm((prev) => ({
      ...prev,
      current_tools: prev.current_tools.includes(t)
        ? prev.current_tools.filter((x) => x !== t)
        : [...prev.current_tools, t],
    }));
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/rtf',
      'text/rtf',
      'text/plain',
      'text/markdown',
      'text/csv',
    ];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Accepted file types: PDF, Word, PowerPoint, Excel, RTF, Text, Markdown, CSV');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('File must be under 50MB.');
      return;
    }

    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/api/strategy-prep/${token}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setHasFile(true);
      setFileName(res.data.file_name);
    } catch (err: any) {
      setUploadError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [token]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (form.primary_challenges.length === 0) {
      setFormError('Please select at least one AI challenge.');
      return;
    }
    if (!form.ai_maturity_level) {
      setFormError('Please select your AI maturity level.');
      return;
    }
    if (!form.team_size) {
      setFormError('Please select your team size.');
      return;
    }
    if (!form.timeline_urgency) {
      setFormError('Please select a timeline.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/api/strategy-prep/${token}`, form);
      setSubmitted(true);
    } catch (err: any) {
      if (err.response?.status === 400 && err.response.data?.details) {
        setFormError(err.response.data.details.map((d: any) => d.message).join('. '));
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-5 text-center">
        <p className="text-danger mb-3">{error}</p>
        <Link to="/" className="btn btn-outline-primary btn-sm">
          Return to Homepage
        </Link>
      </div>
    );
  }

  if (submitted) {
    return <SuccessState callInfo={callInfo!} score={score} />;
  }

  return (
    <>
      <SEOHead
        title="Prepare for Your Strategy Call | Colaberry Enterprise AI"
        description="Complete your 5-minute prep form to maximize your executive AI strategy session."
      />

      {/* Hero */}
      <section
        className="text-light text-center"
        style={{
          background: 'linear-gradient(135deg, #0f1b2d 0%, #1a365d 50%, #1e3a5f 100%)',
          padding: '4rem 0 3rem',
        }}
      >
        <div className="container" style={{ maxWidth: '750px' }}>
          <h1 className="text-light mb-2" style={{ fontSize: '2rem' }}>
            Prepare for Your Strategy Call
          </h1>
          {callInfo && (
            <p className="mb-2" style={{ opacity: 0.85 }}>
              {callInfo.name} &mdash;{' '}
              {new Date(callInfo.scheduled_at).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                timeZone: callInfo.timezone,
              })}
            </p>
          )}
          <p className="small mb-0" style={{ opacity: 0.7 }}>
            Complete in 5 minutes &mdash; save 15 minutes during your call
          </p>
        </div>
      </section>

      {/* Progress Bar */}
      <section className="bg-white border-bottom py-3 sticky-top" style={{ zIndex: 10 }}>
        <div className="container" style={{ maxWidth: '750px' }}>
          <div className="d-flex align-items-center gap-3">
            <span className="small fw-semibold text-muted" style={{ minWidth: 80 }}>
              {score}% Ready
            </span>
            <div className="progress flex-grow-1" style={{ height: 8 }}>
              <div
                className={`progress-bar ${score >= 60 ? 'bg-success' : 'bg-primary'}`}
                role="progressbar"
                style={{ width: `${score}%`, transition: 'width 0.3s ease' }}
                aria-valuenow={score}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-3" style={{ background: 'var(--color-bg-alt)' }}>
        <div className="container">
          <div className="row text-center g-3" style={{ maxWidth: '750px', margin: '0 auto' }}>
            {[
              { stat: '42%', label: 'Shorter decision cycle' },
              { stat: '2x', label: 'More productive sessions' },
              { stat: 'Clearer', label: 'ROI alignment' },
            ].map((item) => (
              <div className="col-4" key={item.label}>
                <div className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: '1.2rem' }}>
                  {item.stat}
                </div>
                <div className="text-muted small">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="section">
        <div className="container" style={{ maxWidth: '750px' }}>
          {formError && (
            <div className="alert alert-danger py-2 mb-4" role="alert">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Section 1: AI Challenges */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h5 className="fw-semibold mb-1">Your AI Challenges</h5>
                <p className="text-muted small mb-3">
                  Select all that apply <span className="text-danger">*</span>
                </p>
                <div className="d-flex flex-wrap gap-2">
                  {(options?.challenges || []).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`btn btn-sm ${form.primary_challenges.includes(c) ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => toggleChallenge(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 2: Current State */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h5 className="fw-semibold mb-3">Current State</h5>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">
                      AI Maturity Level <span className="text-danger">*</span>
                    </label>
                    <select
                      className="form-select form-select-sm"
                      value={form.ai_maturity_level}
                      onChange={(e) => setForm((f) => ({ ...f, ai_maturity_level: e.target.value }))}
                    >
                      <option value="">Select...</option>
                      {(options?.maturityLevels || []).map((m) => (
                        <option key={m} value={m}>
                          {MATURITY_LABELS[m] || m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">
                      Team Size <span className="text-danger">*</span>
                    </label>
                    <select
                      className="form-select form-select-sm"
                      value={form.team_size}
                      onChange={(e) => setForm((f) => ({ ...f, team_size: e.target.value }))}
                    >
                      <option value="">Select...</option>
                      {(options?.teamSizes || []).map((t) => (
                        <option key={t} value={t}>
                          {TEAM_LABELS[t] || t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="form-label small fw-medium">Current AI Tools</label>
                  <div className="d-flex flex-wrap gap-2">
                    {(options?.tools || []).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`btn btn-sm ${form.current_tools.includes(t) ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => toggleTool(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Priority & Timeline */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h5 className="fw-semibold mb-3">Priority &amp; Timeline</h5>
                <div className="mb-3">
                  <label className="form-label small fw-medium">Priority Use Case</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={3}
                    placeholder="Describe the AI use case you'd most like to discuss..."
                    value={form.priority_use_case}
                    onChange={(e) => setForm((f) => ({ ...f, priority_use_case: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label small fw-medium">
                    Timeline <span className="text-danger">*</span>
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={form.timeline_urgency}
                    onChange={(e) => setForm((f) => ({ ...f, timeline_urgency: e.target.value }))}
                  >
                    <option value="">Select...</option>
                    {(options?.timelines || []).map((t) => (
                      <option key={t} value={t}>
                        {TIMELINE_LABELS[t] || t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Section 4: Budget Context (optional) */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h5 className="fw-semibold mb-1">Budget Context</h5>
                <p className="text-muted small mb-3">Optional &mdash; helps us tailor recommendations</p>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Budget Range</label>
                    <select
                      className="form-select form-select-sm"
                      value={form.budget_range}
                      onChange={(e) => setForm((f) => ({ ...f, budget_range: e.target.value }))}
                    >
                      <option value="">Select...</option>
                      {(options?.budgets || []).map((b) => (
                        <option key={b} value={b}>
                          {BUDGET_LABELS[b] || b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6 d-flex align-items-end">
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="eval-consultants"
                        checked={form.evaluating_consultants}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, evaluating_consultants: e.target.checked }))
                        }
                      />
                      <label className="form-check-label small" htmlFor="eval-consultants">
                        Currently evaluating consultants
                      </label>
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="form-label small fw-medium">Previous AI Investment</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    placeholder="Any prior AI spend or pilots..."
                    value={form.previous_ai_investment}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, previous_ai_investment: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Section 5: For Your Call */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h5 className="fw-semibold mb-3">For Your Call</h5>
                <div className="mb-3">
                  <label className="form-label small fw-medium">
                    Specific Questions for the Session
                  </label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={3}
                    placeholder="What would you like to leave this call knowing?"
                    value={form.specific_questions}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, specific_questions: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="form-label small fw-medium">Additional Context</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    placeholder="Anything else we should know before the call..."
                    value={form.additional_context}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, additional_context: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Section 6: File Upload */}
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <h5 className="fw-semibold mb-1">Upload Materials</h5>
                <p className="text-muted small mb-3">
                  Optional &mdash; upload AI roadmaps, org charts, or strategic documents (PDF, PPT). Max 20MB.
                </p>

                {hasFile && fileName ? (
                  <div className="d-flex align-items-center gap-2 p-3 rounded" style={{ background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: '1.4rem' }}>&#128196;</span>
                    <div className="flex-grow-1">
                      <div className="fw-medium small">{fileName}</div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>Uploaded successfully</div>
                    </div>
                    <label
                      className="btn btn-outline-secondary btn-sm mb-0"
                      style={{ cursor: 'pointer' }}
                    >
                      Replace
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.rtf,.txt,.md,.csv"
                        className="d-none"
                        onChange={handleFileInput}
                      />
                    </label>
                  </div>
                ) : (
                  <div
                    className="border border-2 rounded text-center py-4 px-3"
                    style={{
                      borderStyle: 'dashed',
                      borderColor: uploading ? 'var(--color-primary-light)' : 'var(--color-border)',
                      background: 'var(--color-bg-alt)',
                      cursor: 'pointer',
                    }}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => document.getElementById('file-input')?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        document.getElementById('file-input')?.click();
                      }
                    }}
                  >
                    {uploading ? (
                      <>
                        <div className="spinner-border spinner-border-sm text-primary mb-2" role="status">
                          <span className="visually-hidden">Uploading...</span>
                        </div>
                        <p className="text-muted mb-0 small">Uploading and extracting text...</p>
                      </>
                    ) : (
                      <>
                        <p className="mb-1 small fw-medium">
                          Drag &amp; drop a file here, or click to browse
                        </p>
                        <p className="text-muted mb-0" style={{ fontSize: '0.75rem' }}>
                          Accepted: PDF, Word, PowerPoint, Excel, RTF, Text, Markdown, CSV (max 50MB)
                        </p>
                      </>
                    )}
                    <input
                      id="file-input"
                      type="file"
                      accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.rtf,.txt,.md,.csv"
                      className="d-none"
                      onChange={handleFileInput}
                    />
                  </div>
                )}

                {uploadError && (
                  <div className="text-danger small mt-2">{uploadError}</div>
                )}

                <p className="text-muted mt-2 mb-0" style={{ fontSize: '0.7rem' }}>
                  Uploaded documents are confidential and used solely to personalize your strategy session.
                </p>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-hero-primary btn-lg w-100"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  />
                  Submitting...
                </>
              ) : (
                'Submit Preparation'
              )}
            </button>

            <p className="text-muted small mt-3 text-center mb-0">
              All information is confidential and used solely to personalize your strategy session.
            </p>
          </form>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Success state after submission                                     */
/* ------------------------------------------------------------------ */

function SuccessState({ callInfo, score }: { callInfo: CallInfo; score: number }) {
  return (
    <>
      <SEOHead
        title="Preparation Complete | Colaberry Enterprise AI"
        description="Your strategy call preparation is complete."
      />

      <section
        className="text-light text-center"
        style={{
          background: 'linear-gradient(135deg, #0f1b2d 0%, #1a365d 50%, #1e3a5f 100%)',
          padding: '5rem 0',
        }}
      >
        <div className="container" style={{ maxWidth: '650px' }}>
          <div
            className="rounded-circle bg-success text-white d-inline-flex align-items-center justify-content-center mb-3"
            style={{ width: 56, height: 56, fontSize: '1.8rem' }}
            aria-hidden="true"
          >
            &#10003;
          </div>
          <h1 className="text-light mb-2" style={{ fontSize: '2rem' }}>
            {score >= 60 ? "You're Ready" : 'Preparation Submitted'}
          </h1>
          <div className="mb-3">
            <span
              className="badge bg-success px-3 py-2"
              style={{ fontSize: '1rem' }}
            >
              {score}% Complete
            </span>
          </div>
          <p className="mb-0" style={{ opacity: 0.85 }}>
            Thank you, {callInfo.name}. Your responses have been saved and will be used to
            personalize your strategy session.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container text-center" style={{ maxWidth: '600px' }}>
          <div className="bg-light rounded p-4 mb-4">
            <h5 className="fw-semibold mb-2">What Happens Next</h5>
            <ul className="list-unstyled text-start mb-0">
              <li className="mb-2">&#10003; Your responses are being analyzed</li>
              <li className="mb-2">&#10003; Your strategy session will be tailored to your specific challenges</li>
              <li>&#10003; You'll receive a calendar reminder before your call</li>
            </ul>
          </div>

          <Link to="/" className="btn btn-hero-primary btn-lg px-5">
            Return to Homepage
          </Link>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Static content (no token)                                          */
/* ------------------------------------------------------------------ */

function StaticPrepContent() {
  return (
    <>
      <SEOHead
        title="Prepare for Your Strategy Call | Colaberry Enterprise AI"
        description="Prepare for your 30-minute executive AI strategy call. Review what we'll cover and how to make the most of your session."
      />

      {/* Hero */}
      <section
        className="text-light text-center"
        style={{
          background: 'linear-gradient(135deg, #0f1b2d 0%, #1a365d 50%, #1e3a5f 100%)',
          padding: '5rem 0',
        }}
      >
        <div className="container" style={{ maxWidth: '750px' }}>
          <h1 className="text-light mb-3" style={{ fontSize: '2.2rem' }}>
            Prepare for Your Executive AI Strategy Call
          </h1>
          <p className="lead mb-0" style={{ opacity: 0.85 }}>
            This 5-minute preparation will ensure we use your time effectively.
          </p>
          <hr className="my-4 mx-auto" style={{ opacity: 0.3, maxWidth: 120, borderColor: '#fff' }} />
        </div>
      </section>

      {/* What We'll Cover */}
      <section className="section">
        <div className="container">
          <h2 className="text-center mb-4">What We'll Cover</h2>
          <div className="row g-4">
            {[
              {
                num: 1,
                title: 'AI Deployment Priorities',
                desc: 'Identify 1\u20132 high-impact areas where AI can drive measurable results within your organization.',
              },
              {
                num: 2,
                title: 'Internal Capability Assessment',
                desc: 'Evaluate current technical capacity and governance readiness for enterprise AI adoption.',
              },
              {
                num: 3,
                title: '30-Day Roadmap Alignment',
                desc: 'Define the fastest path to internal AI capability deployment with clear milestones.',
              },
            ].map((item) => (
              <div className="col-md-4" key={item.num}>
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-body text-center py-4">
                    <div
                      className="rounded-circle bg-primary text-white d-inline-flex align-items-center justify-content-center mb-3"
                      style={{ width: 36, height: 36, fontSize: '0.95rem', fontWeight: 600 }}
                    >
                      {item.num}
                    </div>
                    <h5 className="fw-semibold mb-2">{item.title}</h5>
                    <p className="text-muted mb-0 small">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Preparation Questions */}
      <section className="section-alt">
        <div className="container">
          <h2 className="text-center mb-2">Preparation Questions</h2>
          <p className="text-center text-muted mb-4">Before the call, consider:</p>
          <div className="mx-auto" style={{ maxWidth: 700 }}>
            {[
              'What business function is under the most operational pressure?',
              'Where is manual work slowing decision-making?',
              'Do you have internal AI or engineering talent available?',
              'Are you evaluating consulting firms or internal build options?',
            ].map((q) => (
              <div className="d-flex align-items-start gap-3 mb-3" key={q}>
                <span className="text-primary fw-bold" style={{ fontSize: '1.1rem', lineHeight: 1.4 }}>
                  &#10003;
                </span>
                <p className="mb-0" style={{ lineHeight: 1.6 }}>{q}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Optional Materials */}
      <section className="section">
        <div className="container">
          <div className="card border shadow-sm mx-auto" style={{ maxWidth: 600 }}>
            <div className="card-body p-4">
              <h6 className="fw-semibold mb-3">If available, consider bringing:</h6>
              <ul className="mb-0" style={{ lineHeight: 2 }}>
                <li>Current AI initiatives or pilot programs</li>
                <li>Organizational chart (high level)</li>
                <li>Strategic priorities for the next 6 months</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Back CTA */}
      <section className="section text-center">
        <div className="container">
          <Link to="/" className="btn btn-hero-primary btn-lg px-5">
            Return to Homepage
          </Link>
          <br />
          <Link to="/advisory" className="btn btn-outline-secondary btn-sm mt-3">
            View Executive Briefing
          </Link>
        </div>
      </section>
    </>
  );
}
