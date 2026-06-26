import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProjectDnaFormData {
  businessProblem: string;
  targetUser: string;
  industry: string;
  orientation: 'internal' | 'external' | '';
  focus: 'revenue' | 'operational' | '';
  projectTypes: string[];
  dataSources: string[];
  aiComponents: string[];
  industryTrack: string;
}

type FieldErrors = Partial<Record<keyof ProjectDnaFormData, string>>;

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS = ['Business', 'Technical', 'AI Components', 'Review'];

const INDUSTRIES = [
  'Finance', 'Healthcare', 'Education', 'Retail', 'Technology',
  'Manufacturing', 'Government', 'Legal', 'Real Estate', 'Other',
];

const PROJECT_TYPES = [
  { value: 'web',           label: 'Web Application',      icon: 'bi-globe2' },
  { value: 'agent',         label: 'Agent System',          icon: 'bi-cpu' },
  { value: 'workflow',      label: 'Workflow Automation',   icon: 'bi-arrow-repeat' },
  { value: 'mobile',        label: 'Mobile App',            icon: 'bi-phone' },
  { value: 'dashboard',     label: 'Dashboard / Analytics', icon: 'bi-bar-chart-line' },
  { value: 'data-pipeline', label: 'Data Pipeline',         icon: 'bi-diagram-3' },
];

const DATA_SOURCES = [
  { value: 'database',    label: 'Database / SQL' },
  { value: 'api',         label: 'External APIs' },
  { value: 'documents',   label: 'Documents / PDFs' },
  { value: 'web-scraping',label: 'Web Scraping' },
  { value: 'realtime',    label: 'Real-time Feeds' },
  { value: 'user-input',  label: 'User Input' },
];

const AI_COMPONENTS = [
  { value: 'claude',    label: 'Claude',     desc: 'Core LLM reasoning and generation' },
  { value: 'mcp',       label: 'MCP',        desc: 'Model Context Protocol integrations' },
  { value: 'agents',    label: 'Agents',     desc: 'Autonomous multi-step task execution' },
  { value: 'rag',       label: 'RAG',        desc: 'Retrieval-Augmented Generation' },
  { value: 'workflows', label: 'Workflows',  desc: 'Orchestrated AI pipelines' },
];

const INDUSTRY_TRACKS = [
  'AI for Enterprise Operations',
  'AI for Customer Experience',
  'AI for Data & Analytics',
  'AI for Developer Tools',
  'AI for Healthcare',
  'AI for Finance',
  'AI for Education',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INIT: ProjectDnaFormData = {
  businessProblem: '',
  targetUser: '',
  industry: '',
  orientation: '',
  focus: '',
  projectTypes: [],
  dataSources: [],
  aiComponents: [],
  industryTrack: '',
};

function toggleItem(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

// ─── Component ───────────────────────────────────────────────────────────────

function ProjectDnaWizard() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProjectDnaFormData>(INIT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const setField = <K extends keyof ProjectDnaFormData>(key: K, value: ProjectDnaFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggle = (key: 'projectTypes' | 'dataSources' | 'aiComponents', val: string) =>
    setForm((f) => ({ ...f, [key]: toggleItem(f[key], val) }));

  function validate(s: number): boolean {
    const e: FieldErrors = {};
    if (s === 0) {
      if (!form.businessProblem.trim()) e.businessProblem = 'Please describe the business problem.';
      if (!form.targetUser.trim())      e.targetUser = 'Please describe who uses this.';
      if (!form.industry)               e.industry = 'Select an industry.';
      if (!form.orientation)            e.orientation = 'Select one.';
      if (!form.focus)                  e.focus = 'Select one.';
    }
    if (s === 1 && !form.projectTypes.length) e.projectTypes = 'Select at least one project type.';
    if (s === 2) {
      if (!form.aiComponents.length) e.aiComponents = 'Select at least one AI component.';
      if (!form.industryTrack)       e.industryTrack = 'Select a track.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const goNext = () => { if (validate(step)) setStep((s) => s + 1); };
  const goPrev = () => { setErrors({}); setStep((s) => s - 1); };

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitting(true);
    try {
      await portalApi.post('/api/portal/project-dna', form);
      setDone(true);
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || 'Unable to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="py-5" style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Confirmed */}
        <div className="text-center mb-4">
          <span className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
            style={{ width: 64, height: 64, background: 'var(--color-success-bg)' }}>
            <i className="bi bi-check-lg" style={{ fontSize: 32, color: 'var(--color-success)' }}></i>
          </span>
          <h2 className="h5 fw-bold mb-1" style={{ color: '#1e293b' }}>Project DNA Saved</h2>
          <p className="text-muted small mb-0">Your project context is locked in.</p>
        </div>

        {/* What's happening now */}
        <div className="rounded-3 p-4 mb-4" style={{ background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)' }}>
          <div className="d-flex align-items-start gap-3 mb-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
              style={{ width: 36, height: 36, background: 'rgba(99,102,241,0.1)' }}>
              <i className="bi bi-cpu" style={{ color: 'var(--color-purple)', fontSize: 16 }}></i>
            </span>
            <div>
              <p className="fw-semibold small mb-1" style={{ color: '#1e293b' }}>Generating your requirements document</p>
              <p className="text-muted small mb-0">
                An AI architect is analysing your DNA and building a full system requirements spec — architecture, data flows, integrations, and implementation roadmap.
                This runs in the background and takes <strong>15–30 minutes</strong>.
              </p>
            </div>
          </div>
          <div className="d-flex align-items-start gap-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
              style={{ width: 36, height: 36, background: 'rgba(99,102,241,0.1)' }}>
              <i className="bi bi-list-check" style={{ color: 'var(--color-purple)', fontSize: 16 }}></i>
            </span>
            <div>
              <p className="fw-semibold small mb-1" style={{ color: '#1e293b' }}>Your project tasks will be ready shortly after</p>
              <p className="text-muted small mb-0">
                Once the requirements doc is complete, your personalised task board is created automatically — one task list per system area.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <button
            className="btn btn-primary px-4"
            style={{ background: 'var(--color-purple)', borderColor: 'var(--color-purple)' }}
            onClick={() => navigate('/portal/home')}
          >
            <i className="bi bi-house me-2"></i>Back to Home
          </button>
          <p className="text-muted small mt-3 mb-0">
            You can leave this page — your requirements will be ready when you come back.
          </p>
        </div>
      </div>
    );
  }

  // ── Main wizard ─────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div className="mb-4">
        <h1 className="h4 fw-bold mb-1" style={{ color: '#1e293b' }}>Project DNA Wizard</h1>
        <p className="text-muted small mb-0">Define your project to personalize your 12-week AI Systems build.</p>
      </div>

      {/* Step indicator */}
      <div className="d-flex align-items-center mb-4" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Wizard progress">
        {STEPS.map((label, i) => {
          const completed = i < step;
          const active    = i === step;
          return (
            <React.Fragment key={label}>
              <div className="d-flex flex-column align-items-center" style={{ flexShrink: 0 }}>
                <div
                  className="d-flex align-items-center justify-content-center rounded-circle fw-semibold"
                  style={{
                    width: 32, height: 32, fontSize: 13, transition: 'all 0.2s',
                    background: completed ? 'var(--color-purple)' : active ? 'rgba(99,102,241,0.1)' : 'var(--color-bg-alt)',
                    border: `2px solid ${completed || active ? 'var(--color-purple)' : 'var(--color-border)'}`,
                    color: completed ? '#fff' : active ? 'var(--color-purple)' : 'var(--color-text-light)',
                  }}
                >
                  {completed
                    ? <i className="bi bi-check" style={{ fontSize: 14 }}></i>
                    : i + 1}
                </div>
                <span className="mt-1" style={{
                  fontSize: 11, whiteSpace: 'nowrap',
                  fontWeight: active ? 600 : 400,
                  color: active ? '#1e293b' : 'var(--color-text-light)',
                }}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex-grow-1 mx-1" style={{
                  height: 2, marginBottom: 20, transition: 'background 0.2s',
                  background: i < step ? 'var(--color-purple)' : 'var(--color-border)',
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step card */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body p-4">

          {/* ── Step 0: Business ── */}
          {step === 0 && (
            <>
              <h6 className="fw-semibold mb-3" style={{ color: '#1e293b' }}>
                <i className="bi bi-briefcase me-2" style={{ color: 'var(--color-purple)' }}></i>Business Context
              </h6>
              <div className="mb-3">
                <label className="form-label small fw-medium">
                  What business problem does this solve? <span className="text-danger">*</span>
                </label>
                <textarea
                  className={`form-control form-control-sm${errors.businessProblem ? ' is-invalid' : ''}`}
                  rows={3}
                  placeholder="e.g. Our support team spends 4 hours/day on repetitive questions — we need an AI agent to handle tier-1 support automatically."
                  value={form.businessProblem}
                  onChange={(e) => setField('businessProblem', e.target.value)}
                />
                {errors.businessProblem && <div className="invalid-feedback">{errors.businessProblem}</div>}
              </div>
              <div className="mb-3">
                <label className="form-label small fw-medium">
                  Who uses this system? <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className={`form-control form-control-sm${errors.targetUser ? ' is-invalid' : ''}`}
                  placeholder="e.g. Internal support agents, external customers via web chat"
                  value={form.targetUser}
                  onChange={(e) => setField('targetUser', e.target.value)}
                />
                {errors.targetUser && <div className="invalid-feedback">{errors.targetUser}</div>}
              </div>
              <div className="mb-3">
                <label className="form-label small fw-medium">
                  Industry <span className="text-danger">*</span>
                </label>
                <select
                  className={`form-select form-select-sm${errors.industry ? ' is-invalid' : ''}`}
                  value={form.industry}
                  onChange={(e) => setField('industry', e.target.value)}
                >
                  <option value="">Select your industry…</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind.toLowerCase().replace(/ /g, '-')}>{ind}</option>
                  ))}
                </select>
                {errors.industry && <div className="invalid-feedback">{errors.industry}</div>}
              </div>
              <div className="row g-3">
                {/* Orientation */}
                <div className="col-md-6">
                  <label className="form-label small fw-medium">
                    Deployment <span className="text-danger">*</span>
                  </label>
                  {(['internal', 'external'] as const).map((v) => (
                    <div
                      key={v}
                      className="p-2 rounded border mb-2 d-flex align-items-center gap-2"
                      style={{
                        borderColor: form.orientation === v ? 'var(--color-purple)' : 'var(--color-border)',
                        background: form.orientation === v ? 'rgba(99,102,241,0.05)' : undefined,
                        cursor: 'pointer',
                      }}
                      role="radio"
                      aria-checked={form.orientation === v}
                      tabIndex={0}
                      onClick={() => setField('orientation', v)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setField('orientation', v)}
                    >
                      <i
                        className={`bi ${form.orientation === v ? 'bi-record-circle-fill' : 'bi-circle'}`}
                        style={{ color: form.orientation === v ? 'var(--color-purple)' : 'var(--color-text-light)' }}
                      ></i>
                      <div>
                        <div className="small fw-medium" style={{ textTransform: 'capitalize' }}>{v}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                          {v === 'internal' ? 'Used by your team' : 'Facing customers or partners'}
                        </div>
                      </div>
                    </div>
                  ))}
                  {errors.orientation && <div className="text-danger" style={{ fontSize: 12 }}>{errors.orientation}</div>}
                </div>
                {/* Focus */}
                <div className="col-md-6">
                  <label className="form-label small fw-medium">
                    Primary focus <span className="text-danger">*</span>
                  </label>
                  {(['revenue', 'operational'] as const).map((v) => (
                    <div
                      key={v}
                      className="p-2 rounded border mb-2 d-flex align-items-center gap-2"
                      style={{
                        borderColor: form.focus === v ? 'var(--color-purple)' : 'var(--color-border)',
                        background: form.focus === v ? 'rgba(99,102,241,0.05)' : undefined,
                        cursor: 'pointer',
                      }}
                      role="radio"
                      aria-checked={form.focus === v}
                      tabIndex={0}
                      onClick={() => setField('focus', v)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setField('focus', v)}
                    >
                      <i
                        className={`bi ${form.focus === v ? 'bi-record-circle-fill' : 'bi-circle'}`}
                        style={{ color: form.focus === v ? 'var(--color-purple)' : 'var(--color-text-light)' }}
                      ></i>
                      <div>
                        <div className="small fw-medium" style={{ textTransform: 'capitalize' }}>{v}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                          {v === 'revenue' ? 'Grows income directly' : 'Reduces cost or friction'}
                        </div>
                      </div>
                    </div>
                  ))}
                  {errors.focus && <div className="text-danger" style={{ fontSize: 12 }}>{errors.focus}</div>}
                </div>
              </div>
            </>
          )}

          {/* ── Step 1: Technical ── */}
          {step === 1 && (
            <>
              <h6 className="fw-semibold mb-3" style={{ color: '#1e293b' }}>
                <i className="bi bi-code-slash me-2" style={{ color: 'var(--color-purple)' }}></i>Technical Footprint
              </h6>
              <div className="mb-4">
                <label className="form-label small fw-medium">
                  Project type(s) <span className="text-danger">*</span>
                </label>
                <div className="row g-2">
                  {PROJECT_TYPES.map(({ value, label, icon }) => {
                    const sel = form.projectTypes.includes(value);
                    return (
                      <div className="col-6 col-md-4" key={value}>
                        <div
                          className="p-3 rounded border h-100 d-flex align-items-center gap-2"
                          style={{
                            borderColor: sel ? 'var(--color-purple)' : 'var(--color-border)',
                            background: sel ? 'rgba(99,102,241,0.06)' : undefined,
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                          role="checkbox"
                          aria-checked={sel}
                          tabIndex={0}
                          onClick={() => toggle('projectTypes', value)}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle('projectTypes', value)}
                        >
                          <i className={`bi ${icon}`} style={{ fontSize: 18, color: sel ? 'var(--color-purple)' : 'var(--color-text-light)', flexShrink: 0 }}></i>
                          <span className="small fw-medium" style={{ color: sel ? '#1e293b' : 'var(--color-text-light)' }}>{label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {errors.projectTypes && <div className="text-danger mt-1" style={{ fontSize: 12 }}>{errors.projectTypes}</div>}
              </div>
              <div>
                <label className="form-label small fw-medium">
                  Data sources <span className="text-muted fw-normal">(optional)</span>
                </label>
                <div className="row g-2">
                  {DATA_SOURCES.map(({ value, label }) => {
                    const sel = form.dataSources.includes(value);
                    return (
                      <div className="col-6 col-md-4" key={value}>
                        <div
                          className="p-2 rounded border d-flex align-items-center gap-2"
                          style={{
                            borderColor: sel ? 'var(--color-purple)' : 'var(--color-border)',
                            background: sel ? 'rgba(99,102,241,0.06)' : undefined,
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                          role="checkbox"
                          aria-checked={sel}
                          tabIndex={0}
                          onClick={() => toggle('dataSources', value)}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle('dataSources', value)}
                        >
                          <i className={`bi ${sel ? 'bi-check-square-fill' : 'bi-square'}`}
                            style={{ fontSize: 14, color: sel ? 'var(--color-purple)' : 'var(--color-text-light)', flexShrink: 0 }}></i>
                          <span className="small" style={{ color: sel ? '#1e293b' : 'var(--color-text-light)' }}>{label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── Step 2: AI Components + Track ── */}
          {step === 2 && (
            <>
              <h6 className="fw-semibold mb-3" style={{ color: '#1e293b' }}>
                <i className="bi bi-cpu me-2" style={{ color: 'var(--color-purple)' }}></i>AI Components
              </h6>
              <div className="mb-4">
                <label className="form-label small fw-medium">
                  Which AI capabilities will this use? <span className="text-danger">*</span>
                </label>
                <div className="d-flex flex-column gap-2">
                  {AI_COMPONENTS.map(({ value, label, desc }) => {
                    const sel = form.aiComponents.includes(value);
                    return (
                      <div
                        key={value}
                        className="p-3 rounded border d-flex align-items-center gap-3"
                        style={{
                          borderColor: sel ? 'var(--color-purple)' : 'var(--color-border)',
                          background: sel ? 'rgba(99,102,241,0.06)' : undefined,
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                        role="checkbox"
                        aria-checked={sel}
                        tabIndex={0}
                        onClick={() => toggle('aiComponents', value)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle('aiComponents', value)}
                      >
                        <i
                          className={`bi ${sel ? 'bi-check-circle-fill' : 'bi-circle'}`}
                          style={{ fontSize: 18, color: sel ? 'var(--color-purple)' : 'var(--color-text-light)', flexShrink: 0 }}
                        ></i>
                        <div>
                          <div className="small fw-semibold" style={{ color: '#1e293b' }}>{label}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {errors.aiComponents && <div className="text-danger mt-1" style={{ fontSize: 12 }}>{errors.aiComponents}</div>}
              </div>
              <div>
                <label className="form-label small fw-medium">
                  Industry track <span className="text-danger">*</span>
                </label>
                <select
                  className={`form-select form-select-sm${errors.industryTrack ? ' is-invalid' : ''}`}
                  value={form.industryTrack}
                  onChange={(e) => setField('industryTrack', e.target.value)}
                >
                  <option value="">Select a track…</option>
                  {INDUSTRY_TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.industryTrack && <div className="invalid-feedback">{errors.industryTrack}</div>}
              </div>
            </>
          )}

          {/* ── Step 3: Review ── */}
          {step === 3 && (
            <>
              <h6 className="fw-semibold mb-3" style={{ color: '#1e293b' }}>
                <i className="bi bi-clipboard-check me-2" style={{ color: 'var(--color-purple)' }}></i>Review Your Project DNA
              </h6>
              {[
                {
                  icon: 'bi-briefcase', title: 'Business',
                  rows: [
                    ['Problem', form.businessProblem],
                    ['Who uses it', form.targetUser],
                    ['Industry', form.industry],
                    ['Deployment', form.orientation],
                    ['Focus', form.focus],
                  ],
                },
                {
                  icon: 'bi-code-slash', title: 'Technical',
                  rows: [
                    ['Project types', form.projectTypes.join(', ') || '—'],
                    ['Data sources', form.dataSources.join(', ') || '—'],
                  ],
                },
                {
                  icon: 'bi-cpu', title: 'AI',
                  rows: [
                    ['Components', form.aiComponents.join(', ') || '—'],
                    ['Industry track', form.industryTrack || '—'],
                  ],
                },
              ].map((section) => (
                <div key={section.title} className="mb-3 p-3 rounded"
                  style={{ background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)' }}>
                  <div className="small fw-semibold mb-2" style={{ color: '#1e293b' }}>
                    <i className={`bi ${section.icon} me-2`} style={{ color: 'var(--color-purple)' }}></i>
                    {section.title}
                  </div>
                  {section.rows.map(([label, value]) => (
                    <div key={label} className="d-flex gap-2 mb-1" style={{ fontSize: 13 }}>
                      <span className="text-muted" style={{ minWidth: 120, flexShrink: 0 }}>{label}:</span>
                      <span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{value || '—'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

        </div>
      </div>

      {submitError && (
        <div className="alert alert-danger small py-2 mb-3">
          <i className="bi bi-exclamation-triangle me-2"></i>{submitError}
        </div>
      )}

      {/* Navigation */}
      <div className="d-flex justify-content-between">
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={goPrev}
          style={{ visibility: step === 0 ? 'hidden' : undefined }}
        >
          <i className="bi bi-arrow-left me-1"></i>Previous
        </button>
        {step < STEPS.length - 1 ? (
          <button
            className="btn btn-primary btn-sm"
            onClick={goNext}
            style={{ background: 'var(--color-purple)', borderColor: 'var(--color-purple)' }}
          >
            Next<i className="bi bi-arrow-right ms-1"></i>
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ background: 'var(--color-purple)', borderColor: 'var(--color-purple)' }}
          >
            {submitting ? (
              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving…</>
            ) : (
              <><i className="bi bi-check2-circle me-2"></i>Save Project DNA</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default ProjectDnaWizard;
