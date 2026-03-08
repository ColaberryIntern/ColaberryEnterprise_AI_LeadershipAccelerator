import React from 'react';
import { DryRunResult, MiniSection, TYPE_BADGE_MAP } from './types';

interface Props {
  editing: Partial<MiniSection> | null;
  dryRun: DryRunResult | null;
  validating: boolean;
  onRevalidate: () => void;
}

export default function ValidationSection({ editing, dryRun, validating, onRevalidate }: Props) {
  if (validating) {
    return (
      <div className="text-center py-2">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Validating...</span>
        </div>
      </div>
    );
  }

  if (!dryRun) {
    return <p className="text-muted small mb-0">Save and re-validate to see status.</p>;
  }

  const allWarnings = dryRun.warnings || [];

  // Per-mini-section validation if available
  const msValidation = editing?.id && dryRun.validationByMiniSection?.[editing.id];

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-2">
        <span className={`badge ${allWarnings.length === 0 ? 'bg-success' : 'bg-warning text-dark'}`} style={{ fontSize: 10 }}>
          {allWarnings.length === 0 ? 'All Checks Passed' : `${allWarnings.length} Warning${allWarnings.length > 1 ? 's' : ''}`}
        </span>
        <button className="btn btn-sm btn-outline-primary py-0" onClick={onRevalidate} style={{ fontSize: 10 }}>
          <i className="bi bi-arrow-clockwise me-1"></i>Re-validate
        </button>
      </div>

      {/* Per-section validation (if enhanced backend) */}
      {msValidation && (
        <div className="mb-2">
          <div className="d-flex flex-wrap gap-1">
            <span className={`badge ${msValidation.promptsResolved ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: 9 }}>
              <i className={`bi ${msValidation.promptsResolved ? 'bi-check' : 'bi-x'} me-1`}></i>Prompts
            </span>
            <span className={`badge ${msValidation.variablesResolved ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: 9 }}>
              <i className={`bi ${msValidation.variablesResolved ? 'bi-check' : 'bi-x'} me-1`}></i>Variables
            </span>
            <span className={`badge ${msValidation.skillsMapped ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: 9 }}>
              <i className={`bi ${msValidation.skillsMapped ? 'bi-check' : 'bi-x'} me-1`}></i>Skills
            </span>
            <span className={`badge ${msValidation.artifactsLinked ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: 9 }}>
              <i className={`bi ${msValidation.artifactsLinked ? 'bi-check' : 'bi-x'} me-1`}></i>Artifacts
            </span>
          </div>
          {msValidation.errors.length > 0 && (
            <div className="mt-1">
              {msValidation.errors.map((e, i) => (
                <div key={i} className="alert alert-danger py-1 px-2 mb-1" style={{ fontSize: 10 }}>
                  <i className="bi bi-exclamation-triangle me-1"></i>{e}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lesson-level type breakdown */}
      {dryRun.typeBreakdown && (
        <div className="d-flex gap-1 mb-2 flex-wrap">
          {Object.entries(dryRun.typeBreakdown).map(([type, count]) => {
            const info = TYPE_BADGE_MAP[type] || { badge: 'bg-dark', label: type };
            return <span key={type} className={`badge ${info.badge}`} style={{ fontSize: 9 }}>{info.label}: {count}</span>;
          })}
        </div>
      )}

      {/* Required variables */}
      {(dryRun.requiredVariables?.length || 0) > 0 && (
        <div className="mb-2">
          <span className="small fw-medium" style={{ fontSize: 10 }}>Required Variables:</span>
          <div className="d-flex flex-wrap gap-1 mt-1">
            {dryRun.requiredVariables!.map(v => (
              <span key={v} className="badge bg-info-subtle text-info border" style={{ fontSize: 9 }}>{v}</span>
            ))}
          </div>
        </div>
      )}

      {/* Linked skills */}
      {(dryRun.linkedSkills?.length || 0) > 0 && (
        <div className="mb-2">
          <span className="small fw-medium" style={{ fontSize: 10 }}>Linked Skills:</span>
          <div className="d-flex flex-wrap gap-1 mt-1">
            {dryRun.linkedSkills!.map(s => (
              <span key={s} className="badge bg-primary-subtle text-primary border" style={{ fontSize: 9 }}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {allWarnings.length > 0 && (
        <div className="mt-1">
          {allWarnings.map((w, i) => (
            <div key={i} className="alert alert-warning py-1 px-2 mb-1" style={{ fontSize: 10 }}>
              <i className="bi bi-exclamation-triangle me-1"></i>{w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
