import React, { useState } from 'react';
import { MiniSection, MiniSectionType, TYPE_OPTIONS, PromptBody, DryRunResult, VariableOption, VariableMapData } from './types';
import PromptSection from './PromptSection';
import VariableSection from './VariableSection';
import SkillSection from './SkillSection';
import ArtifactSection from './ArtifactSection';
import KnowledgeCheckSection from './KnowledgeCheckSection';
import ValidationSection from './ValidationSection';
import { PromptOption } from './types';

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
}

interface AccordionState {
  core: boolean;
  prompts: boolean;
  variables: boolean;
  skills: boolean;
  artifacts: boolean;
  kc: boolean;
  validation: boolean;
}

export default function ObjectConfigEngine(props: Props) {
  const { editing, isNew, isDirty, miniSections, saving, error } = props;
  const [expanded, setExpanded] = useState<AccordionState>({
    core: true, prompts: true, variables: true, skills: false, artifacts: false, kc: false, validation: false,
  });

  if (!editing) {
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

  const editType = editing.mini_section_type;
  const selectedTypeInfo = TYPE_OPTIONS.find(t => t.value === editType);
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
          <span className="fw-semibold small">{isNew ? 'New Mini-Section' : 'Configure'}</span>
          {isDirty && <span className="badge bg-warning-subtle text-warning border" style={{ fontSize: 8 }}>unsaved changes</span>}
        </div>
        {selectedTypeInfo && (
          <span className={`badge ${selectedTypeInfo.badge}`} style={{ fontSize: 9 }}>{selectedTypeInfo.studentLabel}</span>
        )}
      </div>
      <div className="card-body py-2" style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
        {error && <div className="alert alert-danger small py-1 mb-2">{error}</div>}

        {/* Core Section */}
        {renderAccordion('core', 'Core', 'bi-gear', (
          <div className="row g-2">
            <div className="col-md-6">
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
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {selectedTypeInfo && <div className="text-muted" style={{ fontSize: 10 }}>{selectedTypeInfo.description}</div>}
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium mb-0">Title <span className="text-danger">*</span></label>
              <input className="form-control form-control-sm" value={editing.title || ''} onChange={e => props.onUpdate({ title: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-medium mb-0">Weight</label>
              <input className="form-control form-control-sm" type="number" step="0.1" value={editing.completion_weight ?? 1} onChange={e => props.onUpdate({ completion_weight: parseFloat(e.target.value) })} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium mb-0">Description</label>
              <textarea className="form-control form-control-sm" rows={2} value={editing.description || ''} onChange={e => props.onUpdate({ description: e.target.value })} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium mb-0">Learning Goal</label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                value={editing.settings_json?.learning_goal || ''}
                onChange={e => props.onUpdate({ settings_json: { ...(editing.settings_json || {}), learning_goal: e.target.value } })}
                placeholder="What should the student learn from this section?"
              />
            </div>
          </div>
        ))}

        {/* Prompts Section */}
        {renderAccordion('prompts', 'Prompts', 'bi-chat-left-text', (
          <PromptSection
            editing={editing}
            prompts={props.prompts}
            promptBodies={props.promptBodies}
            fetchPromptBody={props.fetchPromptBody}
            onUpdate={props.onUpdate}
          />
        ))}

        {/* Variables Section */}
        {renderAccordion('variables', 'Variables', 'bi-braces', (
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
        ))}

        {/* Skills Section */}
        {renderAccordion('skills', 'Skills', 'bi-stars', (
          <SkillSection
            editing={editing}
            skillOptions={props.skillOptions}
            onUpdate={props.onUpdate}
            onCreateSkill={props.onCreateSkill}
          />
        ))}

        {/* Artifacts Section (implementation_task only) */}
        {renderAccordion('artifacts', 'Artifacts', 'bi-box', (
          <ArtifactSection
            editing={editing}
            artifactOptions={props.artifactOptions}
            artifacts={props.artifacts}
            onUpdate={props.onUpdate}
            onCreateArtifact={props.onCreateArtifact}
          />
        ), editType === 'implementation_task')}

        {/* Knowledge Check Section (knowledge_check only) */}
        {renderAccordion('kc', 'Knowledge Check', 'bi-question-circle', (
          <KnowledgeCheckSection editing={editing} onUpdate={props.onUpdate} />
        ), editType === 'knowledge_check')}

        {/* Validation Section */}
        {renderAccordion('validation', 'Validation', 'bi-check-circle', (
          <ValidationSection
            editing={editing}
            dryRun={props.dryRun}
            validating={props.validating}
            onRevalidate={props.onRevalidate}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="card-footer bg-white py-2 d-flex justify-content-between">
        <div>
          {editing.id && (
            <button className="btn btn-sm btn-outline-danger" onClick={() => props.onDelete(editing.id!)}>
              <i className="bi bi-trash me-1"></i>Delete
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
    </div>
  );
}
