import React, { useState } from 'react';
import ArchitectureGraph from './system/ArchitectureGraph';
import NodeDetailsPanel from './system/NodeDetailsPanel';
import ProcessDatabaseGraph from './ProcessDatabaseGraph';
import FlowVisualizer from './system/FlowVisualizer';

interface Props {
  links: { backend?: string[]; frontend?: string[]; agents?: string[]; models?: string[] };
  usability: { backend?: string; frontend?: string; agent?: string };
  metrics?: { system_readiness?: number; quality_score?: number };
  repoUrl?: string | null;
  previewLayer?: string | null;
}

type SysTab = 'architecture' | 'flow' | 'database';

export default function SystemIntelligencePanel({ links, usability, metrics, repoUrl, previewLayer }: Props) {
  const [tab, setTab] = useState<SysTab>('architecture');
  const [selectedNode, setSelectedNode] = useState<{ layer: string; files: string[] } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const m = metrics || {};

  const tabs: Array<{ key: SysTab; label: string; icon: string }> = [
    { key: 'architecture', label: 'Architecture', icon: 'bi-diagram-3' },
    { key: 'flow', label: 'Flow', icon: 'bi-arrow-right-circle' },
    { key: 'database', label: 'Database', icon: 'bi-database' },
  ];

  const panelStyle: React.CSSProperties = fullscreen ? {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: '#fff', overflow: 'auto',
  } : { position: 'sticky' as const, top: 10 };

  return (
    <div style={panelStyle}>
      <div className="card border-0 shadow-sm" style={{ background: '#fafbfc', height: fullscreen ? '100vh' : 'auto' }}>
        {/* Header */}
        <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="fw-semibold" style={{ fontSize: 11, color: 'var(--color-primary)' }}>
            <i className="bi bi-cpu me-1"></i>System Intelligence
          </span>
          <div className="d-flex align-items-center gap-2">
            {/* Health mini badges */}
            <span style={{ fontSize: 8 }}>
              <span style={{ color: (m.system_readiness || 0) >= 50 ? '#10b981' : '#ef4444' }}>{m.system_readiness || 0}% ready</span>
              {' · '}
              <span style={{ color: (m.quality_score || 0) >= 50 ? '#10b981' : '#f59e0b' }}>{m.quality_score || 0}% quality</span>
            </span>
            <button className="btn btn-link btn-sm p-0 text-muted" onClick={() => setFullscreen(!fullscreen)} style={{ fontSize: 12 }}>
              <i className={`bi bi-${fullscreen ? 'fullscreen-exit' : 'arrows-fullscreen'}`}></i>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="d-flex border-bottom">
          {tabs.map(t => (
            <button key={t.key} className={`btn btn-sm flex-grow-1 rounded-0 py-1 ${tab === t.key ? 'fw-bold' : 'text-muted'}`}
              style={{ fontSize: 9, borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent', background: 'transparent' }}
              onClick={() => { setTab(t.key); setSelectedNode(null); }}>
              <i className={`bi ${t.icon} me-1`}></i>{t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="card-body p-2" style={{ minHeight: fullscreen ? 'calc(100vh - 100px)' : 300, maxHeight: fullscreen ? 'none' : 500, overflowY: 'auto' }}>
          {/* Architecture Graph */}
          {tab === 'architecture' && (
            <div>
              <ArchitectureGraph
                links={links}
                usability={usability}
                onNodeClick={(layer, files) => setSelectedNode({ layer, files })}
                previewLayer={previewLayer}
              />
              {selectedNode && (
                <div className="mt-2">
                  <NodeDetailsPanel
                    layer={selectedNode.layer}
                    files={selectedNode.files}
                    repoUrl={repoUrl}
                    onClose={() => setSelectedNode(null)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Flow Visualizer */}
          {tab === 'flow' && (
            <FlowVisualizer
              hasBackend={usability.backend !== 'missing'}
              hasFrontend={usability.frontend !== 'missing'}
              hasAgents={usability.agent !== 'missing'}
              hasDatabase={(links.models || []).length > 0}
            />
          )}

          {/* Database ERD */}
          {tab === 'database' && (
            <ProcessDatabaseGraph models={links.models || []} services={links.backend || []} repoUrl={repoUrl} />
          )}
        </div>
      </div>
    </div>
  );
}
