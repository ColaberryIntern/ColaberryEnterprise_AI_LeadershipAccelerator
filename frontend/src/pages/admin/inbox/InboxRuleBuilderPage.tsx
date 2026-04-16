import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';
import { useToast } from '../../../components/ui/ToastProvider';
import ClassificationBadge from '../../../components/admin/inbox/ClassificationBadge';
import RuleFormModal from '../../../components/admin/inbox/RuleFormModal';

interface Rule {
  id: number;
  name: string;
  rule_type: string;
  conditions: Array<{ field: string; operator: string; value: string }>;
  target_state: 'INBOX' | 'AUTOMATION' | 'SILENT_HOLD' | 'ASK_USER';
  priority: number;
  enabled: boolean;
}

function renderConditions(conditions: Rule['conditions']): string {
  return conditions
    .map((c) => `${c.field} ${c.operator} "${c.value}"`)
    .join(' AND ');
}

export default function InboxRuleBuilderPage() {
  const { showToast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | undefined>(undefined);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/api/admin/inbox/rules');
      setRules(res.data.rules || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleSave = async (data: any) => {
    try {
      if (editingRule) {
        await api.patch(`/api/admin/inbox/rules/${editingRule.id}`, data);
        showToast('Rule updated', 'success');
      } else {
        await api.post('/api/admin/inbox/rules', data);
        showToast('Rule created', 'success');
      }
      setShowModal(false);
      setEditingRule(undefined);
      fetchRules();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Save failed', 'error');
    }
  };

  const handleToggle = async (rule: Rule) => {
    try {
      await api.patch(`/api/admin/inbox/rules/${rule.id}`, { enabled: !rule.enabled });
      showToast(`Rule ${!rule.enabled ? 'enabled' : 'disabled'}`, 'success');
      fetchRules();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Toggle failed', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (deleting === id) {
      try {
        await api.delete(`/api/admin/inbox/rules/${id}`);
        showToast('Rule deleted', 'success');
        setDeleting(null);
        fetchRules();
      } catch (err: any) {
        showToast(err.response?.data?.error || 'Delete failed', 'error');
      }
    } else {
      setDeleting(id);
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Inbox Rules</h4>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => { setEditingRule(undefined); setShowModal(true); }}
        >
          + Add Rule
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-5 text-muted">No rules configured.</div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Conditions</th>
                  <th>Target State</th>
                  <th>Priority</th>
                  <th>Enabled</th>
                  <th style={{ width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="small fw-medium">{rule.name}</td>
                    <td><span className="badge bg-info">{rule.rule_type}</span></td>
                    <td className="small text-muted" style={{ maxWidth: 300 }}>
                      {renderConditions(rule.conditions)}
                    </td>
                    <td><ClassificationBadge state={rule.target_state} /></td>
                    <td className="small">{rule.priority}</td>
                    <td>
                      <div className="form-check form-switch">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          role="switch"
                          checked={rule.enabled}
                          onChange={() => handleToggle(rule)}
                          aria-label={`Toggle rule ${rule.name}`}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => { setEditingRule(rule); setShowModal(true); }}
                        >
                          Edit
                        </button>
                        <button
                          className={`btn btn-sm ${deleting === rule.id ? 'btn-danger' : 'btn-outline-danger'}`}
                          onClick={() => handleDelete(rule.id)}
                          onBlur={() => setDeleting(null)}
                        >
                          {deleting === rule.id ? 'Confirm' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RuleFormModal
        show={showModal}
        rule={editingRule}
        onSave={handleSave}
        onClose={() => { setShowModal(false); setEditingRule(undefined); }}
      />
    </div>
  );
}
