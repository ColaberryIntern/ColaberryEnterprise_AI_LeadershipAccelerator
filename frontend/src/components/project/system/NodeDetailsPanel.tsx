import React from 'react';

interface Props {
  layer: string;
  files: string[];
  repoUrl?: string | null;
  onClose: () => void;
}

const LAYER_META: Record<string, { label: string; icon: string; color: string; description: string }> = {
  frontend: { label: 'Frontend', icon: 'bi-layout-wtf', color: '#10b981', description: 'User-facing React components and pages' },
  api: { label: 'API Routes', icon: 'bi-plug', color: '#3b82f6', description: 'Express route handlers that expose backend logic' },
  services: { label: 'Services', icon: 'bi-gear', color: '#6366f1', description: 'Core business logic and data processing' },
  agents: { label: 'Agents', icon: 'bi-cpu', color: '#8b5cf6', description: 'AI agents that automate decisions and actions' },
  database: { label: 'Database', icon: 'bi-database', color: '#f59e0b', description: 'Sequelize models defining data schema' },
};

export default function NodeDetailsPanel({ layer, files, repoUrl, onClose }: Props) {
  const meta = LAYER_META[layer] || { label: layer, icon: 'bi-file-code', color: '#6b7280', description: '' };

  return (
    <div className="card border-0 shadow-sm" style={{ borderLeft: `3px solid ${meta.color}` }}>
      <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
        <span className="fw-semibold" style={{ fontSize: 12, color: meta.color }}>
          <i className={`bi ${meta.icon} me-1`}></i>{meta.label} ({files.length} files)
        </span>
        <button className="btn btn-link btn-sm text-muted p-0" onClick={onClose}><i className="bi bi-x"></i></button>
      </div>
      <div className="card-body p-2">
        <p className="text-muted mb-2" style={{ fontSize: 10 }}>{meta.description}</p>

        {files.length === 0 ? (
          <div className="text-center text-muted py-2" style={{ fontSize: 11 }}>
            <i className={`bi ${meta.icon} d-block mb-1`} style={{ fontSize: 18, color: '#ef4444' }}></i>
            No files detected. This layer needs to be built.
          </div>
        ) : (
          <div>
            {files.map((f, i) => {
              const name = f.split('/').pop() || f;
              return (
                <div key={i} className="d-flex align-items-center gap-2 py-1" style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <i className="bi bi-file-code" style={{ color: meta.color, fontSize: 10 }}></i>
                  {repoUrl ? (
                    <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none" style={{ fontSize: 10 }}>{name}</a>
                  ) : (
                    <span style={{ fontSize: 10 }}>{name}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
