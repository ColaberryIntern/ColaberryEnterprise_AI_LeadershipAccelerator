import React, { useState, useCallback, useMemo } from 'react';
import api from '../../../../utils/api';
import { MiniSection, MiniSectionType, TYPE_OPTIONS, TYPE_ICONS, PromptBody, DryRunResult, VariableOption, VariableMapData, QualityBreakdown, Suggestion, DiagnosticReport, RepairResult, TypeDefinition, buildTypeOptions, PROMPT_PAIRS, extractPlaceholders, computeAvailableVars } from './types';
import HighlightedPromptEditor from './HighlightedPromptEditor';
import VariableSection from './VariableSection';
import SkillSection from './SkillSection';
import ArtifactSection from './ArtifactSection';
import KnowledgeCheckSection from './KnowledgeCheckSection';
import ValidationSection from './ValidationSection';
import QualityScoreSection from './QualityScoreSection';
import SuggestionSection from './SuggestionSection';
import ConceptV2 from '../../../../components/portal/lesson/ConceptV2';
import { generateMockV2Content } from './mockDataGenerator';
import { PromptOption } from './types';

/* Mentor face SVG — matches the FAB in PortalMentorChat for admin preview */
const PreviewMentorFace = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="2" />
    <path d="M12 28c0-11 9-20 20-20s20 9 20 20" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" fill="none" />
    <circle cx="22" cy="30" r="3.5" fill="#6366f1" />
    <circle cx="42" cy="30" r="3.5" fill="#6366f1" />
    <circle cx="23.2" cy="28.8" r="1.2" fill="#fff" />
    <circle cx="43.2" cy="28.8" r="1.2" fill="#fff" />
    <path d="M22 40c3 4 8 6 10 6s7-2 10-6" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <rect x="7" y="24" width="6" height="10" rx="3" fill="#8b5cf6" />
    <rect x="51" y="24" width="6" height="10" rx="3" fill="#8b5cf6" />
    <path d="M10 34v6c0 3 2 5 5 5h3" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" fill="none" />
    <circle cx="19" cy="45" r="2" fill="#8b5cf6" />
  </svg>
);

interface Props {
  editing: Partial<MiniSection> | null;
  isNew: boolean;
  isDirty: boolean;
  miniSections: MiniSection[];
  // Reference data
  prompts: PromptOption[];
  skillOptions: { value: string; label: string; sub?: string }[];
  variableOptions: { value: string; label: string; sub?: string }[];
  artifactOptions: { value: string; label: string; sub?: string }[];
  variables: VariableOption[];
  systemVariables: VariableOption[];
  artifacts: { id: string; name: string; artifact_type: string; produces_variable_keys?: string[] }[];
  promptBodies: Record<string, PromptBody>;
  fetchPromptBody: (id: string) => Promise<PromptBody | null>;
  // Validation
  dryRun: DryRunResult | null;
  variableMap: VariableMapData | null;
  validating: boolean;
  onRevalidate: () => void;
  // Actions
  onUpdate: (updates: Partial<MiniSection>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  saving: boolean;
  error: string;
  // Inline creators
  onCreateVariable: () => void;
  onCreateSkill: () => void;
  onCreateArtifact: () => void;
  // Quality & diagnostics
  qualityBreakdown: QualityBreakdown | null;
  qualityLoading: boolean;
  onRefreshQuality: () => void;
  suggestions: Suggestion[];
  suggestionsLoading: boolean;
  applyingSuggestion: string | null;
  onRefreshSuggestions: () => void;
  onApplySuggestionFix: (s: Suggestion) => void;
  onOpenDiagnostic: () => void;
  onOpenRepair: () => void;
  onSelectMiniSection?: (id: string | null) => void;
  typeDefinitions?: TypeDefinition[];
  // Preview props
  lessonTitle?: string;
  lessonId?: string;
  token?: string;
  apiUrl?: string;
}

interface AccordionState {
  validation: boolean;
  quality: boolean;
  suggestions: boolean;
}

export default function ObjectConfigEngine(props: Props) {
  const { editing, isNew, isDirty, miniSections, saving, error } = props;
  const [expanded, setExpanded] = useState<AccordionState>({
    validation: false, quality: false, suggestions: false,
  });
  const [showPreview, setShowPreview] = useState(false);
  const [reversePrompt, setReversePrompt] = useState('');
  const [reverseLoading, setReverseLoading] = useState(false);
  const [showReverseModal, setShowReverseModal] = useState(false);

  // All useMemo/useCallback hooks MUST be before any early return to maintain hook order
  const mockContent = useMemo(
    () => generateMockV2Content(miniSections, props.lessonTitle || 'Untitled Section'),
    [miniSections, props.lessonTitle]
  );

  const editType = editing?.mini_section_type;
  const corePromptPairs = useMemo(() =>
    PROMPT_PAIRS.filter(p => !editType || p.applicableTypes.includes(editType)),
    [editType]
  );
  const currentOrder = editing?.mini_section_order ?? 999;
  const systemVarKeys = useMemo(() => props.systemVariables.map(v => v.variable_key), [props.systemVariables]);
  const coreAvailableVars = useMemo(() =>
    computeAvailableVars(miniSections, currentOrder, systemVarKeys),
    [miniSections, currentOrder, systemVarKeys]
  );
  const coreAllDefinedVars = useMemo(() =>
    new Set(props.variables.map(v => v.variable_key)),
    [props.variables]
  );

  const handleReverseEngineer = useCallback(async () => {
    if (!editing?.id) return;
    setReverseLoading(true);
    setShowReverseModal(true);
    setReversePrompt('');
    try {
      const res = await api.post(`/api/admin/orchestration/mini-sections/${editing.id}/reverse-engineer`);
      setReversePrompt(res.data.prompt || '');
    } catch (err: any) {
      setReversePrompt(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setReverseLoading(false);
    }
  }, [editing?.id]);

  const effectiveTypeOptions = props.typeDefinitions?.length ? buildTypeOptions(props.typeDefinitions) : TYPE_OPTIONS;

  if (!editing) {
    // Show collapsed type sections as clickable entry points
    if (miniSections.length > 0) {
      return (
        <div className="card border-0 shadow-sm">
          <div className="card-body py-2">
            {effectiveTypeOptions.map(type => {
              const ms = miniSections.find(m => m.mini_section_type === type.value);
              if (!ms) return null;
              const typeIcon = TYPE_ICONS[type.value] || 'bi-circle';
              return (
                <div key={type.value} className="border rounded mb-2">
                  <div
                    className="d-flex align-items-center gap-2 px-3 py-2"
                    style={{ cursor: 'pointer' }}
                    onClick={() => props.onSelectMiniSection?.(ms.id)}
                  >
                    <i className={`bi ${typeIcon}`} style={{ fontSize: 13, color: 'var(--color-primary-light, #2b6cb0)' }}></i>
                    <span className="fw-semibold small">{type.studentLabel}</span>
                    <span className="text-muted ms-1" style={{ fontSize: 10 }}>{ms.title}</span>
                    <span className="ms-auto" style={{ fontSize: 11 }}>{'\u25BC'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-body text-center py-5">
          <i className="bi bi-sliders" style={{ fontSize: 36, color: 'var(--color-text-light)' }}></i>
          <h6 className="fw-bold mt-3">Select a Component</h6>
          <p className="text-muted small mb-0">Click a mini-section on the left to configure it, or click <strong>+ Add</strong> to create a new one.</p>
        </div>
      </div>
    );
  }

  const selectedTypeInfo = effectiveTypeOptions.find(t => t.value === editType);
  const canSave = !!editing.title && !!editType;

  const toggle = (key: keyof AccordionState) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const renderAccordion = (key: keyof AccordionState, label: string, icon: string, content: React.ReactNode, show = true) => {
    if (!show) return null;
    return (
      <div className="border rounded mb-2">
        <div
          className="d-flex align-items-center gap-2 px-3 py-2"
          style={{ cursor: 'pointer', backgroundColor: expanded[key] ? 'var(--color-bg-alt, #f7fafc)' : 'transparent' }}
          onClick={() => toggle(key)}
        >
          <i className={`bi ${icon}`} style={{ fontSize: 13 }}></i>
          <span className="fw-semibold small">{label}</span>
          <span className="ms-auto" style={{ fontSize: 11 }}>{expanded[key] ? '\u25B2' : '\u25BC'}</span>
        </div>
        {expanded[key] && (
          <div className="px-3 py-2" style={{ borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
            {content}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center gap-2">
          <div className="btn-group btn-group-sm">
            <button
              className={`btn ${!showPreview ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setShowPreview(false)}
              style={{ fontSize: 11 }}
            >
              <i className="bi bi-gear me-1"></i>{isNew ? 'New' : 'Configure'}
            </button>
            <button
              className={`btn ${showPreview ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setShowPreview(true)}
              style={{ fontSize: 11 }}
            >
              <i className="bi bi-eye me-1"></i>Preview
            </button>
          </div>
          {isDirty && <span className="badge bg-warning-subtle text-warning border" style={{ fontSize: 8 }}>unsaved changes</span>}
          {!showPreview && editing.quality_score != null && (
            <span className={`badge ${editing.quality_score >= 90 ? 'bg-info' : editing.quality_score >= 70 ? 'bg-success' : editing.quality_score >= 40 ? 'bg-warning text-dark' : 'bg-danger'}`} style={{ fontSize: 9 }}>
              Score: {Math.round(editing.quality_score)}
            </span>
          )}
        </div>
        {selectedTypeInfo && (
          <span className={`badge ${selectedTypeInfo.badge}`} style={{ fontSize: 9 }}>{selectedTypeInfo.studentLabel}</span>
        )}
      </div>
      {showPreview ? (
        <div className="card-body py-3" style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', position: 'relative' }}>
          <div className="mb-2 d-flex align-items-center gap-2">
            <span className="badge bg-secondary" style={{ fontSize: 10 }}>Mock Data</span>
            <span className="text-muted" style={{ fontSize: 11 }}>This preview uses generated sample data — not AI output.</span>
          </div>
          <ConceptV2
            content={mockContent}
            lessonId={props.lessonId || ''}
            isCompleted={false}
          />
          {/* Mentor FAB — visual replica of the student-side AI Mentor button */}
          <div
            style={{
              position: 'sticky',
              bottom: 12,
              display: 'flex',
              justifyContent: 'flex-end',
              pointerEvents: 'none',
              marginTop: 16,
            }}
          >
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                border: '3px solid #fff',
                boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <PreviewMentorFace size={48} />
            </div>
          </div>
        </div>
      ) : (
      <div className="card-body py-2" style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
        {error && <div className="alert alert-danger small py-1 mb-2">{error}</div>}

        {/* New item — type selector */}
        {isNew && (
          <div className="mb-2">
            <label className="form-label small fw-medium mb-0">Type <span className="text-danger">*</span></label>
            <select
              className="form-select form-select-sm"
              value={editType || ''}
              onChange={e => {
                const newType = e.target.value as MiniSectionType;
                const updates: Partial<MiniSection> = { mini_section_type: newType };
                if (newType !== 'prompt_template') updates.creates_variable_keys = [];
                if (newType !== 'implementation_task') updates.creates_artifact_ids = [];
                if (newType !== 'knowledge_check') updates.knowledge_check_config = { enabled: false, question_count: 3, pass_score: 70 };
                props.onUpdate(updates);
              }}
            >
              <option value="">Select type...</option>
              {effectiveTypeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        )}

        {/* Type-based configuration sections */}
        {effectiveTypeOptions.map(type => {
          const typeMiniSection = miniSections.find(m => m.mini_section_type === type.value);
          const isActive = editing?.mini_section_type === type.value;
          const typeIcon = TYPE_ICONS[type.value] || 'bi-circle';
          const msTitle = isActive ? editing?.title : typeMiniSection?.title;

          // For new items, only show the selected type
          if (isNew && type.value !== editType) return null;
          // For existing items, skip types with no mini-section (unless active)
          if (!isNew && !typeMiniSection && !isActive) return null;

          // Compute type-specific prompt pairs for this type
          const typePromptPairs = PROMPT_PAIRS.filter(p => p.applicableTypes.includes(type.value));

          return (
            <div key={type.value} className="border rounded mb-2">
              {/* Section header */}
              <div
                className="d-flex align-items-center gap-2 px-3 py-2"
                style={{
                  cursor: (typeMiniSection || isActive) ? 'pointer' : 'default',
                  backgroundColor: isActive ? 'var(--color-bg-alt, #f7fafc)' : 'transparent',
                }}
                onClick={() => {
                  if (props.onSelectMiniSection) {
                    if (isActive) {
                      props.onSelectMiniSection(null);
                    } else if (typeMiniSection) {
                      props.onSelectMiniSection(typeMiniSection.id);
                    }
                  }
                }}
              >
                <i className={`bi ${typeIcon}`} style={{ fontSize: 13, color: isActive ? 'var(--color-primary-light, #2b6cb0)' : undefined }}></i>
                <span className="fw-semibold small">{type.studentLabel}</span>
                {msTitle && <span className="text-muted ms-1 text-truncate" style={{ fontSize: 10, maxWidth: 200 }}>{msTitle}</span>}
                <span className="ms-auto" style={{ fontSize: 11 }}>{isActive ? '\u25B2' : '\u25BC'}</span>
              </div>

              {/* Section content — only shown for active type */}
              {isActive && editing && (
                <div className="px-3 py-2" style={{ borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
                  {/* Title & Details */}
                  <div className="row g-2 mb-3">
                    <div className="col-md-8">
                      <label className="form-label small fw-medium mb-0">Title <span className="text-danger">*</span></label>
                      <input className="form-control form-control-sm" value={editing.title || ''} onChange={e => props.onUpdate({ title: e.target.value })} />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-medium mb-0">Weight</label>
                      <input className="form-control form-control-sm" type="number" step="0.1" value={editing.completion_weight ?? 1} onChange={e => props.onUpdate({ completion_weight: parseFloat(e.target.value) })} />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium mb-0">Description</label>
                      <textarea className="form-control form-control-sm" rows={2} value={editing.description || ''} onChange={e => props.onUpdate({ description: e.target.value })} />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium mb-0">Learning Goal</label>
                      <textarea className="form-control form-control-sm" rows={2} value={editing.settings_json?.learning_goal || ''} onChange={e => props.onUpdate({ settings_json: { ...(editing.settings_json || {}), learning_goal: e.target.value } })} placeholder="What should the student learn from this section?" />
                    </div>
                  </div>

                  {/* Prompts */}
                  {typePromptPairs.length > 0 && (
                    <div className="mb-3 border-top pt-2">
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <i className="bi bi-chat-left-text" style={{ fontSize: 12, color: 'var(--color-primary-light)' }}></i>
                        <span className="fw-semibold small">Prompts</span>
                        <span className="text-muted" style={{ fontSize: 10 }}>Use <code style={{ fontSize: 10 }}>{'{{variable_key}}'}</code> for dynamic values</span>
                      </div>
                      {typePromptPairs
                        .filter(pair => !(pair.key === 'mentor' && (editType === 'executive_reality_check' || editType === 'ai_strategy')))
                        .map(pair => {
                          const sysVal = (editing[pair.systemField] as string) || '';
                          const usrVal = (editing[pair.userField] as string) || '';
                          const combinedValue = sysVal && usrVal ? sysVal + '\n\n' + usrVal : sysVal || usrVal;
                          const implLabels: Record<string, { label: string; tooltip: string }> = {
                            build: { label: 'Task Requirements Prompt', tooltip: 'Defines requirements, deliverables, and grading criteria. Analyzed for skill derivation.' },
                            mentor: { label: 'Mentor Preparation Prompt', tooltip: 'Configures how the AI Mentor briefs the student before they start (Step 2 of workflow).' },
                            reflection: { label: 'AI Workstation Prompt', tooltip: 'Sent to the student\'s chosen external LLM (ChatGPT, Claude, etc.) when they click Open AI Workspace.' },
                          };
                          const displayLabel = editType === 'implementation_task' && implLabels[pair.key]
                            ? implLabels[pair.key].label : pair.label;
                          const tooltip = editType === 'implementation_task' && implLabels[pair.key]
                            ? implLabels[pair.key].tooltip : '';
                          return (
                            <div key={pair.key} className="mb-2">
                              <span className="text-muted fw-medium" style={{ fontSize: 10 }} title={tooltip}>{displayLabel} {tooltip && <i className="bi bi-info-circle" style={{ fontSize: 9 }}></i>}</span>
                              <HighlightedPromptEditor
                                value={combinedValue}
                                onChange={val => props.onUpdate({ [pair.systemField]: val, [pair.userField]: '' } as any)}
                                availableVars={coreAvailableVars}
                                allDefinedVars={coreAllDefinedVars}
                                label="PROMPT"
                                rows={5}
                                placeholder="Instructions for the AI model with {{variable}} placeholders..."
                              />
                            </div>
                          );
                        })}
                    </div>
                  )}

                  {/* Variables */}
                  <div className="mb-3 border-top pt-2">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <i className="bi bi-braces" style={{ fontSize: 12 }}></i>
                      <span className="fw-semibold small">Variables</span>
                    </div>
                    <VariableSection
                      editing={editing}
                      miniSections={miniSections}
                      variables={props.variables}
                      systemVariables={props.systemVariables}
                      variableMap={props.variableMap}
                      promptBodies={props.promptBodies}
                      artifacts={props.artifacts}
                      onUpdate={props.onUpdate}
                      onCreateVariable={props.onCreateVariable}
                    />
                  </div>

                  {/* Skills */}
                  <div className="mb-3 border-top pt-2">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <i className="bi bi-stars" style={{ fontSize: 12 }}></i>
                      <span className="fw-semibold small">Skills</span>
                    </div>
                    <SkillSection
                      editing={editing}
                      editType={editType}
                      miniSectionId={editing.id}
                      skillOptions={props.skillOptions}
                      onUpdate={props.onUpdate}
                      onCreateSkill={props.onCreateSkill}
                      token={props.token}
                      apiUrl={props.apiUrl}
                    />
                  </div>

                  {/* Artifacts (implementation_task only) */}
                  {editType === 'implementation_task' && (
                    <div className="mb-3 border-top pt-2">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <i className="bi bi-box" style={{ fontSize: 12 }}></i>
                        <span className="fw-semibold small">Artifacts</span>
                      </div>
                      <ArtifactSection
                        editing={editing}
                        artifactOptions={props.artifactOptions}
                        artifacts={props.artifacts}
                        onUpdate={props.onUpdate}
                        onCreateArtifact={props.onCreateArtifact}
                      />
                    </div>
                  )}

                  {/* Knowledge Check (knowledge_check only) */}
                  {editType === 'knowledge_check' && (
                    <div className="mb-3 border-top pt-2">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <i className="bi bi-question-circle" style={{ fontSize: 12 }}></i>
                        <span className="fw-semibold small">Knowledge Check Config</span>
                      </div>
                      <KnowledgeCheckSection editing={editing} onUpdate={props.onUpdate} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Diagnostic tools for active mini-section */}
        {renderAccordion('validation', 'Validation', 'bi-check-circle', (
          <ValidationSection
            editing={editing}
            dryRun={props.dryRun}
            validating={props.validating}
            onRevalidate={props.onRevalidate}
          />
        ))}

        {renderAccordion('quality', 'Quality Score', 'bi-graph-up', (
          <QualityScoreSection
            miniSectionId={editing.id}
            qualityBreakdown={props.qualityBreakdown}
            loading={props.qualityLoading}
            onRefresh={props.onRefreshQuality}
          />
        ), !!editing.id)}

        {renderAccordion('suggestions', 'Improve to 100', 'bi-lightbulb', (
          <SuggestionSection
            miniSectionId={editing.id}
            suggestions={props.suggestions}
            loading={props.suggestionsLoading}
            applying={props.applyingSuggestion}
            onRefresh={props.onRefreshSuggestions}
            onApplyFix={props.onApplySuggestionFix}
          />
        ), !!editing.id)}

        {editing.id && (
          <div className="d-flex gap-2 mt-2 mb-1">
            <button className="btn btn-sm btn-outline-primary flex-grow-1" onClick={props.onOpenDiagnostic}>
              <i className="bi bi-clipboard2-pulse me-1"></i>Full Diagnostic
            </button>
            <button className="btn btn-sm btn-outline-warning flex-grow-1" onClick={props.onOpenRepair}>
              <i className="bi bi-wrench-adjustable me-1"></i>Auto-Repair
            </button>
          </div>
        )}
      </div>
      )}

      {/* Footer */}
      <div className="card-footer bg-white py-2 d-flex justify-content-between">
        <div className="d-flex gap-2">
          {editing.id && (
            <button className="btn btn-sm btn-outline-danger" onClick={() => props.onDelete(editing.id!)}>
              <i className="bi bi-trash me-1"></i>Delete
            </button>
          )}
          {editing.id && !isNew && (
            <button className="btn btn-sm btn-outline-secondary" onClick={handleReverseEngineer} title="Reverse Engineer Prompt">
              <i className="bi bi-arrow-repeat me-1"></i>Reverse Engineer
            </button>
          )}
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={props.onCancel}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={props.onSave} disabled={saving || !canSave}>
            {saving ? 'Saving...' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>

      {/* Reverse Engineer Modal */}
      {showReverseModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) setShowReverseModal(false); }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title fw-semibold"><i className="bi bi-arrow-repeat me-2"></i>Reverse Engineered Prompt</h6>
                <button type="button" className="btn-close" onClick={() => setShowReverseModal(false)}></button>
              </div>
              <div className="modal-body">
                {reverseLoading ? (
                  <div className="text-center py-4">
                    <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
                    <div className="small text-muted mt-2">Analyzing mini-section configuration...</div>
                  </div>
                ) : (
                  <>
                    <label className="form-label small fw-medium">Natural Language Description</label>
                    <textarea className="form-control form-control-sm" rows={10} value={reversePrompt} onChange={e => setReversePrompt(e.target.value)} />
                    <div className="form-text">This prompt describes how to recreate this mini-section. Copy and edit it to create variations.</div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowReverseModal(false)}>Close</button>
                <button className="btn btn-sm btn-outline-primary" onClick={() => navigator.clipboard.writeText(reversePrompt)}>
                  <i className="bi bi-clipboard me-1"></i>Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
