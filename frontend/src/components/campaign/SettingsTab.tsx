import React, { useState, useEffect } from 'react';

interface CampaignSettings {
  test_mode_enabled: boolean;
  test_email: string;
  test_phone: string;
  delay_between_sends: number;
  max_leads_per_cycle: number;
  agent_name: string;
  agent_greeting: string;
  call_time_start: string;
  call_time_end: string;
  call_timezone: string;
  call_active_days: number[];
  max_call_duration: number;
  max_daily_calls: number;
  auto_dnc_on_request: boolean;
  voicemail_enabled: boolean;
  pass_prior_conversations: boolean;
  auto_reply_enabled: boolean;
}

const DEFAULT_SETTINGS: CampaignSettings = {
  test_mode_enabled: false,
  test_email: '',
  test_phone: '',
  delay_between_sends: 120,
  max_leads_per_cycle: 10,
  agent_name: 'Colaberry AI',
  agent_greeting: 'Hi {first_name}, this is {agent_name} calling from Colaberry.',
  call_time_start: '09:00',
  call_time_end: '17:00',
  call_timezone: 'America/Chicago',
  call_active_days: [1, 2, 3, 4, 5],
  max_call_duration: 300,
  max_daily_calls: 50,
  auto_dnc_on_request: true,
  voicemail_enabled: true,
  pass_prior_conversations: true,
  auto_reply_enabled: false,
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'UTC',
];

interface Props {
  campaignId: string;
  headers: Record<string, string>;
}

export default function SettingsTab({ campaignId, headers }: Props) {
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [campaignId]);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/settings`, { headers });
      const data = await res.json();
      setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/admin/campaigns/${campaignId}/settings`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ settings }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof CampaignSettings>(key: K, value: CampaignSettings[K]) => {
    setSettings({ ...settings, [key]: value });
  };

  const toggleDay = (day: number) => {
    const days = settings.call_active_days.includes(day)
      ? settings.call_active_days.filter((d) => d !== day)
      : [...settings.call_active_days, day].sort();
    updateSetting('call_active_days', days);
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
      {/* Test Mode */}
      <div className={`card border-0 shadow-sm mb-4 ${settings.test_mode_enabled ? 'border-danger border-2' : ''}`}>
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Test Mode</span>
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              checked={settings.test_mode_enabled}
              onChange={(e) => updateSetting('test_mode_enabled', e.target.checked)}
            />
          </div>
        </div>
        <div className="card-body">
          {settings.test_mode_enabled && (
            <div className="alert alert-danger py-2 mb-3">
              <small className="fw-medium">Test mode is enabled. All voice calls and emails will be sent to test destinations instead of real leads.</small>
            </div>
          )}
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-medium">Test Email Address</label>
              <input
                type="email"
                className="form-control form-control-sm"
                value={settings.test_email}
                onChange={(e) => updateSetting('test_email', e.target.value)}
                placeholder="test@company.com"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Test Phone Number</label>
              <input
                type="tel"
                className="form-control form-control-sm"
                value={settings.test_phone}
                onChange={(e) => updateSetting('test_phone', e.target.value)}
                placeholder="+1234567890"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Execution Pacing */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Execution Pacing</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-medium">Delay Between Sends (seconds)</label>
              <input
                type="number"
                className="form-control form-control-sm"
                value={settings.delay_between_sends}
                onChange={(e) => updateSetting('delay_between_sends', parseInt(e.target.value) || 0)}
                min={0}
              />
              <div className="form-text">Time to wait between sending messages to different leads.</div>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Max Leads Per Cycle</label>
              <input
                type="number"
                className="form-control form-control-sm"
                value={settings.max_leads_per_cycle}
                onChange={(e) => updateSetting('max_leads_per_cycle', parseInt(e.target.value) || 1)}
                min={1}
              />
              <div className="form-text">Maximum number of leads to process per scheduler cycle.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Identity */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Agent Identity</div>
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label small fw-medium">Agent Name</label>
            <input
              className="form-control form-control-sm"
              value={settings.agent_name}
              onChange={(e) => updateSetting('agent_name', e.target.value)}
            />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-medium">Agent Greeting</label>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              value={settings.agent_greeting}
              onChange={(e) => updateSetting('agent_greeting', e.target.value)}
            />
            <div className="form-text">
              Available variables: {'{first_name}'}, {'{agent_name}'}, {'{company_name}'}
            </div>
          </div>
        </div>
      </div>

      {/* Call Schedule */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Call Schedule</div>
        <div className="card-body">
          <div className="row g-3 mb-3">
            <div className="col-md-4">
              <label className="form-label small fw-medium">Call Time Start</label>
              <input
                type="time"
                className="form-control form-control-sm"
                value={settings.call_time_start}
                onChange={(e) => updateSetting('call_time_start', e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium">Call Time End</label>
              <input
                type="time"
                className="form-control form-control-sm"
                value={settings.call_time_end}
                onChange={(e) => updateSetting('call_time_end', e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium">Timezone</label>
              <select
                className="form-select form-select-sm"
                value={settings.call_timezone}
                onChange={(e) => updateSetting('call_timezone', e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label small fw-medium mb-2">Active Days</label>
            <div className="d-flex gap-2">
              {DAYS.map((day, i) => (
                <button
                  key={i}
                  className={`btn btn-sm ${settings.call_active_days.includes(i) ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => toggleDay(i)}
                  style={{ minWidth: 44 }}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Call Limits */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Call Limits</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-medium">Max Call Duration (seconds)</label>
              <input
                type="number"
                className="form-control form-control-sm"
                value={settings.max_call_duration}
                onChange={(e) => updateSetting('max_call_duration', parseInt(e.target.value) || 60)}
                min={30}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Max Daily Calls</label>
              <input
                type="number"
                className="form-control form-control-sm"
                value={settings.max_daily_calls}
                onChange={(e) => updateSetting('max_daily_calls', parseInt(e.target.value) || 1)}
                min={1}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Behavior */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Behavior</div>
        <div className="card-body">
          <div className="d-flex flex-column gap-3">
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                checked={settings.auto_dnc_on_request}
                onChange={(e) => updateSetting('auto_dnc_on_request', e.target.checked)}
                id="sw-dnc"
              />
              <label className="form-check-label small" htmlFor="sw-dnc">
                <span className="fw-medium">Auto DNC on Request</span>
                <br />
                <span className="text-muted">Automatically remove leads who request unsubscription</span>
              </label>
            </div>
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                checked={settings.voicemail_enabled}
                onChange={(e) => updateSetting('voicemail_enabled', e.target.checked)}
                id="sw-vm"
              />
              <label className="form-check-label small" htmlFor="sw-vm">
                <span className="fw-medium">Voicemail Enabled</span>
                <br />
                <span className="text-muted">Allow leaving voicemails when calls go unanswered</span>
              </label>
            </div>
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                checked={settings.pass_prior_conversations}
                onChange={(e) => updateSetting('pass_prior_conversations', e.target.checked)}
                id="sw-prior"
              />
              <label className="form-check-label small" htmlFor="sw-prior">
                <span className="fw-medium">Pass Prior Conversations</span>
                <br />
                <span className="text-muted">Include conversation history in AI context for personalization</span>
              </label>
            </div>
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                checked={settings.auto_reply_enabled}
                onChange={(e) => updateSetting('auto_reply_enabled', e.target.checked)}
                id="sw-reply"
              />
              <label className="form-check-label small" htmlFor="sw-reply">
                <span className="fw-medium">Auto-Reply Enabled</span>
                <br />
                <span className="text-muted">Automatically respond to incoming replies using AI</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving Settings...' : saved ? 'Settings Saved!' : 'Save Settings'}
      </button>
    </>
  );
}
