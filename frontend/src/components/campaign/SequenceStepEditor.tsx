import React from 'react';

type CampaignChannel = 'email' | 'voice' | 'sms';

export interface SequenceStep {
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

export const EMPTY_STEP: SequenceStep = {
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

interface Props {
  steps: SequenceStep[];
  onChange: (steps: SequenceStep[]) => void;
  disabled?: boolean;
}

export default function SequenceStepEditor({ steps, onChange, disabled }: Props) {
  const updateStep = (index: number, field: string, value: any) => {
    const updated = [...steps];
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

    onChange(updated);
  };

  const addStep = (channel: CampaignChannel = 'email') => {
    const lastDelay = steps.length > 0 ? steps[steps.length - 1].delay_days : 0;
    const newStep: SequenceStep = {
      ...EMPTY_STEP,
      delay_days: lastDelay + (channel === 'sms' ? 2 : 3),
      channel,
      ...(channel === 'voice' ? { voice_agent_type: 'interest' as const, max_attempts: 2, fallback_channel: 'email' as CampaignChannel } : {}),
      ...(channel === 'sms' ? { sms_template: '' } : {}),
    };
    onChange([...steps, newStep]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    onChange(steps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= steps.length) return;
    const updated = [...steps];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    onChange(updated);
  };

  return (
    <>
      <p className="text-muted small mb-3">
        Template variables: {'{{name}}'}, {'{{company}}'}, {'{{title}}'}, {'{{email}}'}, {'{{phone}}'}
        <br />
        <span className="text-info">Voice extras:</span>{' '}
        {'{{cohort_name}}'}, {'{{cohort_start}}'}, {'{{seats_remaining}}'}, {'{{conversation_history}}'}
      </p>

      {steps.map((step, idx) => (
        <div
          key={idx}
          className="card mb-3"
          style={{ borderLeft: `4px solid ${CHANNEL_COLORS[step.channel || 'email']}`, opacity: disabled ? 0.6 : 1 }}
        >
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div className="d-flex align-items-center gap-2">
                <span className="badge" style={{ backgroundColor: CHANNEL_COLORS[step.channel || 'email'] }}>
                  Step {idx + 1}: {CHANNEL_LABELS[step.channel || 'email']}
                </span>
                {step.fallback_channel && (
                  <span className="badge bg-warning text-dark" style={{ fontSize: '0.7rem' }}>
                    Fallback: {CHANNEL_LABELS[step.fallback_channel]}
                  </span>
                )}
              </div>
              {!disabled && (
                <div className="d-flex gap-1">
                  {idx > 0 && (
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => moveStep(idx, 'up')} style={{ fontSize: '0.7rem', padding: '2px 6px' }} title="Move up">^</button>
                  )}
                  {idx < steps.length - 1 && (
                    <button className="btn btn-outline-secondary btn-sm" onClick={() => moveStep(idx, 'down')} style={{ fontSize: '0.7rem', padding: '2px 6px' }} title="Move down">v</button>
                  )}
                  {steps.length > 1 && (
                    <button className="btn btn-outline-danger btn-sm" onClick={() => removeStep(idx)} style={{ fontSize: '0.75rem' }}>Remove</button>
                  )}
                </div>
              )}
            </div>

            <div className="row mb-2">
              <div className="col-md-3">
                <label className="form-label small fw-semibold">Channel</label>
                <select className="form-select form-select-sm" value={step.channel || 'email'} onChange={(e) => updateStep(idx, 'channel', e.target.value)} disabled={disabled}>
                  <option value="email">Email</option>
                  <option value="voice">Voice Call</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label small">Delay (days)</label>
                <input type="number" className="form-control form-control-sm" min={0} value={step.delay_days} onChange={(e) => updateStep(idx, 'delay_days', parseInt(e.target.value, 10) || 0)} disabled={disabled} />
              </div>
              <div className="col-md-2">
                <label className="form-label small">Max Attempts</label>
                <input type="number" className="form-control form-control-sm" min={1} max={5} value={step.max_attempts || 1} onChange={(e) => updateStep(idx, 'max_attempts', parseInt(e.target.value, 10) || 1)} disabled={disabled} />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Fallback Channel</label>
                <select className="form-select form-select-sm" value={step.fallback_channel || ''} onChange={(e) => updateStep(idx, 'fallback_channel', e.target.value || null)} disabled={disabled}>
                  <option value="">None</option>
                  {step.channel !== 'email' && <option value="email">Email</option>}
                  {step.channel !== 'voice' && <option value="voice">Voice Call</option>}
                  {step.channel !== 'sms' && <option value="sms">SMS</option>}
                </select>
              </div>
              {step.channel === 'voice' && (
                <div className="col-md-2">
                  <label className="form-label small">Agent Type</label>
                  <select className="form-select form-select-sm" value={step.voice_agent_type || 'interest'} onChange={(e) => updateStep(idx, 'voice_agent_type', e.target.value)} disabled={disabled}>
                    <option value="welcome">Welcome</option>
                    <option value="interest">Interest</option>
                  </select>
                </div>
              )}
            </div>

            <div className="mb-2">
              <label className="form-label small">Step Goal (optional)</label>
              <input type="text" className="form-control form-control-sm" value={step.step_goal || ''} onChange={(e) => updateStep(idx, 'step_goal', e.target.value)} placeholder="e.g. Identify pain points and book a strategy call" disabled={disabled} />
            </div>

            <div className="mb-2">
              <label className="form-label small fw-semibold text-primary">AI Instructions</label>
              <textarea
                className="form-control form-control-sm"
                rows={3}
                value={step.ai_instructions || ''}
                onChange={(e) => updateStep(idx, 'ai_instructions', e.target.value)}
                disabled={disabled}
                placeholder={
                  step.channel === 'email'
                    ? 'Write a cold intro email. Identify AI pain points relevant to their industry...'
                    : step.channel === 'voice'
                    ? 'Call to follow up on previous email. Build rapport, identify their biggest AI challenge...'
                    : 'Send a brief SMS reminder about the AI Leadership Accelerator...'
                }
              />
            </div>

            <div className="row mb-2">
              <div className="col-md-6">
                <label className="form-label small">AI Tone</label>
                <select className="form-select form-select-sm" value={step.ai_tone || ''} onChange={(e) => updateStep(idx, 'ai_tone', e.target.value)} disabled={disabled}>
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
                <input type="text" className="form-control form-control-sm" value={step.ai_context_notes || ''} onChange={(e) => updateStep(idx, 'ai_context_notes', e.target.value)} placeholder="Extra context for this step" disabled={disabled} />
              </div>
            </div>

            {step.channel !== 'sms' && (
            <div className="mb-2">
              <label className="form-label small">
                {step.channel === 'voice' ? 'Call Label / Subject' : 'Subject Line'}
              </label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={step.subject}
                onChange={(e) => updateStep(idx, 'subject', e.target.value)}
                disabled={disabled}
                placeholder={
                  step.channel === 'voice' ? 'e.g. Intro call — identify pain, book meeting'
                    : 'Email subject...'
                }
              />
            </div>
            )}

            {(step.channel === 'email' || !step.channel) && (
              <div>
                <label className="form-label small">Email Body Fallback (used if AI generation fails)</label>
                <textarea className="form-control form-control-sm" rows={3} value={step.body_template} onChange={(e) => updateStep(idx, 'body_template', e.target.value)} disabled={disabled} placeholder="<p>Dear {{name}},</p>..." />
              </div>
            )}

            {step.channel === 'voice' && (
              <>
                <div className="mb-2">
                  <label className="form-label small fw-semibold text-success">Voice Prompt (AI Instructions)</label>
                  <textarea className="form-control form-control-sm" rows={4} value={step.voice_prompt || ''} onChange={(e) => updateStep(idx, 'voice_prompt', e.target.value)} disabled={disabled} placeholder={`You are calling {{name}} from {{company}}...`} />
                </div>
                <div>
                  <label className="form-label small">Internal Notes</label>
                  <textarea className="form-control form-control-sm" rows={2} value={step.body_template} onChange={(e) => updateStep(idx, 'body_template', e.target.value)} disabled={disabled} placeholder="Internal notes for this call step" />
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
                  disabled={disabled}
                  placeholder="Hi {{name}}, thanks for your interest..."
                  maxLength={320}
                />
                <div className="form-text">{(step.sms_template || step.body_template || '').length}/160 characters</div>
              </div>
            )}
          </div>
        </div>
      ))}

      {!disabled && (
        <div className="d-flex gap-2 mb-3">
          <button className="btn btn-outline-primary btn-sm" onClick={() => addStep('email')}>+ Add Email Step</button>
          <button className="btn btn-outline-success btn-sm" onClick={() => addStep('voice')}>+ Add Voice Step</button>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => addStep('sms')}>+ Add SMS Step</button>
        </div>
      )}
    </>
  );
}
