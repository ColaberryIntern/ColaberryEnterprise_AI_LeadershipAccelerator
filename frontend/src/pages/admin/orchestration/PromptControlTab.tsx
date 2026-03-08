import React, { useEffect, useState, useCallback } from 'react';

interface PromptControlTabProps {
  token: string;
  cohortId: string;
  apiUrl: string;
}

interface PromptTemplate {
  id: string;
  name: string;
  prompt_type: string;
  system_prompt: string;
  user_prompt_template: string;
  model_id: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
}

const PROMPT_TYPES = [
  'teaching',
  'evaluation',
  'feedback',
  'artifact_generation',
  'coaching',
  'summary',
];

const emptyPromptForm = (): Partial<PromptTemplate> => ({
  name: '',
  prompt_type: 'teaching',
  system_prompt: '',
  user_prompt_template: '',
  model_id: 'gpt-4',
  temperature: 0.7,
  max_tokens: 2048,
  is_active: true,
});

const PromptControlTab: React.FC<PromptControlTabProps> = ({ token, cohortId, apiUrl }) => {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<Partial<PromptTemplate>>(emptyPromptForm());
  const [saving, setSaving] = useState(false);
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/prompts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch prompts: ${res.status}`);
      const data = await res.json();
      setPrompts(Array.isArray(data) ? data : data.prompts || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, apiUrl]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const openCreate = () => {
    setModalMode('create');
    setFormData(emptyPromptForm());
    setPreviewResult(null);
    setShowModal(true);
  };

  const openEdit = (p: PromptTemplate) => {
    setModalMode('edit');
    setFormData({ ...p });
    setPreviewResult(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData(emptyPromptForm());
    setPreviewResult(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isEdit = modalMode === 'edit' && formData.id;
      const url = isEdit
        ? `${apiUrl}/api/admin/orchestration/prompts/${formData.id}`
        : `${apiUrl}/api/admin/orchestration/prompts`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      closeModal();
      await fetchPrompts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!formData.id) return;
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/prompts/${formData.id}/preview`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
      const data = await res.json();
      setPreviewResult(data.preview || data.result || JSON.stringify(data, null, 2));
    } catch (err: any) {
      setPreviewResult(`Error: ${err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this prompt template?')) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/prompts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      await fetchPrompts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading prompts...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>}

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="fw-semibold mb-0" style={{ fontSize: 14 }}>Prompt Templates</h6>
        <button className="btn btn-sm btn-primary" onClick={openCreate}>
          + New Prompt
        </button>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
            <thead className="table-light">
              <tr>
                <th style={{ fontSize: 12 }}>Name</th>
                <th style={{ fontSize: 12 }}>Type</th>
                <th style={{ fontSize: 12 }}>Model</th>
                <th style={{ fontSize: 12 }}>Active</th>
                <th style={{ fontSize: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr key={p.id}>
                  <td className="fw-medium">{p.name}</td>
                  <td>
                    <span className="badge bg-info" style={{ fontSize: 11 }}>{p.prompt_type}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{p.model_id}</td>
                  <td>
                    {p.is_active ? (
                      <span className="badge bg-success" style={{ fontSize: 11 }}>Active</span>
                    ) : (
                      <span className="badge bg-secondary" style={{ fontSize: 11 }}>Inactive</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline-secondary me-1"
                      onClick={() => openEdit(p)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDelete(p.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {prompts.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    No prompt templates configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div
            className="modal show d-block"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={modalMode === 'create' ? 'Create Prompt' : 'Edit Prompt'}
          >
            <div className="modal-dialog modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h6 className="modal-title fw-semibold">
                    {modalMode === 'create' ? 'Create Prompt Template' : 'Edit Prompt Template'}
                  </h6>
                  <button type="button" className="btn-close" onClick={closeModal}></button>
                </div>
                <div className="modal-body" style={{ fontSize: 13 }}>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Name
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={formData.name || ''}
                        onChange={(e) => updateField('name', e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Prompt Type
                      </label>
                      <select
                        className="form-select form-select-sm"
                        value={formData.prompt_type || 'teaching'}
                        onChange={(e) => updateField('prompt_type', e.target.value)}
                      >
                        {PROMPT_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        System Prompt
                      </label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={5}
                        value={formData.system_prompt || ''}
                        onChange={(e) => updateField('system_prompt', e.target.value)}
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        User Prompt Template
                      </label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={5}
                        value={formData.user_prompt_template || ''}
                        onChange={(e) => updateField('user_prompt_template', e.target.value)}
                        placeholder="Use {{variable}} for template variables"
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Model ID
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={formData.model_id || ''}
                        onChange={(e) => updateField('model_id', e.target.value)}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Temperature
                      </label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        step={0.1}
                        min={0}
                        max={2}
                        value={formData.temperature ?? 0.7}
                        onChange={(e) => updateField('temperature', parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Max Tokens
                      </label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={formData.max_tokens ?? 2048}
                        onChange={(e) => updateField('max_tokens', parseInt(e.target.value, 10))}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-medium" style={{ fontSize: 12 }}>
                        Active
                      </label>
                      <div>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={formData.is_active ?? true}
                          onChange={(e) => updateField('is_active', e.target.checked)}
                        />
                        <span className="ms-2" style={{ fontSize: 12 }}>
                          {formData.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {modalMode === 'edit' && formData.id && (
                    <div className="mt-3 pt-3 border-top">
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={handlePreview}
                        disabled={previewLoading}
                      >
                        {previewLoading ? 'Generating...' : 'Preview Prompt'}
                      </button>
                      {previewResult && (
                        <pre
                          className="mt-2 p-2 bg-light rounded"
                          style={{ fontSize: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}
                        >
                          {previewResult}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-sm btn-outline-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : modalMode === 'create' ? 'Create' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PromptControlTab;
