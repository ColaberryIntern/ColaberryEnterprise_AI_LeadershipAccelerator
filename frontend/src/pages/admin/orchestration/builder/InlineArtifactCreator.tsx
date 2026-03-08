import React, { useState } from 'react';

interface Props {
  token: string;
  apiUrl: string;
  sessionId?: string;
  onCreated: (artifactId: string) => void;
  onCancel: () => void;
}

export default function InlineArtifactCreator({ token, apiUrl, sessionId, onCreated, onCancel }: Props) {
  const [form, setForm] = useState({
    name: '',
    artifact_type: 'document',
    description: '',
    file_types: '.pdf,.docx,.xlsx',
    evaluation_criteria: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.name) { setError('Name is required'); return; }
    if (!sessionId) { setError('No session context available for artifact creation'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/sessions/${sessionId}/artifacts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          file_types: form.file_types.split(',').map(t => t.trim()),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      const created = await res.json();
      onCreated(created.id);
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-sm">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title" style={{ fontSize: 13 }}>Create Artifact Definition</h6>
            <button className="btn-close" onClick={onCancel} style={{ fontSize: 10 }} />
          </div>
          <div className="modal-body py-2">
            {error && <div className="alert alert-danger py-1 small mb-2">{error}</div>}
            <div className="mb-2">
              <label className="form-label small fw-medium mb-0">Name <span className="text-danger">*</span></label>
              <input className="form-control form-control-sm" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. AI Readiness Assessment" />
            </div>
            <div className="mb-2">
              <label className="form-label small fw-medium mb-0">Type</label>
              <select className="form-select form-select-sm" value={form.artifact_type} onChange={e => setForm({ ...form, artifact_type: e.target.value })}>
                <option value="document">Document</option>
                <option value="spreadsheet">Spreadsheet</option>
                <option value="presentation">Presentation</option>
                <option value="code">Code</option>
                <option value="screenshot">Screenshot</option>
              </select>
            </div>
            <div className="mb-2">
              <label className="form-label small fw-medium mb-0">Description</label>
              <textarea className="form-control form-control-sm" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="mb-2">
              <label className="form-label small fw-medium mb-0">File Types</label>
              <input className="form-control form-control-sm" value={form.file_types} onChange={e => setForm({ ...form, file_types: e.target.value })} placeholder=".pdf,.docx,.xlsx" />
              <div className="text-muted" style={{ fontSize: 9 }}>Comma-separated extensions</div>
            </div>
            <div className="mb-2">
              <label className="form-label small fw-medium mb-0">Evaluation Criteria</label>
              <textarea className="form-control form-control-sm" rows={2} value={form.evaluation_criteria} onChange={e => setForm({ ...form, evaluation_criteria: e.target.value })} placeholder="What must this artifact contain?" />
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
