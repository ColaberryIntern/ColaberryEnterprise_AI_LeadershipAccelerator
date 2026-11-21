import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

/**
 * OH1w: the campaign's membership rules (backend: services/campaignMembership.ts).
 * One campaign at a time; when someone finishes they are removed (default) or moved into
 * another campaign; a campaign that takes precedence moves people out of others when they join.
 */
export interface OnCompleteValue {
  action: 'remove' | 'move';
  move_to_campaign_id?: string | null;
  move_to_campaign_key?: string | null;
}

interface Props {
  campaignId: string;
  onComplete: OnCompleteValue | undefined;
  takesPrecedence: boolean | undefined;
  onChange: (patch: { on_complete?: OnCompleteValue; takes_precedence?: boolean }) => void;
}

interface CampaignOption { id: string; name: string; status?: string; key?: string | null }

export default function MembershipSettingsCard({ campaignId, onComplete, takesPrecedence, onChange }: Props) {
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const action = onComplete?.action === 'move' ? 'move' : 'remove';

  useEffect(() => {
    let alive = true;
    api.get('/api/admin/campaigns')
      .then(({ data }) => {
        if (!alive) return;
        const list = (data?.campaigns || data || []) as Array<{ id: string; name: string; status?: string; settings?: { campaign_key?: string } }>;
        setCampaigns(list.filter((c) => c.id !== campaignId).map((c) => ({ id: c.id, name: c.name, status: c.status, key: c.settings?.campaign_key ?? null })));
      })
      .catch((err) => console.error('Failed to load campaigns for the membership setting:', err));
    return () => { alive = false; };
  }, [campaignId]);

  // A target set by key (the Open House countdown -> follow-up) shows as that campaign.
  const selectedId = onComplete?.move_to_campaign_id
    || campaigns.find((c) => c.key && c.key === onComplete?.move_to_campaign_key)?.id
    || '';

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold">Membership</div>
      <div className="card-body">
        <p className="small text-muted mb-3">
          A person is in one campaign at a time. Explorer Growth only reaches people who are not in a running campaign,
          so everyone leaves when they finish.
        </p>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label small fw-medium" htmlFor="membership-on-complete">When someone finishes</label>
            <select
              id="membership-on-complete"
              className="form-select form-select-sm"
              value={action}
              onChange={(e) => onChange({ on_complete: e.target.value === 'move' ? { action: 'move', move_to_campaign_id: selectedId || null } : { action: 'remove' } })}
            >
              <option value="remove">Remove them from this campaign</option>
              <option value="move">Move them into another campaign</option>
            </select>
            <div className="form-text">Finished means nothing is left to send and the last message is a day old.</div>
          </div>
          {action === 'move' && (
            <div className="col-md-6">
              <label className="form-label small fw-medium" htmlFor="membership-move-to">Move them into</label>
              <select
                id="membership-move-to"
                className="form-select form-select-sm"
                value={selectedId}
                onChange={(e) => {
                  const target = campaigns.find((c) => c.id === e.target.value);
                  onChange({ on_complete: { action: 'move', move_to_campaign_id: target?.id || null, move_to_campaign_key: target?.key || null } });
                }}
              >
                <option value="">Choose a campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.status && c.status !== 'active' ? ` (${c.status})` : ''}</option>
                ))}
              </select>
              <div className="form-text">If that campaign is not running when they finish, they are removed instead.</div>
            </div>
          )}
          <div className="col-12">
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="membership-precedence"
                checked={takesPrecedence === true}
                onChange={(e) => onChange({ takes_precedence: e.target.checked })}
              />
              <label className="form-check-label small" htmlFor="membership-precedence">
                <span className="fw-medium">Takes precedence</span>
                <br />
                <span className="text-muted">Joining this campaign moves a person out of any other campaign. Otherwise they cannot join while in another one.</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
