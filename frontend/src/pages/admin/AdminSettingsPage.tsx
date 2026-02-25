import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

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
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-bold py-3">Lead Scoring</div>
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

      {/* Email & Automation */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-bold py-3">Email & Automation</div>
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
                  Enable Auto Email on Lead Capture
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
                  Enable Voice Calls (Synthflow)
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
    </>
  );
}

export default AdminSettingsPage;
