import React, { useState } from 'react';
import TemperatureBadge from '../TemperatureBadge';
import LeadDetailModal from './LeadDetailModal';

const GHL_LOCATION_ID = 'JFWwp8q7l6T12NWTIOKG';
const ghlContactUrl = (contactId: string) =>
  `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${contactId}`;

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
  next_action_channel?: string | null;
  next_action_subject?: string | null;
  strategy_call_at?: string | null;
  strategy_call_status?: string | null;
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
    ghl_contact_id?: string;
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

  const callCountdown = (d: string | null | undefined) => {
    if (!d) return null;
    const diff = new Date(d).getTime() - Date.now();
    const absDiff = Math.abs(diff);
    const mins = Math.floor(absDiff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    let label: string;
    if (days > 0) label = `${days}d ${hrs % 24}h`;
    else if (hrs > 0) label = `${hrs}h ${mins % 60}m`;
    else label = `${mins}m`;
    return { isFuture: diff > 0, label };
  };

  const isCallPast = (cl: CampaignLead) => {
    if (!cl.strategy_call_at) return false;
    const pastStatuses = ['no_show', 'completed', 'cancelled'];
    if (cl.strategy_call_status && pastStatuses.includes(cl.strategy_call_status)) return true;
    return new Date(cl.strategy_call_at).getTime() < Date.now();
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
                    <th>Call</th>
                    <th>Last Activity</th>
                    <th>Next Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((cl) => {
                    const pastCall = isCallPast(cl);
                    const countdown = callCountdown(cl.strategy_call_at);
                    return (
                    <tr
                      key={cl.id}
                      style={{ cursor: 'pointer', opacity: pastCall ? 0.5 : 1 }}
                      onClick={() => setSelectedLead(cl)}
                    >
                      <td className="fw-medium">
                        {cl.lead?.name}
                        {cl.lead?.ghl_contact_id && (
                          <a
                            href={ghlContactUrl(cl.lead.ghl_contact_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View in GoHighLevel"
                            className="ms-2"
                            style={{ verticalAlign: 'middle' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <img src="/ghl-logo.svg" alt="GHL" width="18" height="18" style={{ borderRadius: '3px' }} />
                          </a>
                        )}
                      </td>
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
                      <td className="small">
                        {countdown ? (
                          countdown.isFuture ? (
                            <span className="text-success fw-medium">in {countdown.label}</span>
                          ) : (
                            <span className="text-muted">{countdown.label} ago</span>
                          )
                        ) : '—'}
                      </td>
                      <td className="small text-muted">{relTime(cl.last_activity_at)}</td>
                      <td className="small" style={{ maxWidth: 220 }}>
                        {cl.next_action_at ? (() => {
                          const cd = callCountdown(cl.next_action_at);
                          return (
                            <>
                              {cl.next_action_channel && (
                                <span className={`badge bg-${cl.next_action_channel === 'email' ? 'info' : cl.next_action_channel === 'sms' ? 'warning' : 'secondary'} me-1`}>
                                  {cl.next_action_channel}
                                </span>
                              )}
                              <span className={cd?.isFuture ? 'text-success' : 'text-muted'}>
                                {cd ? (cd.isFuture ? `in ${cd.label}` : `${cd.label} ago`) : fmtDate(cl.next_action_at)}
                              </span>
                              {cl.next_action_subject && (
                                <div className="text-muted text-truncate" style={{ fontSize: '0.7rem', maxWidth: 200 }} title={cl.next_action_subject}>
                                  {cl.next_action_subject}
                                </div>
                              )}
                            </>
                          );
                        })() : cl.status === 'completed' || (cl.current_step_index !== undefined && cl.total_steps && cl.current_step_index >= cl.total_steps - 1) ? (
                          <span className="text-muted">Complete</span>
                        ) : '—'}
                      </td>
                    </tr>
                    );
                  })}
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
