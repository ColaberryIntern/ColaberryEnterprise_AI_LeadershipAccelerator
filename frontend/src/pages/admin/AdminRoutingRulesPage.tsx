import React, { useEffect, useState, useCallback } from 'react';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';

interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  conditions: Record<string, any>;
  actions: Array<Record<string, any>>;
  continue_on_match: boolean;
  is_active: boolean;
  created_at: string;
}

interface RuleForm {
  name: string;
  priority: number;
  conditions: string;
  actions: string;
  continue_on_match: boolean;
  is_active: boolean;
}

const EMPTY: RuleForm = {
  name: '',
  priority: 100,
  conditions: '{}',
  actions: '[]',
  continue_on_match: false,
  is_active: true,
};

export default function AdminRoutingRulesPage() {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/routing-rules');
      setRules(res.data.routing_rules || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const startEdit = (rule: RoutingRule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      priority: rule.priority,
      conditions: JSON.stringify(rule.conditions || {}, null, 2),
      actions: JSON.stringify(rule.actions || [], null, 2),
      continue_on_match: rule.continue_on_match,
      is_active: rule.is_active,
    });
  };

  const startNew = () => {
    setEditingId('new');
    setForm(EMPTY);
  };

  const save = async () => {
    setError(null);
    let conditions: Record<string, any>;
    let actions: Array<Record<string, any>>;
    try {
      conditions = JSON.parse(form.conditions);
      actions = JSON.parse(form.actions);
    } catch (err: any) {
      setError(`Invalid JSON: ${err.message}`);
      return;
    }
    const payload = {
      name: form.name,
      priority: Number(form.priority),
      conditions,
      actions,
      continue_on_match: form.continue_on_match,
      is_active: form.is_active,
    };
    try {
      if (editingId === 'new') {
        await api.post('/api/admin/routing-rules', payload);
      } else if (editingId) {
        await api.patch(`/api/admin/routing-rules/${editingId}`, payload);
      }
      setEditingId(null);
      setForm(EMPTY);
      fetchRules();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Save failed');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this routing rule?')) return;
    try {
      await api.delete(`/api/admin/routing-rules/${id}`);
      fetchRules();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Delete failed');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4">
      <Breadcrumb items={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Routing Rules' }]} />

      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h3 mb-1">Routing Rules</h1>
          <p className="text-muted mb-0 small">Ordered rules that fire actions on incoming leads.</p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={startNew}>+ New Rule</button>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {editingId && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">
            {editingId === 'new' ? 'New rule' : 'Edit rule'}
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-medium">Name</label>
                <input className="form-control form-control-sm" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Priority</label>
                <input type="number" className="form-control form-control-sm" value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
                <div className="form-text small">Lower runs first.</div>
              </div>
              <div className="col-md-3 d-flex align-items-end gap-3">
                <div className="form-check">
                  <input type="checkbox" className="form-check-input" checked={form.continue_on_match}
                    onChange={(e) => setForm({ ...form, continue_on_match: e.target.checked })} id="cont" />
                  <label className="form-check-label small" htmlFor="cont">Continue</label>
                </div>
                <div className="form-check">
                  <input type="checkbox" className="form-check-input" checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })} id="act" />
                  <label className="form-check-label small" htmlFor="act">Active</label>
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-medium">Conditions (JSON)</label>
                <textarea className="form-control form-control-sm font-monospace" rows={8}
                  value={form.conditions}
                  onChange={(e) => setForm({ ...form, conditions: e.target.value })} />
                <div className="form-text small">
                  e.g. <code>{`{ "entry_point_slug": "get_book_modal" }`}</code>
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-medium">Actions (JSON array)</label>
                <textarea className="form-control form-control-sm font-monospace" rows={8}
                  value={form.actions}
                  onChange={(e) => setForm({ ...form, actions: e.target.value })} />
                <div className="form-text small">
                  e.g. <code>{`[{ "type": "send_pdf", "pdf_slug": "trust" }]`}</code>
                </div>
              </div>
            </div>
            <div className="mt-3 d-flex gap-2">
              <button className="btn btn-sm btn-primary" onClick={save}>Save</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card border-0 shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: 80 }}>Priority</th>
                <th>Name</th>
                <th>Conditions</th>
                <th>Actions</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted py-4">No routing rules yet.</td></tr>
              ) : rules.map(r => (
                <tr key={r.id}>
                  <td>{r.priority}</td>
                  <td className="fw-medium">{r.name}</td>
                  <td className="small"><code>{JSON.stringify(r.conditions)}</code></td>
                  <td className="small">
                    {r.actions.map((a: any, i) => (
                      <span key={i} className="badge bg-info me-1">{a.type}</span>
                    ))}
                  </td>
                  <td className="small">
                    {r.continue_on_match && <span className="badge bg-secondary me-1">continue</span>}
                    <span className={`badge ${r.is_active ? 'bg-success' : 'bg-secondary'}`}>
                      {r.is_active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="text-end">
                    <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => startEdit(r)}>Edit</button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => remove(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
