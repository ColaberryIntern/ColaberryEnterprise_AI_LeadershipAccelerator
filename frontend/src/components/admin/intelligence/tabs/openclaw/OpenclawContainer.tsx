import { useState } from 'react';
import { OpenclawProvider } from './OpenclawContext';
import TaskQueueSubTab from './TaskQueueSubTab';
import LinkedInToolsSubTab from './LinkedInToolsSubTab';
import DashboardSubTab from './DashboardSubTab';
import SettingsSubTab from './SettingsSubTab';

type SubTab = 'queue' | 'linkedin' | 'dashboard' | 'settings';

export default function OpenclawContainer() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('queue');

  return (
    <OpenclawProvider>
      <div className="p-3">
        <h6 className="fw-semibold mb-3">OpenClaw Autonomous Outreach</h6>

        <ul className="nav nav-tabs mb-3" style={{ fontSize: '0.8rem' }}>
          <li className="nav-item">
            <button
              className={`nav-link ${activeSubTab === 'queue' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('queue')}
            >
              Task Queue
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeSubTab === 'linkedin' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('linkedin')}
            >
              LinkedIn Tools
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeSubTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('dashboard')}
            >
              Dashboard
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeSubTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('settings')}
            >
              Settings
            </button>
          </li>
        </ul>

        {activeSubTab === 'queue' && <TaskQueueSubTab />}
        {activeSubTab === 'linkedin' && <LinkedInToolsSubTab />}
        {activeSubTab === 'dashboard' && <DashboardSubTab />}
        {activeSubTab === 'settings' && <SettingsSubTab />}
      </div>
    </OpenclawProvider>
  );
}
