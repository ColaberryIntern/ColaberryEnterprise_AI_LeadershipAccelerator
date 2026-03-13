import React from 'react';
import { MiniSection, TYPE_ICONS, getScoreColor } from './types';

interface Props {
  miniSections: MiniSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (id: string) => void;
  isDirtyId?: string | null;
  loading: boolean;
}

export default function StudentStructureTree({ miniSections, selectedId, onSelect, onMove, onDelete, isDirtyId, loading }: Props) {
  if (loading) {
    return (
      <div className="text-center py-3">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (miniSections.length === 0) {
    return (
      <div className="text-center py-4">
        <i className="bi bi-layers" style={{ fontSize: 32, color: 'var(--color-text-light)' }}></i>
        <p className="text-muted small mt-2 mb-0">No mini-sections yet. Click <strong>+ Add</strong> to create one.</p>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-1" role="tree" aria-label="Student content structure">
      {miniSections.map((ms, i) => {
        const icon = TYPE_ICONS[ms.mini_section_type] || 'bi-circle';
        const isSelected = selectedId === ms.id;
        const isDirty = isDirtyId === ms.id;

        return (
          <div
            key={ms.id}
            role="treeitem"
            aria-selected={isSelected}
            tabIndex={0}
            className={`d-flex align-items-center gap-1 px-2 py-1 rounded ${isSelected ? '' : 'bg-white'}`}
            style={{
              cursor: 'pointer',
              borderLeft: isSelected ? '3px solid var(--color-primary-light, #2b6cb0)' : '3px solid transparent',
              backgroundColor: isSelected ? 'var(--color-bg-alt, #f7fafc)' : undefined,
              transition: 'background-color 0.15s',
            }}
            onClick={() => onSelect(ms.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(ms.id); } }}
          >
            {/* Order controls */}
            <div className="d-flex flex-column flex-shrink-0" onClick={e => e.stopPropagation()}>
              <button
                className="btn btn-link p-0 lh-1"
                disabled={i === 0}
                onClick={() => onMove(i, -1)}
                style={{ fontSize: 10 }}
                aria-label={`Move ${ms.title} up`}
              >
                <i className="bi bi-chevron-up"></i>
              </button>
              <button
                className="btn btn-link p-0 lh-1"
                disabled={i === miniSections.length - 1}
                onClick={() => onMove(i, 1)}
                style={{ fontSize: 10 }}
                aria-label={`Move ${ms.title} down`}
              >
                <i className="bi bi-chevron-down"></i>
              </button>
            </div>

            {/* Order number */}
            <span className="badge bg-light text-dark border flex-shrink-0" style={{ fontSize: 10, width: 22, textAlign: 'center' }}>
              {ms.mini_section_order}
            </span>

            {/* Icon + student label */}
            <i className={`bi ${icon} flex-shrink-0`} style={{ fontSize: 13, color: 'var(--color-primary-light, #2b6cb0)' }}></i>

            {/* Content */}
            <div className="d-flex flex-column" style={{ minWidth: 0, flex: 1 }}>
              {(isDirty || ms.quality_score != null) && (
                <div className="d-flex align-items-center gap-1">
                  {isDirty && <span className="badge bg-warning-subtle text-warning border" style={{ fontSize: 7 }}>unsaved</span>}
                  {ms.quality_score != null && (
                    <span className={`badge ${getScoreColor(ms.quality_score)} flex-shrink-0`} style={{ fontSize: 7 }} title={`Quality: ${Math.round(ms.quality_score)}/100`}>
                      {Math.round(ms.quality_score)}
                    </span>
                  )}
                </div>
              )}
              <span className="text-truncate fw-medium" style={{ fontSize: 11 }}>{ms.title}</span>
            </div>

            {/* Status badges */}
            <div className="d-flex align-items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
              {(ms.creates_variable_keys?.length || 0) > 0 && (
                <span className="badge bg-success-subtle text-success border border-success" style={{ fontSize: 7 }} title={`Creates ${ms.creates_variable_keys.length} variable(s)`}>
                  +{ms.creates_variable_keys.length}v
                </span>
              )}
              {(ms.creates_artifact_ids?.length || 0) > 0 && (
                <span className="badge bg-warning-subtle text-dark border border-warning" style={{ fontSize: 7 }} title={`Creates ${ms.creates_artifact_ids.length} artifact(s)`}>
                  +{ms.creates_artifact_ids.length}a
                </span>
              )}
              {ms.knowledge_check_config?.enabled && (
                <span className="badge bg-secondary" style={{ fontSize: 7 }} title="Knowledge check enabled">Q</span>
              )}
              <button
                className="btn btn-sm btn-outline-danger py-0 px-1"
                onClick={() => onDelete(ms.id)}
                style={{ fontSize: 10 }}
                aria-label={`Delete ${ms.title}`}
              >
                <i className="bi bi-trash"></i>
              </button>
            </div>
          </div>
        );
      })}

      {/* Reflection indicator for knowledge_check */}
      {miniSections.some(ms => ms.mini_section_type === 'knowledge_check') && (
        <div className="d-flex align-items-center gap-1 px-2 py-1 rounded" style={{ borderLeft: '3px solid transparent', opacity: 0.6 }}>
          <span style={{ width: 22 }}></span>
          <span style={{ width: 22 }}></span>
          <i className="bi bi-chat-dots flex-shrink-0" style={{ fontSize: 13, color: 'var(--color-text-light)' }}></i>
          <div className="d-flex flex-column" style={{ minWidth: 0 }}>
            <span className="badge bg-dark flex-shrink-0" style={{ fontSize: 8, width: 'fit-content' }}>Reflection</span>
            <span className="text-muted" style={{ fontSize: 10 }}>Auto-generated from Knowledge Check</span>
          </div>
        </div>
      )}
    </div>
  );
}
