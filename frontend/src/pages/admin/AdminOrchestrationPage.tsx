import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import ProgramOverviewTab from './orchestration/ProgramOverviewTab';
import SessionControlTab from './orchestration/SessionControlTab';
import SectionControlTab from './orchestration/SectionControlTab';
import ArtifactControlTab from './orchestration/ArtifactControlTab';
import SkillControlTab from './orchestration/SkillControlTab';
import GatingControlTab from './orchestration/GatingControlTab';
import AnalyticsTab from './orchestration/AnalyticsTab';
import ProgramBlueprintTab from './orchestration/ProgramBlueprintTab';
import MiniSectionControlTab from './orchestration/MiniSectionControlTab';
import BulkConfigPanel from './orchestration/builder/BulkConfigPanel';
import HealthDashboardTab from './orchestration/HealthDashboardTab';
import CurriculumTypesTab from './orchestration/CurriculumTypesTab';
import WorkstationTab from './orchestration/WorkstationTab';
import '../../styles/orchestration.css';

const API = process.env.REACT_APP_API_URL || '';

const TABS = [
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'overview', label: 'Overview' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'sections', label: 'Sections' },
  { id: 'mini-sections', label: 'Mini-Sections' },
  { id: 'types', label: 'Types' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'skills', label: 'Skills' },
  { id: 'gating', label: 'Gating' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'workstation', label: 'Workstation' },
  { id: 'bulk', label: 'Bulk Config' },
  { id: 'health', label: 'Health' },
];

export default function AdminOrchestrationPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  const handleNavigateToMiniSections = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setActiveTab('mini-sections');
  };

  // Per-page trust signal (Basecamp todo 10027085963) — the orchestration engine
  // is the live source of record for program-wide AI curriculum configuration.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'orchestration',
    updatedAt: new Date().toISOString(),
    summary: 'Live program-wide AI curriculum configuration: sessions, sections, artifacts, skills, and gating.',
    href: '/admin/trust',
    pillars: [
      {
        name: 'Configuration Source',
        status: 'live',
        evidence: [{ label: 'Backed by', value: 'orchestration engine config' }],
      },
    ],
  }), []);

  const tabProps = { token: token || '', apiUrl: API };

  return (
    <div className="orch-engine">
      <div className="container-fluid py-4" style={{ maxWidth: activeTab === 'mini-sections' ? 1600 : 1200 }}>

        <PageHeader
          title="Orchestration"
          icon="git-branch-line"
          subtitle="Program-wide AI curriculum configuration."
          breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Orchestration' }]}
          trust={trust}
          actions={<StatusBadge label="System Online" tone="success" icon="pulse-line" />}
        />

        {/* Tab Navigation */}
        <SectionCard padded={false} className="mb-4">
          <div className="orch-tab-nav">
            <div className="d-flex flex-wrap gap-0">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`orch-tab-btn ${activeTab === tab.id ? 'orch-tab-btn-active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Tab Content */}
        <ErrorBoundary key={activeTab}>
          {activeTab === 'blueprint' && <ProgramBlueprintTab {...tabProps} />}
          {activeTab === 'overview' && <ProgramOverviewTab {...tabProps} />}
          {activeTab === 'sessions' && <SessionControlTab {...tabProps} />}
          {activeTab === 'sections' && <SectionControlTab {...tabProps} onNavigateToMiniSections={handleNavigateToMiniSections} />}
          {activeTab === 'mini-sections' && <MiniSectionControlTab {...tabProps} initialLessonId={selectedLessonId} />}
          {activeTab === 'types' && <CurriculumTypesTab />}
          {activeTab === 'artifacts' && <ArtifactControlTab {...tabProps} />}
          {activeTab === 'skills' && <SkillControlTab {...tabProps} />}
          {activeTab === 'gating' && <GatingControlTab {...tabProps} />}
          {activeTab === 'analytics' && <AnalyticsTab {...tabProps} />}
          {activeTab === 'workstation' && <WorkstationTab {...tabProps} />}
          {activeTab === 'bulk' && <BulkConfigPanel {...tabProps} onNavigateToLesson={handleNavigateToMiniSections} />}
          {activeTab === 'health' && <HealthDashboardTab {...tabProps} />}
        </ErrorBoundary>
      </div>
    </div>
  );
}
