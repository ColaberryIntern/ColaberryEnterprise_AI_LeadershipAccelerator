import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import ArtifactCategoryBoard from '../../components/project/ArtifactCategoryBoard';
import RequirementsGeneratorPanel from '../../components/project/RequirementsGeneratorPanel';

interface ArtifactData {
  project_id: string;
  project_stage: string;
  artifacts: any[];
  grouped: Record<string, any[]>;
}

function ProjectArtifacts() {
  const [data, setData] = useState<ArtifactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadArtifacts = () => {
    portalApi.get('/api/portal/project/artifacts')
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load artifacts'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadArtifacts(); }, []);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: 'var(--color-primary)' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <div className="alert alert-danger">{error || 'Failed to load artifacts.'}</div>;
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h4 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          <i className="bi bi-collection me-2"></i>Project Artifacts
        </h1>
        <Link to="/portal/project" className="btn btn-sm btn-outline-secondary">
          <i className="bi bi-arrow-left me-1"></i>Dashboard
        </Link>
      </div>

      <div className="d-flex gap-3 mb-4">
        <div className="card border-0 shadow-sm px-3 py-2">
          <span className="small text-muted">Total Artifacts</span>
          <span className="fw-bold" style={{ color: 'var(--color-primary)' }}>{data.artifacts.length}</span>
        </div>
        <div className="card border-0 shadow-sm px-3 py-2">
          <span className="small text-muted">Categories</span>
          <span className="fw-bold" style={{ color: 'var(--color-accent)' }}>{Object.keys(data.grouped).length}</span>
        </div>
        <div className="card border-0 shadow-sm px-3 py-2">
          <span className="small text-muted">Stage</span>
          <span className="fw-bold text-capitalize" style={{ color: 'var(--color-primary)' }}>{data.project_stage}</span>
        </div>
      </div>

      <RequirementsGeneratorPanel onComplete={loadArtifacts} />

      <ArtifactCategoryBoard grouped={data.grouped} />
    </>
  );
}

export default ProjectArtifacts;
