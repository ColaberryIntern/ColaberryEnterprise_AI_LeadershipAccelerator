import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

interface ArtifactInfo {
  version: number;
  mode: string;
  generatedAt: string;
  found: boolean;
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function RequirementsStatusCard() {
  const [info, setInfo] = useState<ArtifactInfo | null>(null);

  useEffect(() => {
    portalApi.get('/api/portal/project/artifacts')
      .then(res => {
        const artifacts = res.data.artifacts || [];
        const reqArtifact = artifacts.find((a: any) => {
          const def = a.artifactDefinition || a;
          return def?.name === 'System Requirements Specification' ||
            def?.artifact_type === 'requirements_document';
        });

        if (reqArtifact) {
          const sub = reqArtifact.submission || reqArtifact;
          const contentJson = sub?.content_json || {};
          setInfo({
            version: sub?.version_number || reqArtifact.version || 1,
            mode: contentJson.generation_mode || 'unknown',
            generatedAt: contentJson.generation_timestamp || sub?.submitted_at || sub?.created_at || '',
            found: true,
          });
        } else {
          setInfo({ version: 0, mode: '', generatedAt: '', found: false });
        }
      })
      .catch(() => setInfo({ version: 0, mode: '', generatedAt: '', found: false }));
  }, []);

  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-body py-3">
        <div className="small fw-semibold mb-2" style={{ color: 'var(--color-primary)' }}>
          <i className="bi bi-file-earmark-code me-1"></i>Requirements Document
        </div>

        {info === null ? (
          <div className="text-center py-2">
            <div className="spinner-border spinner-border-sm" style={{ color: 'var(--color-text-light)' }} role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : info.found ? (
          <>
            <div className="d-flex flex-column gap-1 mb-2">
              <div className="d-flex justify-content-between">
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>Version</span>
                <span className="fw-semibold" style={{ fontSize: '0.75rem' }}>v{info.version}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>Mode</span>
                <span className="fw-semibold text-capitalize" style={{ fontSize: '0.75rem' }}>{info.mode}</span>
              </div>
              {info.generatedAt && (
                <div className="d-flex justify-content-between">
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>Generated</span>
                  <span className="fw-semibold" style={{ fontSize: '0.75rem' }}>{formatTimeAgo(info.generatedAt)}</span>
                </div>
              )}
            </div>
            <Link
              to="/portal/project/artifacts"
              className="btn btn-sm btn-outline-primary w-100"
              style={{ fontSize: '0.75rem' }}
            >
              <i className="bi bi-eye me-1"></i>View Artifacts
            </Link>
          </>
        ) : (
          <>
            <p className="text-muted mb-2" style={{ fontSize: '0.75rem' }}>
              No requirements document generated yet.
            </p>
            <Link
              to="/portal/project/artifacts"
              className="btn btn-sm btn-primary w-100"
              style={{ fontSize: '0.75rem' }}
            >
              <i className="bi bi-plus-circle me-1"></i>Generate Document
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default RequirementsStatusCard;
