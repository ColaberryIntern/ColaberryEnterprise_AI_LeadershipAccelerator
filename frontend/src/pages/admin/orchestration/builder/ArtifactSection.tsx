import React from 'react';
import { MiniSection } from './types';
import MultiSelect from './MultiSelect';

interface Props {
  editing: Partial<MiniSection>;
  artifactOptions: { value: string; label: string; sub?: string }[];
  artifacts: { id: string; name: string; artifact_type: string; produces_variable_keys?: string[] }[];
  onUpdate: (updates: Partial<MiniSection>) => void;
  onCreateArtifact: () => void;
}

export default function ArtifactSection({ editing, artifactOptions, artifacts, onUpdate, onCreateArtifact }: Props) {
  if (editing.mini_section_type !== 'implementation_task') return null;

  const linkedIds = editing.creates_artifact_ids || [];
  const linkedArtifacts = linkedIds.map(id => artifacts.find(a => a.id === id)).filter(Boolean);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-1">
        <span></span>
        <button className="btn btn-link p-0" onClick={onCreateArtifact} style={{ fontSize: 10 }}>+ Create Artifact</button>
      </div>
      <MultiSelect
        label="Creates Artifacts"
        options={artifactOptions}
        selected={linkedIds}
        onChange={vals => onUpdate({ creates_artifact_ids: vals })}
        colorClass="text-warning"
        badgeClass="bg-warning-subtle text-dark"
      />
      {/* Linked artifact details */}
      {linkedArtifacts.length > 0 && (
        <div className="mt-2">
          {linkedArtifacts.map(art => art && (
            <div key={art.id} className="d-flex align-items-center gap-1 border rounded px-2 py-1 mb-1" style={{ fontSize: 10 }}>
              <i className="bi bi-box text-warning"></i>
              <span className="fw-medium">{art.name}</span>
              <span className="badge bg-light text-muted border" style={{ fontSize: 8 }}>{art.artifact_type}</span>
              {art.produces_variable_keys && art.produces_variable_keys.length > 0 && (
                <span className="text-muted ms-1">
                  produces: {art.produces_variable_keys.join(', ')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
