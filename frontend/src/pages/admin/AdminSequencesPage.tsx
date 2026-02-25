import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

interface SequenceStep {
  delay_days: number;
  subject: string;
  body_template: string;
}

interface Sequence {
  id: string;
  name: string;
  description: string;
  steps: SequenceStep[];
  is_active: boolean;
  created_at: string;
}

const EMPTY_STEP: SequenceStep = { delay_days: 1, subject: '', body_template: '' };

function AdminSequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<SequenceStep[]>([{ ...EMPTY_STEP }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSequences();
  }, []);

  const fetchSequences = async () => {
    try {
      const res = await api.get('/api/admin/sequences');
      setSequences(res.data.sequences);
    } catch (err) {
      console.error('Failed to fetch sequences:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setSteps([{ ...EMPTY_STEP }]);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (seq: Sequence) => {
    setName(seq.name);
    setDescription(seq.description || '');
    setSteps(seq.steps.length > 0 ? seq.steps : [{ ...EMPTY_STEP }]);
    setEditingId(seq.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || steps.length === 0) return;

    const validSteps = steps.filter((s) => s.subject.trim() && s.body_template.trim());
    if (validSteps.length === 0) return;

    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/api/admin/sequences/${editingId}`, { name, description, steps: validSteps });
      } else {
        await api.post('/api/admin/sequences', { name, description, steps: validSteps });
      }
      resetForm();
      fetchSequences();
    } catch (err) {
      console.error('Failed to save sequence:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this sequence? Pending emails will be cancelled.')) return;
    try {
      await api.delete(`/api/admin/sequences/${id}`);
      fetchSequences();
    } catch (err) {
      console.error('Failed to delete sequence:', err);
    }
  };

  const handleToggleActive = async (seq: Sequence) => {
    try {
      await api.patch(`/api/admin/sequences/${seq.id}`, { is_active: !seq.is_active });
      fetchSequences();
    } catch (err) {
      console.error('Failed to toggle sequence:', err);
    }
  };

  const updateStep = (index: number, field: keyof SequenceStep, value: string | number) => {
    setSteps((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addStep = () => {
    const lastDelay = steps.length > 0 ? steps[steps.length - 1].delay_days : 0;
    setSteps([...steps, { delay_days: lastDelay + 3, subject: '', body_template: '' }]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== index));
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
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          Follow-Up Sequences
        </h1>
        {!showForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            Create Sequence
          </button>
        )}
      </div>

      <p className="text-muted small mb-4">
        Create automated email sequences to nurture leads. Use {'{{name}}'}, {'{{company}}'}, {'{{title}}'} as template variables.
      </p>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-bold py-3">
            {editingId ? 'Edit Sequence' : 'New Sequence'}
          </div>
          <div className="card-body">
            <div className="row mb-3">
              <div className="col-md-6">
                <label className="form-label small">Sequence Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Executive Overview Follow-Up"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small">Description (optional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description..."
                />
              </div>
            </div>

            <h6 className="fw-bold mb-3">Steps</h6>
            {steps.map((step, idx) => (
              <div key={idx} className="card bg-light mb-3">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="badge bg-primary">Step {idx + 1}</span>
                    {steps.length > 1 && (
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => removeStep(idx)}
                        style={{ fontSize: '0.75rem' }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="row mb-2">
                    <div className="col-md-3">
                      <label className="form-label small">Delay (days)</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min={0}
                        value={step.delay_days}
                        onChange={(e) => updateStep(idx, 'delay_days', parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                    <div className="col-md-9">
                      <label className="form-label small">Subject Line</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={step.subject}
                        onChange={(e) => updateStep(idx, 'subject', e.target.value)}
                        placeholder="Email subject..."
                      />
                    </div>
                  </div>
                  <div>
                    <label className="form-label small">Email Body (HTML supported)</label>
                    <textarea
                      className="form-control form-control-sm"
                      rows={4}
                      value={step.body_template}
                      onChange={(e) => updateStep(idx, 'body_template', e.target.value)}
                      placeholder="<p>Dear {{name}},</p>..."
                    />
                  </div>
                </div>
              </div>
            ))}

            <button className="btn btn-outline-primary btn-sm mb-3" onClick={addStep}>
              + Add Step
            </button>

            <div className="d-flex gap-2">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update Sequence' : 'Create Sequence'}
              </button>
              <button className="btn btn-secondary" onClick={resetForm}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Sequences List */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-bold py-3">
          Sequences ({sequences.length})
        </div>
        <div className="card-body p-0">
          {sequences.length === 0 ? (
            <div className="text-center text-muted py-4">
              No sequences created yet
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Steps</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sequences.map((seq) => (
                    <tr key={seq.id}>
                      <td>
                        <div className="fw-medium">{seq.name}</div>
                        {seq.description && <div className="text-muted small">{seq.description}</div>}
                      </td>
                      <td>
                        <span className="badge bg-light text-dark">{seq.steps.length} steps</span>
                        <div className="text-muted small">
                          {seq.steps.map((s) => `Day ${s.delay_days}`).join(', ')}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${seq.is_active ? 'bg-success' : 'bg-secondary'}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleToggleActive(seq)}
                        >
                          {seq.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="text-muted small">
                        {new Date(seq.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <button
                            className="btn btn-outline-primary btn-sm"
                            onClick={() => handleEdit(seq)}
                            style={{ fontSize: '0.75rem' }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => handleDelete(seq.id)}
                            style={{ fontSize: '0.75rem' }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminSequencesPage;
