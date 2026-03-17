import React, { useState, useEffect } from 'react';

interface Props {
  campaignId: string;
  campaign: {
    type: string;
    description: string;
    goals?: string;
    gtm_notes?: string;
    sequence?: { id: string; name: string; steps: any[] } | null;
  };
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

export default function GTMStrategyTab({ campaignId, campaign, headers, onRefresh }: Props) {
  const [description, setDescription] = useState(campaign.description || '');
  const [goals, setGoals] = useState(campaign.goals || '');
  const [gtmNotes, setGtmNotes] = useState(campaign.gtm_notes || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDescription(campaign.description || '');
    setGoals(campaign.goals || '');
    setGtmNotes(campaign.gtm_notes || '');
  }, [campaign]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/admin/campaigns/${campaignId}/gtm`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ description, goals, gtm_notes: gtmNotes }),
      });
      setSaved(true);
      onRefresh();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save GTM:', err);
    } finally {
      setSaving(false);
    }
  };

  const steps = Array.isArray(campaign.sequence?.steps) ? campaign.sequence.steps : [];
  const isCountdown = steps.length > 0 && steps.every((s: any) => s.minutes_before_call);
  const totalDays = steps.length > 0 ? Math.max(...steps.map((s: any) => s.delay_days || 0)) : 0;

  return (
    <>
      {/* Campaign Goal — prominent display */}
      {campaign.goals && (
        <div className="card border-0 shadow-sm mb-4 border-start border-4 border-primary">
          <div className="card-body">
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="badge bg-primary bg-opacity-10 text-primary">Campaign Goal</span>
            </div>
            <p className="mb-0" style={{ whiteSpace: 'pre-line' }}>{campaign.goals}</p>
          </div>
        </div>
      )}

      {/* Campaign Type */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Campaign Info</div>
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label fw-medium">Campaign Type</label>
            <div>
              <span className="badge bg-light text-dark border fs-6">
                {campaign.type?.replace(/_/g, ' ') || 'Unknown'}
              </span>
              {isCountdown && (
                <span className="badge bg-info bg-opacity-10 text-info ms-2">Countdown Campaign</span>
              )}
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label fw-medium">Description</label>
            <textarea
              className="form-control"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Campaign description..."
            />
          </div>
        </div>
      </div>

      {/* Goals & Strategy */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Goals & Strategy</div>
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label fw-medium">Goals</label>
            <textarea
              className="form-control"
              rows={4}
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="What are the goals for this campaign? (e.g., Generate 50 qualified meetings, convert 10% of cold leads...)"
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
        </div>
      </div>

      {/* Sequence Info */}
      {campaign.sequence && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Linked Sequence</div>
          <div className="card-body">
            <div className="d-flex gap-4 mb-3">
              <div>
                <span className="text-muted small">Sequence Name</span>
                <div className="fw-medium">{campaign.sequence.name}</div>
              </div>
              <div>
                <span className="text-muted small">Steps</span>
                <div className="fw-medium">{steps.length}</div>
              </div>
              <div>
                <span className="text-muted small">{isCountdown ? 'Type' : 'Total Days'}</span>
                <div className="fw-medium">{isCountdown ? 'Countdown' : totalDays}</div>
              </div>
            </div>
            {steps.length > 0 && (
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Step</th>
                      <th>Channel</th>
                      <th>Timing</th>
                      <th>Subject/Action</th>
                      <th>Goal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((step: any, i: number) => (
                      <tr key={i}>
                        <td className="fw-medium">{i + 1}</td>
                        <td className="text-capitalize">{step.channel}</td>
                        <td>
                          <span className={`badge ${isCountdown ? 'bg-info bg-opacity-10 text-info' : 'bg-light text-dark border'}`}>
                            {formatTiming(step)}
                          </span>
                        </td>
                        <td className="small">{step.subject || step.action || '—'}</td>
                        <td className="small text-muted">{step.step_goal || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
      </button>
    </>
  );
}
