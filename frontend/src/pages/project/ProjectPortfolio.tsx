import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import PortfolioPreview from '../../components/project/PortfolioPreview';

interface ShareState {
  share_token: string | null;
  share_enabled: boolean;
}

function mapPortfolioResponse(raw: any) {
  const structure = raw?.portfolio_structure || {};
  const metadata = structure.project_metadata || {};
  const categories = ['strategy', 'governance', 'architecture', 'implementation']
    .map((category) => ({
      category,
      artifacts: (structure[category] || []).map((a: any) => ({
        name: a.artifact_name,
        summary: a.artifact_summary,
        version: a.version_number,
      })),
    }))
    .filter((cat) => cat.artifacts.length > 0);

  return {
    metadata: {
      organization_name: metadata.organization_name,
      industry: metadata.industry,
      use_case: metadata.selected_use_case,
      automation_goal: metadata.automation_goal,
    },
    portfolio: categories,
    readme: raw?.readme_content,
    executiveSummary: raw?.executive_summary,
    weeklyArtifacts: structure.weekly_artifacts || [],
    readinessScore: structure.readiness_score ?? null,
  };
}

function ProjectPortfolio() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [share, setShare] = useState<ShareState>({ share_token: null, share_enabled: false });
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    portalApi.get('/api/portal/project/portfolio')
      .then(res => setData(mapPortfolioResponse(res.data)))
      .catch(err => setError(err.response?.data?.error || 'Failed to generate portfolio'))
      .finally(() => setLoading(false));

    portalApi.get('/api/portal/project/portfolio/share')
      .then(res => setShare(res.data))
      .catch(() => { /* sharing state is a non-critical enhancement; leave defaults on failure */ });
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    portalApi.post('/api/portal/project/refresh')
      .then(() => portalApi.get('/api/portal/project/portfolio'))
      .then(res => setData(mapPortfolioResponse(res.data)))
      .catch(err => setError(err.response?.data?.error || 'Refresh failed'))
      .finally(() => setRefreshing(false));
  };

  const handleToggleShare = () => {
    setShareBusy(true);
    setCopied(false);
    portalApi.post('/api/portal/project/portfolio/share', { enabled: !share.share_enabled })
      .then(res => setShare(res.data))
      .catch(() => { /* leave prior share state on failure */ })
      .finally(() => setShareBusy(false));
  };

  const shareUrl = share.share_token ? `${window.location.origin}/portfolio/share/${share.share_token}` : null;

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => setCopied(true));
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: '#FB2832' }} role="status">
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
        <h1 className="h4 fw-bold mb-0" style={{ color: '#FB2832' }}>
          <i className="bi bi-briefcase me-2"></i>Enterprise AI Portfolio
        </h1>
        <div className="d-flex gap-2">
          <button
            className="btn btn-sm"
            style={{ border: '1px solid #FB2832', color: share.share_enabled ? '#fff' : '#FB2832', background: share.share_enabled ? '#FB2832' : 'transparent' }}
            onClick={handleToggleShare}
            disabled={shareBusy}
          >
            <i className={`bi ${share.share_enabled ? 'bi-globe' : 'bi-globe2'} me-1`}></i>
            {share.share_enabled ? 'Sharing on' : 'Share portfolio'}
          </button>
          <button
            className="btn btn-sm"
            style={{ border: '1px solid #FB2832', color: '#FB2832', background: 'transparent' }}
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

      {share.share_enabled && shareUrl && (
        <div className="alert alert-light border d-flex align-items-center justify-content-between mb-4">
          <div className="small text-truncate me-2">
            <i className="bi bi-link-45deg me-1"></i>{shareUrl}
          </div>
          <button className="btn btn-sm btn-outline-secondary flex-shrink-0" onClick={handleCopyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      )}

      <PortfolioPreview
        metadata={data.metadata || {}}
        portfolio={data.portfolio || []}
        readme={data.readme}
        executiveSummary={data.executiveSummary}
        weeklyArtifacts={data.weeklyArtifacts}
        readinessScore={data.readinessScore}
      />
    </>
  );
}

export default ProjectPortfolio;
