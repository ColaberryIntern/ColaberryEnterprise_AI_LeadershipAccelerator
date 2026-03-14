import React, { useRef, useCallback, useState } from 'react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  availableVars: Set<string>;
  allDefinedVars: Set<string>;
  sectionVars?: Set<string>;
  label: string;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Textarea with overlay div for {{placeholder}} highlighting.
 * Purple = section variable, Green = available, Yellow = defined but not yet available, Red = undefined.
 * Shows clickable variable chips above the textarea for quick insertion.
 */
export default function HighlightedPromptEditor({
  value, onChange, availableVars, allDefinedVars, sectionVars, label, rows = 4, placeholder, disabled,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [validationIssues, setValidationIssues] = useState<{ key: string; status: 'section' | 'available' | 'not_yet' | 'undefined' }[]>([]);

  const sectionVarSet = sectionVars || new Set<string>();

  const insertVariable = useCallback((varKey: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const insert = `{{${varKey}}}`;
    const newVal = value.substring(0, start) + insert + value.substring(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + insert.length;
      ta.setSelectionRange(pos, pos);
    });
  }, [value, onChange]);

  const handleScroll = useCallback(() => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const handleBlur = useCallback(() => {
    const matches = value.match(/\{\{(\w+)\}\}/g) || [];
    const keys = [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
    const issues = keys.map(key => ({
      key,
      status: sectionVarSet.has(key) ? 'section' as const
        : availableVars.has(key) ? 'available' as const
        : allDefinedVars.has(key) ? 'not_yet' as const
        : 'undefined' as const,
    }));
    setValidationIssues(issues);
  }, [value, availableVars, allDefinedVars, sectionVarSet]);

  // Build highlighted HTML — section vars get purple, then green/yellow/red
  const highlightedHtml = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      const cls = sectionVarSet.has(key)
        ? 'hl-var-section'
        : availableVars.has(key)
        ? 'hl-var-available'
        : allDefinedVars.has(key) ? 'hl-var-notyet' : 'hl-var-undefined';
      return `<mark class="${cls}">{{${key}}}</mark>`;
    }) + '\n';

  const undefinedCount = validationIssues.filter(i => i.status === 'undefined').length;
  const notYetCount = validationIssues.filter(i => i.status === 'not_yet').length;

  const hasVars = availableVars.size > 0 || allDefinedVars.size > 0 || sectionVarSet.size > 0;

  return (
    <div className="mb-2">
      <div className="d-flex align-items-center gap-1 mb-1">
        <span className="text-muted fw-medium" style={{ fontSize: 10 }}>{label}</span>
        {validationIssues.length > 0 && (
          <span className="ms-auto d-flex gap-1">
            {undefinedCount > 0 && <span className="badge bg-danger" style={{ fontSize: 8 }}>{undefinedCount} undefined</span>}
            {notYetCount > 0 && <span className="badge bg-warning text-dark" style={{ fontSize: 8 }}>{notYetCount} not yet available</span>}
          </span>
        )}
      </div>
      {/* Always-visible variable chips — click to insert at cursor */}
      {hasVars && (
        <div className="d-flex flex-wrap gap-1 mb-1 px-1 py-1 rounded" style={{ background: 'var(--color-bg-alt, #f7fafc)', border: '1px solid var(--color-border, #e2e8f0)' }}>
          <span className="text-muted d-flex align-items-center" style={{ fontSize: 9 }}>
            <i className="bi bi-braces me-1"></i>Insert:
          </span>
          {/* Section variables — purple chips first */}
          {[...sectionVarSet].sort().map(v => (
            <button
              key={`s-${v}`}
              type="button"
              className="btn btn-sm py-0 px-1"
              style={{ fontSize: 9, background: 'rgba(128,90,213,0.15)', color: '#553c9a', border: '1px solid rgba(128,90,213,0.3)', borderRadius: 4 }}
              onClick={() => insertVariable(v)}
              title={`Insert {{${v}}} — section variable (auto-available)`}
            >
              {v}
            </button>
          ))}
          {/* User-defined available variables — green chips */}
          {[...availableVars].filter(v => !sectionVarSet.has(v)).sort().map(v => (
            <button
              key={v}
              type="button"
              className="btn btn-sm py-0 px-1"
              style={{ fontSize: 9, background: 'rgba(56,161,105,0.15)', color: '#276749', border: '1px solid rgba(56,161,105,0.3)', borderRadius: 4 }}
              onClick={() => insertVariable(v)}
              title={`Insert {{${v}}} — available at this position`}
            >
              {v}
            </button>
          ))}
          {/* Not-yet-available variables — yellow chips */}
          {[...allDefinedVars].filter(v => !availableVars.has(v) && !sectionVarSet.has(v)).sort().map(v => (
            <button
              key={v}
              type="button"
              className="btn btn-sm py-0 px-1"
              style={{ fontSize: 9, background: 'rgba(236,201,75,0.15)', color: '#975a16', border: '1px solid rgba(236,201,75,0.3)', borderRadius: 4 }}
              onClick={() => insertVariable(v)}
              title={`Insert {{${v}}} — defined but not yet available at this order`}
            >
              {v}
            </button>
          ))}
        </div>
      )}
      <div className="position-relative" style={{ fontFamily: 'monospace', fontSize: 11 }}>
        {/* Highlight overlay */}
        <div
          ref={overlayRef}
          className="position-absolute w-100 h-100 pe-none"
          style={{
            top: 0, left: 0, padding: '6px 12px',
            whiteSpace: 'pre-wrap', wordWrap: 'break-word',
            overflow: 'hidden', color: 'transparent',
            lineHeight: '1.5',
          }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
        {/* Actual textarea */}
        <textarea
          ref={textareaRef}
          className="form-control form-control-sm"
          rows={rows}
          value={value}
          onChange={e => onChange(e.target.value)}
          onScroll={handleScroll}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            fontFamily: 'monospace', fontSize: 11,
            background: 'transparent', position: 'relative',
            caretColor: 'var(--color-text, #2d3748)',
            lineHeight: '1.5',
          }}
        />
      </div>
      {/* Inline CSS for highlight marks */}
      <style>{`
        .hl-var-section { background: rgba(128, 90, 213, 0.2); color: transparent; border-radius: 2px; padding: 0 1px; }
        .hl-var-available { background: rgba(56, 161, 105, 0.2); color: transparent; border-radius: 2px; padding: 0 1px; }
        .hl-var-notyet { background: rgba(236, 201, 75, 0.3); color: transparent; border-radius: 2px; padding: 0 1px; }
        .hl-var-undefined { background: rgba(229, 62, 62, 0.2); color: transparent; border-radius: 2px; padding: 0 1px; }
      `}</style>
    </div>
  );
}
