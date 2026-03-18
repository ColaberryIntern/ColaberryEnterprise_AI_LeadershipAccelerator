import React, { useState, useCallback } from 'react';
import api from '../../../utils/api';

// ─── Types (mirroring backend) ──────────────────────────────────────

interface CurriculumGenerationInput {
  program_id: string;
  cohort_id: string;
  program_name: string;
  program_description: string;
  target_modules: number;
  lessons_per_module: number;
  variables: Record<string, string>;
  options?: {
    skill_areas?: string[];
    unlock_rule?: 'sequential' | 'manual';
  };
}

interface SkeletonLesson {
  temp_id: string;
  lesson_number: number;
  title: string;
  description: string;
  lesson_type: string;
  estimated_minutes: number;
  learning_goal: string;
  structure_prompt: string;
}

interface SkeletonModule {
  temp_id: string;
  module_number: number;
  title: string;
  description: string;
  skill_area: string;
  lessons: SkeletonLesson[];
}

interface CurriculumSkeleton {
  generated_at: string;
  input: CurriculumGenerationInput;
  modules: SkeletonModule[];
  total_lessons: number;
  total_modules: number;
}

interface MiniSectionSpec {
  type: string;
  student_label: string;
  title: string;
  description: string;
  learning_goal: string;
  variables: { key: string; display_name: string }[];
  artifact: { name: string } | null;
}

interface LessonBlueprintPreview {
  lesson_temp_id: string;
  lesson_title: string;
  blueprint: { mini_sections: MiniSectionSpec[]; skill_domain: string };
  variable_flow: { produces: string[]; consumes: string[] };
}

interface GovernanceReport {
  health_score: number;
  total_variables_produced: number;
  total_variables_consumed: number;
  missing_variables: string[];
  timeline_violations: string[];
  orphaned_variables: string[];
  can_approve: boolean;
  block_reasons: string[];
  warnings: string[];
  confidence_score: number;
  risk_level: 'low' | 'medium' | 'high';
}

interface DiagnosticsResult {
  system_health_score: number;
}

interface ApprovalResult {
  success: boolean;
  created_modules: { id: string; title: string }[];
  created_lessons: { id: string; title: string }[];
  created_mini_sections: number;
  created_variables: number;
  created_artifacts: number;
  governance_insight_id: string;
  diagnostics_after: DiagnosticsResult;
}

// ─── Constants ──────────────────────────────────────────────────────

const SYSTEM_VARIABLES = ['industry', 'company_name', 'company_size', 'role', 'goal', 'ai_maturity_level', 'identified_use_case'];

const SKILL_AREA_LABELS: Record<string, string> = {
  strategy_trust: 'Strategy & Trust',
  governance: 'Governance',
  requirements: 'Requirements',
  build_discipline: 'Build Discipline',
  executive_authority: 'Executive Authority',
};

const TYPE_COLORS: Record<string, string> = {
  executive_reality_check: 'primary',
  ai_strategy: 'success',
  prompt_template: 'info',
  implementation_task: 'warning',
  knowledge_check: 'secondary',
};

const RISK_COLORS: Record<string, string> = { low: 'success', medium: 'warning', high: 'danger' };

// ─── Component ──────────────────────────────────────────────────────

export default function CurriculumGenerationTab() {
  const [step, setStep] = useState<'input' | 'skeleton' | 'preview' | 'approved'>('input');
  const [input, setInput] = useState<CurriculumGenerationInput>({
    program_id: '',
    cohort_id: '',
    program_name: '',
    program_description: '',
    target_modules: 5,
    lessons_per_module: 4,
    variables: {},
  });
  const [skeleton, setSkeleton] = useState<CurriculumSkeleton | null>(null);
  const [blueprints, setBlueprints] = useState<LessonBlueprintPreview[] | null>(null);
  const [governance, setGovernance] = useState<GovernanceReport | null>(null);
  const [approvalResult, setApprovalResult] = useState<ApprovalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarValue, setNewVarValue] = useState('');

  // ─── Step 1: Generate Skeleton ──────────────────────────────────

  const handleGenerateSkeleton = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/admin/orchestration/curriculum/generate-skeleton', input);
      setSkeleton(res.data);
      setStep('skeleton');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [input]);

  // ─── Step 2: Generate Blueprints ────────────────────────────────

  const handleGenerateBlueprints = useCallback(async () => {
    if (!skeleton) return;
    setLoading(true);
    setError(null);
    try {
      const bpRes = await api.post('/api/admin/orchestration/curriculum/generate-blueprints', { skeleton });
      setBlueprints(bpRes.data.blueprints);

      const govRes = await api.post('/api/admin/orchestration/curriculum/analyze-governance', {
        skeleton,
        blueprints: bpRes.data.blueprints,
      });
      setGovernance(govRes.data);
      setStep('preview');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [skeleton]);

  // ─── Step 3: Approve ────────────────────────────────────────────

  const handleApprove = useCallback(async () => {
    if (!skeleton || !blueprints || !governance) return;
    setLoading(true);
    setError(null);
    try {
      const preview = { skeleton, blueprints, governance, status: 'preview' };
      const res = await api.post('/api/admin/orchestration/curriculum/approve', preview);
      setApprovalResult(res.data);
      setStep('approved');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [skeleton, blueprints, governance]);

  // ─── Variable Management ────────────────────────────────────────

  const addVariable = () => {
    if (!newVarKey.trim()) return;
    setInput(prev => ({
      ...prev,
      variables: { ...prev.variables, [newVarKey.trim().toLowerCase().replace(/\s+/g, '_')]: newVarValue },
    }));
    setNewVarKey('');
    setNewVarValue('');
  };

  const removeVariable = (key: string) => {
    setInput(prev => {
      const v = { ...prev.variables };
      delete v[key];
      return { ...prev, variables: v };
    });
  };

  const toggleModule = (tempId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(tempId) ? next.delete(tempId) : next.add(tempId);
      return next;
    });
  };

  // ─── Render: Input Step ─────────────────────────────────────────

  const renderInputStep = () => (
    <div className="row g-4">
      <div className="col-lg-8">
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">
            <i className="bi bi-gear me-2" />Program Configuration
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-medium">Program Name</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={input.program_name}
                  onChange={e => setInput(prev => ({ ...prev, program_name: e.target.value }))}
                  placeholder="e.g., AI Leadership Accelerator"
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Program ID</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={input.program_id}
                  onChange={e => setInput(prev => ({ ...prev, program_id: e.target.value }))}
                  placeholder="prog-xxx"
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Cohort ID</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={input.cohort_id}
                  onChange={e => setInput(prev => ({ ...prev, cohort_id: e.target.value }))}
                  placeholder="cohort-xxx"
                />
              </div>
              <div className="col-12">
                <label className="form-label small fw-medium">Program Description</label>
                <textarea
                  className="form-control form-control-sm"
                  rows={3}
                  value={input.program_description}
                  onChange={e => setInput(prev => ({ ...prev, program_description: e.target.value }))}
                  placeholder="Describe the program's goals, audience, and key outcomes..."
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-medium">Modules (3-6)</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  min={3} max={6}
                  value={input.target_modules}
                  onChange={e => setInput(prev => ({ ...prev, target_modules: Number(e.target.value) }))}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-medium">Lessons per Module (2-5)</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  min={2} max={5}
                  value={input.lessons_per_module}
                  onChange={e => setInput(prev => ({ ...prev, lessons_per_module: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="col-lg-4">
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">
            <i className="bi bi-braces me-2" />Variables
          </div>
          <div className="card-body">
            <p className="text-muted small mb-2">System variables (always available):</p>
            <div className="d-flex flex-wrap gap-1 mb-3">
              {SYSTEM_VARIABLES.map(v => (
                <span key={v} className="badge bg-light text-dark border">{`{{${v}}}`}</span>
              ))}
            </div>

            <p className="text-muted small mb-2">Custom variables:</p>
            {Object.entries(input.variables).map(([key, value]) => (
              <div key={key} className="d-flex align-items-center gap-2 mb-1">
                <span className="badge bg-info">{`{{${key}}}`}</span>
                <small className="text-muted flex-grow-1 text-truncate">{value}</small>
                <button className="btn btn-sm btn-outline-danger p-0 px-1" onClick={() => removeVariable(key)}>
                  <i className="bi bi-x" />
                </button>
              </div>
            ))}

            <div className="d-flex gap-1 mt-2">
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="key"
                value={newVarKey}
                onChange={e => setNewVarKey(e.target.value)}
                style={{ maxWidth: '100px' }}
              />
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="value"
                value={newVarValue}
                onChange={e => setNewVarValue(e.target.value)}
              />
              <button className="btn btn-sm btn-outline-primary" onClick={addVariable}>+</button>
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary btn-sm w-100 mt-3"
          onClick={handleGenerateSkeleton}
          disabled={loading || !input.program_name || !input.program_description}
        >
          {loading ? <><span className="spinner-border spinner-border-sm me-2" role="status" />Generating...</> : 'Generate Curriculum Skeleton'}
        </button>
      </div>
    </div>
  );

  // ─── Render: Skeleton Review Step ───────────────────────────────

  const renderSkeletonStep = () => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h6 className="mb-0">Curriculum Skeleton</h6>
          <small className="text-muted">{skeleton?.total_modules} modules, {skeleton?.total_lessons} lessons</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setStep('input')}>
            <i className="bi bi-arrow-left me-1" />Back
          </button>
          <button className="btn btn-sm btn-primary" onClick={handleGenerateBlueprints} disabled={loading}>
            {loading ? <><span className="spinner-border spinner-border-sm me-2" role="status" />Generating Blueprints...</> : 'Generate Blueprints'}
          </button>
        </div>
      </div>

      {skeleton?.modules.map(mod => (
        <div key={mod.temp_id} className="card border-0 shadow-sm mb-3">
          <div
            className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center"
            style={{ cursor: 'pointer' }}
            onClick={() => toggleModule(mod.temp_id)}
          >
            <span>
              <i className={`bi bi-chevron-${expandedModules.has(mod.temp_id) ? 'down' : 'right'} me-2`} />
              Module {mod.module_number}: {mod.title}
            </span>
            <span className="badge bg-light text-dark">{SKILL_AREA_LABELS[mod.skill_area] || mod.skill_area}</span>
          </div>
          {expandedModules.has(mod.temp_id) && (
            <div className="card-body p-0">
              <div className="list-group list-group-flush">
                {mod.lessons.map(les => (
                  <div key={les.temp_id} className="list-group-item">
                    <div className="d-flex justify-content-between">
                      <strong className="small">Lesson {les.lesson_number}: {les.title}</strong>
                      <small className="text-muted">{les.estimated_minutes} min</small>
                    </div>
                    <p className="small text-muted mb-1">{les.learning_goal}</p>
                    <textarea
                      className="form-control form-control-sm mt-1"
                      rows={2}
                      value={les.structure_prompt}
                      onChange={e => {
                        if (!skeleton) return;
                        const updated = { ...skeleton };
                        const m = updated.modules.find(x => x.temp_id === mod.temp_id);
                        const l = m?.lessons.find(x => x.temp_id === les.temp_id);
                        if (l) l.structure_prompt = e.target.value;
                        setSkeleton({ ...updated });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  // ─── Render: Preview + Governance Step ──────────────────────────

  const renderPreviewStep = () => (
    <div className="row g-4">
      <div className="col-lg-8">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0">Curriculum Preview</h6>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setStep('skeleton')}>
              <i className="bi bi-arrow-left me-1" />Back
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setStep('input')}>Edit Variables</button>
            <button className="btn btn-sm btn-outline-primary" onClick={handleGenerateBlueprints} disabled={loading}>Regenerate</button>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleApprove}
              disabled={loading || !governance?.can_approve}
              title={governance?.can_approve ? 'Approve and create curriculum' : governance?.block_reasons.join('; ')}
            >
              {loading ? <><span className="spinner-border spinner-border-sm me-2" role="status" />Approving...</> : 'Approve & Create'}
            </button>
          </div>
        </div>

        {skeleton?.modules.map(mod => {
          const modBlueprints = mod.lessons.map(l => blueprints?.find(b => b.lesson_temp_id === l.temp_id)).filter(Boolean) as LessonBlueprintPreview[];
          return (
            <div key={mod.temp_id} className="card border-0 shadow-sm mb-3">
              <div
                className="card-header bg-white fw-semibold d-flex justify-content-between"
                style={{ cursor: 'pointer' }}
                onClick={() => toggleModule(mod.temp_id)}
              >
                <span>
                  <i className={`bi bi-chevron-${expandedModules.has(mod.temp_id) ? 'down' : 'right'} me-2`} />
                  Module {mod.module_number}: {mod.title}
                </span>
                <span className="badge bg-light text-dark">{SKILL_AREA_LABELS[mod.skill_area] || mod.skill_area}</span>
              </div>
              {expandedModules.has(mod.temp_id) && (
                <div className="card-body p-2">
                  {modBlueprints.map(bp => (
                    <div key={bp.lesson_temp_id} className="mb-3">
                      <div className="fw-medium small mb-1">{bp.lesson_title}</div>
                      {bp.blueprint.mini_sections.length === 0 ? (
                        <span className="badge bg-danger">Blueprint generation failed</span>
                      ) : (
                        <div className="d-flex flex-wrap gap-1">
                          {bp.blueprint.mini_sections.map((ms, i) => (
                            <span key={i} className={`badge bg-${TYPE_COLORS[ms.type] || 'secondary'}`}>
                              {ms.student_label}: {ms.title}
                            </span>
                          ))}
                        </div>
                      )}
                      {(bp.variable_flow.produces.length > 0 || bp.variable_flow.consumes.length > 0) && (
                        <div className="mt-1 d-flex flex-wrap gap-1">
                          {bp.variable_flow.produces.map(v => (
                            <span key={`p-${v}`} className="badge bg-success bg-opacity-25 text-success border border-success" style={{ fontSize: '0.65rem' }}>
                              <i className="bi bi-plus-circle me-1" />{v}
                            </span>
                          ))}
                          {bp.variable_flow.consumes.map(v => (
                            <span key={`c-${v}`} className="badge bg-primary bg-opacity-25 text-primary border border-primary" style={{ fontSize: '0.65rem' }}>
                              <i className="bi bi-arrow-right-circle me-1" />{v}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="col-lg-4">
        {governance && (
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold">
              <i className="bi bi-shield-check me-2" />Governance Report
            </div>
            <div className="card-body">
              {/* Health Score */}
              <div className="mb-3">
                <div className="d-flex justify-content-between small mb-1">
                  <span>Health Score</span>
                  <strong>{governance.health_score}/100</strong>
                </div>
                <div className="progress" style={{ height: '8px' }}>
                  <div
                    className={`progress-bar bg-${governance.health_score >= 80 ? 'success' : governance.health_score >= 50 ? 'warning' : 'danger'}`}
                    style={{ width: `${governance.health_score}%` }}
                  />
                </div>
              </div>

              {/* Risk + Confidence */}
              <div className="d-flex gap-2 mb-3">
                <span className={`badge bg-${RISK_COLORS[governance.risk_level]}`}>
                  Risk: {governance.risk_level.toUpperCase()}
                </span>
                <span className="badge bg-light text-dark border">
                  Confidence: {Math.round(governance.confidence_score * 100)}%
                </span>
              </div>

              {/* Stats */}
              <div className="d-flex flex-wrap gap-2 mb-3">
                <span className="badge bg-success bg-opacity-10 text-success border">
                  {governance.total_variables_produced} produced
                </span>
                <span className="badge bg-primary bg-opacity-10 text-primary border">
                  {governance.total_variables_consumed} consumed
                </span>
              </div>

              {/* Block Reasons */}
              {governance.block_reasons.length > 0 && (
                <div className="alert alert-danger small py-2 mb-2">
                  <strong>Blocked:</strong>
                  <ul className="mb-0 ps-3 mt-1">
                    {governance.block_reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              {/* Issues */}
              {governance.missing_variables.length > 0 && (
                <div className="mb-2">
                  <small className="fw-medium text-danger">Missing Variables:</small>
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {governance.missing_variables.map(v => (
                      <span key={v} className="badge bg-danger">{v}</span>
                    ))}
                  </div>
                </div>
              )}

              {governance.timeline_violations.length > 0 && (
                <div className="mb-2">
                  <small className="fw-medium text-warning">Timeline Violations:</small>
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {governance.timeline_violations.map(v => (
                      <span key={v} className="badge bg-warning text-dark">{v}</span>
                    ))}
                  </div>
                </div>
              )}

              {governance.orphaned_variables.length > 0 && (
                <div className="mb-2">
                  <small className="fw-medium text-muted">Orphaned (warnings):</small>
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {governance.orphaned_variables.map(v => (
                      <span key={v} className="badge bg-secondary">{v}</span>
                    ))}
                  </div>
                </div>
              )}

              {governance.warnings.length > 0 && (
                <div className="mt-2">
                  {governance.warnings.map((w, i) => (
                    <div key={i} className="small text-muted"><i className="bi bi-exclamation-triangle me-1" />{w}</div>
                  ))}
                </div>
              )}

              {governance.can_approve && (
                <div className="alert alert-success small py-2 mt-3 mb-0">
                  <i className="bi bi-check-circle me-1" />All governance checks passed. Ready to approve.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Render: Approved Step ──────────────────────────────────────

  const renderApprovedStep = () => (
    <div>
      {approvalResult && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold text-success">
            <i className="bi bi-check-circle-fill me-2" />Curriculum Created Successfully
          </div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <div className="col-md-3">
                <div className="text-center p-3 bg-light rounded">
                  <div className="fs-3 fw-bold" style={{ color: 'var(--color-primary)' }}>{approvalResult.created_modules.length}</div>
                  <small className="text-muted">Modules</small>
                </div>
              </div>
              <div className="col-md-3">
                <div className="text-center p-3 bg-light rounded">
                  <div className="fs-3 fw-bold" style={{ color: 'var(--color-primary)' }}>{approvalResult.created_lessons.length}</div>
                  <small className="text-muted">Lessons</small>
                </div>
              </div>
              <div className="col-md-3">
                <div className="text-center p-3 bg-light rounded">
                  <div className="fs-3 fw-bold" style={{ color: 'var(--color-primary)' }}>{approvalResult.created_mini_sections}</div>
                  <small className="text-muted">Mini-Sections</small>
                </div>
              </div>
              <div className="col-md-3">
                <div className="text-center p-3 bg-light rounded">
                  <div className="fs-3 fw-bold" style={{ color: 'var(--color-primary)' }}>{approvalResult.created_variables}</div>
                  <small className="text-muted">Variables</small>
                </div>
              </div>
            </div>

            <div className="d-flex gap-2 mb-3">
              <span className="badge bg-info">
                {approvalResult.created_artifacts} artifacts created
              </span>
              <span className={`badge bg-${approvalResult.diagnostics_after.system_health_score >= 80 ? 'success' : 'warning'}`}>
                Post-creation health: {approvalResult.diagnostics_after.system_health_score}
              </span>
            </div>

            <h6 className="small fw-semibold mt-3">Created Modules:</h6>
            <ul className="small mb-3">
              {approvalResult.created_modules.map(m => (
                <li key={m.id}>{m.title} <span className="text-muted">({m.id.slice(0, 8)})</span></li>
              ))}
            </ul>

            <h6 className="small fw-semibold">Created Lessons:</h6>
            <ul className="small mb-3">
              {approvalResult.created_lessons.map(l => (
                <li key={l.id}>{l.title} <span className="text-muted">({l.id.slice(0, 8)})</span></li>
              ))}
            </ul>

            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-primary" onClick={() => { setStep('input'); setApprovalResult(null); setSkeleton(null); setBlueprints(null); setGovernance(null); }}>
                Generate Another Curriculum
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Main Render ────────────────────────────────────────────────

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 className="mb-1" style={{ color: 'var(--color-primary)' }}>Curriculum Generation Engine</h5>
          <p className="text-muted small mb-0">Generate governed curriculum structures from variables with full Control Tower integration</p>
        </div>
        <div className="d-flex gap-1">
          {['input', 'skeleton', 'preview', 'approved'].map((s, i) => (
            <span
              key={s}
              className={`badge ${step === s ? 'bg-primary' : i < ['input', 'skeleton', 'preview', 'approved'].indexOf(step) ? 'bg-success' : 'bg-light text-dark border'}`}
            >
              {i + 1}. {s === 'input' ? 'Configure' : s === 'skeleton' ? 'Skeleton' : s === 'preview' ? 'Preview' : 'Created'}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger small py-2 mb-3">
          <i className="bi bi-exclamation-triangle me-2" />{error}
          <button className="btn-close float-end" style={{ fontSize: '0.6rem' }} onClick={() => setError(null)} />
        </div>
      )}

      {step === 'input' && renderInputStep()}
      {step === 'skeleton' && renderSkeletonStep()}
      {step === 'preview' && renderPreviewStep()}
      {step === 'approved' && renderApprovedStep()}
    </div>
  );
}
