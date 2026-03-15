import React, { useState, useCallback } from 'react';
import { MiniSection, TYPE_ICONS } from './types';

interface Props {
  miniSections: MiniSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onDelete: (id: string) => void;
  isDirtyId?: string | null;
  loading: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  executive_reality_check: '#2b6cb0',
  ai_strategy: '#0d9488',
  prompt_template: '#7c3aed',
  implementation_task: '#dd6b20',
  knowledge_check: '#e53e3e',
};

const TYPE_LABELS: Record<string, string> = {
  executive_reality_check: 'Concept',
  ai_strategy: 'Strategy',
  prompt_template: 'Prompt',
  implementation_task: 'Task',
  knowledge_check: 'Check',
};

export default function MiniSectionPipeline({ miniSections, selectedId, onSelect, onReorder, onDelete, isDirtyId, loading }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    (e.target as HTMLElement).classList.add('pipeline-card-dragging');
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).classList.remove('pipeline-card-dragging');
    setDragIndex(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndex;
    setDragIndex(null);
    setDropTarget(null);
    if (fromIndex === null || fromIndex === toIndex) return;
    const ids = miniSections.map(ms => ms.id);
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved);
    onReorder(ids);
  }, [dragIndex, miniSections, onReorder]);

  if (loading) {
    return (
      <div className="text-center py-3">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading pipeline...</span>
        </div>
      </div>
    );
  }

  if (miniSections.length === 0) {
    return (
      <div className="text-center py-3 text-muted" style={{ fontSize: 11 }}>
        <i className="bi bi-plus-circle me-1"></i>No mini-sections yet
      </div>
    );
  }

  return (
    <div className="d-flex gap-1 align-items-start overflow-auto pb-2" style={{ minHeight: 90 }} role="list" aria-label="Mini-section pipeline">
      {miniSections.map((ms, i) => {
        const icon = TYPE_ICONS[ms.mini_section_type] || 'bi-circle';
        const color = TYPE_COLORS[ms.mini_section_type] || '#718096';
        const shortLabel = TYPE_LABELS[ms.mini_section_type] || ms.mini_section_type;
        const isSelected = ms.id === selectedId;
        const isDirty = ms.id === isDirtyId;
        const isDropHere = dropTarget === i && dragIndex !== i;
        const qScore = ms.quality_score;
        const qColor = !qScore ? '#718096' : qScore >= 90 ? '#2b6cb0' : qScore >= 70 ? '#38a169' : qScore >= 40 ? '#dd6b20' : '#e53e3e';

        return (
          <React.Fragment key={ms.id}>
            {isDropHere && <div className="pipeline-drop-indicator" style={{ width: 3, minHeight: 70, flexShrink: 0 }} />}
            <div
              role="listitem"
              draggable
              onDragStart={e => handleDragStart(e, i)}
              onDragEnd={handleDragEnd}
              onDragOver={e => handleDragOver(e, i)}
              onDrop={e => handleDrop(e, i)}
              onClick={() => onSelect(ms.id)}
              className="d-flex flex-column align-items-center text-center"
              style={{
                cursor: 'pointer',
                minWidth: 80,
                maxWidth: 100,
                padding: '6px 4px',
                borderRadius: 8,
                border: `2px solid ${isSelected ? color : 'transparent'}`,
                background: isSelected ? `${color}10` : 'transparent',
                transition: 'border-color 0.15s, background 0.15s',
                position: 'relative',
                flexShrink: 0,
              }}
              title={`${ms.title}\n${ms.mini_section_type}`}
            >
              {/* Order badge */}
              <span className="badge bg-light text-muted border" style={{ fontSize: 8, position: 'absolute', top: 2, left: 4 }}>
                {i + 1}
              </span>

              {/* Delete button */}
              <button
                className="btn btn-link p-0 text-danger"
                style={{ position: 'absolute', top: 1, right: 3, fontSize: 9, opacity: 0.5, lineHeight: 1 }}
                onClick={e => { e.stopPropagation(); onDelete(ms.id); }}
                title="Delete"
              >
                <i className="bi bi-x-lg"></i>
              </button>

              {/* Type icon */}
              <div
                className="d-flex align-items-center justify-content-center rounded-circle mb-1"
                style={{ width: 36, height: 36, background: `${color}18`, color, flexShrink: 0 }}
              >
                <i className={`bi ${icon}`} style={{ fontSize: 16 }}></i>
              </div>

              {/* Label */}
              <span className="fw-semibold" style={{ fontSize: 9, color, lineHeight: 1.2 }}>
                {shortLabel}
              </span>

              {/* Title (truncated) */}
              <span className="text-muted text-truncate w-100" style={{ fontSize: 8, lineHeight: 1.2 }}>
                {ms.title || 'Untitled'}
              </span>

              {/* Quality + status badges */}
              <div className="d-flex gap-1 mt-1 flex-wrap justify-content-center">
                {qScore != null && (
                  <span className="badge" style={{ fontSize: 7, background: `${qColor}20`, color: qColor, border: `1px solid ${qColor}40` }}>
                    {Math.round(qScore)}
                  </span>
                )}
                {isDirty && (
                  <span className="badge bg-warning-subtle text-warning border" style={{ fontSize: 7 }}>*</span>
                )}
                {!ms.is_active && (
                  <span className="badge bg-secondary" style={{ fontSize: 7 }}>off</span>
                )}
              </div>
            </div>

            {/* Arrow connector */}
            {i < miniSections.length - 1 && (
              <div className="d-flex align-items-center" style={{ color: 'var(--color-border, #e2e8f0)', fontSize: 14, flexShrink: 0, marginTop: 20 }}>
                <i className="bi bi-arrow-right"></i>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
