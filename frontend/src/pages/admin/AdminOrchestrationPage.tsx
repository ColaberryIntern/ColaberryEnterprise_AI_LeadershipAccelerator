import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
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

const API = process.env.REACT_APP_API_URL || '';

const TABS = [
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'overview', label: 'Program Overview' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'sections', label: 'Sections' },
  { id: 'mini-sections', label: 'Mini-Sections' },
  { id: 'types', label: 'Curriculum Types' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'skills', label: 'Skills' },
  { id: 'gating', label: 'Gating & Variables' },
  { id: 'analytics', label: 'Analytics' },
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

  const tabProps = { token: token || '', apiUrl: API };

  return (
    <div className="container-fluid py-4" style={{ maxWidth: 1200 }}>
      <div className="mb-4">
        <h4 className="fw-bold mb-1" style={{ color: 'var(--color-primary, #1a365d)' }}>
          Orchestration Engine
        </h4>
        <p className="text-muted small mb-0">Program-wide AI curriculum configuration</p>
      </div>

      <ul className="nav nav-tabs mb-4">
        {TABS.map(tab => (
          <li key={tab.id} className="nav-item">
            <button
              className={`nav-link ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ fontSize: 13 }}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

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
      {activeTab === 'bulk' && <BulkConfigPanel {...tabProps} onNavigateToLesson={handleNavigateToMiniSections} />}
      {activeTab === 'health' && <HealthDashboardTab {...tabProps} />}
    </div>
  );
}
