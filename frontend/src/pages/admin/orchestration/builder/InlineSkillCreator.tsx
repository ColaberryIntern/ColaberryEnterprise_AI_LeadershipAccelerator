import React, { useState } from 'react';

interface Props {
  token: string;
  apiUrl: string;
  onCreated: (skillId: string) => void;
  onCancel: () => void;
}

export default function InlineSkillCreator({ token, apiUrl, onCreated, onCancel }: Props) {
  const [form, setForm] = useState({
    layer_id: 'L1_foundation',
    domain_id: 'ai_strategy',
    skill_id: '',
    name: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.skill_id || !form.name) { setError('Skill ID and name are required'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/skills`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      onCreated(form.skill_id);
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-sm">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title" style={{ fontSize: 13 }}>Create Skill Definition</h6>
            <button className="btn-close" onClick={onCancel} style={{ fontSize: 10 }} />
          </div>
          <div className="modal-body py-2">
            {error && <div className="alert alert-danger py-1 small mb-2">{error}</div>}
            <div className="row g-2 mb-2">
              <div className="col-6">
                <label className="form-label small fw-medium mb-0">Layer</label>
                <select className="form-select form-select-sm" value={form.layer_id} onChange={e => setForm({ ...form, layer_id: e.target.value })}>
                  <option value="L1_foundation">L1 Foundation</option>
                  <option value="L2_application">L2 Application</option>
                  <option value="L3_integration">L3 Integration</option>
                  <option value="L4_leadership">L4 Leadership</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label small fw-medium mb-0">Domain</label>
                <select className="form-select form-select-sm" value={form.domain_id} onChange={e => setForm({ ...form, domain_id: e.target.value })}>
                  <option value="ai_strategy">AI Strategy</option>
                  <option value="ai_literacy">AI Literacy</option>
                  <option value="prompt_engineering">Prompt Engineering</option>
                  <option value="data_governance">Data Governance</option>
                  <option value="change_management">Change Management</option>
                  <option value="ethics_compliance">Ethics & Compliance</option>
                  <option value="implementation">Implementation</option>
                </select>
              </div>
            </div>
            <div className="mb-2">
              <label className="form-label small fw-medium mb-0">Skill ID <span className="text-danger">*</span></label>
              <input className="form-control form-control-sm" value={form.skill_id} onChange={e => setForm({ ...form, skill_id: e.target.value.replace(/[^a-z0-9_]/g, '') })} placeholder="e.g. strategic_ai_assessment" />
            </div>
            <div className="mb-2">
              <label className="form-label small fw-medium mb-0">Name <span className="text-danger">*</span></label>
              <input className="form-control form-control-sm" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Strategic AI Assessment" />
            </div>
            <div className="mb-2">
              <label className="form-label small fw-medium mb-0">Description</label>
              <textarea className="form-control form-control-sm" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="modal-footer py-1">
            <button className="btn btn-sm btn-outline-secondary" onClick={onCancel}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
