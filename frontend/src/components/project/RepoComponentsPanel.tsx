import React from 'react';

interface DetectedComponent {
  type: string;
  name: string;
  path: string;
}

interface RepoAnalysis {
  connected: boolean;
  repo_url: string | null;
  detected_components: DetectedComponent[];
  file_map: Record<string, string[]>;
  stats: {
    total_files: number;
    language: string | null;
    folders: number;
    last_synced: string | null;
  };
}

interface Props {
  repo: RepoAnalysis | null;
}

const TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  service: { label: 'Services', icon: 'bi-gear', color: '#2b6cb0' },
  agent: { label: 'Agents', icon: 'bi-cpu', color: '#8b5cf6' },
  route: { label: 'Routes', icon: 'bi-signpost-split', color: '#059669' },
  model: { label: 'Models', icon: 'bi-diagram-3', color: '#d97706' },
  test: { label: 'Tests', icon: 'bi-bug', color: '#dc2626' },
  frontend: { label: 'Frontend', icon: 'bi-layout-wtf', color: '#0891b2' },
  config: { label: 'Config', icon: 'bi-sliders', color: '#6b7280' },
};

export default function RepoComponentsPanel({ repo }: Props) {
  if (!repo || !repo.connected) {
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-body p-3 text-center">
          <i className="bi bi-github d-block mb-2" style={{ fontSize: 24, color: 'var(--color-text-light)' }}></i>
          <p className="text-muted small mb-0">No GitHub repository connected</p>
        </div>
      </div>
    );
  }

  // Group components by type
  const grouped = new Map<string, DetectedComponent[]>();
  for (const comp of repo.detected_components) {
    const list = grouped.get(comp.type) || [];
    list.push(comp);
    grouped.set(comp.type, list);
  }

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)', fontSize: 14 }}>
            <i className="bi bi-github me-2"></i>Repository Analysis
          </h6>
          <div className="d-flex gap-3 small text-muted">
            <span><i className="bi bi-file-code me-1"></i>{repo.stats.total_files} files</span>
            {repo.stats.language && <span><i className="bi bi-braces me-1"></i>{repo.stats.language}</span>}
            <span><i className="bi bi-folder me-1"></i>{repo.stats.folders} folders</span>
          </div>
        </div>

        {/* Component type summary */}
        <div className="row g-2 mb-3">
          {Object.entries(TYPE_LABELS).map(([type, info]) => {
            const count = grouped.get(type)?.length || 0;
            if (count === 0) return null;
            return (
              <div key={type} className="col-auto">
                <span className="badge d-flex align-items-center gap-1 px-2 py-1" style={{
                  background: `${info.color}15`,
                  color: info.color,
                  fontSize: 11,
                  fontWeight: 500,
                }}>
                  <i className={`bi ${info.icon}`}></i>
                  {info.label}: {count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Detailed component list */}
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {Array.from(grouped.entries()).map(([type, components]) => {
            const info = TYPE_LABELS[type] || { label: type, icon: 'bi-file', color: '#6b7280' };
            return (
              <div key={type} className="mb-3">
                <div className="fw-medium small mb-1" style={{ color: info.color }}>
                  <i className={`bi ${info.icon} me-1`}></i>{info.label}
                </div>
                <div className="d-flex flex-wrap gap-1">
                  {components.map(comp => (
                    <span key={comp.path} className="badge bg-light text-dark" style={{ fontSize: 10, fontWeight: 400 }} title={comp.path}>
                      {comp.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {repo.stats.last_synced && (
          <div className="text-muted small mt-2" style={{ fontSize: 10 }}>
            Last synced: {new Date(repo.stats.last_synced).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
