import React, { useState, useRef, useEffect } from 'react';

interface MultiSelectOption {
  value: string;
  label: string;
  sub?: string;
}

interface Props {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (vals: string[]) => void;
  renderLabel?: (opt: MultiSelectOption) => React.ReactNode;
  colorClass?: string;
  badgeClass?: string;
  placeholder?: string;
  disabled?: boolean;
}

export default function MultiSelect({ label, options, selected, onChange, renderLabel, colorClass, badgeClass, placeholder, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const defaultBadge = badgeClass || (colorClass ? 'bg-success-subtle text-success' : 'bg-primary-subtle text-primary');

  return (
    <div ref={ref}>
      <label className={`form-label small fw-medium mb-0 ${colorClass || ''}`}>{label}</label>
      <div
        className={`form-control form-control-sm d-flex flex-wrap gap-1 align-items-center ${disabled ? 'bg-light' : ''}`}
        style={{ minHeight: 32, cursor: disabled ? 'default' : 'pointer' }}
        onClick={() => !disabled && setOpen(!open)}
      >
        {selected.length === 0 && (
          <span className="text-muted" style={{ fontSize: 11 }}>{placeholder || 'Click to select...'}</span>
        )}
        {selected.map(v => {
          const opt = options.find(o => o.value === v);
          return (
            <span key={v} className={`badge ${defaultBadge} border`} style={{ fontSize: 10 }}>
              {opt?.label || v}
            </span>
          );
        })}
      </div>
      {open && !disabled && (
        <div className="border rounded mt-1 p-2 bg-white shadow-sm" style={{ maxHeight: 200, overflowY: 'auto', fontSize: 12, position: 'relative', zIndex: 10 }}>
          {options.length === 0 && <span className="text-muted">No options available</span>}
          {options.map(opt => (
            <div key={opt.value} className="form-check py-0">
              <input
                className="form-check-input"
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                id={`ms-${label.replace(/\s/g, '-')}-${opt.value}`}
              />
              <label className="form-check-label" htmlFor={`ms-${label.replace(/\s/g, '-')}-${opt.value}`}>
                {renderLabel ? renderLabel(opt) : (
                  <>{opt.label} {opt.sub && <span className="text-muted">({opt.sub})</span>}</>
                )}
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { MultiSelectOption };
