import React, { useEffect, useState } from 'react';

interface VariableMapData {
  created: { key: string; miniSectionTitle: string; order: number }[];
  referenced: { key: string; miniSectionTitle: string; order: number; definitionExists: boolean }[];
  warnings: string[];
}

interface MiniSectionInput {
  id: string;
  mini_section_type: string;
  title: string;
  mini_section_order: number;
  associated_variable_keys?: string[];
  creates_variable_keys?: string[];
}

interface Props {
  lessonId: string;
  miniSections: MiniSectionInput[];
  token: string;
  apiUrl: string;
}

export default function VariableInspectorPanel({ lessonId, miniSections, token, apiUrl }: Props) {
  const [data, setData] = useState<VariableMapData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lessonId) fetchVariableMap();
  }, [lessonId, miniSections.length]);

  const fetchVariableMap = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/lessons/${lessonId}/variable-map`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch { /* non-critical */ }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="text-center py-3">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-muted small">Select a section to inspect variables.</p>;
  }

  const hasWarnings = data.warnings.length > 0;

  return (
    <div>
      {/* Summary badge */}
      <div className="d-flex align-items-center gap-2 mb-2">
        <span className={`badge ${hasWarnings ? 'bg-warning text-dark' : 'bg-success'}`} style={{ fontSize: 10 }}>
          {hasWarnings ? `${data.warnings.length} Warning${data.warnings.length > 1 ? 's' : ''}` : 'No Issues'}
        </span>
        <span className="text-muted" style={{ fontSize: 10 }}>
          {data.created.length} created | {data.referenced.length} referenced
        </span>
        <button className="btn btn-sm btn-outline-primary py-0" onClick={fetchVariableMap} style={{ fontSize: 10 }}>
          <i className="bi bi-arrow-clockwise me-1"></i>Refresh
        </button>
      </div>

      {/* Created Variables */}
      <h6 className="small fw-semibold mb-1" style={{ color: 'var(--color-accent, #38a169)' }}>
        <i className="bi bi-plus-circle me-1"></i>Variables Created by This Lesson
      </h6>
      {data.created.length === 0 ? (
        <p className="text-muted mb-2" style={{ fontSize: 11 }}>No variables created. Only prompt_template type can create variables.</p>
      ) : (
        <div className="d-flex flex-wrap gap-1 mb-2">
          {data.created.map((v, i) => (
            <span key={i} className="badge bg-success-subtle text-success border border-success" style={{ fontSize: 10 }}>
              <i className="bi bi-plus-circle me-1"></i>
              {v.key}
              <span className="text-muted ms-1">(#{v.order} {v.miniSectionTitle})</span>
            </span>
          ))}
        </div>
      )}

      {/* Referenced Variables */}
      <h6 className="small fw-semibold mb-1" style={{ color: 'var(--color-primary-light, #2b6cb0)' }}>
        <i className="bi bi-arrow-right-circle me-1"></i>Variables Referenced by This Lesson
      </h6>
      {data.referenced.length === 0 ? (
        <p className="text-muted mb-2" style={{ fontSize: 11 }}>No variables referenced.</p>
      ) : (
        <div className="d-flex flex-wrap gap-1 mb-2">
          {data.referenced.map((v, i) => {
            const isOrderViolation = data.created.some(c => c.key === v.key && c.order >= v.order);
            const badgeClass = isOrderViolation
              ? 'bg-danger-subtle text-danger border-danger'
              : v.definitionExists
                ? 'bg-info-subtle text-info border-info'
                : 'bg-warning-subtle text-warning border-warning';
            return (
              <span key={i} className={`badge ${badgeClass} border`} style={{ fontSize: 10 }}>
                <i className={`bi ${isOrderViolation ? 'bi-exclamation-circle' : v.definitionExists ? 'bi-check-circle' : 'bi-question-circle'} me-1`}></i>
                {v.key}
                <span className="text-muted ms-1">(#{v.order})</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Dependency Flow */}
      <h6 className="small fw-semibold mb-1">
        <i className="bi bi-diagram-3 me-1"></i>Dependency Flow
      </h6>
      <div className="border rounded p-2 mb-2" style={{ fontSize: 11 }}>
        {miniSections
          .sort((a, b) => a.mini_section_order - b.mini_section_order)
          .map(ms => {
            const creates = ms.creates_variable_keys || [];
            const uses = ms.associated_variable_keys || [];
            if (creates.length === 0 && uses.length === 0) return null;
            return (
              <div key={ms.id} className="d-flex align-items-start gap-1 mb-1 py-1" style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                <span className="badge bg-light text-dark border flex-shrink-0" style={{ fontSize: 9, minWidth: 24 }}>#{ms.mini_section_order}</span>
                <div>
                  <span className="fw-medium">{ms.title}</span>
                  {uses.length > 0 && (
                    <div className="mt-1">
                      <span className="text-info" style={{ fontSize: 10 }}>
                        <i className="bi bi-arrow-down me-1"></i>reads: {uses.join(', ')}
                      </span>
                    </div>
                  )}
                  {creates.length > 0 && (
                    <div className="mt-1">
                      <span className="text-success" style={{ fontSize: 10 }}>
                        <i className="bi bi-arrow-up me-1"></i>creates: {creates.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Warnings */}
      {data.warnings.length > 0 && (
        <div>
          <h6 className="small fw-semibold mb-1 text-danger">
            <i className="bi bi-exclamation-triangle me-1"></i>Warnings
          </h6>
          {data.warnings.map((w, i) => (
            <div key={i} className="alert alert-warning py-1 px-2 mb-1" style={{ fontSize: 10 }}>
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 border-top pt-2" style={{ fontSize: 9 }}>
        <span className="badge bg-success-subtle text-success border border-success me-1">Created</span>
        <span className="badge bg-info-subtle text-info border border-info me-1">Ref + Defined</span>
        <span className="badge bg-warning-subtle text-warning border border-warning me-1">Ref + No Def</span>
        <span className="badge bg-danger-subtle text-danger border border-danger">Order Violation</span>
      </div>
    </div>
  );
}
