import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

type CampaignChannel = 'email' | 'voice' | 'sms';

interface SequenceStep {
  delay_days: number;
  channel: CampaignChannel;
  subject: string;
  body_template: string;
  voice_agent_type?: 'welcome' | 'interest';
  sms_template?: string;
  max_attempts?: number;
  fallback_channel?: CampaignChannel | null;
  step_goal?: string;
}

interface Sequence {
  id: string;
  name: string;
  description: string;
  steps: SequenceStep[];
  is_active: boolean;
  created_at: string;
}

const EMPTY_STEP: SequenceStep = {
  delay_days: 1,
  channel: 'email',
  subject: '',
  body_template: '',
  max_attempts: 1,
  fallback_channel: null,
};

const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  email: 'Email',
  voice: 'Voice Call',
  sms: 'SMS',
};

const CHANNEL_COLORS: Record<CampaignChannel, string> = {
  email: '#0d6efd',
  voice: '#198754',
  sms: '#6f42c1',
};

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
    const normalized = seq.steps.map((s) => ({
      ...EMPTY_STEP,
      ...s,
      channel: (s.channel || 'email') as CampaignChannel,
    }));
    setSteps(normalized.length > 0 ? normalized : [{ ...EMPTY_STEP }]);
    setEditingId(seq.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || steps.length === 0) return;

    const validSteps = steps.filter((s) => {
      if (s.channel === 'email') return s.subject.trim() && s.body_template.trim();
      if (s.channel === 'voice') return s.subject.trim();
      if (s.channel === 'sms') return s.subject.trim() && (s.sms_template?.trim() || s.body_template.trim());
      return false;
    });
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
    if (!window.confirm('Delete this sequence? Pending actions will be cancelled.')) return;
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

  const updateStep = (index: number, field: string, value: any) => {
    setSteps((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      if (field === 'channel') {
        const ch = value as CampaignChannel;
        updated[index].max_attempts = ch === 'voice' ? 2 : 1;
        if (ch === 'voice') {
          updated[index].voice_agent_type = updated[index].voice_agent_type || 'interest';
          updated[index].fallback_channel = updated[index].fallback_channel || 'email';
        }
        if (ch !== 'voice') {
          updated[index].voice_agent_type = undefined;
        }
        if (ch === 'sms' && !updated[index].sms_template) {
          updated[index].sms_template = '';
        }
      }

      return updated;
    });
  };

  const addStep = () => {
    const lastDelay = steps.length > 0 ? steps[steps.length - 1].delay_days : 0;
    setSteps([...steps, { ...EMPTY_STEP, delay_days: lastDelay + 3 }]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const updated = [...prev];
      [updated[index], updated[target]] = [updated[target], updated[index]];
      return updated;
    });
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
        <div>
          <h1 className="h3 fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
            Campaign Sequences
          </h1>
          <p className="text-muted small mb-0">
            Multi-channel automated sequences: email, voice (Synthflow), and SMS per step
          </p>
        </div>
        {!showForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            Create Sequence
          </button>
        )}
      </div>

      <p className="text-muted small mb-4">
        Template variables: {'{{name}}'}, {'{{company}}'}, {'{{title}}'}, {'{{email}}'}, {'{{phone}}'}
      </p>

      {showForm && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-bold py-3">
            {editingId ? 'Edit Sequence' : 'New Multi-Channel Sequence'}
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
                  placeholder="e.g. Executive Lead Nurture Campaign"
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

            <h6 className="fw-bold mb-3">Campaign Steps</h6>
            {steps.map((step, idx) => (
              <div
                key={idx}
                className="card mb-3"
                style={{ borderLeft: `4px solid ${CHANNEL_COLORS[step.channel || 'email']}` }}
              >
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div className="d-flex align-items-center gap-2">
                      <span
                        className="badge"
                        style={{ backgroundColor: CHANNEL_COLORS[step.channel || 'email'] }}
                      >
                        Step {idx + 1}: {CHANNEL_LABELS[step.channel || 'email']}
                      </span>
                      {step.fallback_channel && (
                        <span className="badge bg-warning text-dark" style={{ fontSize: '0.7rem' }}>
                          Fallback: {CHANNEL_LABELS[step.fallback_channel]}
                        </span>
                      )}
                    </div>
                    <div className="d-flex gap-1">
                      {idx > 0 && (
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => moveStep(idx, 'up')}
                          style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                          title="Move up"
                        >
                          ^
                        </button>
                      )}
                      {idx < steps.length - 1 && (
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => moveStep(idx, 'down')}
                          style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                          title="Move down"
                        >
                          v
                        </button>
                      )}
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
                  </div>

                  <div className="row mb-2">
                    <div className="col-md-3">
                      <label className="form-label small fw-semibold">Channel</label>
                      <select
                        className="form-select form-select-sm"
                        value={step.channel || 'email'}
                        onChange={(e) => updateStep(idx, 'channel', e.target.value)}
                      >
                        <option value="email">Email</option>
                        <option value="voice">Voice Call</option>
                        <option value="sms">SMS</option>
                      </select>
                    </div>
                    <div className="col-md-2">
                      <label className="form-label small">Delay (days)</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min={0}
                        value={step.delay_days}
                        onChange={(e) => updateStep(idx, 'delay_days', parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label small">Max Attempts</label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min={1}
                        max={5}
                        value={step.max_attempts || 1}
                        onChange={(e) => updateStep(idx, 'max_attempts', parseInt(e.target.value, 10) || 1)}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label small">Fallback Channel</label>
                      <select
                        className="form-select form-select-sm"
                        value={step.fallback_channel || ''}
                        onChange={(e) => updateStep(idx, 'fallback_channel', e.target.value || null)}
                      >
                        <option value="">None</option>
                        {step.channel !== 'email' && <option value="email">Email</option>}
                        {step.channel !== 'voice' && <option value="voice">Voice Call</option>}
                        {step.channel !== 'sms' && <option value="sms">SMS</option>}
                      </select>
                    </div>
                    {step.channel === 'voice' && (
                      <div className="col-md-2">
                        <label className="form-label small">Agent Type</label>
                        <select
                          className="form-select form-select-sm"
                          value={step.voice_agent_type || 'interest'}
                          onChange={(e) => updateStep(idx, 'voice_agent_type', e.target.value)}
                        >
                          <option value="welcome">Welcome</option>
                          <option value="interest">Interest</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="mb-2">
                    <label className="form-label small">Step Goal (optional)</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={step.step_goal || ''}
                      onChange={(e) => updateStep(idx, 'step_goal', e.target.value)}
                      placeholder="e.g. Identify pain points and book a strategy call"
                    />
                  </div>

                  <div className="mb-2">
                    <label className="form-label small">
                      {step.channel === 'voice' ? 'Call Label / Subject' : 'Subject Line'}
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={step.subject}
                      onChange={(e) => updateStep(idx, 'subject', e.target.value)}
                      placeholder={
                        step.channel === 'voice'
                          ? 'e.g. Intro call — identify pain, book meeting'
                          : step.channel === 'sms'
                          ? 'e.g. SMS follow-up after enrollment info'
                          : 'Email subject...'
                      }
                    />
                  </div>

                  {(step.channel === 'email' || !step.channel) && (
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
                  )}

                  {step.channel === 'voice' && (
                    <div>
                      <label className="form-label small">Voice Script / Notes (for reference)</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={3}
                        value={step.body_template}
                        onChange={(e) => updateStep(idx, 'body_template', e.target.value)}
                        placeholder="Hi {{name}}, this is Alex from Colaberry. I'm reaching out because..."
                      />
                      <div className="form-text">
                        The Synthflow AI agent handles the actual conversation. This script is for reference and activity logging.
                      </div>
                    </div>
                  )}

                  {step.channel === 'sms' && (
                    <div>
                      <label className="form-label small">SMS Message (max 160 chars recommended)</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={2}
                        value={step.sms_template || step.body_template}
                        onChange={(e) => {
                          updateStep(idx, 'sms_template', e.target.value);
                          updateStep(idx, 'body_template', e.target.value);
                        }}
                        placeholder="Hi {{name}}, thanks for your interest in the AI Leadership Accelerator. Reply YES for more info."
                        maxLength={320}
                      />
                      <div className="form-text">
                        {(step.sms_template || step.body_template || '').length}/160 characters
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="d-flex gap-2 mb-3">
              <button className="btn btn-outline-primary btn-sm" onClick={addStep}>
                + Add Email Step
              </button>
              <button
                className="btn btn-outline-success btn-sm"
                onClick={() => {
                  const lastDelay = steps.length > 0 ? steps[steps.length - 1].delay_days : 0;
                  setSteps([
                    ...steps,
                    {
                      ...EMPTY_STEP,
                      delay_days: lastDelay + 3,
                      channel: 'voice',
                      voice_agent_type: 'interest',
                      max_attempts: 2,
                      fallback_channel: 'email',
                    },
                  ]);
                }}
              >
                + Add Voice Step
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  const lastDelay = steps.length > 0 ? steps[steps.length - 1].delay_days : 0;
                  setSteps([
                    ...steps,
                    {
                      ...EMPTY_STEP,
                      delay_days: lastDelay + 2,
                      channel: 'sms',
                      sms_template: '',
                    },
                  ]);
                }}
              >
                + Add SMS Step
              </button>
            </div>

            <div className="d-flex gap-2">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update Sequence' : 'Create Sequence'}
              </button>
              <button className="btn btn-secondary" onClick={resetForm}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
                    <th>Channels</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sequences.map((seq) => {
                    const channels = [...new Set(seq.steps.map((s) => s.channel || 'email'))];
                    return (
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
                          <div className="d-flex gap-1 flex-wrap">
                            {channels.map((ch) => (
                              <span
                                key={ch}
                                className="badge"
                                style={{
                                  backgroundColor: CHANNEL_COLORS[ch as CampaignChannel] || '#6c757d',
                                  fontSize: '0.7rem',
                                }}
                              >
                                {CHANNEL_LABELS[ch as CampaignChannel] || ch}
                              </span>
                            ))}
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
                    );
                  })}
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
