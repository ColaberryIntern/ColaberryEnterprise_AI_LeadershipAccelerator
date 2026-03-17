import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

interface Intervention {
  id: string;
  type: string;
  severity: string;
  message: string;
  recommended_action: string;
  created_at: string;
}

const SEVERITY_CONFIG: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  high: { bg: 'bg-danger bg-opacity-10', border: 'border-danger', icon: 'bi-exclamation-triangle-fill text-danger', label: 'High' },
  medium: { bg: 'bg-warning bg-opacity-10', border: 'border-warning', icon: 'bi-exclamation-circle-fill text-warning', label: 'Medium' },
  low: { bg: 'bg-info bg-opacity-10', border: 'border-info', icon: 'bi-info-circle-fill text-info', label: 'Low' },
};

function ProjectMentorAlerts() {
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.get('/api/portal/project/interventions')
      .then(res => setInterventions(res.data.interventions || []))
      .catch(() => setInterventions([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (interventions.length === 0) return null;

  // Group by severity
  const grouped: Record<string, Intervention[]> = { high: [], medium: [], low: [] };
  for (const i of interventions) {
    const key = grouped[i.severity] ? i.severity : 'medium';
    grouped[key].push(i);
  }

  const severityOrder = ['high', 'medium', 'low'];

  return (
    <div className="mb-4">
      <h6 className="fw-semibold small mb-3" style={{ color: 'var(--color-primary)' }}>
        <i className="bi bi-bell me-2"></i>Mentor Alerts
        <span className="badge bg-secondary ms-2">{interventions.length}</span>
      </h6>

      {severityOrder.map(severity => {
        const items = grouped[severity];
        if (items.length === 0) return null;
        const config = SEVERITY_CONFIG[severity];

        return (
          <div key={severity} className="mb-3">
            {items.map(item => (
              <div
                key={item.id}
                className={`card border-start border-3 ${config.border} ${config.bg} mb-2`}
                style={{ borderTop: 0, borderRight: 0, borderBottom: 0 }}
              >
                <div className="card-body py-2 px-3">
                  <div className="d-flex align-items-start gap-2">
                    <i className={`bi ${config.icon} mt-1`} style={{ fontSize: '0.9rem' }}></i>
                    <div className="flex-grow-1">
                      <div className="small fw-medium">{item.message}</div>
                      {item.recommended_action && (
                        <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                          <i className="bi bi-arrow-right me-1"></i>{item.recommended_action}
                        </div>
                      )}
                    </div>
                    <span className={`badge ${severity === 'high' ? 'bg-danger' : severity === 'medium' ? 'bg-warning text-dark' : 'bg-info'}`} style={{ fontSize: '0.65rem' }}>
                      {config.label}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default ProjectMentorAlerts;
