import React, { useEffect, useState, useCallback } from 'react';

interface Props { token: string; apiUrl: string; }

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

const PromptControlTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newPrompt, setNewPrompt] = useState({ name: '', prompt_type: 'suggested', system_prompt: '', user_prompt_template: '', model_id: 'gpt-4o-mini', temperature: 0.7, max_tokens: 1024 });
  const [saving, setSaving] = useState(false);

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/prompts`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setPrompts(Array.isArray(data) ? data : []);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [token, apiUrl]);

  useEffect(() => { fetchPrompts(); }, [fetchPrompts]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/prompts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrompt),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setShowCreate(false);
      setNewPrompt({ name: '', prompt_type: 'suggested', system_prompt: '', user_prompt_template: '', model_id: 'gpt-4o-mini', temperature: 0.7, max_tokens: 1024 });
      await fetchPrompts();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/prompts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchPrompts();
    } catch (err: any) { setError(err.message); }
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>;

  return (
    <div>
      {error && <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>}
      <div className="d-flex justify-content-between mb-3">
        <span className="fw-semibold" style={{ fontSize: 14 }}>Prompt Templates</span>
        <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : '+ New Template'}
        </button>
      </div>

      {showCreate && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body">
            <div className="row g-2">
              <div className="col-md-6">
                <label className="form-label small fw-medium">Name</label>
                <input className="form-control form-control-sm" value={newPrompt.name} onChange={e => setNewPrompt({ ...newPrompt, name: e.target.value })} />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Type</label>
                <select className="form-select form-select-sm" value={newPrompt.prompt_type} onChange={e => setNewPrompt({ ...newPrompt, prompt_type: e.target.value })}>
                  <option value="suggested">Suggested</option>
                  <option value="mentor">Mentor</option>
                  <option value="evaluation">Evaluation</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Model</label>
                <input className="form-control form-control-sm" value={newPrompt.model_id} onChange={e => setNewPrompt({ ...newPrompt, model_id: e.target.value })} />
              </div>
              <div className="col-12">
                <label className="form-label small fw-medium">System Prompt</label>
                <textarea className="form-control form-control-sm" rows={3} value={newPrompt.system_prompt} onChange={e => setNewPrompt({ ...newPrompt, system_prompt: e.target.value })} />
              </div>
              <div className="col-12">
                <label className="form-label small fw-medium">User Prompt Template</label>
                <textarea className="form-control form-control-sm" rows={3} value={newPrompt.user_prompt_template} onChange={e => setNewPrompt({ ...newPrompt, user_prompt_template: e.target.value })} placeholder="Use {{variable}} for dynamic content" />
              </div>
              <div className="col-12">
                <button className="btn btn-sm btn-primary" onClick={handleCreate} disabled={saving || !newPrompt.name}>{saving ? 'Saving...' : 'Create'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              {prompts.map(p => (
                <tr key={p.id}>
                  <td className="fw-medium">{p.name}</td>
                  <td><span className="badge bg-secondary" style={{ fontSize: 10 }}>{p.prompt_type}</span></td>
                  <td style={{ fontSize: 12 }}>{p.model_id}</td>
                  <td>{p.is_active ? <span className="badge bg-success" style={{ fontSize: 10 }}>Active</span> : <span className="badge bg-warning" style={{ fontSize: 10 }}>Inactive</span>}</td>
                  <td>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {prompts.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted py-4">No prompt templates yet. Create one to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PromptControlTab;
