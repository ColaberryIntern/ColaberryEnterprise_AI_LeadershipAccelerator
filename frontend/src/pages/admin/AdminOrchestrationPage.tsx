import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
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
  { id: 'blueprint', label: 'Blueprint', icon: 'bi-diagram-3' },
  { id: 'overview', label: 'Overview', icon: 'bi-grid-1x2' },
  { id: 'sessions', label: 'Sessions', icon: 'bi-calendar-event' },
  { id: 'sections', label: 'Sections', icon: 'bi-list-nested' },
  { id: 'mini-sections', label: 'Mini-Sections', icon: 'bi-layers' },
  { id: 'types', label: 'Types', icon: 'bi-tag' },
  { id: 'artifacts', label: 'Artifacts', icon: 'bi-file-earmark-code' },
  { id: 'skills', label: 'Skills', icon: 'bi-lightning' },
  { id: 'gating', label: 'Gating', icon: 'bi-funnel' },
  { id: 'analytics', label: 'Analytics', icon: 'bi-bar-chart-line' },
  { id: 'workstation', label: 'Workstation', icon: 'bi-gear' },
  { id: 'bulk', label: 'Bulk Config', icon: 'bi-stack' },
  { id: 'health', label: 'Health', icon: 'bi-heart-pulse' },
];

export default function AdminOrchestrationPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  const handleNavigateToMiniSections = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setActiveTab('mini-sections');
  };

  const tabProps = { token: token || '', apiUrl: API };

  return (
    <div className="orch-dark" style={{ minHeight: '100vh' }}>
      <div className="container-fluid py-4" style={{ maxWidth: activeTab === 'mini-sections' ? 1600 : 1200 }}>

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-4">
          <div>
            <h4 className="fw-bold mb-1" style={{ color: 'var(--orch-text)', letterSpacing: '-0.02em' }}>
              <i className="bi bi-cpu me-2" style={{ color: 'var(--orch-accent-blue)' }} />
              Orchestration Engine
            </h4>
            <p className="mb-0" style={{ color: 'var(--orch-text-muted)', fontSize: 13 }}>
              Program-wide AI curriculum configuration
            </p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="orch-badge" style={{ fontSize: 11 }}>
              <span className="orch-dot-pulse" style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--orch-accent-green)', display: 'inline-block',
              }} />
              System Online
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="orch-tab-nav mb-4">
          <div className="d-flex flex-wrap gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`orch-tab-btn ${activeTab === tab.id ? 'orch-tab-btn-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <i className={`bi ${tab.icon} me-1`} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

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
