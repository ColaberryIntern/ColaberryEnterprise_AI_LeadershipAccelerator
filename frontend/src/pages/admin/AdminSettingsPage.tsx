import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';
import { EventLedgerContent } from './AdminEventLedgerPage';

type TabKey = 'system' | 'revenue' | 'automation' | 'communication' | 'integrations' | 'ai' | 'audit';

interface TabDef {
  key: TabKey;
  label: string;
  badge?: (s: Record<string, any>) => { text: string; color: string } | null;
}

const TABS: TabDef[] = [
  {
    key: 'system',
    label: 'System Status',
    badge: (s) => s.test_mode_enabled ? { text: 'TEST MODE', color: 'warning' } : null,
  },
  { key: 'revenue', label: 'Revenue & Scoring' },
  { key: 'automation', label: 'Automation' },
  {
    key: 'communication',
    label: 'Communication',
    badge: (s) => s.digest_enabled ? { text: 'DIGEST ON', color: 'success' } : null,
  },
  {
    key: 'integrations',
    label: 'Integrations',
    badge: (s) => s.ghl_enabled ? { text: 'GHL ON', color: 'success' } : null,
  },
  { key: 'ai', label: 'AI Config' },
  { key: 'audit', label: 'Audit Log' },
];

type FieldProps = {
  settings: Record<string, any>;
  onChange: (key: string, value: any) => void;
};

function SystemStatusTab({ settings, onChange }: FieldProps) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white fw-semibold d-flex align-items-center gap-2">
        Test Mode
        {settings.test_mode_enabled && (
          <span className="badge bg-warning text-dark">ACTIVE</span>
        )}
      </div>
      <div className="card-body">
        {settings.test_mode_enabled && (
          <div className="alert alert-warning py-2 small mb-3">
            <strong>TEST MODE ACTIVE</strong> — All emails, SMS, and voice calls are being redirected to the test addresses below. No communications will reach real leads.
          </div>
        )}
        <div className="row g-3">
          <div className="col-md-4">
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                checked={settings.test_mode_enabled ?? false}
                onChange={(e) => onChange('test_mode_enabled', e.target.checked)}
                id="testModeEnabled"
              />
              <label className="form-check-label" htmlFor="testModeEnabled">
                Enable Global Test Mode
              </label>
            </div>
            <div className="form-text">
              When enabled, all system emails and calls redirect to test addresses
            </div>
          </div>
          <div className="col-md-4">
            <label className="form-label small">Test Email</label>
            <input
              type="email"
              className="form-control"
              value={settings.test_email ?? ''}
              onChange={(e) => onChange('test_email', e.target.value)}
              placeholder="test@example.com"
              disabled={!settings.test_mode_enabled}
            />
            <div className="form-text">All system emails will be redirected here</div>
          </div>
          <div className="col-md-4">
            <label className="form-label small">Test Phone</label>
            <input
              type="text"
              className="form-control"
              value={settings.test_phone ?? ''}
              onChange={(e) => onChange('test_phone', e.target.value)}
              placeholder="+1234567890"
              disabled={!settings.test_mode_enabled}
            />
            <div className="form-text">All SMS and voice calls will be redirected here</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RevenueScoringTab({ settings, onChange }: FieldProps) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white fw-semibold">Lead Scoring & Revenue</div>
      <div className="card-body">
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label small">High Intent Threshold</label>
            <input
              type="number"
              className="form-control"
              value={settings.high_intent_threshold ?? 60}
              onChange={(e) => onChange('high_intent_threshold', parseInt(e.target.value, 10) || 0)}
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
              onChange={(e) => onChange('price_per_enrollment', parseInt(e.target.value, 10) || 0)}
              min={0}
            />
            <div className="form-text">Used for revenue forecasting</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AutomationTab({ settings, onChange }: FieldProps) {
  return (
    <>
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Automation Toggles</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={settings.follow_up_enabled ?? true}
                  onChange={(e) => onChange('follow_up_enabled', e.target.checked)}
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
                  onChange={(e) => onChange('enable_auto_email', e.target.checked)}
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
                  onChange={(e) => onChange('enable_voice_calls', e.target.checked)}
                  id="voiceCallsEnabled"
                />
                <label className="form-check-label" htmlFor="voiceCallsEnabled">
                  Enable Voice Calls
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">Scheduling</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label small">Sequence Send Hour (24h)</label>
              <input
                type="number"
                className="form-control"
                value={settings.sequence_send_hour ?? 9}
                onChange={(e) => onChange('sequence_send_hour', parseInt(e.target.value, 10) || 0)}
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
                onChange={(e) => onChange('max_daily_emails', parseInt(e.target.value, 10) || 0)}
                min={1}
                max={500}
              />
              <div className="form-text">Maximum emails sent per day via scheduler</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function CommunicationTab({ settings, onChange, saving, setSaving }: FieldProps & { saving: boolean; setSaving: (v: boolean) => void }) {
  return (
    <>
      {/* Email / SMTP */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Email Configuration (SMTP / Mandrill)</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label small">SMTP Host</label>
              <input
                type="text"
                className="form-control"
                value={settings.smtp_host ?? 'smtp.mandrillapp.com'}
                onChange={(e) => onChange('smtp_host', e.target.value)}
                placeholder="smtp.mandrillapp.com"
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small">SMTP Port</label>
              <input
                type="number"
                className="form-control"
                value={settings.smtp_port ?? 587}
                onChange={(e) => onChange('smtp_port', parseInt(e.target.value, 10) || 587)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small">SMTP User</label>
              <input
                type="text"
                className="form-control"
                value={settings.smtp_user ?? ''}
                onChange={(e) => onChange('smtp_user', e.target.value)}
                placeholder="username"
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small">SMTP Password / API Key</label>
              <input
                type="password"
                className="form-control"
                value={settings.smtp_pass ?? ''}
                onChange={(e) => onChange('smtp_pass', e.target.value)}
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
                onChange={(e) => onChange('email_from', e.target.value)}
                placeholder="ali@colaberry.com"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small">From Name</label>
              <input
                type="text"
                className="form-control"
                value={settings.email_from_name ?? 'Colaberry Enterprise AI'}
                onChange={(e) => onChange('email_from_name', e.target.value)}
                placeholder="Colaberry Enterprise AI"
              />
            </div>
          </div>
          <div className="row g-3 mt-2">
            <div className="col-md-8">
              <label className="form-label small">Admin Notification Emails</label>
              <input
                type="text"
                className="form-control"
                value={settings.admin_notification_emails ?? ''}
                onChange={(e) => onChange('admin_notification_emails', e.target.value)}
                placeholder="ali@colaberry.com, team@colaberry.com"
              />
              <div className="form-text">
                Comma-separated list of emails that receive high-intent alerts and strategy call intelligence briefs. Falls back to From Email if empty.
              </div>
            </div>
          </div>
          <div className="form-text mt-2">
            Currently using Mandrill (Mailchimp Transactional). SMTP credentials are also set via environment variables (.env) — values here override env vars when configured.
          </div>
        </div>
      </div>

      {/* Email Digest */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold d-flex align-items-center gap-2">
          Email Digest
          {settings.digest_enabled && <span className="badge bg-success">ENABLED</span>}
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={settings.digest_enabled ?? false}
                  onChange={(e) => onChange('digest_enabled', e.target.checked)}
                  id="digestEnabled"
                />
                <label className="form-check-label" htmlFor="digestEnabled">
                  Enable Email Digest
                </label>
              </div>
            </div>
            <div className="col-md-3">
              <label className="form-label small">Frequency</label>
              <select
                className="form-select"
                value={settings.digest_frequency ?? 'daily'}
                onChange={(e) => onChange('digest_frequency', e.target.value)}
                disabled={!settings.digest_enabled}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small">Send Hour (24h)</label>
              <input
                type="number"
                className="form-control"
                value={settings.digest_send_hour ?? 7}
                onChange={(e) => onChange('digest_send_hour', parseInt(e.target.value, 10) || 7)}
                min={0}
                max={23}
                disabled={!settings.digest_enabled}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small">Weekly Day</label>
              <select
                className="form-select"
                value={settings.digest_send_day ?? 1}
                onChange={(e) => onChange('digest_send_day', parseInt(e.target.value, 10))}
                disabled={!settings.digest_enabled || settings.digest_frequency !== 'weekly'}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            </div>
            <div className="col-md-2 d-flex align-items-end">
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={async () => {
                  try {
                    setSaving(true);
                    await api.post('/api/admin/digest/test');
                    alert('Test digest sent successfully!');
                  } catch (err: any) {
                    alert('Failed to send test digest: ' + (err.response?.data?.error || err.message));
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
              >
                Send Test Digest
              </button>
            </div>
          </div>
          <div className="form-text mt-2">
            Digest emails are sent to the Admin Notification Emails configured above. Recipients receive a summary of pipeline, opportunities, visitors, and action items.
          </div>
        </div>
      </div>

      {/* SMS */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">SMS Configuration</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label small">SMS Provider</label>
              <select
                className="form-select"
                value={settings.sms_provider ?? 'none'}
                onChange={(e) => onChange('sms_provider', e.target.value)}
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
                onChange={(e) => onChange('sms_from_number', e.target.value)}
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
                onChange={(e) => onChange('sms_api_key', e.target.value)}
                placeholder="API key for SMS provider"
                disabled={settings.sms_provider === 'none'}
              />
            </div>
          </div>
          <div className="form-text mt-2">
            SMS is sent via GoHighLevel when GHL integration is enabled above. These legacy SMS settings are for direct provider integration (Twilio, etc.) as a fallback.
          </div>
        </div>
      </div>
    </>
  );
}

function IntegrationsTab({ settings, onChange }: FieldProps) {
  return (
    <>
      {/* GoHighLevel CRM */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold d-flex align-items-center gap-2">
          GoHighLevel CRM Integration
          {settings.ghl_enabled && <span className="badge bg-success">ENABLED</span>}
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={settings.ghl_enabled ?? false}
                  onChange={(e) => onChange('ghl_enabled', e.target.checked)}
                  id="ghlEnabled"
                />
                <label className="form-check-label" htmlFor="ghlEnabled">
                  Enable GHL CRM
                </label>
              </div>
              <div className="form-text">
                Sync leads to GHL, send SMS via GHL workflows
              </div>
            </div>
            <div className="col-md-4">
              <label className="form-label small">GHL API Key</label>
              <input
                type="password"
                className="form-control"
                value={settings.ghl_api_key ?? ''}
                onChange={(e) => onChange('ghl_api_key', e.target.value)}
                placeholder="Bearer token from GHL"
                disabled={!settings.ghl_enabled}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small">GHL Location ID</label>
              <input
                type="text"
                className="form-control"
                value={settings.ghl_location_id ?? 'JFWwp8q7l6T12NWTIOKG'}
                onChange={(e) => onChange('ghl_location_id', e.target.value)}
                placeholder="Location ID"
                disabled={!settings.ghl_enabled}
              />
            </div>
          </div>
          <div className="form-text mt-2">
            GHL integration syncs leads to GoHighLevel contacts with Interest Group tags, sends SMS via the Cory_SMS_Composed custom field (triggers GHL workflow), and receives reply webhooks.
            Webhook URL: <code>/api/webhook/ghl/sms-reply</code>
          </div>
        </div>
      </div>

      {/* Synthflow Voice */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">Voice Configuration (Synthflow AI)</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label small">Synthflow API Key</label>
              <input
                type="password"
                className="form-control"
                value={settings.synthflow_api_key ?? ''}
                onChange={(e) => onChange('synthflow_api_key', e.target.value)}
                placeholder="sf_..."
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small">Welcome Agent ID</label>
              <input
                type="text"
                className="form-control"
                value={settings.synthflow_welcome_agent_id ?? ''}
                onChange={(e) => onChange('synthflow_welcome_agent_id', e.target.value)}
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
                onChange={(e) => onChange('synthflow_interest_agent_id', e.target.value)}
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
    </>
  );
}

function AIConfigTab({ settings, onChange }: FieldProps) {
  return (
    <>
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">AI Model & Parameters</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label small">AI Model</label>
              <select
                className="form-select"
                value={settings.ai_model ?? 'gpt-4o-mini'}
                onChange={(e) => onChange('ai_model', e.target.value)}
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
                onChange={(e) => onChange('ai_max_tokens', parseInt(e.target.value, 10) || 1024)}
                min={256}
                max={4096}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">Default System Prompt</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label small">Default AI System Prompt (Campaign Persona)</label>
              <textarea
                className="form-control"
                rows={4}
                value={settings.ai_system_prompt_default ?? ''}
                onChange={(e) => onChange('ai_system_prompt_default', e.target.value)}
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
    </>
  );
}

function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('system');

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
      </div>

      {saved && (
        <div className="alert alert-success py-2 small">Settings saved successfully.</div>
      )}

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        {TABS.map((t) => {
          const badgeInfo = t.badge ? t.badge(settings) : null;
          return (
            <li className="nav-item" key={t.key}>
              <button
                className={`nav-link d-flex align-items-center gap-2${activeTab === t.key ? ' active' : ''}`}
                onClick={() => setActiveTab(t.key)}
                style={activeTab === t.key ? { color: 'var(--color-primary)', borderBottomColor: 'var(--color-primary)' } : {}}
              >
                {t.label}
                {badgeInfo && (
                  <span className={`badge bg-${badgeInfo.color} small`} style={{ fontSize: '0.65rem' }}>
                    {badgeInfo.text}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Tab Content */}
      {activeTab === 'system' && <SystemStatusTab settings={settings} onChange={handleChange} />}
      {activeTab === 'revenue' && <RevenueScoringTab settings={settings} onChange={handleChange} />}
      {activeTab === 'automation' && <AutomationTab settings={settings} onChange={handleChange} />}
      {activeTab === 'communication' && <CommunicationTab settings={settings} onChange={handleChange} saving={saving} setSaving={setSaving} />}
      {activeTab === 'integrations' && <IntegrationsTab settings={settings} onChange={handleChange} />}
      {activeTab === 'ai' && <AIConfigTab settings={settings} onChange={handleChange} />}
      {activeTab === 'audit' && <EventLedgerContent />}

      {/* Sticky Save Bar */}
      <div
        className="bg-white border-top py-3 mt-4 d-flex justify-content-end"
        style={{ position: 'sticky', bottom: 0, zIndex: 10 }}
      >
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </>
  );
}

export default AdminSettingsPage;
