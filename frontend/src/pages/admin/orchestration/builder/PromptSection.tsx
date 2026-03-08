import React, { useEffect, useState } from 'react';
import { MiniSection, PromptOption, PromptBody, extractPlaceholders } from './types';

interface Props {
  editing: Partial<MiniSection>;
  prompts: PromptOption[];
  promptBodies: Record<string, PromptBody>;
  fetchPromptBody: (id: string) => Promise<PromptBody | null>;
  onUpdate: (updates: Partial<MiniSection>) => void;
}

export default function PromptSection({ editing, prompts, promptBodies, fetchPromptBody, onUpdate }: Props) {
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

  const promptSelectors: { key: keyof MiniSection; label: string; icon: string }[] = [
    { key: 'concept_prompt_template_id', label: 'Concept Prompt', icon: 'bi-lightbulb' },
    { key: 'build_prompt_template_id', label: 'Build Prompt', icon: 'bi-hammer' },
    { key: 'mentor_prompt_template_id', label: 'Mentor Prompt', icon: 'bi-person-badge' },
  ];

  // Auto-fetch prompt body when selected
  useEffect(() => {
    for (const ps of promptSelectors) {
      const id = editing[ps.key] as string;
      if (id && !promptBodies[id]) fetchPromptBody(id);
    }
  }, [editing.concept_prompt_template_id, editing.build_prompt_template_id, editing.mentor_prompt_template_id]);

  const renderPromptBody = (promptId: string | undefined) => {
    if (!promptId || !promptBodies[promptId]) return null;
    const body = promptBodies[promptId];
    const template = body.user_prompt_template || '';
    const placeholders = extractPlaceholders(template);

    return (
      <div className="mt-1 mb-2">
        {body.system_prompt && (
          <div className="mb-1">
            <span className="text-muted fw-medium" style={{ fontSize: 9 }}>SYSTEM:</span>
            <pre className="bg-light rounded p-2 mb-0" style={{ fontSize: 10, maxHeight: 100, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {body.system_prompt}
            </pre>
          </div>
        )}
        {template && (
          <div>
            <span className="text-muted fw-medium" style={{ fontSize: 9 }}>USER TEMPLATE:</span>
            <pre className="bg-light rounded p-2 mb-0" style={{ fontSize: 10, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {highlightPlaceholders(template)}
            </pre>
          </div>
        )}
        {placeholders.length > 0 && (
          <div className="mt-1 d-flex flex-wrap gap-1">
            <span className="text-muted" style={{ fontSize: 9 }}>Placeholders:</span>
            {placeholders.map(p => (
              <span key={p} className="badge bg-info-subtle text-info border" style={{ fontSize: 8 }}>
                {`{{${p}}}`}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="row g-2">
        {promptSelectors.map(ps => {
          const currentId = editing[ps.key] as string || '';
          const isExpanded = expandedPrompt === ps.key;
          return (
            <div key={ps.key} className="col-12">
              <div className="d-flex align-items-center gap-1 mb-0">
                <i className={`bi ${ps.icon}`} style={{ fontSize: 12 }}></i>
                <label className="form-label small fw-medium mb-0">{ps.label}</label>
              </div>
              <div className="d-flex align-items-center gap-1">
                <select
                  className="form-select form-select-sm"
                  value={currentId}
                  onChange={e => onUpdate({ [ps.key]: e.target.value || undefined } as any)}
                >
                  <option value="">None</option>
                  {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {currentId && (
                  <button
                    className="btn btn-sm btn-outline-secondary py-0 flex-shrink-0"
                    onClick={() => setExpandedPrompt(isExpanded ? null : ps.key)}
                    style={{ fontSize: 10 }}
                    title={isExpanded ? 'Hide body' : 'Show body'}
                  >
                    <i className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`}></i>
                  </button>
                )}
              </div>
              {isExpanded && renderPromptBody(currentId)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function highlightPlaceholders(text: string): string {
  // Return as-is — highlighting done via pre tag. Real highlighting would use dangerouslySetInnerHTML.
  return text;
}
