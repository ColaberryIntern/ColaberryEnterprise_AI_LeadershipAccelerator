import React, { useState } from 'react';
import TemperatureBadge from '../TemperatureBadge';
import LeadDetailModal from './LeadDetailModal';

interface CampaignLead {
  id: string;
  lead_id: number;
  status: string;
  enrolled_at: string;
  outcome: string | null;
  current_step_index?: number;
  total_steps?: number;
  last_activity_at?: string | null;
  next_action_at?: string | null;
  touchpoint_count?: number;
  response_count?: number;
  lead: {
    id: number;
    name: string;
    email: string;
    company: string;
    title: string;
    lead_score: number;
    lead_source_type: string;
    lead_temperature?: string;
  };
}

interface Stats {
  total_leads: number;
  leads_by_status: Record<string, number>;
  total_actions: number;
  actions_by_status: Record<string, number>;
  actions_by_channel: Record<string, number>;
  ai_generated_count: number;
}

interface Props {
  campaignId: string;
  stats: Stats | null;
  leads: CampaignLead[];
  headers: Record<string, string>;
}

export default function OverviewTab({ campaignId, stats, leads, headers }: Props) {
  const [selectedLead, setSelectedLead] = useState<CampaignLead | null>(null);

  const statusCounts = stats?.leads_by_status || {};
  const activeCount = statusCounts['active'] || 0;
  const completedCount = statusCounts['completed'] || 0;
  const removedCount = statusCounts['removed'] || statusCounts['dnc'] || 0;
  const pausedCount = statusCounts['paused'] || 0;
  const totalEnrolled = stats?.total_leads || leads.length;
  const progressPct = totalEnrolled > 0 ? ((completedCount / totalEnrolled) * 100).toFixed(0) : '0';

  const relTime = (d: string | null | undefined) => {
    if (!d) return '—';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
  };

  return (
    <>
      {/* KPI Cards */}
      <div className="row g-3 mb-4">
        <div className="col">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center p-3">
              <div className="fs-4 fw-bold">{totalEnrolled}</div>
              <div className="text-muted small">Total Enrolled</div>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center p-3">
              <div className="fs-4 fw-bold text-success">{activeCount}</div>
              <div className="text-muted small">Active</div>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center p-3">
              <div className="fs-4 fw-bold text-info">{completedCount}</div>
              <div className="text-muted small">Completed</div>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center p-3">
              <div className="fs-4 fw-bold text-danger">{removedCount}</div>
              <div className="text-muted small">DNC / Removed</div>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center p-3">
              <div className="fs-4 fw-bold text-warning">{pausedCount}</div>
              <div className="text-muted small">Paused</div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3">
          <div className="d-flex justify-content-between mb-1">
            <span className="small fw-medium">Campaign Progress</span>
            <span className="small text-muted">{completedCount}/{totalEnrolled} completed ({progressPct}%)</span>
          </div>
          <div className="progress" style={{ height: 8 }}>
            <div className="progress-bar bg-success" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      {/* Contact Table */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">
          Enrolled Contacts ({leads.length})
        </div>
        <div className="card-body p-0">
          {leads.length === 0 ? (
            <div className="text-center py-4 text-muted">No leads enrolled yet.</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Company</th>
                    <th>Temperature</th>
                    <th>Status</th>
                    <th>Step</th>
                    <th>Last Activity</th>
                    <th>Next Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((cl) => (
                    <tr
                      key={cl.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedLead(cl)}
                    >
                      <td className="fw-medium">{cl.lead?.name}</td>
                      <td>{cl.lead?.company}</td>
                      <td>
                        <TemperatureBadge temperature={cl.lead?.lead_temperature} />
                      </td>
                      <td>
                        <span className={`badge bg-${
                          cl.status === 'active' ? 'success' :
                          cl.status === 'completed' ? 'info' :
                          cl.status === 'paused' ? 'warning' : 'secondary'
                        }`}>
                          {cl.status}
                        </span>
                      </td>
                      <td className="small">
                        {cl.current_step_index !== undefined && cl.total_steps
                          ? `Step ${(cl.current_step_index || 0) + 1} of ${cl.total_steps}`
                          : '—'}
                      </td>
                      <td className="small text-muted">{relTime(cl.last_activity_at)}</td>
                      <td className="small">
                        {cl.next_action_at ? fmtDate(cl.next_action_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Lead Detail Modal */}
      {selectedLead && (
        <LeadDetailModal
          campaignId={campaignId}
          leadId={selectedLead.lead_id}
          leadName={selectedLead.lead?.name || 'Lead'}
          headers={headers}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </>
  );
}
