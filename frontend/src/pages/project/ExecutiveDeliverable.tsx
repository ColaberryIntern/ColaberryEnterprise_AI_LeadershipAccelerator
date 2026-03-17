import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import ExecutiveDeliverablePanel from '../../components/project/ExecutiveDeliverablePanel';

function ExecutiveDeliverable() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi.get('/api/portal/project/executive')
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to generate executive deliverable'))
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    portalApi.post('/api/portal/project/refresh')
      .then(() => portalApi.get('/api/portal/project/executive'))
      .then(res => { setData(res.data); setError(null); })
      .catch(err => setError(err.response?.data?.error || 'Refresh failed'))
      .finally(() => setRefreshing(false));
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h4 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          <i className="bi bi-file-earmark-richtext me-2"></i>Executive Deliverable
        </h1>
        <div className="d-flex gap-2">
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <i className={`bi ${refreshing ? 'bi-arrow-repeat' : 'bi-arrow-clockwise'} me-1`}></i>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <Link to="/portal/project" className="btn btn-sm btn-outline-secondary">
            <i className="bi bi-arrow-left me-1"></i>Dashboard
          </Link>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger">{error}</div>
      ) : (
        <ExecutiveDeliverablePanel
          report={data?.report || data?.executive_summary || ''}
          roi={data?.roi}
          generatedAt={data?.generated_at}
          loading={loading}
        />
      )}
    </>
  );
}

export default ExecutiveDeliverable;
