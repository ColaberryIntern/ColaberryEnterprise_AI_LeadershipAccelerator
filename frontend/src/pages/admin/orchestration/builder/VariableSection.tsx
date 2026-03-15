import React from 'react';
import { MiniSection, VariableOption } from './types';
import MultiSelect from './MultiSelect';

interface Props {
  editing: Partial<MiniSection>;
  variables: VariableOption[];
  systemVariables: VariableOption[];
  sectionVariableKeys?: string[];
  onUpdate: (updates: Partial<MiniSection>) => void;
  onCreateVariable: () => void;
}

export default function VariableSection({
  editing, variables, systemVariables, sectionVariableKeys, onUpdate, onCreateVariable,
}: Props) {
  const editType = editing.mini_section_type;
  const variableOptions = variables.map(v => ({ value: v.variable_key, label: v.display_name || v.variable_key, sub: v.scope }));

  return (
    <div>
      {/* System Variables (read-only) */}
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

      {/* Section Variables (inherited, read-only) */}
      <div className="mb-3">
        <h6 className="small fw-semibold mb-1" style={{ fontSize: 11, color: '#553c9a' }}>
          <i className="bi bi-diagram-3 me-1"></i>Section Variables
          <span className="badge ms-1" style={{ fontSize: 8, background: 'rgba(128,90,213,0.12)', color: '#553c9a' }}>inherited</span>
        </h6>
        <div className="d-flex flex-wrap gap-1">
          {(sectionVariableKeys || []).map(k => (
            <span key={k} className="badge" style={{ fontSize: 9, background: 'rgba(128,90,213,0.12)', color: '#553c9a', border: '1px solid rgba(128,90,213,0.2)' }}>
              {k}
            </span>
          ))}
          {(!sectionVariableKeys || sectionVariableKeys.length === 0) && (
            <span className="text-muted" style={{ fontSize: 10 }}>None assigned</span>
          )}
        </div>
        <span className="text-muted" style={{ fontSize: 9 }}>
          <i className="bi bi-info-circle me-1"></i>Edit in Section Blueprint
        </span>
      </div>

      {/* Prompt Template: Collects Variables (data gatherer) */}
      {editType === 'prompt_template' && (
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <h6 className="small fw-semibold mb-0" style={{ fontSize: 11 }}>
              <i className="bi bi-plus-circle me-1 text-success"></i>Collects Variables
              <span className="badge bg-success-subtle text-success border ms-1" style={{ fontSize: 8 }}>data gatherer</span>
            </h6>
            <button className="btn btn-link p-0 text-success" onClick={onCreateVariable} style={{ fontSize: 10 }}>
              + Create Variable
            </button>
          </div>
          <p className="text-muted mb-1" style={{ fontSize: 10 }}>
            Variables this prompt template will ask the student to fill in. New variables are always shown; previously-defined variables appear if they lack values.
          </p>
          <MultiSelect
            label=""
            options={variableOptions}
            selected={editing.creates_variable_keys || []}
            onChange={vals => onUpdate({ creates_variable_keys: vals })}
            colorClass="text-success"
            badgeClass="bg-success-subtle text-success"
          />
        </div>
      )}

      {/* Info for non-prompt-template types */}
      {editType !== 'prompt_template' && (
        <div className="text-muted" style={{ fontSize: 10 }}>
          <i className="bi bi-info-circle me-1"></i>
          Variables are automatically appended as learner data to all prompts. No manual variable assignment needed.
        </div>
      )}
    </div>
  );
}
