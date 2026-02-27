import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/ToastProvider';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Breadcrumb from '../../components/ui/Breadcrumb';
import OverviewTab from '../../components/campaign/OverviewTab';
import AnalyticsTab from '../../components/campaign/AnalyticsTab';
import TargetingTab from '../../components/campaign/TargetingTab';
import GTMStrategyTab from '../../components/campaign/GTMStrategyTab';
import PromptsTab from '../../components/campaign/PromptsTab';
import LeadsOutreachTab from '../../components/campaign/LeadsOutreachTab';
import CRMTab from '../../components/campaign/CRMTab';
import SettingsTab from '../../components/campaign/SettingsTab';

interface CampaignDetail {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  sequence_id: string | null;
  sequence?: { id: string; name: string; steps: any[] };
  targeting_criteria: Record<string, any>;
  channel_config: Record<string, any>;
  budget_total: number | null;
  budget_spent: number;
  ai_system_prompt: string | null;
  lead_count: number;
  lead_status_counts: Record<string, number>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  goals?: string;
  gtm_notes?: string;
  settings?: Record<string, any>;
}

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

interface AnalyticsData {
  overview: any;
  channel_performance: any[];
  funnel: any[];
  daily_series: any[];
  step_performance: any[];
  lead_outcomes: any[];
}

type TabKey = 'overview' | 'analytics' | 'targeting' | 'gtm' | 'prompts' | 'leads' | 'crm' | 'settings';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'targeting', label: 'Targeting' },
  { key: 'gtm', label: 'GTM & Strategy' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'leads', label: 'Leads & Outreach' },
  { key: 'crm', label: 'CRM' },
  { key: 'settings', label: 'Settings' },
];

const STATUS_COLORS: Record<string, string> = {
  draft: 'secondary',
  active: 'success',
  paused: 'warning',
  completed: 'info',
};

function AdminCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Enrollment modal state
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [matchingLeads, setMatchingLeads] = useState<any[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [enrolling, setEnrolling] = useState(false);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchCampaign = async () => {
    try {
      const [campRes, statsRes, leadsRes] = await Promise.all([
        fetch(`/api/admin/campaigns/${id}`, { headers }),
        fetch(`/api/admin/campaigns/${id}/stats`, { headers }),
        fetch(`/api/admin/campaigns/${id}/leads`, { headers }),
      ]);
      const campData = await campRes.json();
      const statsData = await statsRes.json();
      const leadsData = await leadsRes.json();
      setCampaign(campData);
      setStats(statsData.stats);
      setLeads(leadsData.leads || []);
    } catch (err) {
      showToast('Failed to load campaign data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/analytics`, { headers });
      const data = await res.json();
      setAnalytics(data.analytics);
    } catch (err) {
      showToast('Failed to load analytics.', 'error');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaign();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'analytics' && !analytics) {
      fetchAnalytics();
    }
  }, [activeTab]);

  const handleLifecycle = async (action: 'activate' | 'pause' | 'complete') => {
    try {
      await fetch(`/api/admin/campaigns/${id}/${action}`, { method: 'POST', headers });
      showToast(`Campaign ${action}d successfully.`, 'success');
      fetchCampaign();
    } catch (err) {
      showToast(`Failed to ${action} campaign.`, 'error');
    }
  };

  const handleShowMatchingLeads = async () => {
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/matching-leads`, { headers });
      const data = await res.json();
      setMatchingLeads(data.leads || []);
      setSelectedLeadIds([]);
      setShowEnrollModal(true);
    } catch (err) {
      showToast('Failed to get matching leads.', 'error');
    }
  };

  const handleEnroll = async () => {
    if (selectedLeadIds.length === 0) return;
    setEnrolling(true);
    try {
      await fetch(`/api/admin/campaigns/${id}/enroll-leads`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ lead_ids: selectedLeadIds }),
      });
      setShowEnrollModal(false);
      showToast(`${selectedLeadIds.length} lead(s) enrolled successfully.`, 'success');
      fetchCampaign();
    } catch (err) {
      showToast('Failed to enroll leads.', 'error');
    } finally {
      setEnrolling(false);
    }
  };

  const handleRemoveLead = async (leadId: number) => {
    try {
      await fetch(`/api/admin/campaigns/${id}/leads/${leadId}`, { method: 'DELETE', headers });
      fetchCampaign();
    } catch (err) {
      showToast('Failed to remove lead.', 'error');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/admin/campaigns/${id}`, { method: 'DELETE', headers });
      showToast('Campaign deleted.', 'success');
      navigate('/admin/campaigns');
    } catch (err) {
      showToast('Failed to delete campaign.', 'error');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading || !campaign) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const isTestMode = campaign.settings?.test_mode_enabled;

  return (
    <div>
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Campaigns', to: '/admin/campaigns' }, { label: campaign.name }]} />
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h2 className="mb-1">{campaign.name}</h2>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <span className={`badge rounded-pill bg-${STATUS_COLORS[campaign.status] || 'secondary'}`}>
              {campaign.status}
            </span>
            <span className="badge bg-light text-dark border">{campaign.type.replace(/_/g, ' ')}</span>
            {isTestMode && (
              <span className="badge bg-danger">TEST MODE</span>
            )}
            {campaign.budget_total && (
              <span className="text-muted small">
                Budget: ${campaign.budget_spent?.toFixed(0)} / ${campaign.budget_total?.toFixed(0)}
              </span>
            )}
            <span className="text-muted small">
              Created {new Date(campaign.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="d-flex gap-2">
          {campaign.status === 'draft' && (
            <button className="btn btn-success btn-sm" onClick={() => handleLifecycle('activate')}>
              Activate
            </button>
          )}
          {campaign.status === 'active' && (
            <button className="btn btn-warning btn-sm" onClick={() => handleLifecycle('pause')}>
              Pause
            </button>
          )}
          {campaign.status === 'paused' && (
            <button className="btn btn-success btn-sm" onClick={() => handleLifecycle('activate')}>
              Resume
            </button>
          )}
          {(campaign.status === 'active' || campaign.status === 'paused') && (
            <button className="btn btn-info btn-sm" onClick={() => handleLifecycle('complete')}>
              Complete
            </button>
          )}
          <button className="btn btn-outline-danger btn-sm" onClick={() => setShowDeleteConfirm(true)}>
            Delete
          </button>
        </div>
      </div>

      {/* 8-Tab Navigation */}
      <ul className="nav nav-tabs nav-tabs-scrollable mb-4">
        {TABS.map((tab) => (
          <li key={tab.key} className="nav-item">
            <button
              className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.key === 'settings' && isTestMode && (
                <span className="badge bg-danger ms-1" style={{ fontSize: '0.55rem' }}>!</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          campaignId={id!}
          stats={stats}
          leads={leads}
          headers={headers}
        />
      )}

      {activeTab === 'analytics' && (
        <AnalyticsTab
          analytics={analytics}
          loading={analyticsLoading}
        />
      )}

      {activeTab === 'targeting' && (
        <TargetingTab
          campaignId={id!}
          targeting_criteria={campaign.targeting_criteria || {}}
          headers={headers}
          onRefresh={fetchCampaign}
        />
      )}

      {activeTab === 'gtm' && (
        <GTMStrategyTab
          campaignId={id!}
          campaign={campaign}
          headers={headers}
          onRefresh={fetchCampaign}
        />
      )}

      {activeTab === 'prompts' && (
        <PromptsTab
          campaignId={id!}
          aiSystemPrompt={campaign.ai_system_prompt}
          sequence={campaign.sequence}
          headers={headers}
          onRefresh={fetchCampaign}
        />
      )}

      {activeTab === 'leads' && (
        <LeadsOutreachTab
          campaignId={id!}
          leads={leads}
          headers={headers}
          onShowMatchingLeads={handleShowMatchingLeads}
          onRemoveLead={handleRemoveLead}
          onRefresh={fetchCampaign}
        />
      )}

      {activeTab === 'crm' && (
        <CRMTab
          campaignId={id!}
          headers={headers}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsTab
          campaignId={id!}
          headers={headers}
        />
      )}

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Enroll Matching Leads ({matchingLeads.length} found)</h5>
                <button className="btn-close" onClick={() => setShowEnrollModal(false)} />
              </div>
              <div className="modal-body" style={{ maxHeight: '400px', overflow: 'auto' }}>
                {matchingLeads.length === 0 ? (
                  <p className="text-muted text-center">No matching leads found. Try adjusting targeting criteria.</p>
                ) : (
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.length === matchingLeads.length}
                            onChange={(e) =>
                              setSelectedLeadIds(e.target.checked ? matchingLeads.map((l: any) => l.id) : [])
                            }
                          />
                        </th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Company</th>
                        <th>Title</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingLeads.map((lead: any) => (
                        <tr key={lead.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedLeadIds.includes(lead.id)}
                              onChange={(e) =>
                                setSelectedLeadIds(
                                  e.target.checked
                                    ? [...selectedLeadIds, lead.id]
                                    : selectedLeadIds.filter((i) => i !== lead.id)
                                )
                              }
                            />
                          </td>
                          <td>{lead.name}</td>
                          <td className="small">{lead.email}</td>
                          <td>{lead.company}</td>
                          <td>{lead.title}</td>
                          <td>{lead.lead_score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowEnrollModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={selectedLeadIds.length === 0 || enrolling}
                  onClick={handleEnroll}
                >
                  {enrolling ? 'Enrolling...' : `Enroll ${selectedLeadIds.length} Lead(s)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        show={showDeleteConfirm}
        title="Delete Campaign"
        message="Are you sure you want to delete this campaign? This action cannot be undone."
        confirmLabel="Delete Campaign"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        loading={deleting}
      />
    </div>
  );
}

export default AdminCampaignDetailPage;
