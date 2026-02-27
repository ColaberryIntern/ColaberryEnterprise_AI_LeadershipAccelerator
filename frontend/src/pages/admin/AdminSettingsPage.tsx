import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';

function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/api/admin/settings');
      setSettings(res.data.settings);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.patch('/api/admin/settings', settings);
      setSettings(res.data.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
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
    <>
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Settings' }]} />
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          System Settings
        </h1>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {saved && (
        <div className="alert alert-success py-2 small">Settings saved successfully.</div>
      )}

      {/* Lead Scoring */}
      <div className="card admin-table-card mb-4" style={{ borderLeft: '4px solid #3182ce' }}>
        <div className="card-header fw-bold py-3">Lead Scoring</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label small">High Intent Threshold</label>
              <input
                type="number"
                className="form-control"
                value={settings.high_intent_threshold ?? 60}
                onChange={(e) => handleChange('high_intent_threshold', parseInt(e.target.value, 10) || 0)}
                min={0}
                max={200}
              />
              <div className="form-text">Score above which a lead is considered high-intent</div>
            </div>
            <div className="col-md-4">
              <label className="form-label small">Price Per Enrollment ($)</label>
              <input
                type="number"
                className="form-control"
                value={settings.price_per_enrollment ?? 4500}
                onChange={(e) => handleChange('price_per_enrollment', parseInt(e.target.value, 10) || 0)}
                min={0}
              />
              <div className="form-text">Used for revenue forecasting</div>
            </div>
          </div>
        </div>
      </div>

      {/* Automation Toggles */}
      <div className="card admin-table-card mb-4" style={{ borderLeft: '4px solid #38a169' }}>
        <div className="card-header fw-bold py-3">Automation</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={settings.follow_up_enabled ?? true}
                  onChange={(e) => handleChange('follow_up_enabled', e.target.checked)}
                  id="followUpEnabled"
                />
                <label className="form-check-label" htmlFor="followUpEnabled">
                  Enable Follow-Up Sequences
                </label>
              </div>
            </div>
            <div className="col-md-4">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={settings.enable_auto_email ?? true}
                  onChange={(e) => handleChange('enable_auto_email', e.target.checked)}
                  id="autoEmailEnabled"
                />
                <label className="form-check-label" htmlFor="autoEmailEnabled">
                  Auto Email on Lead Capture
                </label>
              </div>
            </div>
            <div className="col-md-4">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={settings.enable_voice_calls ?? false}
                  onChange={(e) => handleChange('enable_voice_calls', e.target.checked)}
                  id="voiceCallsEnabled"
                />
                <label className="form-check-label" htmlFor="voiceCallsEnabled">
                  Enable Voice Calls
                </label>
              </div>
            </div>
          </div>
          <div className="row g-3 mt-2">
            <div className="col-md-4">
              <label className="form-label small">Sequence Send Hour (24h)</label>
              <input
                type="number"
                className="form-control"
                value={settings.sequence_send_hour ?? 9}
                onChange={(e) => handleChange('sequence_send_hour', parseInt(e.target.value, 10) || 0)}
                min={0}
                max={23}
              />
              <div className="form-text">Hour of day to send scheduled sequence emails</div>
            </div>
            <div className="col-md-4">
              <label className="form-label small">Max Daily Emails</label>
              <input
                type="number"
                className="form-control"
                value={settings.max_daily_emails ?? 50}
                onChange={(e) => handleChange('max_daily_emails', parseInt(e.target.value, 10) || 0)}
                min={1}
                max={500}
              />
              <div className="form-text">Maximum emails sent per day via scheduler</div>
            </div>
          </div>
        </div>
      </div>

      {/* Email (SMTP / Mandrill) */}
      <div className="card admin-table-card mb-4" style={{ borderLeft: '4px solid #805ad5' }}>
        <div className="card-header fw-bold py-3">
          Email Configuration (SMTP / Mandrill)
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label small">SMTP Host</label>
              <input
                type="text"
                className="form-control"
                value={settings.smtp_host ?? 'smtp.mandrillapp.com'}
                onChange={(e) => handleChange('smtp_host', e.target.value)}
                placeholder="smtp.mandrillapp.com"
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small">SMTP Port</label>
              <input
                type="number"
                className="form-control"
                value={settings.smtp_port ?? 587}
                onChange={(e) => handleChange('smtp_port', parseInt(e.target.value, 10) || 587)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small">SMTP User</label>
              <input
                type="text"
                className="form-control"
                value={settings.smtp_user ?? ''}
                onChange={(e) => handleChange('smtp_user', e.target.value)}
                placeholder="username"
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small">SMTP Password / API Key</label>
              <input
                type="password"
                className="form-control"
                value={settings.smtp_pass ?? ''}
                onChange={(e) => handleChange('smtp_pass', e.target.value)}
                placeholder="API key or password"
              />
            </div>
          </div>
          <div className="row g-3 mt-2">
            <div className="col-md-4">
              <label className="form-label small">From Email</label>
              <input
                type="email"
                className="form-control"
                value={settings.email_from ?? 'ali@colaberry.com'}
                onChange={(e) => handleChange('email_from', e.target.value)}
                placeholder="ali@colaberry.com"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small">From Name</label>
              <input
                type="text"
                className="form-control"
                value={settings.email_from_name ?? 'Colaberry Enterprise AI'}
                onChange={(e) => handleChange('email_from_name', e.target.value)}
                placeholder="Colaberry Enterprise AI"
              />
            </div>
          </div>
          <div className="form-text mt-2">
            Currently using Mandrill (Mailchimp Transactional). SMTP credentials are also set via environment variables (.env) — values here override env vars when configured.
          </div>
        </div>
      </div>

      {/* Voice (Synthflow) */}
      <div className="card admin-table-card mb-4" style={{ borderLeft: '4px solid #dd6b20' }}>
        <div className="card-header fw-bold py-3">
          Voice Configuration (Synthflow AI)
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label small">Synthflow API Key</label>
              <input
                type="password"
                className="form-control"
                value={settings.synthflow_api_key ?? ''}
                onChange={(e) => handleChange('synthflow_api_key', e.target.value)}
                placeholder="sf_..."
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small">Welcome Agent ID</label>
              <input
                type="text"
                className="form-control"
                value={settings.synthflow_welcome_agent_id ?? ''}
                onChange={(e) => handleChange('synthflow_welcome_agent_id', e.target.value)}
                placeholder="Agent ID for intro/welcome calls"
              />
              <div className="form-text">Used for Day 0 intro calls</div>
            </div>
            <div className="col-md-4">
              <label className="form-label small">Interest Agent ID</label>
              <input
                type="text"
                className="form-control"
                value={settings.synthflow_interest_agent_id ?? ''}
                onChange={(e) => handleChange('synthflow_interest_agent_id', e.target.value)}
                placeholder="Agent ID for follow-up calls"
              />
              <div className="form-text">Used for follow-up / interest calls</div>
            </div>
          </div>
          <div className="form-text mt-2">
            Voice calls use dynamic prompts — the AI agent receives lead context, conversation history, and next cohort info at call time. Configure agents in the Synthflow dashboard.
          </div>
        </div>
      </div>

      {/* AI Configuration */}
      <div className="card admin-table-card mb-4" style={{ borderLeft: '4px solid #dc3545' }}>
        <div className="card-header fw-bold py-3">
          AI Configuration (OpenAI)
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label small">AI Model</label>
              <select
                className="form-select"
                value={settings.ai_model ?? 'gpt-4o-mini'}
                onChange={(e) => handleChange('ai_model', e.target.value)}
              >
                <option value="gpt-4o-mini">GPT-4o Mini (fast, cost-effective)</option>
                <option value="gpt-4o">GPT-4o (higher quality)</option>
              </select>
              <div className="form-text">Model used for generating all outbound messages</div>
            </div>
            <div className="col-md-2">
              <label className="form-label small">Max Tokens</label>
              <input
                type="number"
                className="form-control"
                value={settings.ai_max_tokens ?? 1024}
                onChange={(e) => handleChange('ai_max_tokens', parseInt(e.target.value, 10) || 1024)}
                min={256}
                max={4096}
              />
            </div>
          </div>
          <div className="row g-3 mt-2">
            <div className="col-12">
              <label className="form-label small">Default AI System Prompt (Campaign Persona)</label>
              <textarea
                className="form-control"
                rows={4}
                value={settings.ai_system_prompt_default ?? ''}
                onChange={(e) => handleChange('ai_system_prompt_default', e.target.value)}
                placeholder="Define the default AI persona for all campaigns. Individual campaigns can override this."
              />
              <div className="form-text">
                This system prompt defines the AI's personality, brand voice, and communication style across all campaigns. Individual campaigns can override with their own system prompt.
              </div>
            </div>
          </div>
          <div className="form-text mt-2">
            The OpenAI API key is set via environment variable (OPENAI_API_KEY). All outbound messages (email, SMS, voice prompts) are generated by AI using step instructions + lead context.
          </div>
        </div>
      </div>

      {/* SMS */}
      <div className="card admin-table-card mb-4" style={{ borderLeft: '4px solid #0dcaf0' }}>
        <div className="card-header fw-bold py-3">
          SMS Configuration
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label small">SMS Provider</label>
              <select
                className="form-select"
                value={settings.sms_provider ?? 'none'}
                onChange={(e) => handleChange('sms_provider', e.target.value)}
              >
                <option value="none">None (disabled)</option>
                <option value="twilio">Twilio</option>
                <option value="synthflow">Synthflow SMS</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label small">From Number</label>
              <input
                type="text"
                className="form-control"
                value={settings.sms_from_number ?? ''}
                onChange={(e) => handleChange('sms_from_number', e.target.value)}
                placeholder="+1234567890"
                disabled={settings.sms_provider === 'none'}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small">SMS API Key</label>
              <input
                type="password"
                className="form-control"
                value={settings.sms_api_key ?? ''}
                onChange={(e) => handleChange('sms_api_key', e.target.value)}
                placeholder="API key for SMS provider"
                disabled={settings.sms_provider === 'none'}
              />
            </div>
          </div>
          <div className="form-text mt-2">
            SMS is currently a placeholder. Configure a provider (Twilio, etc.) to enable outbound SMS in campaign sequences.
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminSettingsPage;
