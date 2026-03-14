import React from 'react';
import { MiniSection, VariableOption, VariableMapData, extractPlaceholders, computeAvailableVars, PromptBody } from './types';
import MultiSelect from './MultiSelect';

interface Props {
  editing: Partial<MiniSection>;
  miniSections: MiniSection[];
  variables: VariableOption[];
  systemVariables: VariableOption[];
  variableMap: VariableMapData | null;
  promptBodies: Record<string, PromptBody>;
  artifacts: { id: string; name: string; artifact_type: string; produces_variable_keys?: string[] }[];
  sectionVariableKeys?: string[];
  onUpdate: (updates: Partial<MiniSection>) => void;
  onCreateVariable: () => void;
}

export default function VariableSection({
  editing, miniSections, variables, systemVariables, variableMap, promptBodies, artifacts, sectionVariableKeys, onUpdate, onCreateVariable,
}: Props) {
  const editType = editing.mini_section_type;
  const currentOrder = editing.mini_section_order || miniSections.length + 1;
  const systemVarKeys = systemVariables.map(v => v.variable_key);
  const availableVars = computeAvailableVars(miniSections as MiniSection[], currentOrder, systemVarKeys);
  const variableOptions = variables.map(v => ({ value: v.variable_key, label: v.display_name || v.variable_key, sub: v.scope }));

  // Auto-detect placeholders from linked prompt templates
  const detectedPlaceholders: string[] = [];
  const promptIds = [editing.concept_prompt_template_id, editing.build_prompt_template_id, editing.mentor_prompt_template_id].filter(Boolean) as string[];
  for (const pid of promptIds) {
    if (promptBodies[pid]?.user_prompt_template) {
      detectedPlaceholders.push(...extractPlaceholders(promptBodies[pid].user_prompt_template));
    }
  }
  const uniqueDetected = [...new Set(detectedPlaceholders)];
  const existingVarKeys = new Set(variables.map(v => v.variable_key));
  const unregisteredPlaceholders = uniqueDetected.filter(p => !existingVarKeys.has(p));

  // Artifact-generated variables
  const linkedArtifactIds = editing.creates_artifact_ids || [];
  const artifactVars: string[] = [];
  for (const aid of linkedArtifactIds) {
    const art = artifacts.find(a => a.id === aid);
    if (art?.produces_variable_keys) artifactVars.push(...art.produces_variable_keys);
  }

  // Validation
  const referencedKeys = editing.associated_variable_keys || [];
  const warnings: { type: 'error' | 'warning'; msg: string }[] = [];
  for (const key of referencedKeys) {
    if (!existingVarKeys.has(key) && !systemVarKeys.includes(key)) {
      warnings.push({ type: 'error', msg: `Variable "${key}" referenced but not defined in any VariableDefinition` });
    } else if (!availableVars.has(key)) {
      warnings.push({ type: 'error', msg: `Ordering violation: "${key}" is used at order ${currentOrder} but not yet available` });
    }
  }

  // Unused created vars
  if (variableMap) {
    const createdKeys = editing.creates_variable_keys || [];
    for (const key of createdKeys) {
      const isReferenced = variableMap.referenced.some(r => r.key === key);
      if (!isReferenced) {
        warnings.push({ type: 'warning', msg: `Variable "${key}" is created but never referenced downstream` });
      }
    }
  }

  const hasOrderViolations = warnings.some(w => w.type === 'error' && w.msg.includes('Ordering violation'));

  return (
    <div>
      {/* 1. System Variables (read-only) */}
      <div className="mb-3">
        <h6 className="small fw-semibold mb-1" style={{ fontSize: 11 }}>
          <i className="bi bi-shield-check me-1"></i>System Variables
          <span className="badge bg-light text-muted border ms-1" style={{ fontSize: 8 }}>always available</span>
        </h6>
        <div className="d-flex flex-wrap gap-1">
          {systemVariables.length === 0 ? (
            <span className="text-muted" style={{ fontSize: 10 }}>No system variables registered</span>
          ) : (
            systemVariables.map(v => (
              <span key={v.variable_key} className="badge bg-light text-muted border" style={{ fontSize: 9 }}>
                {v.display_name || v.variable_key}
              </span>
            ))
          )}
        </div>
      </div>

      {/* 1b. Section Variables (inherited, read-only) */}
      {((sectionVariableKeys && sectionVariableKeys.length > 0) || true) && (
        <div className="mb-3">
          <h6 className="small fw-semibold mb-1" style={{ fontSize: 11, color: '#553c9a' }}>
            <i className="bi bi-diagram-3 me-1"></i>Section Variables
            <span className="badge ms-1" style={{ fontSize: 8, background: 'rgba(128,90,213,0.12)', color: '#553c9a' }}>inherited</span>
          </h6>
          <div className="d-flex flex-wrap gap-1">
            {['section_title', 'section_description', 'section_learning_goal'].map(k => (
              <span key={k} className="badge" style={{ fontSize: 9, background: 'rgba(128,90,213,0.12)', color: '#553c9a', border: '1px solid rgba(128,90,213,0.2)' }}>
                {`{{${k}}}`}
              </span>
            ))}
            {(sectionVariableKeys || []).map(k => (
              <span key={k} className="badge" style={{ fontSize: 9, background: 'rgba(128,90,213,0.12)', color: '#553c9a', border: '1px solid rgba(128,90,213,0.2)' }}>
                {`{{${k}}}`}
              </span>
            ))}
          </div>
          <span className="text-muted" style={{ fontSize: 9 }}>
            <i className="bi bi-info-circle me-1"></i>Edit in Section Control tab
          </span>
        </div>
      )}

      {/* 2. Prompt Template Created Variables (prompt_template only) */}
      {editType === 'prompt_template' && (
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <h6 className="small fw-semibold mb-0" style={{ fontSize: 11 }}>
              <i className="bi bi-plus-circle me-1 text-success"></i>Prompt-Created Variables
            </h6>
            <button className="btn btn-link p-0 text-success" onClick={onCreateVariable} style={{ fontSize: 10 }}>
              + Create Variable
            </button>
          </div>
          <MultiSelect
            label=""
            options={variableOptions}
            selected={editing.creates_variable_keys || []}
            onChange={vals => onUpdate({ creates_variable_keys: vals })}
            colorClass="text-success"
            badgeClass="bg-success-subtle text-success"
          />
          {/* Detected placeholder suggestions */}
          {unregisteredPlaceholders.length > 0 && (
            <div className="mt-1 p-2 border rounded" style={{ backgroundColor: 'var(--color-bg-alt, #f7fafc)' }}>
              <span className="text-muted" style={{ fontSize: 9 }}>
                <i className="bi bi-magic me-1"></i>Detected from prompt templates (not yet registered):
              </span>
              <div className="d-flex flex-wrap gap-1 mt-1">
                {unregisteredPlaceholders.map(p => (
                  <span key={p} className="badge bg-warning-subtle text-warning border" style={{ fontSize: 9 }}>
                    {`{{${p}}}`}
                    <button
                      className="btn-close ms-1"
                      style={{ fontSize: 6 }}
                      onClick={onCreateVariable}
                      title="Register this variable"
                    />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Artifact-Generated Variables (implementation_task only) */}
      {editType === 'implementation_task' && artifactVars.length > 0 && (
        <div className="mb-3">
          <h6 className="small fw-semibold mb-1" style={{ fontSize: 11 }}>
            <i className="bi bi-box me-1 text-warning"></i>Artifact-Generated Variables
            <span className="badge bg-light text-muted border ms-1" style={{ fontSize: 8 }}>read-only</span>
          </h6>
          <div className="d-flex flex-wrap gap-1">
            {artifactVars.map(v => (
              <span key={v} className="badge bg-warning-subtle text-dark border" style={{ fontSize: 9 }}>
                {v}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 4. Referenced Variables (always shown) */}
      <div className="mb-3">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h6 className="small fw-semibold mb-0" style={{ fontSize: 11 }}>
            <i className="bi bi-arrow-right-circle me-1 text-info"></i>Referenced Variables
          </h6>
          <button className="btn btn-link p-0" onClick={onCreateVariable} style={{ fontSize: 10 }}>
            + Create Variable
          </button>
        </div>
        <MultiSelect
          label=""
          options={variableOptions}
          selected={editing.associated_variable_keys || []}
          onChange={vals => onUpdate({ associated_variable_keys: vals })}
          badgeClass="bg-info-subtle text-info"
        />
        {/* Color-coded availability indicators */}
        {referencedKeys.length > 0 && (
          <div className="d-flex flex-wrap gap-1 mt-1">
            {referencedKeys.map(key => {
              const isSystem = systemVarKeys.includes(key);
              const isAvailable = availableVars.has(key);
              const isDefined = existingVarKeys.has(key);
              const cls = isSystem
                ? 'bg-light text-muted border'
                : isAvailable
                  ? 'bg-success-subtle text-success border border-success'
                  : isDefined
                    ? 'bg-warning-subtle text-warning border border-warning'
                    : 'bg-danger-subtle text-danger border border-danger';
              const icon = isSystem ? 'bi-shield-check' : isAvailable ? 'bi-check-circle' : isDefined ? 'bi-clock' : 'bi-x-circle';
              return (
                <span key={key} className={`badge ${cls}`} style={{ fontSize: 8 }}>
                  <i className={`bi ${icon} me-1`}></i>{key}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Summary Row */}
      <div className="d-flex align-items-center gap-2 mb-2 border-top pt-2">
        <span className="text-muted" style={{ fontSize: 10 }}>
          Available: {availableVars.size} | Referenced: {referencedKeys.length} | Created: {(editing.creates_variable_keys || []).length}
        </span>
        {warnings.length > 0 && (
          <span className={`badge ${hasOrderViolations ? 'bg-danger' : 'bg-warning text-dark'}`} style={{ fontSize: 9 }}>
            {warnings.length} issue{warnings.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* 6. Inline Warnings */}
      {warnings.length > 0 && (
        <div>
          {warnings.map((w, i) => (
            <div key={i} className={`alert ${w.type === 'error' ? 'alert-danger' : 'alert-warning'} py-1 px-2 mb-1`} style={{ fontSize: 10 }}>
              <i className={`bi ${w.type === 'error' ? 'bi-exclamation-triangle' : 'bi-info-circle'} me-1`}></i>
              {w.msg}
            </div>
          ))}
          {hasOrderViolations && (
            <div className="alert alert-danger py-1 px-2" style={{ fontSize: 10 }}>
              <i className="bi bi-lock me-1"></i><strong>Save blocked</strong> — resolve ordering violations first
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="border-top pt-1 mt-2 d-flex gap-2 flex-wrap" style={{ fontSize: 8 }}>
        <span className="badge" style={{ background: 'rgba(128,90,213,0.12)', color: '#553c9a', border: '1px solid rgba(128,90,213,0.2)' }}>Section</span>
        <span className="badge bg-light text-muted border">System</span>
        <span className="badge bg-success-subtle text-success border border-success">Available</span>
        <span className="badge bg-warning-subtle text-warning border border-warning">Not yet available</span>
        <span className="badge bg-danger-subtle text-danger border border-danger">Undefined</span>
      </div>
    </div>
  );
}
