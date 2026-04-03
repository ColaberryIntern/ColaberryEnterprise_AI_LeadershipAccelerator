import React, { useState, useEffect, useCallback, useRef } from 'react';
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

// Display order: decision first (what matters most) → awareness last
const STAGES = ['decision', 'evaluation', 'consideration', 'interest', 'awareness'];
// Progress bar order: natural funnel flow left to right
const STAGES_PROGRESS = ['awareness', 'interest', 'consideration', 'evaluation', 'decision'];

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

  // Group events by stage, sorted newest first within each stage
  const eventsByStage: Record<string, JourneyEvent[]> = {};
  for (const stage of STAGES) {
    eventsByStage[stage] = filteredEvents
      .filter(e => e.journey_stage === stage)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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
            {STAGES_PROGRESS.map((stage, idx) => {
              const reached = STAGES_PROGRESS.indexOf(metrics.current_stage) >= idx;
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
                  {idx < STAGES_PROGRESS.length - 1 && (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: `${((idx + 1) / STAGES_PROGRESS.length) * 100}%`,
                      width: `${100 / STAGES_PROGRESS.length}%`,
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

      {/* Engagement Scatter Plot */}
      <JourneyScatterPlot events={filteredEvents} filterCategory={filterCategory} />

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

/* ─── Engagement Intensity Scatter Plot ─────────────────────────────── */

function getIntensity(event: JourneyEvent): number {
  const stageBase: Record<string, number> = {
    awareness: 10, interest: 30, consideration: 50, evaluation: 70, decision: 90,
  };
  const base = stageBase[event.journey_stage] || 10;
  const typeBonus: Record<string, number> = {
    booking_modal_opened: 8, book_strategy_call_click: 9, form_submit: 7,
    demo_complete: 6, cta_click: 5, demo_start: 4, form_start: 3,
    replied: 8, clicked: 5, booked: 9, answered: 6, opened: 2,
    advisory_page_visit: 3, high_engagement_signal: 5, return_visitor: 3,
    pageview: 0, scroll: 1, heartbeat: -5, session_start: -2,
  };
  // Small jitter to spread overlapping dots
  const jitter = (Math.random() - 0.5) * 6;
  return Math.min(100, Math.max(2, base + (typeBonus[event.event_type] || 0) + jitter));
}

const STAGE_Y_BANDS = [
  { label: 'Decision', min: 80, max: 100, color: '#198754' },
  { label: 'Evaluation', min: 60, max: 80, color: '#fd7e14' },
  { label: 'Consideration', min: 40, max: 60, color: '#6f42c1' },
  { label: 'Interest', min: 20, max: 40, color: '#0d6efd' },
  { label: 'Awareness', min: 0, max: 20, color: '#6c757d' },
];

function JourneyScatterPlot({ events, filterCategory }: { events: JourneyEvent[]; filterCategory: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d3 = (window as any).d3;
    if (!d3 || !containerRef.current || events.length === 0) return;

    const container = containerRef.current;
    container.innerHTML = '';

    const margin = { top: 12, right: 20, bottom: 36, left: 90 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 280 - margin.top - margin.bottom;

    const svg = d3.select(container).append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Compute data points
    const points = events
      .filter((e: JourneyEvent) => e.event_type !== 'heartbeat')
      .map((e: JourneyEvent) => ({
        x: new Date(e.timestamp),
        y: getIntensity(e),
        category: e.category,
        color: CATEGORY_COLORS[e.category] || '#6c757d',
        title: e.title,
        detail: e.detail || '',
        type: e.event_type,
        stage: e.journey_stage,
        timestamp: e.timestamp,
        id: e.id,
      }));

    if (points.length === 0) return;

    // Scales
    const xExtent = d3.extent(points, (d: any) => d.x) as [Date, Date];
    // Pad time range slightly
    const timePad = (xExtent[1].getTime() - xExtent[0].getTime()) * 0.02;
    const xScale = d3.scaleTime()
      .domain([new Date(xExtent[0].getTime() - timePad), new Date(Math.max(xExtent[1].getTime() + timePad, Date.now()))])
      .range([0, width]);

    const yScale = d3.scaleLinear().domain([0, 100]).range([height, 0]);

    // Background bands for stages
    STAGE_Y_BANDS.forEach(band => {
      svg.append('rect')
        .attr('x', 0).attr('width', width)
        .attr('y', yScale(band.max)).attr('height', yScale(band.min) - yScale(band.max))
        .attr('fill', band.color).attr('opacity', 0.04);
    });

    // Grid lines
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(6).tickSize(-height).tickFormat(d3.timeFormat('%b %d')))
      .call((g: any) => g.select('.domain').remove())
      .call((g: any) => g.selectAll('.tick line').attr('stroke', '#e2e8f0').attr('stroke-dasharray', '2,2'))
      .call((g: any) => g.selectAll('.tick text').attr('fill', '#718096').attr('font-size', '10px'));

    // Y-axis stage labels
    STAGE_Y_BANDS.forEach(band => {
      svg.append('text')
        .attr('x', -8).attr('y', yScale((band.min + band.max) / 2))
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        .attr('fill', band.color).attr('font-size', '10px').attr('font-weight', '600')
        .text(band.label);
    });

    // Horizontal dividers between stages
    [20, 40, 60, 80].forEach(y => {
      svg.append('line')
        .attr('x1', 0).attr('x2', width)
        .attr('y1', yScale(y)).attr('y2', yScale(y))
        .attr('stroke', '#e2e8f0').attr('stroke-dasharray', '3,3');
    });

    // Today marker
    const now = new Date();
    if (now >= xExtent[0] && now <= new Date(xExtent[1].getTime() + timePad * 2)) {
      svg.append('line')
        .attr('x1', xScale(now)).attr('x2', xScale(now))
        .attr('y1', 0).attr('y2', height)
        .attr('stroke', '#dc3545').attr('stroke-width', 1).attr('stroke-dasharray', '4,3').attr('opacity', 0.5);
      svg.append('text')
        .attr('x', xScale(now)).attr('y', -2)
        .attr('text-anchor', 'middle').attr('fill', '#dc3545').attr('font-size', '9px')
        .text('Now');
    }

    // Dots
    const tooltip = tooltipRef.current;
    svg.selectAll('circle.event-dot').data(points).enter()
      .append('circle')
      .attr('class', 'event-dot')
      .attr('cx', (d: any) => xScale(d.x))
      .attr('cy', (d: any) => yScale(d.y))
      .attr('r', 4)
      .attr('fill', (d: any) => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .attr('opacity', 0.8)
      .style('cursor', 'pointer')
      .on('mouseenter', function(this: any, ev: any, d: any) {
        d3.select(this).attr('r', 7).attr('opacity', 1).attr('stroke-width', 2);
        if (tooltip) {
          const time = new Date(d.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          tooltip.innerHTML = `<strong>${d.title}</strong><br/><span style="color:${d.color}">${d.category}</span> &middot; ${d.stage}<br/><span style="color:#718096">${time}</span>${d.detail ? '<br/><span style="color:#a0aec0;font-size:10px">' + d.detail.substring(0, 80) + '</span>' : ''}`;
          tooltip.style.display = 'block';
          tooltip.style.left = (ev.pageX + 12) + 'px';
          tooltip.style.top = (ev.pageY - 10) + 'px';
        }
      })
      .on('mouseleave', function(this: any) {
        d3.select(this).attr('r', 4).attr('opacity', 0.8).attr('stroke-width', 1);
        if (tooltip) tooltip.style.display = 'none';
      });

    // Legend
    const legendCats = Array.from(new Set(points.map((p: any) => p.category)));
    const legend = svg.append('g').attr('transform', `translate(0, ${height + 22})`);
    let lx = 0;
    legendCats.forEach((cat: string) => {
      const g = legend.append('g').attr('transform', `translate(${lx}, 0)`);
      g.append('circle').attr('r', 4).attr('cx', 4).attr('cy', 0).attr('fill', CATEGORY_COLORS[cat] || '#6c757d');
      g.append('text').attr('x', 12).attr('y', 0).attr('dominant-baseline', 'middle').attr('font-size', '9px').attr('fill', '#718096').text(cat);
      lx += cat.length * 6 + 24;
    });

    return () => { container.innerHTML = ''; };
  }, [events, filterCategory]);

  if (events.length === 0) return null;

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white border-0 py-2 d-flex justify-content-between align-items-center">
        <span className="fw-semibold" style={{ fontSize: 13 }}>Engagement Timeline</span>
        <span className="text-muted" style={{ fontSize: 10 }}>{events.filter(e => e.event_type !== 'heartbeat').length} events</span>
      </div>
      <div className="card-body p-2" style={{ position: 'relative' }}>
        <div ref={containerRef} style={{ width: '100%', minHeight: 280 }} />
        <div
          ref={tooltipRef}
          style={{
            display: 'none', position: 'fixed', zIndex: 9999,
            background: '#1a202c', color: '#fff', padding: '8px 12px',
            borderRadius: 8, fontSize: 11, lineHeight: 1.5,
            maxWidth: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
