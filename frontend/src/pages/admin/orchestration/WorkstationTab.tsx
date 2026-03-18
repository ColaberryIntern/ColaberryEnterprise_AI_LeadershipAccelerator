import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';

const VARIABLES = [
  { name: '{title}', desc: 'Implementation task title' },
  { name: '{description}', desc: 'Task description' },
  { name: '{deliverable}', desc: 'Expected deliverable' },
  { name: '{task_requirements}', desc: 'Numbered list of requirements' },
  { name: '{task_artifacts}', desc: 'List of required artifacts' },
  { name: '{lessonTitle}', desc: 'Section/lesson title' },
  { name: '{mentor_briefing}', desc: 'AI Mentor briefing (appended automatically if not in template)' },
];

export default function WorkstationTab({ token, apiUrl }: { token: string; apiUrl: string }) {
  const [prompt, setPrompt] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/settings');
      const s = res.data.settings || res.data;
      setPrompt(s.workstation_prompt || '');
      setTestMode(s.workstation_test_mode || false);
    } catch {
      // defaults already set
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch('/api/admin/settings', {
        workstation_prompt: prompt,
        workstation_test_mode: testMode,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Prompt Card */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center">
          <div>
            <span className="fw-semibold small">
              <i className="bi bi-terminal me-1"></i>AI Workstation Prompt
            </span>
            <span className="text-muted ms-2" style={{ fontSize: 11 }}>
              Global — applies to all implementation tasks
            </span>
          </div>
          <div className="d-flex align-items-center gap-2">
            {saved && <span className="text-success small"><i className="bi bi-check-circle me-1"></i>Saved</span>}
            <button
              className="btn btn-sm btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ fontSize: 11 }}
            >
              {saving ? (
                <><span className="spinner-border spinner-border-sm me-1" role="status"></span>Saving...</>
              ) : (
                <><i className="bi bi-check-lg me-1"></i>Save</>
              )}
            </button>
          </div>
        </div>
        <div className="card-body py-3">
          <p className="text-muted small mb-2">
            This prompt is sent to the learner's chosen LLM (ChatGPT, Claude, etc.) when they click
            <strong> Open AI Workspace</strong> after receiving their mentor briefing. It is shared across all sections.
          </p>
          <textarea
            className="form-control form-control-sm font-monospace"
            rows={18}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Paste your AI Workstation prompt template here..."
            style={{ fontSize: 12, lineHeight: 1.5 }}
          />
        </div>
      </div>

      {/* Variables Reference */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white py-2">
          <span className="fw-semibold small">
            <i className="bi bi-braces me-1"></i>Available Variables
          </span>
        </div>
        <div className="card-body py-2">
          <div className="row g-2">
            {VARIABLES.map(v => (
              <div key={v.name} className="col-md-6">
                <div className="d-flex align-items-start gap-2">
                  <code className="text-nowrap" style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                    {v.name}
                  </code>
                  <span className="text-muted" style={{ fontSize: 11 }}>{v.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Test Mode Card */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white py-2">
          <span className="fw-semibold small">
            <i className="bi bi-bug me-1"></i>Test Mode
          </span>
        </div>
        <div className="card-body py-3">
          <div className="form-check form-switch mb-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="workstationTestMode"
              checked={testMode}
              onChange={e => setTestMode(e.target.checked)}
            />
            <label className="form-check-label small fw-medium" htmlFor="workstationTestMode">
              Enable test mode
            </label>
          </div>
          <p className="text-muted small mb-0">
            When enabled, the workstation prompt appends instructions that tell the LLM to auto-generate
            example submissions instead of waiting for real work — so admins can walk through the full
            student experience quickly without producing actual deliverables.
          </p>
        </div>
      </div>
    </div>
  );
}
