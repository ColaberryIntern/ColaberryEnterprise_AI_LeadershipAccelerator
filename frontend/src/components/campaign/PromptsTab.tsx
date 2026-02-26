import React, { useState } from 'react';

interface Props {
  campaignId: string;
  aiSystemPrompt: string | null;
  sequence?: { id: string; name: string; steps: any[] } | null;
  headers: Record<string, string>;
  onRefresh: () => void;
}

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

  const steps = sequence?.steps || [];

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
                      <td className="text-capitalize">{step.channel}</td>
                      <td className="small" style={{ maxWidth: 300 }}>
                        {step.ai_instructions || step.body_template || '—'}
                      </td>
                      <td className="small text-capitalize">{step.tone || '—'}</td>
                      <td className="small">{step.goal || '—'}</td>
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
