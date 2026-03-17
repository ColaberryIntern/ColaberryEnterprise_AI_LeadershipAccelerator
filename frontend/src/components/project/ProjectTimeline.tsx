import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

interface TimelineEvent {
  timestamp: string;
  type: string;
  label: string;
  icon: string;
  color: string;
}

const EVENT_ICONS: Record<string, { icon: string; color: string }> = {
  artifact: { icon: 'bi-collection', color: 'var(--color-primary)' },
  requirements: { icon: 'bi-file-earmark-code', color: 'var(--color-primary-light)' },
  portfolio: { icon: 'bi-briefcase', color: 'var(--color-accent)' },
  executive: { icon: 'bi-file-earmark-richtext', color: 'var(--color-secondary)' },
  project: { icon: 'bi-kanban', color: 'var(--color-text-light)' },
};

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function ProjectTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      portalApi.get('/api/portal/project').catch(() => null),
      portalApi.get('/api/portal/project/artifacts').catch(() => null),
    ]).then(([projectRes, artifactsRes]) => {
      const timeline: TimelineEvent[] = [];

      // Project creation
      if (projectRes?.data?.created_at) {
        timeline.push({
          timestamp: projectRes.data.created_at,
          type: 'project',
          label: 'Project created',
          ...EVENT_ICONS.project,
        });
      }

      // Portfolio refresh
      if (projectRes?.data?.portfolio_updated_at) {
        timeline.push({
          timestamp: projectRes.data.portfolio_updated_at,
          type: 'portfolio',
          label: 'Portfolio refreshed',
          ...EVENT_ICONS.portfolio,
        });
      }

      // Executive report
      if (projectRes?.data?.executive_updated_at) {
        timeline.push({
          timestamp: projectRes.data.executive_updated_at,
          type: 'executive',
          label: 'Executive report generated',
          ...EVENT_ICONS.executive,
        });
      }

      // Artifact submissions
      const artifacts = artifactsRes?.data?.artifacts || [];
      for (const artifact of artifacts) {
        const sub = artifact.submission || artifact;
        const def = artifact.artifactDefinition || {};
        const name = def.name || sub?.title || 'Artifact';
        const isReq = def.artifact_type === 'requirements_document';
        const timestamp = sub?.submitted_at || sub?.created_at || artifact.created_at;

        if (timestamp) {
          timeline.push({
            timestamp,
            type: isReq ? 'requirements' : 'artifact',
            label: `${name} (v${artifact.version || sub?.version_number || 1})`,
            ...(isReq ? EVENT_ICONS.requirements : EVENT_ICONS.artifact),
          });
        }
      }

      // Sort newest first
      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(timeline.slice(0, 8));
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">
          <i className="bi bi-clock-history me-2"></i>Project Timeline
        </div>
        <div className="card-body text-center py-3">
          <div className="spinner-border spinner-border-sm" style={{ color: 'var(--color-primary)' }} role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (events.length === 0) return null;

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold">
        <i className="bi bi-clock-history me-2"></i>Project Timeline
      </div>
      <div className="card-body py-2">
        {events.map((event, idx) => (
          <div key={idx} className="d-flex align-items-start gap-2 py-2" style={{
            borderBottom: idx < events.length - 1 ? '1px solid var(--color-border)' : 'none',
          }}>
            <i className={`bi ${event.icon} mt-1`} style={{ color: event.color, fontSize: '0.85rem', minWidth: 18 }}></i>
            <div className="flex-grow-1">
              <div className="small" style={{ color: 'var(--color-text)' }}>{event.label}</div>
            </div>
            <div className="text-muted" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
              {formatTimeAgo(event.timestamp)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProjectTimeline;
