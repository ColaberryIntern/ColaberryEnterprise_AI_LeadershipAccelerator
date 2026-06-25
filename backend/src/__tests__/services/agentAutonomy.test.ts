import {
  levelForTier,
  actionCategory,
  levelAllowsAction,
  actionRequiresApproval,
} from '../../services/agentAutonomy';

describe('agentAutonomy — tier → level mapping', () => {
  it('maps the existing permission tiers onto the ladder', () => {
    expect(levelForTier('read_only')).toBe('observe');
    expect(levelForTier('suggest_only')).toBe('suggest');
    expect(levelForTier('write_with_audit')).toBe('act_audited');
    expect(levelForTier('communication')).toBe('communicate');
  });
  it('defaults unknown/missing tiers to observe (fail-closed)', () => {
    expect(levelForTier('nonsense')).toBe('observe');
    expect(levelForTier(null)).toBe('observe');
    expect(levelForTier(undefined)).toBe('observe');
  });
});

describe('agentAutonomy — action classification', () => {
  it('classifies real agent operations into the right category', () => {
    expect(actionCategory('send_email')).toBe('communicate');
    expect(actionCategory('send_sms')).toBe('communicate');
    expect(actionCategory('synthflow_call')).toBe('communicate');
    expect(actionCategory('propose_content_rewrite')).toBe('propose');
    expect(actionCategory('create_agent')).toBe('agent_lifecycle');
    expect(actionCategory('activate_agent')).toBe('agent_lifecycle');
    expect(actionCategory('run_qa_test')).toBe('read');
    expect(actionCategory('detect_stalled_campaign')).toBe('read');
    // The important false-positive guards: internal writes that merely CONTAIN send/post.
    expect(actionCategory('retry_failed_send')).toBe('write');
    expect(actionCategory('post_repair_retest')).toBe('write');
    expect(actionCategory('update_campaign_config')).toBe('write');
  });
});

describe('agentAutonomy — level permits action (least privilege)', () => {
  it('observe may only read', () => {
    expect(levelAllowsAction('observe', 'scan_campaign')).toBe(true);
    expect(levelAllowsAction('observe', 'update_campaign_config')).toBe(false);
    expect(levelAllowsAction('observe', 'send_email')).toBe(false);
  });
  it('suggest may read + propose, not write', () => {
    expect(levelAllowsAction('suggest', 'propose_content_rewrite')).toBe(true);
    expect(levelAllowsAction('suggest', 'update_campaign_config')).toBe(false);
  });
  it('act_audited may write but NOT communicate', () => {
    expect(levelAllowsAction('act_audited', 'update_campaign_config')).toBe(true);
    expect(levelAllowsAction('act_audited', 'send_email')).toBe(false);
  });
  it('communicate may do everything including outbound', () => {
    expect(levelAllowsAction('communicate', 'send_email')).toBe(true);
    expect(levelAllowsAction('communicate', 'update_campaign_config')).toBe(true);
  });
});

describe('agentAutonomy — HITL always-approval rules (§5 Q2)', () => {
  it('agent lifecycle always needs a human', () => {
    expect(actionRequiresApproval('create_agent').required).toBe(true);
    expect(actionRequiresApproval('create_agent').rule).toBe('agent_lifecycle');
  });
  it('public social posts always need a human', () => {
    const d = actionRequiresApproval('social_post', { resourceType: 'social' });
    expect(d.required).toBe(true);
    expect(d.rule).toBe('public_social_post');
  });
  it('first touch to a brand-new lead needs a human', () => {
    const d = actionRequiresApproval('send_email', { isNewLead: true });
    expect(d.required).toBe(true);
    expect(d.rule).toBe('first_touch_new_lead');
  });
  it('anything in a campaign’s first 24h needs a human', () => {
    expect(actionRequiresApproval('send_sms', { campaignAgeHours: 3 }).rule).toBe('campaign_first_24h');
    expect(actionRequiresApproval('update_campaign_config', { campaignAgeHours: 3 }).rule).toBe('campaign_first_24h');
    expect(actionRequiresApproval('send_sms', { campaignAgeHours: 48 }).required).toBe(false);
  });
  it('a routine send to an established lead in a mature campaign does NOT need a human', () => {
    expect(actionRequiresApproval('send_email', { isNewLead: false, campaignAgeHours: 200 }).required).toBe(false);
  });
});
