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
  it('high-stakes legacy ERP writes always need a human (REQ-003 approval gate)', () => {
    expect(actionRequiresApproval('erp_data_push').required).toBe(true);
    expect(actionRequiresApproval('erp_data_push').rule).toBe('erp_write');
    // also triggers via resource type, regardless of the action verb
    expect(actionRequiresApproval('erp_update', { resourceType: 'legacy_erp_module' }).rule).toBe('erp_write');
  });
});

describe('agentAutonomy — ProofDesk R0-R4 risk-tier reconciliation (Milestone 4, shadow mode)', () => {
  it('happy path: R1/R2 risk tiers do not force approval on their own (existing rules still decide)', () => {
    expect(actionRequiresApproval('update_campaign_config', { riskTier: 'R1' }).required).toBe(false);
    expect(actionRequiresApproval('update_campaign_config', { riskTier: 'R2' }).required).toBe(false);
    // R0/undefined behave exactly as before this milestone (no riskTier passed at all).
    expect(actionRequiresApproval('update_campaign_config', { riskTier: 'R0' }).required).toBe(false);
    expect(actionRequiresApproval('update_campaign_config').required).toBe(false);
  });

  it('boundary: R3 and R4 force approval, EVEN for an action that would otherwise classify as read/observe-safe', () => {
    // 'run_qa_test' classifies as 'read' (see actionCategory's READ_HINTS) and would
    // never need approval under any existing rule - this is the edge case worth its
    // own explicit assertion: risk tier overrides category entirely.
    const r3 = actionRequiresApproval('run_qa_test', { riskTier: 'R3' });
    expect(r3.required).toBe(true);
    expect(r3.rule).toBe('high_risk_tier');

    const r4 = actionRequiresApproval('ticket_dispatch', { riskTier: 'R4' });
    expect(r4.required).toBe(true);
    expect(r4.rule).toBe('high_risk_tier');
  });

  it('the high-risk-tier rule is checked ahead of the other rules (takes the ERP-write reason slot too)', () => {
    // Same action would ALSO qualify for 'erp_write' - risk tier wins because it's
    // checked first, proving R3/R4 truly overrides regardless of action category.
    const d = actionRequiresApproval('erp_data_push', { riskTier: 'R4' });
    expect(d.required).toBe(true);
    expect(d.rule).toBe('high_risk_tier');
  });

  it('failure/malformed input: a bad risk-tier string never throws and never falsely forces approval', () => {
    expect(() => actionRequiresApproval('update_campaign_config', { riskTier: 'bogus' as any })).not.toThrow();
    expect(actionRequiresApproval('update_campaign_config', { riskTier: 'bogus' as any }).required).toBe(false);
    expect(() => actionRequiresApproval('update_campaign_config', { riskTier: null })).not.toThrow();
    expect(actionRequiresApproval('update_campaign_config', { riskTier: null }).required).toBe(false);
    expect(() => actionRequiresApproval('update_campaign_config', { riskTier: undefined })).not.toThrow();
    expect(actionRequiresApproval('update_campaign_config', { riskTier: undefined }).required).toBe(false);
    // Empty string is falsy - same safe-default path, not an R0-vs-crash ambiguity.
    expect(actionRequiresApproval('update_campaign_config', { riskTier: '' }).required).toBe(false);
  });

  it('every pre-existing rule (ERP/social/new-lead/campaign-first-24h) still fires exactly as before when no riskTier is passed', () => {
    // Regression guard for T003's own change: re-assert the pre-existing behavior this
    // milestone must not alter, using the same fixtures as the describe block above.
    expect(actionRequiresApproval('create_agent').rule).toBe('agent_lifecycle');
    expect(actionRequiresApproval('social_post', { resourceType: 'social' }).rule).toBe('public_social_post');
    expect(actionRequiresApproval('send_email', { isNewLead: true }).rule).toBe('first_touch_new_lead');
    expect(actionRequiresApproval('send_sms', { campaignAgeHours: 3 }).rule).toBe('campaign_first_24h');
    expect(actionRequiresApproval('send_email', { isNewLead: false, campaignAgeHours: 200 }).required).toBe(false);
  });
});
