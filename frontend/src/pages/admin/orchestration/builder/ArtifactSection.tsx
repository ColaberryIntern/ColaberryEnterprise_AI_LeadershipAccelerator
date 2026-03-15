import React from 'react';
import { MiniSection } from './types';

interface Props {
  editing: Partial<MiniSection>;
  artifacts: { id: string; name: string; artifact_type: string; produces_variable_keys?: string[] }[];
  sectionArtifactIds?: string[];
}

export default function ArtifactSection({ editing, artifacts, sectionArtifactIds }: Props) {
  if (editing.mini_section_type !== 'implementation_task') return null;

  const sectionArtifacts = (sectionArtifactIds || []).map(id => artifacts.find(a => a.id === id)).filter(Boolean);

  return (
    <div>
      {/* Section-level artifacts (inherited, read-only) */}
      <div className="mb-2">
        <h6 className="small fw-semibold mb-1" style={{ fontSize: 11, color: '#553c9a' }}>
          <i className="bi bi-diagram-3 me-1"></i>Section Artifacts
          <span className="badge ms-1" style={{ fontSize: 8, background: 'rgba(128,90,213,0.12)', color: '#553c9a' }}>inherited</span>
        </h6>
        <div className="d-flex flex-wrap gap-1">
          {sectionArtifacts.map(art => art && (
            <span key={art.id} className="badge" style={{ fontSize: 9, background: 'rgba(128,90,213,0.12)', color: '#553c9a', border: '1px solid rgba(128,90,213,0.2)' }}>
              {art.name}
              {art.artifact_type && (
                <span className="ms-1 opacity-75" style={{ fontSize: 8 }}>({art.artifact_type})</span>
              )}
            </span>
          ))}
          {sectionArtifacts.length === 0 && (
            <span className="text-muted" style={{ fontSize: 10 }}>None assigned</span>
          )}
        </div>
        <span className="text-muted" style={{ fontSize: 9 }}>
          <i className="bi bi-info-circle me-1"></i>Edit in Section Blueprint
        </span>
      </div>

      {/* Mini-section creates_artifact_ids (read-only display) */}
      {(editing.creates_artifact_ids || []).length > 0 && (
        <div className="mb-1">
          <span className="text-muted" style={{ fontSize: 10 }}>Creates artifacts:</span>
          <div className="d-flex flex-wrap gap-1 mt-1">
            {(editing.creates_artifact_ids || []).map(id => {
              const art = artifacts.find(a => a.id === id);
              return (
                <span key={id} className="badge bg-warning-subtle text-dark border" style={{ fontSize: 9 }}>
                  {art?.name || id.slice(0, 8)}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
