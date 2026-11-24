import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader } from '../../components/admin/shell';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import HealthDashboardTab from './orchestration/HealthDashboardTab';
import '../../styles/orchestration.css';

const API = process.env.REACT_APP_API_URL || '';

/**
 * Orchestration Health, read-only, on its own route.
 *
 * WHY A SEPARATE ROUTE AND NOT A DEEP LINK TO THE HEALTH TAB.
 *
 * The same component renders inside AdminOrchestrationPage as the "Health" tab, and
 * /admin/orchestration?tab=health already opens it. That is not reachable for the people this
 * page exists for. The nav's model is one section per PATH: sectionForPath() matches on
 * pathname only and never sees a query string, so ?tab=health still resolves to 'program' and
 * ProtectedRoute turns the request away before any tab renders.
 *
 * Re-sectioning /admin/orchestration itself was the alternative and is worse. That page also
 * holds the Curriculum Composer, Experience Studio, Timeline, Feed Control and Architecture
 * Skills, none of which the orchestration_health key covers. A holder would see all six tab
 * buttons, click one, and get a 403 from its API calls — a page that looks granted and is not.
 *
 * So: one component, two mount points, one section each. The tab keeps 'program' for the
 * curriculum team who reach it in context; this route carries 'orchestration_health' for the
 * platform domain, which needs the numbers and nothing else around them.
 *
 * READ-ONLY IS A PROPERTY OF THE THREE ENDPOINTS, NOT OF THIS FILE. HealthDashboardTab calls
 * GET health-report, GET health-snapshots/latest and GET monitoring/agents, and its only
 * control is a Refresh button that re-issues two of them. The guarantee is enforced in
 * mgmtSectionGate's PATH_SECTION rows, which grant those three paths and deliberately not the
 * /monitoring prefix that would have carried POST /monitoring/scan with it.
 */
export default function OrchestrationHealthPage(): React.ReactElement {
  const { token } = useAuth();

  return (
    <div className="orchestration-page">
      <PageHeader
        title="Orchestration Health"
        subtitle="The latest curriculum content health snapshot, its findings and component scores. Read-only."
      />
      <ErrorBoundary>
        <HealthDashboardTab token={token || ''} apiUrl={API} />
      </ErrorBoundary>
    </div>
  );
}
