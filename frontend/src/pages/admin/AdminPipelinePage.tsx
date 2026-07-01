import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import TemperatureBadge from '../../components/TemperatureBadge';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal, TrustLevel } from '../../components/admin/shell/trust';
import { PIPELINE_STAGES } from '../../constants';

interface PipelineLead {
  id: number;
  name: string;
  email: string;
  company: string;
  title: string;
  lead_score: number;
  lead_temperature?: string;
  pipeline_stage: string;
  created_at: string;
  ghl_contact_id?: string;
}

const GHL_LOCATION_ID = 'JFWwp8q7l6T12NWTIOKG';
const ghlContactUrl = (contactId: string) =>
  `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${contactId}`;

const STAGES = PIPELINE_STAGES;

// Brand-token stage colors: map each stage to a chart token in stage order,
// replacing the ad-hoc hex on PIPELINE_STAGES (constants/index.ts is out of scope).
const stageColor = (index: number): string => `var(--chart-${(index % 7) + 1})`;

// StatusBadge tone for the numeric lead-score pill (replaces hardcoded bg-* classes).
const scoreTone = (score: number): 'danger' | 'warning' | 'info' | 'neutral' => {
  if (score > 80) return 'danger';
  if (score > 60) return 'warning';
  if (score > 30) return 'info';
  return 'neutral';
};

function AdminPipelinePage() {
  const [leads, setLeads] = useState<Record<string, PipelineLead[]>>({});
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [draggedLead, setDraggedLead] = useState<PipelineLead | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [leadsRes, statsRes] = await Promise.all([
        api.get('/api/admin/leads', { params: { limit: '500' } }),
        api.get('/api/admin/pipeline/stats'),
      ]);

      // Group leads by pipeline_stage
      const grouped: Record<string, PipelineLead[]> = {};
      for (const stage of STAGES) {
        grouped[stage.key] = [];
      }
      for (const lead of leadsRes.data.leads) {
        const stage = lead.pipeline_stage || 'new_lead';
        if (grouped[stage]) {
          grouped[stage].push(lead);
        } else {
          grouped['new_lead'].push(lead);
        }
      }

      setLeads(grouped);
      setStats(statsRes.data.stats);
    } catch (err) {
      console.error('Failed to fetch pipeline data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDragStart = (lead: PipelineLead) => {
    setDraggedLead(lead);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnter = (stageKey: string) => {
    setDragOverStage(stageKey);
  };

  const handleDragLeave = (e: React.DragEvent, stageKey: string) => {
    // Only clear if leaving the column entirely (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dragOverStage === stageKey) setDragOverStage(null);
    }
  };

  const handleDrop = async (targetStage: string) => {
    setDragOverStage(null);
    if (!draggedLead || draggedLead.pipeline_stage === targetStage) {
      setDraggedLead(null);
      return;
    }

    const fromStage = draggedLead.pipeline_stage || 'new_lead';

    // Optimistic update
    setLeads((prev) => {
      const updated = { ...prev };
      updated[fromStage] = updated[fromStage].filter((l) => l.id !== draggedLead.id);
      updated[targetStage] = [...updated[targetStage], { ...draggedLead, pipeline_stage: targetStage }];
      return updated;
    });

    setDraggedLead(null);

    try {
      await api.patch(`/api/admin/leads/${draggedLead.id}/pipeline`, {
        pipeline_stage: targetStage,
        from_stage: fromStage,
      });
      // Refresh stats
      const statsRes = await api.get('/api/admin/pipeline/stats');
      setStats(statsRes.data.stats);
    } catch (err) {
      console.error('Failed to update pipeline stage:', err);
      fetchData(); // Rollback
    }
  };

  const getDaysInStage = (createdAt: string) => {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  // Pipeline-wide KPIs derived from per-stage counts (stats fall back to grouped leads).
  const summary = useMemo(() => {
    const countFor = (key: string) => stats[key] ?? leads[key]?.length ?? 0;
    const total = STAGES.reduce((sum, s) => sum + countFor(s.key), 0);
    const open = STAGES.filter((s) => s.key !== 'enrolled' && s.key !== 'lost')
      .reduce((sum, s) => sum + countFor(s.key), 0);
    const enrolled = countFor('enrolled');
    const lost = countFor('lost');
    return { total, open, enrolled, lost };
  }, [stats, leads]);

  // Per-page trust signal (Basecamp todo 10027085963) derived from pipeline coverage.
  const trust: TrustSignal = useMemo(() => {
    const { total, open, enrolled } = summary;
    const level: TrustLevel = loading ? 'stale' : 'live';
    const conversion = total === 0 ? 0 : Math.round((enrolled / total) * 100);
    return {
      level,
      score: conversion,
      source: 'pipeline / opportunities',
      updatedAt: new Date().toISOString(),
      summary: `${open} open opportunities across ${STAGES.length} stages, ${enrolled} enrolled.`,
      href: '/admin/trust',
      pillars: [
        {
          name: 'Coverage',
          status: 'live',
          evidence: [{ label: 'Tracked leads', value: String(total) }],
        },
        {
          name: 'Conversion',
          status: enrolled > 0 ? 'verified' : 'live',
          score: conversion,
          evidence: [{ label: 'Enrolled', value: `${enrolled}/${total}` }],
        },
      ],
    };
  }, [summary, loading]);

  const kpiRow = (
    <div className="row g-3">
      <div className="col-6 col-lg-3">
        <StatCard label="Total leads" value={summary.total} icon="group-line" tone="info" />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard label="Open" value={summary.open} icon="record-circle-line" tone="primary" />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard label="Enrolled" value={summary.enrolled} icon="checkbox-circle-line" tone="success" />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard label="Lost" value={summary.lost} icon="close-circle-line" tone={summary.lost ? 'danger' : 'neutral'} />
      </div>
    </div>
  );

  if (loading) {
    return (
      <>
        <PageHeader
          title="Sales Pipeline"
          icon="filter-3-line"
          subtitle="Drag leads between stages to update their pipeline status."
          breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Pipeline' }]}
          trust={trust}
        >
          {kpiRow}
        </PageHeader>
        <div className="d-flex gap-3" style={{ overflowX: 'auto' }}>
          {STAGES.map((stage, index) => (
            <div key={stage.key} className="flex-shrink-0" style={{ width: '220px' }}>
              <div
                className="rounded-top px-3 py-2 text-white small"
                style={{ backgroundColor: stageColor(index) } as React.CSSProperties}
              >
                <div className="skeleton" style={{ width: '70%', height: '14px', opacity: 0.5 }} />
              </div>
              <div className="rounded-bottom p-2" style={{ minHeight: '300px', background: 'var(--surface-subtle)' }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card border-0 shadow-sm mb-2 p-2">
                    <div className="skeleton mb-1" style={{ width: '80%', height: '12px' }} />
                    <div className="skeleton" style={{ width: '50%', height: '10px' }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sales Pipeline"
        icon="filter-3-line"
        subtitle="Drag leads between stages to update their pipeline status."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Pipeline' }]}
        trust={trust}
      >
        {kpiRow}
      </PageHeader>

      <SectionCard padded={false} className="admin-section-card--bare">
        <div className="d-flex gap-3 p-3" style={{ overflowX: 'auto' }}>
          {STAGES.map((stage, index) => (
            <div
              key={stage.key}
              className="flex-shrink-0"
              style={{ width: '220px' }}
              onDragOver={handleDragOver}
              onDragEnter={() => handleDragEnter(stage.key)}
              onDragLeave={(e) => handleDragLeave(e, stage.key)}
              onDrop={() => handleDrop(stage.key)}
            >
              {/* Column Header */}
              <div
                className="rounded-top px-3 py-2 text-white fw-bold small d-flex justify-content-between align-items-center"
                style={{ backgroundColor: stageColor(index) } as React.CSSProperties}
              >
                <span>{stage.label}</span>
                <StatusBadge label={String(stats[stage.key] || leads[stage.key]?.length || 0)} tone="neutral" />
              </div>

              {/* Column Body */}
              <div
                className={`rounded-bottom p-2${dragOverStage === stage.key ? ' pipeline-column-drag-over' : ''}`}
                style={{ minHeight: '400px', maxHeight: '70vh', overflowY: 'auto', background: 'var(--surface-subtle)' }}
              >
                {(leads[stage.key] || []).map((lead) => (
                  <div
                    key={lead.id}
                    className={`card border-0 shadow-sm mb-2${draggedLead?.id === lead.id ? ' pipeline-card-dragging' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(lead)}
                    onDragEnd={() => { setDraggedLead(null); setDragOverStage(null); }}
                    style={{ cursor: draggedLead?.id === lead.id ? 'grabbing' : 'grab', fontSize: '0.85rem' }}
                  >
                    <div className="card-body p-2">
                      <div className="d-flex justify-content-between align-items-start mb-1">
                        <span className="d-flex align-items-center gap-1">
                          <Link
                            to={`/admin/leads/${lead.id}`}
                            className="fw-bold text-decoration-none small"
                            style={{ lineHeight: 1.2, color: 'var(--text-strong)' }}
                          >
                            {lead.name}
                          </Link>
                          {lead.ghl_contact_id && (
                            <a
                              href={ghlContactUrl(lead.ghl_contact_id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View in GoHighLevel"
                            >
                              <img src="/ghl-logo.svg" alt="GHL" width="14" height="14" style={{ borderRadius: '2px' }} />
                            </a>
                          )}
                        </span>
                        {lead.lead_score > 0 && (
                          <StatusBadge label={String(lead.lead_score)} tone={scoreTone(lead.lead_score)} />
                        )}
                      </div>
                      {lead.company && (
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{lead.company}</div>
                      )}
                      {lead.title && (
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>{lead.title}</div>
                      )}
                      <div className="mt-1">
                        <TemperatureBadge temperature={lead.lead_temperature} />
                      </div>
                      <div className="text-muted mt-1" style={{ fontSize: '0.7rem' }}>
                        {getDaysInStage(lead.created_at)}d ago
                      </div>
                    </div>
                  </div>
                ))}

                {(leads[stage.key] || []).length === 0 && (
                  <div className="text-center text-muted small py-4" style={{ fontSize: '0.8rem' }}>
                    No leads in this stage
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

export default AdminPipelinePage;
