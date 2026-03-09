import React, { useState } from 'react';
import { Suggestion } from './types';

interface Props {
  miniSectionId?: string;
  suggestions: Suggestion[];
  loading: boolean;
  applying: string | null; // ID of suggestion being applied
  onRefresh: () => void;
  onApplyFix: (suggestion: Suggestion) => void;
  onScrollToSection?: (section: string) => void;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-danger',
  warning: 'bg-warning text-dark',
  info: 'bg-info',
};

const CATEGORY_ICON: Record<string, string> = {
  prompt: 'bi-chat-left-text',
  variable: 'bi-braces',
  skill: 'bi-stars',
  artifact: 'bi-box',
  validation: 'bi-check-circle',
  testing: 'bi-clipboard-check',
};

export default function SuggestionSection({ miniSectionId, suggestions, loading, applying, onRefresh, onApplyFix, onScrollToSection }: Props) {
  const [filter, setFilter] = useState<string>('all');

  if (!miniSectionId) {
    return <p className="text-muted small mb-0">Save the mini-section first to see suggestions.</p>;
  }

  if (loading) {
    return (
      <div className="text-center py-2">
        <div className="spinner-border spinner-border-sm me-2" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <span className="small text-muted">Analyzing for improvements...</span>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-2">
        <i className="bi bi-check-circle-fill text-success" style={{ fontSize: 24 }}></i>
        <p className="small text-muted mt-1 mb-1">No suggestions — this mini-section looks great!</p>
        <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}>
          <i className="bi bi-arrow-clockwise me-1"></i>Re-check
        </button>
      </div>
    );
  }

  const categories = [...new Set(suggestions.map(s => s.category))];
  const filtered = filter === 'all' ? suggestions : suggestions.filter(s => s.category === filter);
  const autoFixable = suggestions.filter(s => s.autoFixable);

  return (
    <div>
      {/* Summary bar */}
      <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
        <span className="small fw-medium">{suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}</span>
        {autoFixable.length > 0 && (
          <span className="badge bg-success-subtle text-success border border-success" style={{ fontSize: 9 }}>
            {autoFixable.length} auto-fixable
          </span>
        )}
        <div className="ms-auto d-flex gap-1">
          <button
            className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
            style={{ fontSize: 10, padding: '1px 6px' }}
            onClick={() => setFilter('all')}
          >All</button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`btn btn-sm ${filter === cat ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: 10, padding: '1px 6px' }}
              onClick={() => setFilter(cat)}
            >
              <i className={`bi ${CATEGORY_ICON[cat] || 'bi-circle'} me-1`}></i>{cat}
            </button>
          ))}
        </div>
      </div>

      {/* Suggestion list */}
      <div className="d-flex flex-column gap-1">
        {filtered.map(s => (
          <div
            key={s.id}
            className="d-flex align-items-start gap-2 border rounded px-2 py-1"
            style={{ fontSize: 11 }}
          >
            <i className={`bi ${CATEGORY_ICON[s.category] || 'bi-circle'} flex-shrink-0 mt-1`} style={{ fontSize: 12 }}></i>
            <div className="flex-grow-1">
              <div className="d-flex align-items-center gap-1 mb-0">
                <span className={`badge ${SEVERITY_BADGE[s.severity]}`} style={{ fontSize: 8 }}>{s.severity}</span>
                <span className="badge bg-light text-dark border" style={{ fontSize: 8 }}>{s.category}</span>
              </div>
              <span>{s.description}</span>
            </div>
            <div className="d-flex gap-1 flex-shrink-0">
              {s.autoFixable && (
                <button
                  className="btn btn-sm btn-outline-success py-0 px-1"
                  style={{ fontSize: 10 }}
                  onClick={() => onApplyFix(s)}
                  disabled={applying === s.id}
                  title="Auto-fix this issue"
                >
                  {applying === s.id ? (
                    <span className="spinner-border spinner-border-sm" style={{ width: 10, height: 10 }}></span>
                  ) : (
                    <><i className="bi bi-wrench me-1"></i>Fix</>
                  )}
                </button>
              )}
              {s.targetSection && onScrollToSection && (
                <button
                  className="btn btn-sm btn-outline-secondary py-0 px-1"
                  style={{ fontSize: 10 }}
                  onClick={() => onScrollToSection(s.targetSection!)}
                  title="Go to section"
                >
                  <i className="bi bi-box-arrow-in-down"></i>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-end">
        <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}>
          <i className="bi bi-arrow-clockwise me-1"></i>Refresh
        </button>
      </div>
    </div>
  );
}
