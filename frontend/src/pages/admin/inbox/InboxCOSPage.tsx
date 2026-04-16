import React, { useState } from 'react';
import InboxDecisionsPage from './InboxDecisionsPage';
import InboxDraftApprovalPage from './InboxDraftApprovalPage';
import InboxRuleBuilderPage from './InboxRuleBuilderPage';
import InboxVipManagerPage from './InboxVipManagerPage';
import InboxLearningPage from './InboxLearningPage';
import InboxAuditLogPage from './InboxAuditLogPage';

const TABS = [
  { id: 'decisions', label: 'Decisions', component: InboxDecisionsPage },
  { id: 'drafts', label: 'Drafts', component: InboxDraftApprovalPage },
  { id: 'rules', label: 'Rules', component: InboxRuleBuilderPage },
  { id: 'vips', label: 'VIPs', component: InboxVipManagerPage },
  { id: 'learning', label: 'Learning', component: InboxLearningPage },
  { id: 'audit', label: 'Audit Log', component: InboxAuditLogPage },
];

export default function InboxCOSPage() {
  const [activeTab, setActiveTab] = useState('decisions');
  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component || InboxDecisionsPage;

  return (
    <div>
      <h4 className="fw-semibold mb-3">Inbox Chief of Staff</h4>
      <ul className="nav nav-tabs mb-4">
        {TABS.map(tab => (
          <li className="nav-item" key={tab.id}>
            <button
              className={`nav-link${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
      <ActiveComponent />
    </div>
  );
}
