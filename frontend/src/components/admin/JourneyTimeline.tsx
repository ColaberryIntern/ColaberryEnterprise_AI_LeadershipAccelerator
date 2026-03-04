import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';

interface JourneyEvent {
  id: string;
  timestamp: string;
  category: string;
  event_type: string;
  title: string;
  detail?: string;
  metadata?: Record<string, any>;
  journey_stage: string;
  source_table: string;
  source_id: string;
}

interface StageProgression {
  stage: string;
  entered_at: string;
  touchpoints: number;
}

interface JourneyMetrics {
  total_touchpoints: number;
  first_touch_at: string | null;
  latest_touch_at: string | null;
  journey_duration_days: number;
  current_stage: string;
  time_in_current_stage_days: number;
  stage_progression: StageProgression[];
  engagement_velocity: number;
  stall_detected: boolean;
  days_since_last_touchpoint: number;
}

interface JourneyData {
  lead_id?: number;
  visitor_id?: string;
  lead_name?: string;
  company?: string;
  events: JourneyEvent[];
  metrics: JourneyMetrics;
  stage_summary: Record<string, number>;
}

const CATEGORY_COLORS: Record<string, string> = {
  website: '#0d6efd',
  signal: '#6f42c1',
  campaign: '#fd7e14',
  interaction: '#198754',
  conversation: '#0dcaf0',
  appointment: '#dc3545',
  activity: '#6c757d',
  temperature: '#ffc107',
  pipeline: '#20c997',
};

const STAGE_COLORS: Record<string, string> = {
  awareness: '#6c757d',
  interest: '#0d6efd',
  consideration: '#6f42c1',
  evaluation: '#fd7e14',
  decision: '#198754',
};

const STAGE_LABELS: Record<string, string> = {
  awareness: 'Awareness',
  interest: 'Interest',
  consideration: 'Consideration',
  evaluation: 'Evaluation',
  decision: 'Decision',
};

const STAGES = ['awareness', 'interest', 'consideration', 'evaluation', 'decision'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function JourneyTimeline({ leadId }: { leadId: number }) {
  const [data, setData] = useState<JourneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const fetchJourney = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/admin/leads/${leadId}/journey`);
      setData(res.data);
    } catch {
      setError('Failed to load journey timeline');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { fetchJourney(); }, [fetchJourney]);

  const toggleStage = (stage: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading journey...</span>
        </div>
        <p className="text-muted small mt-2">Loading journey timeline...</p>
      </div>
    );
  }

  if (error || !data) {
    return <div className="alert alert-warning">{error || 'No journey data available'}</div>;
  }

  const { events, metrics, stage_summary } = data;
  const filteredEvents = filterCategory === 'all' ? events : events.filter(e => e.category === filterCategory);

  // Group events by stage
  const eventsByStage: Record<string, JourneyEvent[]> = {};
  for (const stage of STAGES) {
    eventsByStage[stage] = filteredEvents.filter(e => e.journey_stage === stage);
  }

  const categories = Array.from(new Set(events.map(e => e.category)));

  return (
    <div>
      {/* Metrics Summary */}
      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center py-3">
              <div className="text-muted small">Touchpoints</div>
              <div className="fw-bold fs-4" style={{ color: 'var(--color-primary)' }}>{metrics.total_touchpoints}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center py-3">
              <div className="text-muted small">Journey Duration</div>
              <div className="fw-bold fs-4" style={{ color: 'var(--color-primary)' }}>{metrics.journey_duration_days}d</div>
              {metrics.first_touch_at && (
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>Since {formatDate(metrics.first_touch_at)}</div>
              )}
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center py-3">
              <div className="text-muted small">Current Stage</div>
              <span className="badge fs-6" style={{ backgroundColor: STAGE_COLORS[metrics.current_stage] || '#6c757d' }}>
                {STAGE_LABELS[metrics.current_stage] || metrics.current_stage}
              </span>
              <div className="text-muted mt-1" style={{ fontSize: '0.7rem' }}>{metrics.time_in_current_stage_days}d in stage</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center py-3">
              <div className="text-muted small">Velocity</div>
              <div className="fw-bold fs-4" style={{ color: 'var(--color-primary)' }}>{metrics.engagement_velocity}/wk</div>
              {metrics.stall_detected && (
                <span className="badge bg-danger mt-1">Stall Detected</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stage Progress Bar */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body py-3">
          <div className="d-flex justify-content-between align-items-center">
            {STAGES.map((stage, idx) => {
              const reached = STAGES.indexOf(metrics.current_stage) >= idx;
              const count = stage_summary[stage] || 0;
              return (
                <div key={stage} className="text-center flex-fill">
                  <div
                    className="mx-auto mb-1 rounded-circle d-flex align-items-center justify-content-center"
                    style={{
                      width: 32, height: 32,
                      backgroundColor: reached ? STAGE_COLORS[stage] : '#e2e8f0',
                      color: reached ? '#fff' : '#a0aec0',
                      fontSize: '0.75rem', fontWeight: 600,
                    }}
                  >
                    {count}
                  </div>
                  <div className="small" style={{ color: reached ? STAGE_COLORS[stage] : '#a0aec0', fontWeight: reached ? 600 : 400 }}>
                    {STAGE_LABELS[stage]}
                  </div>
                  {idx < STAGES.length - 1 && (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: `${((idx + 1) / STAGES.length) * 100}%`,
                      width: `${100 / STAGES.length}%`,
                      height: 2,
                      backgroundColor: reached ? STAGE_COLORS[stage] : '#e2e8f0',
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <span className="small fw-medium text-muted">Filter:</span>
        <button
          className={`btn btn-sm ${filterCategory === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setFilterCategory('all')}
        >
          All ({events.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            className={`btn btn-sm ${filterCategory === cat ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setFilterCategory(cat)}
          >
            <span className="d-inline-block rounded-circle me-1" style={{ width: 8, height: 8, backgroundColor: CATEGORY_COLORS[cat] || '#6c757d' }} />
            {cat} ({events.filter(e => e.category === cat).length})
          </button>
        ))}
      </div>

      {/* Timeline by Stage */}
      {STAGES.map(stage => {
        const stageEvents = eventsByStage[stage] || [];
        if (stageEvents.length === 0) return null;

        const isCollapsed = collapsedStages.has(stage);

        return (
          <div key={stage} className="mb-3">
            <button
              className="btn btn-sm w-100 text-start d-flex align-items-center gap-2 py-2 px-3"
              style={{
                backgroundColor: `${STAGE_COLORS[stage]}15`,
                border: `1px solid ${STAGE_COLORS[stage]}40`,
                borderRadius: 8,
              }}
              onClick={() => toggleStage(stage)}
            >
              <span className="badge" style={{ backgroundColor: STAGE_COLORS[stage] }}>
                {STAGE_LABELS[stage]}
              </span>
              <span className="small text-muted">{stageEvents.length} events</span>
              <span className="ms-auto small">{isCollapsed ? '+' : '-'}</span>
            </button>

            {!isCollapsed && (
              <div className="ps-3 mt-2" style={{ borderLeft: `2px solid ${STAGE_COLORS[stage]}40` }}>
                {stageEvents.map(event => (
                  <div key={`${event.source_table}-${event.source_id}`} className="d-flex align-items-start gap-2 mb-2 ps-2">
                    <span
                      className="d-inline-block rounded-circle mt-1 flex-shrink-0"
                      style={{ width: 10, height: 10, backgroundColor: CATEGORY_COLORS[event.category] || '#6c757d' }}
                    />
                    <div className="flex-grow-1 small">
                      <div className="d-flex justify-content-between align-items-start">
                        <span className="fw-medium">{event.title}</span>
                        <span className="text-muted ms-2 flex-shrink-0" style={{ fontSize: '0.7rem' }}>
                          {formatDateTime(event.timestamp)}
                        </span>
                      </div>
                      {event.detail && (
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{event.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {filteredEvents.length === 0 && (
        <div className="text-center text-muted py-4">No events found for this filter.</div>
      )}
    </div>
  );
}
