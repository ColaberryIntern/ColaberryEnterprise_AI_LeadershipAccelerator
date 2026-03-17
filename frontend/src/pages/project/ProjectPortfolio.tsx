import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import PortfolioPreview from '../../components/project/PortfolioPreview';

function ProjectPortfolio() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi.get('/api/portal/project/portfolio')
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to generate portfolio'))
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    portalApi.post('/api/portal/project/refresh')
      .then(() => portalApi.get('/api/portal/project/portfolio'))
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Refresh failed'))
      .finally(() => setRefreshing(false));
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: 'var(--color-primary)' }} role="status">
          <span className="visually-hidden">Generating portfolio...</span>
        </div>
        <p className="small text-muted mt-3">Generating portfolio — this may take a moment...</p>
      </div>
    );
  }

  if (error || !data) {
    return <div className="alert alert-danger">{error || 'Failed to generate portfolio.'}</div>;
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h4 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          <i className="bi bi-briefcase me-2"></i>Enterprise AI Portfolio
        </h1>
        <div className="d-flex gap-2">
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <i className={`bi ${refreshing ? 'bi-arrow-repeat spin' : 'bi-arrow-clockwise'} me-1`}></i>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link to="/portal/project" className="btn btn-sm btn-outline-secondary">
            <i className="bi bi-arrow-left me-1"></i>Dashboard
          </Link>
        </div>
      </div>

      <PortfolioPreview
        metadata={data.metadata || {}}
        portfolio={data.portfolio || []}
        readme={data.readme}
        executiveSummary={data.executive_summary}
      />
    </>
  );
}

export default ProjectPortfolio;
