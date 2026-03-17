import React from 'react';
import ArtifactCard from './ArtifactCard';

interface Artifact {
  id: string;
  version: number;
  artifact_stage?: string;
  artifact_category?: string;
  submission?: {
    id: string;
    title: string;
    status: string;
    score?: number;
    submitted_at?: string;
  };
  artifactDefinition?: {
    id: string;
    name: string;
  };
}

interface ArtifactCategoryBoardProps {
  grouped: Record<string, Artifact[]>;
}

const CATEGORY_ICONS: Record<string, string> = {
  strategy: 'bi-lightbulb',
  governance: 'bi-shield-check',
  architecture: 'bi-diagram-3',
  implementation: 'bi-code-square',
  uncategorized: 'bi-folder',
};

function ArtifactCategoryBoard({ grouped }: ArtifactCategoryBoardProps) {
  const categories = Object.keys(grouped);

  if (categories.length === 0) {
    return (
      <div className="text-center py-5 text-muted">
        <i className="bi bi-inbox fs-1 d-block mb-2"></i>
        <p className="small">No artifacts linked to this project yet.</p>
        <p className="small">Complete curriculum lessons to generate artifacts.</p>
      </div>
    );
  }

  return (
    <>
      {categories.map(category => (
        <div key={category} className="mb-4">
          <h6 className="fw-semibold text-capitalize mb-3" style={{ color: 'var(--color-primary)' }}>
            <i className={`${CATEGORY_ICONS[category] || 'bi-folder'} me-2`}></i>
            {category}
            <span className="badge bg-light text-dark ms-2">{grouped[category].length}</span>
          </h6>
          <div className="row g-3">
            {grouped[category].map(artifact => (
              <div key={artifact.id} className="col-md-6 col-lg-4">
                <ArtifactCard
                  title={artifact.submission?.title || 'Untitled'}
                  status={artifact.submission?.status || 'pending'}
                  version={artifact.version}
                  stage={artifact.artifact_stage}
                  score={artifact.submission?.score}
                  submittedAt={artifact.submission?.submitted_at}
                  artifactDefinitionName={artifact.artifactDefinition?.name}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export default ArtifactCategoryBoard;
