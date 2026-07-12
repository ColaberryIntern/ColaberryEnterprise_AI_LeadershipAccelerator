import React, { useMemo, useState } from 'react';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../../components/admin/shell';
import { TrustSignal } from '../../../components/admin/shell/trust';
import InboxDecisionsPage from './InboxDecisionsPage';
import InboxDraftApprovalPage from './InboxDraftApprovalPage';
import InboxRuleBuilderPage from './InboxRuleBuilderPage';
import InboxVipManagerPage from './InboxVipManagerPage';
import InboxLearningPage from './InboxLearningPage';
import InboxAuditLogPage from './InboxAuditLogPage';

type Tone = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface TabDef {
  id: string;
  label: string;
  icon: string; // RemixIcon name without ri- prefix
  tone: Tone;
  component: React.ComponentType;
  help: string;
}

const TABS: TabDef[] = [
  {
    id: 'decisions',
    label: 'Decisions',
    icon: 'inbox-2-line',
    tone: 'primary',
    component: InboxDecisionsPage,
    help: 'Emails the system wasn\'t sure about are held here. Review the Silent Hold queue and either promote emails to your Inbox or dismiss them to Automation. You can also see every classification the system has made across all states.',
  },
  {
    id: 'drafts',
    label: 'Drafts',
    icon: 'draft-line',
    tone: 'info',
    component: InboxDraftApprovalPage,
    help: 'When an email lands in your Inbox and needs a reply, the system generates a draft. Review each draft here: approve to send it, edit it first, or reject it. Over time, drafts get better as the system learns your writing style.',
  },
  {
    id: 'rules',
    label: 'Rules',
    icon: 'filter-3-line',
    tone: 'warning',
    component: InboxRuleBuilderPage,
    help: 'Create custom rules to override the AI. Match emails by sender, keyword, header, or domain and route them directly to Inbox, Automation, or Silent Hold. Rules are checked before the AI, so they always take priority.',
  },
  {
    id: 'vips',
    label: 'VIPs',
    icon: 'vip-crown-line',
    tone: 'success',
    component: InboxVipManagerPage,
    help: 'Anyone on the VIP list always goes straight to your Inbox, no AI needed. Add family, key business contacts, or anyone whose emails you never want filtered. VIPs are checked first before any other rule.',
  },
  {
    id: 'learning',
    label: 'Learning',
    icon: 'brain-line',
    tone: 'info',
    component: InboxLearningPage,
    help: 'The system compares every draft it wrote against your actual reply. Over time it learns your tone, greetings, sign-offs, and level of formality for different types of contacts. The more drafts you edit, the faster it adapts.',
  },
  {
    id: 'audit',
    label: 'Audit Log',
    icon: 'history-line',
    tone: 'neutral',
    component: InboxAuditLogPage,
    help: 'Every decision the system makes is logged here with the full reasoning. Use this to understand why an email was classified a certain way, trace overrides, and spot patterns the AI may be getting wrong.',
  },
];

export default function InboxCOSPage() {
  const [activeTab, setActiveTab] = useState('decisions');
  const tab = TABS.find(t => t.id === activeTab) || TABS[0];
  const ActiveComponent = tab.component;

  // Per-page trust signal (Basecamp todo 10027085963): the COS routes live email
  // decisions, so the signal reflects the routing layer being active.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'inbox decisions',
    updatedAt: new Date().toISOString(),
    summary: 'Live email triage routing every inbound message to Inbox, Automation, or Silent Hold.',
    href: '/admin/trust',
    pillars: [
      {
        name: 'Routing',
        status: 'live',
        evidence: [{ label: 'Capabilities', value: `${TABS.length} active` }],
      },
    ],
  }), []);

  return (
    <>
      <PageHeader
        title="Inbox Chief of Staff"
        icon="inbox-2-line"
        subtitle="Your email intelligence layer. Filters noise, surfaces what matters, learns your style."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Inbox COS' }]}
        trust={trust}
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Capabilities" value={TABS.length} icon="apps-2-line" tone="primary" hint="Triage surfaces" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Active View" value={tab.label} icon={tab.icon} tone={tab.tone} />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Routing" value="Live" icon="broadcast-line" tone="success" hint="Inbox · Automation · Silent Hold" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Learning" value="On" icon="brain-line" tone="info" hint="Adapts to your replies" />
          </div>
        </div>
      </PageHeader>

      <ul className="nav nav-tabs mb-3" role="tablist">
        {TABS.map(t => (
          <li className="nav-item" key={t.id} role="presentation">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`nav-link${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <i className={`ri-${t.icon}`} aria-hidden="true" /> {t.label}
            </button>
          </li>
        ))}
      </ul>

      <SectionCard className="mb-3">
        <div className="d-flex align-items-start gap-2">
          <StatusBadge label={tab.label} tone={tab.tone} icon={tab.icon} />
          <small className="text-muted">{tab.help}</small>
        </div>
      </SectionCard>

      <ActiveComponent />
    </>
  );
}
