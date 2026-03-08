import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProgramOverviewTab from './orchestration/ProgramOverviewTab';
import SessionControlTab from './orchestration/SessionControlTab';
import SectionControlTab from './orchestration/SectionControlTab';
import PromptControlTab from './orchestration/PromptControlTab';
import ArtifactControlTab from './orchestration/ArtifactControlTab';
import SkillControlTab from './orchestration/SkillControlTab';
import GatingControlTab from './orchestration/GatingControlTab';
import AnalyticsTab from './orchestration/AnalyticsTab';

const API = process.env.REACT_APP_API_URL || '';

const TABS = [
  { id: 'overview', label: 'Program Overview', icon: 'bi-diagram-3' },
  { id: 'sessions', label: 'Sessions', icon: 'bi-calendar-event' },
  { id: 'sections', label: 'Sections', icon: 'bi-layout-text-sidebar' },
  { id: 'prompts', label: 'Prompts', icon: 'bi-terminal' },
  { id: 'artifacts', label: 'Artifacts', icon: 'bi-file-earmark-check' },
  { id: 'skills', label: 'Skills', icon: 'bi-award' },
  { id: 'gating', label: 'Gating & Variables', icon: 'bi-lock' },
  { id: 'analytics', label: 'Analytics', icon: 'bi-graph-up' },
];

export default function AdminOrchestrationPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');

  useEffect(() => {
    fetch(`${API}/api/admin/cohorts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.cohorts || [];
        setCohorts(list);
        if (list.length > 0 && !selectedCohortId) setSelectedCohortId(list[0].id);
      })
      .catch(() => {});
  }, [token]);

  const tabProps = { token: token || '', cohortId: selectedCohortId, apiUrl: API };

  return (
    <div className="container-fluid py-4" style={{ maxWidth: 1200 }}>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: 'var(--color-primary, #1a365d)' }}>
            <i className="bi bi-gear-wide-connected me-2"></i>
            Orchestration Engine
          </h4>
          <p className="text-muted small mb-0">Admin-controlled AI Program Configuration</p>
        </div>
        <select
          className="form-select form-select-sm"
          style={{ width: 260 }}
          value={selectedCohortId}
          onChange={e => setSelectedCohortId(e.target.value)}
        >
          {cohorts.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <ul className="nav nav-tabs mb-4">
        {TABS.map(tab => (
          <li key={tab.id} className="nav-item">
            <button
              className={`nav-link ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ fontSize: 13 }}
            >
              <i className={`bi ${tab.icon} me-1`}></i>
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {!selectedCohortId ? (
        <div className="text-center text-muted py-5">
          <i className="bi bi-info-circle" style={{ fontSize: 32 }}></i>
          <p className="mt-2">Select a cohort to begin configuration.</p>
        </div>
      ) : (
        <>
          {activeTab === 'overview' && <ProgramOverviewTab {...tabProps} />}
          {activeTab === 'sessions' && <SessionControlTab {...tabProps} />}
          {activeTab === 'sections' && <SectionControlTab {...tabProps} />}
          {activeTab === 'prompts' && <PromptControlTab {...tabProps} />}
          {activeTab === 'artifacts' && <ArtifactControlTab {...tabProps} />}
          {activeTab === 'skills' && <SkillControlTab {...tabProps} />}
          {activeTab === 'gating' && <GatingControlTab {...tabProps} />}
          {activeTab === 'analytics' && <AnalyticsTab {...tabProps} />}
        </>
      )}
    </div>
  );
}
