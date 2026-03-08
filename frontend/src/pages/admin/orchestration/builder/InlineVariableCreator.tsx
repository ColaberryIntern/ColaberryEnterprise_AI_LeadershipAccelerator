import React, { useState } from 'react';

interface Props {
  token: string;
  apiUrl: string;
  onCreated: (variableKey: string) => void;
  onCancel: () => void;
}

export default function InlineVariableCreator({ token, apiUrl, onCreated, onCancel }: Props) {
  const [form, setForm] = useState({
    variable_key: '',
    display_name: '',
    data_type: 'string',
    scope: 'enrollment',
    source_type: 'prompt_output',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.variable_key || !form.display_name) { setError('Key and name are required'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/variable-definitions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      onCreated(form.variable_key);
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-sm">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title" style={{ fontSize: 13 }}>Create Variable Definition</h6>
            <button className="btn-close" onClick={onCancel} style={{ fontSize: 10 }} />
          </div>
          <div className="modal-body py-2">
            {error && <div className="alert alert-danger py-1 small mb-2">{error}</div>}
            <div className="mb-2">
              <label className="form-label small fw-medium mb-0">Key <span className="text-danger">*</span></label>
              <input className="form-control form-control-sm" value={form.variable_key} onChange={e => setForm({ ...form, variable_key: e.target.value.replace(/[^a-z0-9_]/g, '') })} placeholder="e.g. ai_maturity_score" />
            </div>
            <div className="mb-2">
              <label className="form-label small fw-medium mb-0">Display Name <span className="text-danger">*</span></label>
              <input className="form-control form-control-sm" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="e.g. AI Maturity Score" />
            </div>
            <div className="row g-2 mb-2">
              <div className="col-6">
                <label className="form-label small fw-medium mb-0">Type</label>
                <select className="form-select form-select-sm" value={form.data_type} onChange={e => setForm({ ...form, data_type: e.target.value })}>
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="json">JSON</option>
                  <option value="array">Array</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label small fw-medium mb-0">Scope</label>
                <select className="form-select form-select-sm" value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}>
                  <option value="enrollment">Enrollment</option>
                  <option value="session">Session</option>
                  <option value="global">Global</option>
                </select>
              </div>
            </div>
            <div className="mb-2">
              <label className="form-label small fw-medium mb-0">Source</label>
              <select className="form-select form-select-sm" value={form.source_type} onChange={e => setForm({ ...form, source_type: e.target.value })}>
                <option value="prompt_output">Prompt Output</option>
                <option value="user_input">User Input</option>
                <option value="system_computed">System Computed</option>
                <option value="admin_set">Admin Set</option>
              </select>
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
