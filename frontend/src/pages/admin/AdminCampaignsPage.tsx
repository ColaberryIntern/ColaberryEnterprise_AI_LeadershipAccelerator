import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import Modal from '../../components/ui/Modal';
import Breadcrumb from '../../components/ui/Breadcrumb';
import CampaignGraphTab from '../../components/admin/intelligence/entityPanel/CampaignGraphTab';

interface Campaign {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  sequence?: { id: string; name: string };
  creator?: { id: string; email: string };
  lead_count: number;
  active_lead_count: number;
  budget_total: number | null;
  budget_spent: number;
  started_at: string | null;
  created_at: string;
  campaign_mode?: string;
  ramp_state?: any;
  evolution_config?: any;
}

interface Sequence {
  id: string;
  name: string;
}

const TYPE_LABELS: Record<string, string> = {
  warm_nurture: 'Warm Nurture',
  cold_outbound: 'Cold Outbound',
  re_engagement: 'Re-Engagement',
  behavioral_trigger: 'Behavioral Trigger',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'secondary',
  active: 'success',
  paused: 'warning',
  completed: 'info',
};

const TYPE_BORDER_COLORS: Record<string, string> = {
  cold_outbound: '#0dcaf0',
  warm_nurture: '#fd7e14',
  re_engagement: '#6f42c1',
  behavioral_trigger: '#38a169',
};

function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'cold_outbound',
    sequence_id: '',
    budget_total: '',
    ai_system_prompt: '',
  });
  const [triggerRules, setTriggerRules] = useState<{ signal_type: string; min_count: number }[]>([]);
  const [triggerSettings, setTriggerSettings] = useState({
    min_intent_score: 45,
    require_all_rules: true,
    cooldown_hours: 72,
    auto_start_chat: false,
    exclude_identified: false,
  });
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchCampaigns = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      const res = await api.get('/api/admin/campaigns', { params });
      setCampaigns(res.data.campaigns || []);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    }
  }, [filterType, filterStatus]);

  const fetchSequences = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/sequences');
      setSequences(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch sequences:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchCampaigns(), fetchSequences()]).finally(() => setLoading(false));
  }, [fetchCampaigns, fetchSequences]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        ...form,
        budget_total: form.budget_total ? parseFloat(form.budget_total) : null,
        sequence_id: form.sequence_id || null,
      };

      if (form.type === 'behavioral_trigger') {
        payload.targeting_criteria = {
          trigger_rules: triggerRules.filter(r => r.signal_type),
          ...triggerSettings,
        };
      }

      await api.post('/api/admin/campaigns', payload);
      setShowModal(false);
      setForm({ name: '', description: '', type: 'cold_outbound', sequence_id: '', budget_total: '', ai_system_prompt: '' });
      setTriggerRules([]);
      setTriggerSettings({ min_intent_score: 45, require_all_rules: true, cooldown_hours: 72, auto_start_chat: false, exclude_identified: false });
      fetchCampaigns();
    } catch (err) {
      console.error('Failed to create campaign:', err);
    }
  };

  if (loading) {
    return (
      <>
        <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Campaigns' }]} />
        <div className="row g-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="col-md-6 col-lg-4">
              <div className="card admin-table-card p-3">
                <div className="skeleton mb-2" style={{ width: '60%', height: '18px' }} />
                <div className="skeleton mb-2" style={{ width: '40%', height: '14px' }} />
                <div className="skeleton" style={{ width: '80%', height: '14px' }} />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div>
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Campaigns' }]} />
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">Campaigns</h2>
        <div className="d-flex gap-2">
          <Link to="/admin/campaigns/build-cold" className="btn btn-outline-primary">
            Build Cold Campaign
          </Link>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + New Campaign
          </button>
        </div>
      </div>

      {/* Campaign Intelligence Graph */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white d-flex justify-content-between align-items-center">
          <span className="fw-semibold" style={{ color: 'var(--color-primary)' }}>Campaign Intelligence Graph</span>
          <span className="text-muted small">Click nodes for details</span>
        </div>
        <div className="card-body p-0" style={{ height: 560 }}>
          <CampaignGraphTab fullWidth />
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-auto">
          <select className="form-select form-select-sm" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            <option value="warm_nurture">Warm Nurture</option>
            <option value="cold_outbound">Cold Outbound</option>
            <option value="re_engagement">Re-Engagement</option>
          </select>
        </div>
        <div className="col-auto">
          <select className="form-select form-select-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-5 text-muted">
            <p className="mb-2">No campaigns yet.</p>
            <button className="btn btn-outline-primary btn-sm" onClick={() => setShowModal(true)}>
              Create your first campaign
            </button>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {campaigns.map((c) => (
            <div key={c.id} className="col-md-6 col-lg-4">
              <Link to={`/admin/campaigns/${c.id}`} className="text-decoration-none">
                <div className="card h-100 admin-table-card card-lift" style={{ borderTop: `3px solid ${TYPE_BORDER_COLORS[c.type] || '#6c757d'}` }}>
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <h6 className="card-title text-dark mb-0">{c.name}</h6>
                      <span className={`badge rounded-pill bg-${STATUS_COLORS[c.status] || 'secondary'}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="d-flex gap-1 mb-2 flex-wrap">
                      <span className="badge bg-light text-dark border">
                        {TYPE_LABELS[c.type] || c.type}
                      </span>
                      {c.campaign_mode === 'autonomous' && (
                        <span className="badge bg-info text-white">Autonomous</span>
                      )}
                      {c.campaign_mode === 'autonomous' && c.ramp_state && c.ramp_state.status !== 'complete' && (
                        <span className="badge bg-outline-primary border text-primary">
                          Phase {c.ramp_state.current_phase}/{c.ramp_state.phase_sizes?.length || 4}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-muted small mb-2" style={{ WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {c.description}
                      </p>
                    )}
                    <div className="d-flex gap-3 text-muted small mt-auto">
                      <span>{c.lead_count} leads</span>
                      {c.sequence && <span>Seq: {c.sequence.name}</span>}
                      {c.budget_total != null && c.budget_total > 0 && (
                        <span>${(c.budget_spent || 0).toFixed(0)} / ${c.budget_total.toFixed(0)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Create Campaign Modal */}
      <Modal
        show={showModal}
        onClose={() => setShowModal(false)}
        title="New Campaign"
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
              Cancel
            </button>
            <button type="submit" form="create-campaign-form" className="btn btn-primary" disabled={!form.name}>
              Create Campaign
            </button>
          </>
        }
      >
        <form id="create-campaign-form" onSubmit={handleCreate}>
          <div className="mb-3">
            <label htmlFor="camp-name" className="form-label">Campaign Name *</label>
            <input
              id="camp-name"
              className="form-control"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="camp-desc" className="form-label">Description</label>
            <textarea
              id="camp-desc"
              className="form-control"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label htmlFor="camp-type" className="form-label">Campaign Type *</label>
              <select
                id="camp-type"
                className="form-select"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="cold_outbound">Cold Outbound</option>
                <option value="warm_nurture">Warm Nurture</option>
                <option value="re_engagement">Re-Engagement</option>
                <option value="behavioral_trigger">Behavioral Trigger</option>
              </select>
            </div>
            <div className="col-md-6 mb-3">
              <label htmlFor="camp-seq" className="form-label">Sequence</label>
              <select
                id="camp-seq"
                className="form-select"
                value={form.sequence_id}
                onChange={(e) => setForm({ ...form, sequence_id: e.target.value })}
              >
                <option value="">-- Select Sequence --</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label htmlFor="camp-budget" className="form-label">Budget ($)</label>
            <input
              id="camp-budget"
              type="number"
              className="form-control"
              value={form.budget_total}
              onChange={(e) => setForm({ ...form, budget_total: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div className="mb-3">
            <label htmlFor="camp-prompt" className="form-label">AI System Prompt (Campaign Persona)</label>
            <textarea
              id="camp-prompt"
              className="form-control"
              rows={3}
              value={form.ai_system_prompt}
              onChange={(e) => setForm({ ...form, ai_system_prompt: e.target.value })}
              placeholder="Define the AI's persona and brand voice for this campaign. Leave blank to use the default system prompt."
            />
          </div>

          {/* Behavioral Trigger Rules — shown when type is behavioral_trigger */}
          {form.type === 'behavioral_trigger' && (
            <div className="card border-0 bg-light mb-3">
              <div className="card-body">
                <h6 className="card-title fw-semibold mb-3">Trigger Rules</h6>

                <div className="row mb-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Min Intent Score (0-100)</label>
                    <input
                      type="range"
                      className="form-range"
                      min={0}
                      max={100}
                      value={triggerSettings.min_intent_score}
                      onChange={(e) => setTriggerSettings({ ...triggerSettings, min_intent_score: Number(e.target.value) })}
                    />
                    <small className="text-muted">{triggerSettings.min_intent_score}</small>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-medium">Cooldown Hours</label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={triggerSettings.cooldown_hours}
                      onChange={(e) => setTriggerSettings({ ...triggerSettings, cooldown_hours: Number(e.target.value) })}
                      min={0}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-medium">Signal Rules</label>
                  {triggerRules.map((rule, idx) => (
                    <div key={idx} className="d-flex gap-2 mb-2 align-items-center">
                      <select
                        className="form-select form-select-sm"
                        value={rule.signal_type}
                        onChange={(e) => {
                          const updated = [...triggerRules];
                          updated[idx] = { ...updated[idx], signal_type: e.target.value };
                          setTriggerRules(updated);
                        }}
                      >
                        <option value="">Select signal...</option>
                        <option value="pricing_visit">Pricing Visit</option>
                        <option value="enroll_page_visit">Enroll Page Visit</option>
                        <option value="contact_page_visit">Contact Page Visit</option>
                        <option value="strategy_call_visit">Strategy Call Visit</option>
                        <option value="cta_click_enroll">CTA Click - Enroll</option>
                        <option value="cta_click_strategy">CTA Click - Strategy</option>
                        <option value="form_started">Form Started</option>
                        <option value="form_submitted">Form Submitted</option>
                        <option value="return_visit">Return Visit</option>
                        <option value="deep_scroll_pricing">Deep Scroll - Pricing</option>
                        <option value="deep_scroll_program">Deep Scroll - Program</option>
                        <option value="evaluation_pattern">Evaluation Pattern</option>
                        <option value="research_pattern">Research Pattern</option>
                        <option value="long_session">Long Session</option>
                        <option value="multi_page_session">Multi-Page Session</option>
                      </select>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        style={{ width: '80px' }}
                        value={rule.min_count}
                        onChange={(e) => {
                          const updated = [...triggerRules];
                          updated[idx] = { ...updated[idx], min_count: Number(e.target.value) };
                          setTriggerRules(updated);
                        }}
                        min={1}
                        placeholder="Min"
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => setTriggerRules(triggerRules.filter((_, i) => i !== idx))}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setTriggerRules([...triggerRules, { signal_type: '', min_count: 1 }])}
                  >
                    + Add Signal Rule
                  </button>
                </div>

                <div className="d-flex flex-wrap gap-3">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="trigger-all"
                      checked={triggerSettings.require_all_rules}
                      onChange={(e) => setTriggerSettings({ ...triggerSettings, require_all_rules: e.target.checked })}
                    />
                    <label className="form-check-label small" htmlFor="trigger-all">Require all rules (AND)</label>
                  </div>
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="trigger-chat"
                      checked={triggerSettings.auto_start_chat}
                      onChange={(e) => setTriggerSettings({ ...triggerSettings, auto_start_chat: e.target.checked })}
                    />
                    <label className="form-check-label small" htmlFor="trigger-chat">Auto-start proactive chat</label>
                  </div>
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="trigger-exclude"
                      checked={triggerSettings.exclude_identified}
                      onChange={(e) => setTriggerSettings({ ...triggerSettings, exclude_identified: e.target.checked })}
                    />
                    <label className="form-check-label small" htmlFor="trigger-exclude">Exclude identified leads</label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}

export default AdminCampaignsPage;
