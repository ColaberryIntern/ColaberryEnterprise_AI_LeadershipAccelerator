import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import portalApi from '../utils/portalApi';
import PortfolioPreview from '../components/project/PortfolioPreview';

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

function PublicPortfolioPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    portalApi.get(`/api/public/portfolio/${token}`)
      .then(res => setData(mapPortfolioResponse(res.data)))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: '#FB2832' }} role="status">
          <span className="visually-hidden">Loading portfolio...</span>
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="container py-5">
        <div className="alert alert-warning">This portfolio link is invalid or is no longer shared.</div>
      </div>
    );
  }

  return (
    <div className="container py-5" style={{ maxWidth: 960 }}>
      <div className="mb-4">
        <h1 className="h4 fw-bold mb-1" style={{ color: '#FB2832' }}>
          <i className="bi bi-briefcase me-2"></i>Enterprise AI Portfolio
        </h1>
        <p className="small text-muted mb-0">A Colaberry AI Systems Architect Accelerator student project.</p>
      </div>

      <PortfolioPreview
        metadata={data.metadata || {}}
        portfolio={data.portfolio || []}
        readme={data.readme}
        executiveSummary={data.executiveSummary}
        weeklyArtifacts={data.weeklyArtifacts}
        readinessScore={data.readinessScore}
      />
    </div>
  );
}

export default PublicPortfolioPage;
