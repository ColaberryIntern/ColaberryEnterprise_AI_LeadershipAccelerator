import React, { useState, useEffect, useCallback } from 'react';
import SequenceStepEditor, { SequenceStep, EMPTY_STEP } from './SequenceStepEditor';
import RebuildProgressModal from './RebuildProgressModal';

interface Props {
  campaignId: string;
  campaign: {
    type: string;
    description: string;
    goals?: string;
    gtm_notes?: string;
    ai_system_prompt: string | null;
    sequence_id: string | null;
    sequence?: { id: string; name: string; steps: any[] } | null;
  };
  headers: Record<string, string>;
  onRefresh: () => void;
}

export default function StrategyPromptsTab({ campaignId, campaign, headers, onRefresh }: Props) {
  // ── Section 1: AI System Prompt ──────────────────────────────────
  const [prompt, setPrompt] = useState(campaign.ai_system_prompt || '');
  const [savedPrompt, setSavedPrompt] = useState(campaign.ai_system_prompt || '');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseResult, setReverseResult] = useState<string | null>(null);

  // ── Section 2: Description ────────────────────────────────────────
  const [description, setDescription] = useState(campaign.description || '');
  const [savingDesc, setSavingDesc] = useState(false);
  const [descSaved, setDescSaved] = useState(false);

  // ── Section 3: Goals & GTM ────────────────────────────────────────
  const [goals, setGoals] = useState(campaign.goals || '');
  const [gtmNotes, setGtmNotes] = useState(campaign.gtm_notes || '');
  const [savingGtm, setSavingGtm] = useState(false);
  const [gtmSaved, setGtmSaved] = useState(false);

  // ── Section 4: Sequence Steps ─────────────────────────────────────
  const rawSteps = Array.isArray(campaign.sequence?.steps) ? campaign.sequence!.steps : [];
  const [steps, setSteps] = useState<SequenceStep[]>(
    rawSteps.length > 0
      ? rawSteps.map((s: any) => ({ ...EMPTY_STEP, ...s, channel: s.channel || 'email' }))
      : [{ ...EMPTY_STEP }]
  );
  const [savingSteps, setSavingSteps] = useState(false);
  const [stepsSaved, setStepsSaved] = useState(false);

  // ── Rebuild Modal ─────────────────────────────────────────────────
  const [showRebuild, setShowRebuild] = useState(false);
  const [rebuildMinimized, setRebuildMinimized] = useState(false);
  const [rebuildStep, setRebuildStep] = useState(0);
  const [rebuildError, setRebuildError] = useState<string | null>(null);

  const promptDirty = prompt !== savedPrompt;

  // Sync from props when campaign reloads
  const syncFromCampaign = useCallback(() => {
    setPrompt(campaign.ai_system_prompt || '');
    setSavedPrompt(campaign.ai_system_prompt || '');
    setDescription(campaign.description || '');
    setGoals(campaign.goals || '');
    setGtmNotes(campaign.gtm_notes || '');
    const s = Array.isArray(campaign.sequence?.steps) ? campaign.sequence!.steps : [];
    setSteps(
      s.length > 0
        ? s.map((st: any) => ({ ...EMPTY_STEP, ...st, channel: st.channel || 'email' }))
        : [{ ...EMPTY_STEP }]
    );
  }, [campaign]);

  useEffect(() => {
    syncFromCampaign();
  }, [syncFromCampaign]);

  // ── Save handlers ────────────────────────────────────────────────

  const handleSavePrompt = async () => {
    setSavingPrompt(true);
    setPromptSaved(false);
    try {
      await fetch(`/api/admin/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ai_system_prompt: prompt }),
      });
      setSavedPrompt(prompt);
      setPromptSaved(true);
      onRefresh();
      setTimeout(() => setPromptSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save prompt:', err);
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleSaveDescription = async () => {
    setSavingDesc(true);
    setDescSaved(false);
    try {
      await fetch(`/api/admin/campaigns/${campaignId}/gtm`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ description }),
      });
      setDescSaved(true);
      onRefresh();
      setTimeout(() => setDescSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save description:', err);
    } finally {
      setSavingDesc(false);
    }
  };

  const handleSaveGtm = async () => {
    setSavingGtm(true);
    setGtmSaved(false);
    try {
      await fetch(`/api/admin/campaigns/${campaignId}/gtm`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ goals, gtm_notes: gtmNotes }),
      });
      setGtmSaved(true);
      onRefresh();
      setTimeout(() => setGtmSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save GTM:', err);
    } finally {
      setSavingGtm(false);
    }
  };

  const handleSaveSteps = async () => {
    setSavingSteps(true);
    setStepsSaved(false);
    try {
      if (campaign.sequence_id) {
        await fetch(`/api/admin/sequences/${campaign.sequence_id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ steps }),
        });
      } else {
        // Create a new sequence and link it
        const seqRes = await fetch('/api/admin/sequences', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: `${campaign.type} Sequence`,
            description: 'Auto-created sequence',
            steps,
          }),
        });
        const seqData = await seqRes.json();
        if (seqData.sequence?.id) {
          await fetch(`/api/admin/campaigns/${campaignId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ sequence_id: seqData.sequence.id }),
          });
        }
      }
      setStepsSaved(true);
      onRefresh();
      setTimeout(() => setStepsSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save steps:', err);
    } finally {
      setSavingSteps(false);
    }
  };

  // ── Reverse Engineer ──────────────────────────────────────────────

  const handleReverseEngineer = async () => {
    setReverseLoading(true);
    setReverseResult(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/reverse-engineer`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        setReverseResult(data.summary || 'No summary generated.');
      } else {
        setReverseResult(`Error: ${data.error || 'Failed to reverse engineer'}`);
      }
    } catch (err) {
      setReverseResult('Error: Failed to connect to server.');
    } finally {
      setReverseLoading(false);
    }
  };

  // ── Save & Rebuild ─────────────────────────────────────────────────

  const handleRebuild = async () => {
    setShowRebuild(true);
    setRebuildMinimized(false);
    setRebuildStep(1);
    setRebuildError(null);

    try {
      // Step 1: Saving prompt (handled by rebuild endpoint)
      setRebuildStep(1);

      // Step 2-4: Call rebuild endpoint
      await new Promise((r) => setTimeout(r, 300)); // brief visual delay
      setRebuildStep(2);

      const res = await fetch(`/api/admin/campaigns/${campaignId}/rebuild`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ai_system_prompt: prompt }),
      });

      setRebuildStep(3);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Rebuild failed');
      }

      setRebuildStep(4);
      await new Promise((r) => setTimeout(r, 300));

      // Update local state from rebuild response
      if (data.campaign) {
        setDescription(data.campaign.description || '');
        setGoals(data.campaign.goals || '');
        setGtmNotes(data.campaign.gtm_notes || '');
        setSavedPrompt(data.campaign.ai_system_prompt || prompt);
        setPrompt(data.campaign.ai_system_prompt || prompt);
      }
      if (data.sequence?.steps) {
        setSteps(
          data.sequence.steps.map((s: any) => ({ ...EMPTY_STEP, ...s, channel: s.channel || 'email' }))
        );
      }

      setRebuildStep(5); // Complete
      onRefresh();
    } catch (err: any) {
      setRebuildError(err.message || 'Rebuild failed');
    }
  };

  // ── Render ──────────────────────────────────────────────────────

  const isCountdown = steps.length > 0 && steps.every((s: any) => s.minutes_before_call);

  return (
    <>
      {/* ═══ Section 1: AI System Prompt ═══ */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">AI System Prompt (Campaign Persona)</div>
        <div className="card-body">
          <textarea
            className="form-control font-monospace"
            rows={8}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Define the AI persona and strategy for this campaign..."
            style={{ fontSize: '0.85rem' }}
          />
          <div className="d-flex gap-2 mt-3 flex-wrap">
            <button className="btn btn-outline-info btn-sm" onClick={handleReverseEngineer} disabled={reverseLoading}>
              {reverseLoading ? 'Analyzing...' : 'Reverse Engineer'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSavePrompt} disabled={!promptDirty && !savingPrompt}>
              {savingPrompt ? 'Saving...' : promptSaved ? 'Saved!' : 'Save Prompt'}
            </button>
            <button
              className="btn btn-warning btn-sm"
              onClick={handleRebuild}
              disabled={!promptDirty}
              title={promptDirty ? 'Rebuild entire campaign from this prompt' : 'Edit the prompt first to enable rebuild'}
            >
              Save & Rebuild
            </button>
          </div>
          {!promptDirty && (
            <div className="form-text mt-1">Edit the prompt above to enable Save & Rebuild.</div>
          )}
        </div>
      </div>

      {/* Reverse Engineer Result */}
      {reverseResult && (
        <div className="card border-0 shadow-sm mb-4 border-start border-4 border-info">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
            <div>
              <span className="fw-semibold">Reverse Engineered Campaign Prompt</span>
              <span className="badge bg-info ms-2" style={{ fontSize: 10 }}>
                {reverseResult.split('\n').length} lines
              </span>
            </div>
            <button className="btn-close" onClick={() => setReverseResult(null)} />
          </div>
          <div className="card-body">
            <div className="small text-muted mb-2">
              Review the generated prompt below. You can use it as-is, copy it, or edit the prompt above before rebuilding.
            </div>
            <pre
              className="mb-3 p-3 rounded"
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.82rem',
                backgroundColor: 'var(--color-bg-alt, #f7fafc)',
                border: '1px solid var(--color-border, #e2e8f0)',
                maxHeight: 400,
                overflowY: 'auto',
                lineHeight: 1.6,
              }}
            >
              {reverseResult}
            </pre>
            <div className="d-flex gap-2 flex-wrap">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setPrompt(reverseResult);
                  setReverseResult(null);
                }}
              >
                Use as Prompt
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(reverseResult);
                }}
              >
                Copy to Clipboard
              </button>
              <button
                className="btn btn-outline-info btn-sm"
                onClick={() => {
                  // Append to existing prompt instead of replacing
                  setPrompt(prev => prev ? `${prev}\n\n---\n\n${reverseResult}` : reverseResult);
                  setReverseResult(null);
                }}
              >
                Append to Prompt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Section 2: Campaign Description ═══ */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Campaign Description</div>
        <div className="card-body">
          <div className="mb-3">
            <span className="badge bg-light text-dark border fs-6">
              {campaign.type?.replace(/_/g, ' ') || 'Unknown'}
            </span>
            {isCountdown && (
              <span className="badge bg-info bg-opacity-10 text-info ms-2">Countdown Campaign</span>
            )}
          </div>
          <textarea
            className="form-control"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Campaign description..."
          />
          <button className="btn btn-primary btn-sm mt-3" onClick={handleSaveDescription} disabled={savingDesc}>
            {savingDesc ? 'Saving...' : descSaved ? 'Saved!' : 'Save Description'}
          </button>
        </div>
      </div>

      {/* ═══ Section 3: Goals & GTM Strategy ═══ */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Goals & GTM Strategy</div>
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label fw-medium">Goals</label>
            <textarea
              className="form-control"
              rows={4}
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="What are the goals for this campaign?"
            />
          </div>
          <div className="mb-3">
            <label className="form-label fw-medium">GTM Notes</label>
            <textarea
              className="form-control"
              rows={4}
              value={gtmNotes}
              onChange={(e) => setGtmNotes(e.target.value)}
              placeholder="Go-to-market strategy notes, messaging themes, competitive positioning..."
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSaveGtm} disabled={savingGtm}>
            {savingGtm ? 'Saving...' : gtmSaved ? 'Saved!' : 'Save Goals & GTM'}
          </button>
        </div>
      </div>

      {/* ═══ Sequence Overview (read-only summary) ═══ */}
      {steps.length > 0 && steps[0].channel && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Sequence Overview</span>
            <span className="badge bg-light text-dark border">
              {steps.length} step{steps.length !== 1 ? 's' : ''}
              {' · '}
              {(() => {
                const maxDay = Math.max(...steps.map(s => s.delay_days || 0));
                return `${maxDay} day${maxDay !== 1 ? 's' : ''}`;
              })()}
              {' · '}
              {[...new Set(steps.map(s => s.channel))].map(ch =>
                ch === 'email' ? 'Email' : ch === 'sms' ? 'SMS' : 'Voice'
              ).join(', ')}
            </span>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '0.82rem' }}>
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th style={{ width: 55 }}>Day</th>
                    <th style={{ width: 75 }}>Channel</th>
                    <th>Subject / Goal</th>
                    <th style={{ width: 90 }}>Tone</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step, i) => {
                    const channelColor = step.channel === 'email' ? '#0d6efd' : step.channel === 'sms' ? '#6f42c1' : '#198754';
                    const channelLabel = step.channel === 'email' ? 'Email' : step.channel === 'sms' ? 'SMS' : 'Voice';
                    return (
                      <tr key={i}>
                        <td className="text-muted">{i + 1}</td>
                        <td>{step.delay_days || 0}</td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: `${channelColor}15`,
                              color: channelColor,
                              border: `1px solid ${channelColor}40`,
                              fontSize: '0.72rem',
                            }}
                          >
                            {channelLabel}
                          </span>
                        </td>
                        <td>
                          {step.subject && (
                            <div className="fw-medium" style={{ lineHeight: 1.3 }}>{step.subject}</div>
                          )}
                          {step.step_goal && (
                            <div className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.3 }}>
                              {step.step_goal}
                            </div>
                          )}
                          {!step.subject && !step.step_goal && (
                            <span className="text-muted fst-italic">No subject or goal</span>
                          )}
                        </td>
                        <td className="text-muted text-capitalize">{step.ai_tone || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Section 4: Sequence Steps ═══ */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">
          Sequence Steps ({steps.length})
        </div>
        <div className="card-body">
          <SequenceStepEditor steps={steps} onChange={setSteps} />
          <button className="btn btn-primary btn-sm" onClick={handleSaveSteps} disabled={savingSteps}>
            {savingSteps ? 'Saving...' : stepsSaved ? 'Saved!' : 'Save Sequence'}
          </button>
        </div>
      </div>

      {/* Rebuild Progress Modal */}
      <RebuildProgressModal
        show={showRebuild}
        minimized={rebuildMinimized}
        currentStep={rebuildStep}
        error={rebuildError}
        onClose={() => { setShowRebuild(false); setRebuildMinimized(false); }}
        onMinimize={() => setRebuildMinimized(true)}
        onRestore={() => setRebuildMinimized(false)}
      />
    </>
  );
}
