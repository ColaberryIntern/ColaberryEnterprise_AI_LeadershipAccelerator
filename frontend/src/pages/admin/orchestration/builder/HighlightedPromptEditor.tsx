import React from 'react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  label: string;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  // Legacy props — accepted but ignored for backward compatibility
  availableVars?: Set<string>;
  allDefinedVars?: Set<string>;
  sectionVars?: Set<string>;
}

export default function HighlightedPromptEditor({
  value, onChange, label, rows = 4, placeholder, disabled,
}: Props) {
  return (
    <div className="mb-2">
      <div className="d-flex align-items-center gap-1 mb-1">
        <span className="text-muted fw-medium" style={{ fontSize: 10 }}>{label}</span>
      </div>
      <textarea
        className="form-control form-control-sm"
        rows={rows}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'Write prompt instructions naturally. Learner data is appended automatically.'}
        disabled={disabled}
        style={{
          fontFamily: 'monospace', fontSize: 11,
          lineHeight: '1.5',
        }}
      />
      <span className="text-muted d-block mt-1" style={{ fontSize: 9 }}>
        <i className="bi bi-info-circle me-1"></i>
        Variables are automatically appended as learner data. Write prompts that use available data naturally.
      </span>
    </div>
  );
}
