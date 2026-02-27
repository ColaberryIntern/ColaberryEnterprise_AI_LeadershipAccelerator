import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useToast } from '../../components/ui/ToastProvider';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Breadcrumb from '../../components/ui/Breadcrumb';

type CampaignChannel = 'email' | 'voice' | 'sms';

interface SequenceStep {
  delay_days: number;
  channel: CampaignChannel;
  subject: string;
  body_template: string;
  voice_agent_type?: 'welcome' | 'interest';
  voice_prompt?: string;
  sms_template?: string;
  max_attempts?: number;
  fallback_channel?: CampaignChannel | null;
  step_goal?: string;
  ai_instructions?: string;
  ai_tone?: string;
  ai_context_notes?: string;
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
  const { showToast } = useToast();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<SequenceStep[]>([{ ...EMPTY_STEP }]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    fetchSequences();
  }, []);

  const fetchSequences = async () => {
    try {
      const res = await api.get('/api/admin/sequences');
      setSequences(res.data.sequences);
    } catch (err) {
      showToast('Failed to load sequences.', 'error');
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
      const hasAI = !!s.ai_instructions?.trim();
      if (s.channel === 'email') return s.subject.trim() && (hasAI || s.body_template.trim());
      if (s.channel === 'voice') return s.subject.trim() && (hasAI || s.voice_prompt?.trim());
      if (s.channel === 'sms') return s.subject.trim() && (hasAI || s.sms_template?.trim() || s.body_template.trim());
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
      showToast(editingId ? 'Sequence updated.' : 'Sequence created.', 'success');
      resetForm();
      fetchSequences();
    } catch (err) {
      showToast('Failed to save sequence.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/admin/sequences/${id}`);
      showToast('Sequence deleted.', 'success');
      fetchSequences();
    } catch (err) {
      showToast('Failed to delete sequence.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleToggleActive = async (seq: Sequence) => {
    try {
      await api.patch(`/api/admin/sequences/${seq.id}`, { is_active: !seq.is_active });
      fetchSequences();
    } catch (err) {
      showToast('Failed to toggle sequence status.', 'error');
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
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Sequences' }]} />
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
        <br />
        <span className="text-info">Voice prompt extras:</span>{' '}
        {'{{cohort_name}}'}, {'{{cohort_start}}'}, {'{{seats_remaining}}'}, {'{{conversation_history}}'}
      </p>

      {showForm && (
        <div className="card admin-table-card mb-4">
          <div className="card-header fw-bold py-3">
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
                    <label className="form-label small fw-semibold text-primary">
                      AI Instructions (what should the AI achieve in this step?)
                    </label>
                    <textarea
                      className="form-control form-control-sm"
                      rows={3}
                      value={step.ai_instructions || ''}
                      onChange={(e) => updateStep(idx, 'ai_instructions', e.target.value)}
                      placeholder={
                        step.channel === 'email'
                          ? 'Write a cold intro email. Identify AI pain points relevant to their industry. Mention the 5-day accelerator. Ask which challenge resonates most.'
                          : step.channel === 'voice'
                          ? 'Call to follow up on previous email. Build rapport, identify their biggest AI challenge, and book a 15-minute strategy call.'
                          : 'Send a brief SMS reminder about the AI Leadership Accelerator. Include a link to schedule a call.'
                      }
                    />
                    <div className="form-text">
                      The AI generates the actual message content at send time using these instructions + lead context. This is the primary content source.
                    </div>
                  </div>

                  <div className="row mb-2">
                    <div className="col-md-6">
                      <label className="form-label small">AI Tone (optional)</label>
                      <select
                        className="form-select form-select-sm"
                        value={step.ai_tone || ''}
                        onChange={(e) => updateStep(idx, 'ai_tone', e.target.value)}
                      >
                        <option value="">Default (Professional)</option>
                        <option value="professional">Professional</option>
                        <option value="casual">Casual</option>
                        <option value="consultative">Consultative</option>
                        <option value="urgent">Urgent</option>
                        <option value="friendly">Friendly</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small">AI Context Notes (optional)</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={step.ai_context_notes || ''}
                        onChange={(e) => updateStep(idx, 'ai_context_notes', e.target.value)}
                        placeholder="Extra context for this step"
                      />
                    </div>
                  </div>

                  <div className="mb-2">
                    <label className="form-label small">
                      {step.channel === 'voice' ? 'Call Label / Subject' : 'Subject Line (fallback)'}
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
                      <label className="form-label small">Email Body Fallback (used if AI generation fails)</label>
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
                    <>
                      <div className="mb-2">
                        <label className="form-label small fw-semibold text-success">
                          Voice Prompt (AI Instructions)
                        </label>
                        <textarea
                          className="form-control form-control-sm"
                          rows={5}
                          value={step.voice_prompt || ''}
                          onChange={(e) => updateStep(idx, 'voice_prompt', e.target.value)}
                          placeholder={`You are calling {{name}} from {{company}}. They expressed interest in the AI Leadership Accelerator.\n\nContext:\n- Next cohort: {{cohort_name}} starting {{cohort_start}} ({{seats_remaining}} seats left)\n- Prior interactions: {{conversation_history}}\n\nYour goal: Identify their AI pain points and book a 15-minute strategy call.`}
                        />
                        <div className="form-text">
                          Dynamic AI instructions sent to the Synthflow agent at call time. Variables are
                          replaced with live data (lead profile, next cohort, conversation history).
                          This is <strong>not</strong> a script — the AI uses it as context to have a natural conversation.
                        </div>
                      </div>
                      <div>
                        <label className="form-label small">Internal Notes (for activity log)</label>
                        <textarea
                          className="form-control form-control-sm"
                          rows={2}
                          value={step.body_template}
                          onChange={(e) => updateStep(idx, 'body_template', e.target.value)}
                          placeholder="Internal notes for this call step (logged in activity timeline)"
                        />
                      </div>
                    </>
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

      <div className="card admin-table-card">
        <div className="card-header fw-bold py-3">
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
                            className={`badge rounded-pill ${seq.is_active ? 'bg-success' : 'bg-secondary'}`}
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
                              onClick={() => setDeleteTarget(seq.id)}
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

      <ConfirmModal
        show={!!deleteTarget}
        title="Delete Sequence"
        message="Delete this sequence? Pending actions will be cancelled."
        confirmLabel="Delete Sequence"
        confirmVariant="danger"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

export default AdminSequencesPage;
