import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';
import { useToast } from '../../../components/ui/ToastProvider';

interface Vip {
  id: number;
  email: string;
  name: string;
  relationship: string;
  priority: number;
}

const RELATIONSHIP_OPTIONS = ['client', 'partner', 'investor', 'executive', 'board', 'vendor', 'other'];

const RELATIONSHIP_COLORS: Record<string, string> = {
  client: 'success',
  partner: 'info',
  investor: 'warning',
  executive: 'danger',
  board: 'primary',
  vendor: 'secondary',
  other: 'secondary',
};

export default function InboxVipManagerPage() {
  const { showToast } = useToast();
  const [vips, setVips] = useState<Vip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Form state for add/edit
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formRelationship, setFormRelationship] = useState('client');
  const [formPriority, setFormPriority] = useState(100);

  const fetchVips = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/api/admin/inbox/vips');
      setVips(res.data.vips || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load VIPs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVips();
  }, [fetchVips]);

  const resetForm = () => {
    setFormEmail('');
    setFormName('');
    setFormRelationship('client');
    setFormPriority(100);
  };

  const handleAdd = async () => {
    if (!formEmail || !formName) return;
    try {
      await api.post('/api/admin/inbox/vips', {
        email: formEmail,
        name: formName,
        relationship: formRelationship,
        priority: formPriority,
      });
      showToast('VIP added', 'success');
      setAdding(false);
      resetForm();
      fetchVips();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Add failed', 'error');
    }
  };

  const startEdit = (vip: Vip) => {
    setEditingId(vip.id);
    setFormEmail(vip.email);
    setFormName(vip.name);
    setFormRelationship(vip.relationship);
    setFormPriority(vip.priority);
  };

  const handleSaveEdit = async (id: number) => {
    try {
      await api.patch(`/api/admin/inbox/vips/${id}`, {
        email: formEmail,
        name: formName,
        relationship: formRelationship,
        priority: formPriority,
      });
      showToast('VIP updated', 'success');
      setEditingId(null);
      resetForm();
      fetchVips();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Update failed', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (deleting === id) {
      try {
        await api.delete(`/api/admin/inbox/vips/${id}`);
        showToast('VIP removed', 'success');
        setDeleting(null);
        fetchVips();
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
        <h4 className="mb-0">VIP Manager</h4>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => { resetForm(); setAdding(true); setEditingId(null); }}
          disabled={adding}
        >
          + Add VIP
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Relationship</th>
                  <th>Priority</th>
                  <th style={{ width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Add new row */}
                {adding && (
                  <tr>
                    <td>
                      <input
                        type="email"
                        className="form-control form-control-sm"
                        placeholder="email@example.com"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Full Name"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        value={formRelationship}
                        onChange={(e) => setFormRelationship(e.target.value)}
                      >
                        {RELATIONSHIP_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        style={{ width: 80 }}
                        value={formPriority}
                        onChange={(e) => setFormPriority(parseInt(e.target.value, 10) || 0)}
                      />
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <button className="btn btn-sm btn-success" onClick={handleAdd}>Save</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => { setAdding(false); resetForm(); }}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Existing VIPs */}
                {vips.length === 0 && !adding ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">No VIPs configured.</td>
                  </tr>
                ) : (
                  vips.map((vip) => (
                    <tr key={vip.id}>
                      <td className="small">
                        {editingId === vip.id ? (
                          <input
                            type="email"
                            className="form-control form-control-sm"
                            value={formEmail}
                            onChange={(e) => setFormEmail(e.target.value)}
                          />
                        ) : (
                          vip.email
                        )}
                      </td>
                      <td className="small">
                        {editingId === vip.id ? (
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                          />
                        ) : (
                          vip.name
                        )}
                      </td>
                      <td>
                        {editingId === vip.id ? (
                          <select
                            className="form-select form-select-sm"
                            value={formRelationship}
                            onChange={(e) => setFormRelationship(e.target.value)}
                          >
                            {RELATIONSHIP_OPTIONS.map((r) => (
                              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`badge bg-${RELATIONSHIP_COLORS[vip.relationship] || 'secondary'}`}>
                            {vip.relationship.charAt(0).toUpperCase() + vip.relationship.slice(1)}
                          </span>
                        )}
                      </td>
                      <td className="small">
                        {editingId === vip.id ? (
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            style={{ width: 80 }}
                            value={formPriority}
                            onChange={(e) => setFormPriority(parseInt(e.target.value, 10) || 0)}
                          />
                        ) : (
                          vip.priority
                        )}
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          {editingId === vip.id ? (
                            <>
                              <button className="btn btn-sm btn-success" onClick={() => handleSaveEdit(vip.id)}>Save</button>
                              <button className="btn btn-sm btn-outline-secondary" onClick={() => { setEditingId(null); resetForm(); }}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-sm btn-outline-secondary" onClick={() => startEdit(vip)}>Edit</button>
                              <button
                                className={`btn btn-sm ${deleting === vip.id ? 'btn-danger' : 'btn-outline-danger'}`}
                                onClick={() => handleDelete(vip.id)}
                                onBlur={() => setDeleting(null)}
                              >
                                {deleting === vip.id ? 'Confirm' : 'Delete'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
