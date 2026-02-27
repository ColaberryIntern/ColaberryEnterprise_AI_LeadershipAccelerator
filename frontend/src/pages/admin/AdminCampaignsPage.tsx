import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../../components/ui/Modal';
import Breadcrumb from '../../components/ui/Breadcrumb';

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
}

interface Sequence {
  id: string;
  name: string;
}

const TYPE_LABELS: Record<string, string> = {
  warm_nurture: 'Warm Nurture',
  cold_outbound: 'Cold Outbound',
  re_engagement: 'Re-Engagement',
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
};

function AdminCampaignsPage() {
  const { token } = useAuth();
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
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchCampaigns = async () => {
    try {
      const params = new URLSearchParams();
      if (filterType) params.append('type', filterType);
      if (filterStatus) params.append('status', filterStatus);
      const res = await fetch(`/api/admin/campaigns?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSequences = async () => {
    try {
      const res = await fetch('/api/admin/sequences', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSequences(data || []);
    } catch (err) {
      console.error('Failed to fetch sequences:', err);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchSequences();
  }, [filterType, filterStatus]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          budget_total: form.budget_total ? parseFloat(form.budget_total) : null,
          sequence_id: form.sequence_id || null,
        }),
      });
      if (res.ok) {
        setShowModal(false);
        setForm({ name: '', description: '', type: 'cold_outbound', sequence_id: '', budget_total: '', ai_system_prompt: '' });
        fetchCampaigns();
      }
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
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Campaign
        </button>
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
                    <span className="badge bg-light text-dark border mb-2">
                      {TYPE_LABELS[c.type] || c.type}
                    </span>
                    {c.description && (
                      <p className="text-muted small mb-2" style={{ lineClamp: 2, overflow: 'hidden' }}>
                        {c.description}
                      </p>
                    )}
                    <div className="d-flex gap-3 text-muted small mt-auto">
                      <span>{c.lead_count} leads</span>
                      {c.sequence && <span>Seq: {c.sequence.name}</span>}
                      {c.budget_total && (
                        <span>${c.budget_spent?.toFixed(0)} / ${c.budget_total?.toFixed(0)}</span>
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
        </form>
      </Modal>
    </div>
  );
}

export default AdminCampaignsPage;
