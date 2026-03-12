import React, { useMemo, useState } from 'react';
import { MiniSection, PromptOption, PromptBody, PROMPT_PAIRS, extractPlaceholders, computeAvailableVars, VariableOption } from './types';
import HighlightedPromptEditor from './HighlightedPromptEditor';

interface Props {
  editing: Partial<MiniSection>;
  miniSections: MiniSection[];
  prompts: PromptOption[];
  promptBodies: Record<string, PromptBody>;
  systemVariables: VariableOption[];
  variables: VariableOption[];
  fetchPromptBody: (id: string) => Promise<PromptBody | null>;
  onUpdate: (updates: Partial<MiniSection>) => void;
}

export default function PromptSection({ editing, miniSections, prompts, promptBodies, systemVariables, variables, fetchPromptBody, onUpdate }: Props) {
  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const editType = editing.mini_section_type;

  // Filter prompt pairs to only those applicable to this type
  const applicablePairs = useMemo(() =>
    PROMPT_PAIRS.filter(p => !editType || p.applicableTypes.includes(editType)),
    [editType]
  );

  // Compute available variables for placeholder validation
  const currentOrder = editing.mini_section_order ?? 999;
  const systemVarKeys = useMemo(() => systemVariables.map(v => v.variable_key), [systemVariables]);
  const availableVars = useMemo(() =>
    computeAvailableVars(miniSections, currentOrder, systemVarKeys),
    [miniSections, currentOrder, systemVarKeys]
  );
  const allDefinedVars = useMemo(() =>
    new Set(variables.map(v => v.variable_key)),
    [variables]
  );

  // Load from template: fetch body and merge into single prompt field
  const handleLoadFromTemplate = async (promptKey: string, templateId: string, systemField: keyof MiniSection, userField: keyof MiniSection) => {
    setLoadingTemplate(promptKey);
    const body = await fetchPromptBody(templateId);
    if (body) {
      // Merge system + user template into one field
      const parts = [body.system_prompt, body.user_prompt_template].filter(Boolean);
      onUpdate({
        [systemField]: parts.join('\n\n'),
        [userField]: '',
        prompt_source: 'hybrid',
      } as any);
    }
    setLoadingTemplate(null);
    setExpandedTemplate(null);
  };

  // Count total placeholder issues across all prompts
  const allPlaceholders = useMemo(() => {
    const all = new Set<string>();
    for (const pair of applicablePairs) {
      const sysText = (editing[pair.systemField] as string) || '';
      const userText = (editing[pair.userField] as string) || '';
      extractPlaceholders(sysText + ' ' + userText).forEach(p => all.add(p));
    }
    return all;
  }, [editing, applicablePairs]);

  const undefinedPlaceholders = useMemo(() =>
    [...allPlaceholders].filter(p => !allDefinedVars.has(p)),
    [allPlaceholders, allDefinedVars]
  );

  return (
    <div>
      {/* Summary badges */}
      <div className="d-flex gap-2 mb-2 flex-wrap">
        <span className="text-muted" style={{ fontSize: 10 }}>
          {allPlaceholders.size} placeholder{allPlaceholders.size !== 1 ? 's' : ''} detected
        </span>
        {undefinedPlaceholders.length > 0 && (
          <span className="badge bg-danger" style={{ fontSize: 9 }}>
            {undefinedPlaceholders.length} undefined: {undefinedPlaceholders.join(', ')}
          </span>
        )}
        {undefinedPlaceholders.length === 0 && allPlaceholders.size > 0 && (
          <span className="badge bg-success" style={{ fontSize: 9 }}>All resolved</span>
        )}
      </div>

      {applicablePairs.map(pair => {
        const sysVal = (editing[pair.systemField] as string) || '';
        const usrVal = (editing[pair.userField] as string) || '';
        // Merge legacy split fields into single value
        const combinedValue = sysVal && usrVal ? sysVal + '\n\n' + usrVal : sysVal || usrVal;
        const fkValue = (editing[pair.fkField] as string) || '';
        const hasInlineContent = !!combinedValue;
        const isTemplateExpanded = expandedTemplate === pair.key;

        return (
          <div key={pair.key} className="border rounded mb-2 p-2">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <span className="fw-semibold small">{pair.label}</span>
              <div className="d-flex align-items-center gap-1">
                {hasInlineContent && <span className="badge bg-success-subtle text-success border" style={{ fontSize: 8 }}>inline</span>}
                {fkValue && <span className="badge bg-info-subtle text-info border" style={{ fontSize: 8 }}>template linked</span>}
                <button
                  className="btn btn-sm btn-outline-secondary py-0"
                  style={{ fontSize: 9 }}
                  onClick={() => setExpandedTemplate(isTemplateExpanded ? null : pair.key)}
                  title="Load from template"
                >
                  <i className="bi bi-download me-1"></i>Load Template
                </button>
              </div>
            </div>

            {/* Load from template dropdown */}
            {isTemplateExpanded && (
              <div className="mb-2 p-2 bg-light rounded" style={{ fontSize: 11 }}>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span className="text-muted fw-medium">Select template to copy into prompt:</span>
                </div>
                <select
                  className="form-select form-select-sm"
                  value=""
                  onChange={e => {
                    if (e.target.value) {
                      if (hasInlineContent && !window.confirm('This will overwrite existing prompt text. Continue?')) return;
                      handleLoadFromTemplate(pair.key, e.target.value, pair.systemField, pair.userField);
                    }
                  }}
                  disabled={loadingTemplate === pair.key}
                >
                  <option value="">Choose a template...</option>
                  {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {loadingTemplate === pair.key && <span className="text-muted" style={{ fontSize: 10 }}>Loading...</span>}
              </div>
            )}

            {/* Single combined prompt editor */}
            <HighlightedPromptEditor
              value={combinedValue}
              onChange={val => onUpdate({ [pair.systemField]: val, [pair.userField]: '' } as any)}
              availableVars={availableVars}
              allDefinedVars={allDefinedVars}
              label="PROMPT"
              rows={6}
              placeholder="Instructions for the AI model with {{variable}} placeholders..."
            />
          </div>
        );
      })}

      {applicablePairs.length === 0 && (
        <div className="text-center text-muted py-3" style={{ fontSize: 12 }}>
          Select a mini-section type to see applicable prompt fields.
        </div>
      )}
    </div>
  );
}
