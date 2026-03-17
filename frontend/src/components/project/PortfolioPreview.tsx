import React from 'react';

interface PortfolioCategory {
  category: string;
  artifacts: Array<{
    name: string;
    summary: string;
    version: number;
  }>;
}

interface PortfolioPreviewProps {
  metadata: {
    organization_name?: string;
    industry?: string;
    use_case?: string;
    automation_goal?: string;
  };
  portfolio: PortfolioCategory[];
  readme?: string;
  executiveSummary?: string;
}

function PortfolioPreview({ metadata, portfolio, readme, executiveSummary }: PortfolioPreviewProps) {
  const totalArtifacts = portfolio.reduce((sum, cat) => sum + cat.artifacts.length, 0);

  return (
    <div>
      {/* Summary stats */}
      <div className="row g-3 mb-4">
        <div className="col-sm-3">
          <div className="card border-0 shadow-sm text-center p-3">
            <div className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>{totalArtifacts}</div>
            <div className="small text-muted">Total Artifacts</div>
          </div>
        </div>
        <div className="col-sm-3">
          <div className="card border-0 shadow-sm text-center p-3">
            <div className="h3 fw-bold mb-0" style={{ color: 'var(--color-accent)' }}>{portfolio.length}</div>
            <div className="small text-muted">Categories</div>
          </div>
        </div>
        <div className="col-sm-6">
          <div className="card border-0 shadow-sm p-3">
            <div className="small fw-medium mb-1" style={{ color: 'var(--color-primary)' }}>
              {metadata.organization_name || 'Enterprise AI Project'}
            </div>
            {metadata.industry && <div className="small text-muted">{metadata.industry}</div>}
            {metadata.use_case && <div className="small text-muted mt-1">{metadata.use_case}</div>}
          </div>
        </div>
      </div>

      {/* Portfolio categories */}
      {portfolio.map(cat => (
        <div key={cat.category} className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold text-capitalize">
            <i className="bi bi-folder2-open me-2"></i>{cat.category}
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="small">Artifact</th>
                    <th className="small">Summary</th>
                    <th className="small text-center">Version</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.artifacts.map((a, idx) => (
                    <tr key={idx}>
                      <td className="small fw-medium">{a.name}</td>
                      <td className="small text-muted">{a.summary || '—'}</td>
                      <td className="small text-center">v{a.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}

      {/* Executive Summary */}
      {executiveSummary && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold">
            <i className="bi bi-file-earmark-text me-2"></i>Executive Summary
          </div>
          <div className="card-body">
            <div className="small" style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text)' }}>
              {executiveSummary}
            </div>
          </div>
        </div>
      )}

      {/* README preview */}
      {readme && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">
            <i className="bi bi-markdown me-2"></i>README.md Preview
          </div>
          <div className="card-body">
            <pre className="small mb-0" style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto', color: 'var(--color-text)' }}>
              {readme}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default PortfolioPreview;
