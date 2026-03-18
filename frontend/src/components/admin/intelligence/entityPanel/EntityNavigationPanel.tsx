import React, { useState } from 'react';
import { EntityNetwork, BusinessEntityNetwork } from '../../../../services/intelligenceApi';
import BusinessMapTab from './BusinessMapTab';
import CampaignGraphTab from './CampaignGraphTab';
import EntityBrowserTab from './EntityBrowserTab';
import SchemaExplorerTab from './SchemaExplorerTab';
import DeptMapTab from './DeptMapTab';

interface Props {
  network: EntityNetwork | null;
  businessHierarchy: BusinessEntityNetwork | null;
  hierarchyLoading?: boolean;
  onRefresh: () => void;
}

type TabKey = 'map' | 'campaign' | 'depts' | 'entities' | 'schema';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'map', label: 'Map' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'depts', label: 'Depts' },
  { key: 'entities', label: 'Entities' },
  { key: 'schema', label: 'Schema' },
];

export default function EntityNavigationPanel({ network, businessHierarchy, hierarchyLoading, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('map');

  return (
    <div className="d-flex flex-column h-100">
      {/* Tab navigation */}
      <ul className="nav nav-tabs mb-0" style={{ fontSize: '0.75rem' }}>
        {TABS.map((tab) => (
          <li className="nav-item" key={tab.key}>
            <button
              className={`nav-link py-1 px-2${activeTab === tab.key ? ' active' : ''}`}
              style={{ fontSize: '0.72rem' }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {/* Tab content */}
      <div className="flex-grow-1" style={{ minHeight: 0 }}>
        {activeTab === 'map' && (
          <BusinessMapTab hierarchy={businessHierarchy} loading={hierarchyLoading} />
        )}
        {activeTab === 'campaign' && (
          <CampaignGraphTab />
        )}
        {activeTab === 'depts' && (
          <DeptMapTab />
        )}
        {activeTab === 'entities' && (
          <EntityBrowserTab hierarchy={businessHierarchy} network={network} />
        )}
        {activeTab === 'schema' && (
          <SchemaExplorerTab network={network} onRefresh={onRefresh} />
        )}
      </div>
    </div>
  );
}
