import React, { useState } from 'react';

interface Props {
  campaignId: string;
  aiSystemPrompt: string | null;
  sequence?: { id: string; name: string; steps: any[] } | null;
  headers: Record<string, string>;
  onRefresh: () => void;
}

const formatTiming = (step: any): string => {
  if (step.minutes_before_call) {
    const mins = step.minutes_before_call;
    if (mins >= 1440) return `T-${mins / 1440}d`;
    if (mins >= 60) return `T-${mins / 60}h`;
    return `T-${mins}min`;
  }
  return step.delay_days ? `Day ${step.delay_days}` : 'Day 0';
};

export default function PromptsTab({ campaignId, aiSystemPrompt, sequence, headers, onRefresh }: Props) {
  const [prompt, setPrompt] = useState(aiSystemPrompt || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/admin/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ai_system_prompt: prompt }),
      });
      setSaved(true);
      onRefresh();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const res = await fetch(`/api/admin/ai/preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          campaign_id: campaignId,
          system_prompt: prompt,
          channel: 'email',
        }),
      });
      const data = await res.json();
      setPreviewResult(data.preview || data.message || 'No preview available');
    } catch (err) {
      setPreviewResult('Preview not available. Ensure AI preview endpoint is configured.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const steps = Array.isArray(sequence?.steps) ? sequence.steps : [];
  const isCountdown = steps.length > 0 && steps.every((s: any) => s.minutes_before_call);

  return (
    <>
      {/* AI System Prompt */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">AI System Prompt (Campaign Persona)</div>
        <div className="card-body">
          <textarea
            className="form-control font-monospace"
            rows={8}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Define the AI persona and instructions for this campaign. Use variables like {first_name}, {company_name}, {agent_name}..."
            style={{ fontSize: '0.85rem' }}
          />
          <div className="d-flex gap-2 mt-3">
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Prompt'}
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? 'Generating...' : 'Preview AI Output'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewResult && (
        <div className="card border-0 shadow-sm mb-4 border-start border-4 border-primary">
          <div className="card-header bg-white d-flex justify-content-between">
            <span className="fw-semibold">AI Output Preview</span>
            <button className="btn-close" onClick={() => setPreviewResult(null)} />
          </div>
          <div className="card-body">
            <pre className="mb-0 small" style={{ whiteSpace: 'pre-wrap' }}>{previewResult}</pre>
          </div>
        </div>
      )}

      {/* Per-Step Instructions */}
      {steps.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Per-Step AI Instructions</div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Step</th>
                    <th>Timing</th>
                    <th>Channel</th>
                    <th>AI Instructions</th>
                    <th>Tone</th>
                    <th>Goal</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step: any, i: number) => (
                    <tr key={i}>
                      <td className="fw-medium">{i + 1}</td>
                      <td>
                        <span className={`badge ${isCountdown ? 'bg-info bg-opacity-10 text-info' : 'bg-light text-dark border'}`}>
                          {formatTiming(step)}
                        </span>
                      </td>
                      <td className="text-capitalize">{step.channel}</td>
                      <td className="small" style={{ maxWidth: 300 }}>
                        {step.ai_instructions || step.body_template || '—'}
                      </td>
                      <td className="small text-capitalize">{step.ai_tone || '—'}</td>
                      <td className="small">{step.step_goal || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
