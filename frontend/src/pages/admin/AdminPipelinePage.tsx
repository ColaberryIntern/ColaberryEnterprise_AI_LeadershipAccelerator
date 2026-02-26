import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import TemperatureBadge from '../../components/TemperatureBadge';

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
}

const STAGES = [
  { key: 'new_lead', label: 'New Lead', color: '#0dcaf0' },
  { key: 'contacted', label: 'Contacted', color: '#0d6efd' },
  { key: 'meeting_scheduled', label: 'Meeting', color: '#6f42c1' },
  { key: 'proposal_sent', label: 'Proposal', color: '#fd7e14' },
  { key: 'negotiation', label: 'Negotiation', color: '#ffc107' },
  { key: 'enrolled', label: 'Enrolled', color: '#198754' },
  { key: 'lost', label: 'Lost', color: '#6c757d' },
];

function AdminPipelinePage() {
  const [leads, setLeads] = useState<Record<string, PipelineLead[]>>({});
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [draggedLead, setDraggedLead] = useState<PipelineLead | null>(null);

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

  const handleDrop = async (targetStage: string) => {
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

  const getScoreBadge = (score: number) => {
    if (score > 80) return 'bg-danger';
    if (score > 60) return 'bg-warning text-dark';
    if (score > 30) return 'bg-info';
    return 'bg-light text-dark';
  };

  const getDaysInStage = (createdAt: string) => {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          Sales Pipeline
        </h1>
        <div className="text-muted small">
          Drag leads between stages to update their pipeline status
        </div>
      </div>

      <div className="d-flex gap-3" style={{ overflowX: 'auto', paddingBottom: '16px' }}>
        {STAGES.map((stage) => (
          <div
            key={stage.key}
            className="flex-shrink-0"
            style={{ width: '220px' }}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(stage.key)}
          >
            {/* Column Header */}
            <div
              className="rounded-top px-3 py-2 text-white fw-bold small d-flex justify-content-between align-items-center"
              style={{ backgroundColor: stage.color }}
            >
              <span>{stage.label}</span>
              <span className="badge bg-white text-dark rounded-pill">
                {stats[stage.key] || leads[stage.key]?.length || 0}
              </span>
            </div>

            {/* Column Body */}
            <div
              className="bg-light rounded-bottom p-2"
              style={{ minHeight: '400px', maxHeight: '70vh', overflowY: 'auto' }}
            >
              {(leads[stage.key] || []).map((lead) => (
                <div
                  key={lead.id}
                  className="card border-0 shadow-sm mb-2"
                  draggable
                  onDragStart={() => handleDragStart(lead)}
                  style={{ cursor: 'grab', fontSize: '0.85rem' }}
                >
                  <div className="card-body p-2">
                    <div className="d-flex justify-content-between align-items-start mb-1">
                      <Link
                        to={`/admin/leads/${lead.id}`}
                        className="fw-bold text-decoration-none text-dark small"
                        style={{ lineHeight: 1.2 }}
                      >
                        {lead.name}
                      </Link>
                      {lead.lead_score > 0 && (
                        <span className={`badge ${getScoreBadge(lead.lead_score)} ms-1`} style={{ fontSize: '0.7rem' }}>
                          {lead.lead_score}
                        </span>
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
                  No leads
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default AdminPipelinePage;
