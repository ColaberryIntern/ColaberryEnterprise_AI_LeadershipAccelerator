import React, { useState } from 'react';
import InboxDecisionsPage from './InboxDecisionsPage';
import InboxDraftApprovalPage from './InboxDraftApprovalPage';
import InboxRuleBuilderPage from './InboxRuleBuilderPage';
import InboxVipManagerPage from './InboxVipManagerPage';
import InboxLearningPage from './InboxLearningPage';
import InboxAuditLogPage from './InboxAuditLogPage';

const TABS = [
  {
    id: 'decisions',
    label: 'Decisions',
    component: InboxDecisionsPage,
    help: 'Emails the system wasn\'t sure about are held here. Review the Silent Hold queue and either promote emails to your Inbox or dismiss them to Automation. You can also see every classification the system has made across all states.',
  },
  {
    id: 'drafts',
    label: 'Drafts',
    component: InboxDraftApprovalPage,
    help: 'When an email lands in your Inbox and needs a reply, the system generates a draft. Review each draft here: approve to send it, edit it first, or reject it. Over time, drafts get better as the system learns your writing style.',
  },
  {
    id: 'rules',
    label: 'Rules',
    component: InboxRuleBuilderPage,
    help: 'Create custom rules to override the AI. Match emails by sender, keyword, header, or domain and route them directly to Inbox, Automation, or Silent Hold. Rules are checked before the AI, so they always take priority.',
  },
  {
    id: 'vips',
    label: 'VIPs',
    component: InboxVipManagerPage,
    help: 'Anyone on the VIP list always goes straight to your Inbox, no AI needed. Add family, key business contacts, or anyone whose emails you never want filtered. VIPs are checked first before any other rule.',
  },
  {
    id: 'learning',
    label: 'Learning',
    component: InboxLearningPage,
    help: 'The system compares every draft it wrote against your actual reply. Over time it learns your tone, greetings, sign-offs, and level of formality for different types of contacts. The more drafts you edit, the faster it adapts.',
  },
  {
    id: 'audit',
    label: 'Audit Log',
    component: InboxAuditLogPage,
    help: 'Every decision the system makes is logged here with the full reasoning. Use this to understand why an email was classified a certain way, trace overrides, and spot patterns the AI may be getting wrong.',
  },
];

export default function InboxCOSPage() {
  const [activeTab, setActiveTab] = useState('decisions');
  const tab = TABS.find(t => t.id === activeTab) || TABS[0];
  const ActiveComponent = tab.component;

  return (
    <div>
      <h4 className="fw-semibold mb-1">Inbox Chief of Staff</h4>
      <p className="text-muted small mb-3">Your email intelligence layer. Filters noise, surfaces what matters, learns your style.</p>
      <ul className="nav nav-tabs mb-3">
        {TABS.map(t => (
          <li className="nav-item" key={t.id}>
            <button
              className={`nav-link${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="alert alert-light border-0 py-2 px-3 mb-3" style={{ backgroundColor: '#f8fafc' }}>
        <small className="text-muted">{tab.help}</small>
      </div>
      <ActiveComponent />
    </div>
  );
}
