/**
 * AF3.5 — the grant gate, driven both ways.
 *
 * The contract is pure, so every refusal is reachable without a database and every one of them
 * has a matching acceptance case. A refusal with no paired acceptance proves only that the gate
 * says no, which a `return false` would also do.
 */

import { acceptToolGrant, type ProposedGrant } from '../agentToolGrantContract';

const ALI = 'ali@colaberry.com';

/** A grant that passes. Each test spoils exactly one thing about it. */
function clean(over: Partial<ProposedGrant> = {}): ProposedGrant {
  return {
    agent: {
      id: '11111111-1111-4111-8111-111111111111',
      agentName: 'Maya',
      toolsGranted: ['draft_marketing_email'],
    },
    toolName: 'send_email',
    capabilityId: 'admissions.CAP.reply',
    capabilityState: 'confirmed',
    approvedBy: ALI,
    recordedHumans: [ALI],
    approvers: [ALI],
    proposedBy: 'kalkidan@colaberry.com',
    registeredToolNames: ['send_email', 'draft_marketing_email', 'read_attachments'],
    // Agent Tools Phase 4. The clean case now needs a capability that actually ASKS for the tool
    // being granted, because `tool_not_required_by_capability` refuses one that does not. This
    // is the positive control for that rule as much as for the others: if the clean case did not
    // include `send_email` here, every refusal below would be passing for the wrong reason.
    capabilityRequiredTools: ['send_email', 'read_attachments'],
    ...over,
  };
}

const rules = (v: ReturnType<typeof acceptToolGrant>): string[] =>
  (v.ok ? [] : v.issues.map((i) => i.rule));

describe('the clean case — without this every refusal below proves nothing', () => {
  it('accepts a confirmed capability, a registered tool and a configured approver', () => {
    const verdict = acceptToolGrant(clean());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.grant.toolName).toBe('send_email');
    expect(verdict.grant.approvedBy).toBe(ALI);
    expect(verdict.grant.capabilityId).toBe('admissions.CAP.reply');
  });

  it('appends the new tool and keeps the existing order, because order is load-bearing', () => {
    // maybeReclassifyAutonomyLevel compares JSON.stringify of before and after. A reordered
    // list with identical membership would read as a change and rewrite autonomy_level.
    const verdict = acceptToolGrant(clean({
      agent: { id: 'a', agentName: 'Maya', toolsGranted: ['z_tool', 'a_tool'] },
    }));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.grant.toolsGrantedAfter).toEqual(['z_tool', 'a_tool', 'send_email']);
  });

  it('is idempotent: granting a tool already held changes nothing and says so', () => {
    const verdict = acceptToolGrant(clean({
      agent: { id: 'a', agentName: 'Maya', toolsGranted: ['send_email'] },
    }));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.grant.alreadyGranted).toBe(true);
    expect(verdict.grant.toolsGrantedAfter).toEqual(['send_email']);
  });
});

describe('who is asking', () => {
  it('REFUSES an empty roster as its own reason, not as permission', () => {
    // absence is not approval. This is the refusal that carries the weight, because
    // isNonHumanIdentity returns false for the identities that actually walk through.
    expect(rules(acceptToolGrant(clean({ recordedHumans: [] }))))
      .toContain('approver_roster_absent');
  });

  it('REFUSES an unreadable roster the same way as an empty one', () => {
    expect(rules(acceptToolGrant(clean({ recordedHumans: null }))))
      .toContain('approver_roster_absent');
  });

  it('REFUSES the four-hour auto-approve timer identity', () => {
    expect(rules(acceptToolGrant(clean({ approvedBy: 'system:auto_approve_timeout' }))))
      .toContain('approver_is_non_human');
  });

  it('REFUSES "unknown", which is the identity that actually walks through', () => {
    // approvalRequestController writes `req.admin?.email || 'unknown'`, and
    // isNonHumanIdentity('unknown') is FALSE — so only the positive roster catches it.
    const verdict = acceptToolGrant(clean({ approvedBy: 'unknown', recordedHumans: [ALI] }));
    expect(rules(verdict)).toContain('approver_not_a_recorded_human');
  });

  it('REFUSES somebody real who is not a configured approver', () => {
    const other = 'ram@colaberry.com';
    const verdict = acceptToolGrant(clean({ approvedBy: other, recordedHumans: [other] }));
    expect(rules(verdict)).toContain('approver_not_configured');
    // and NOT for being a stranger — he is a real person, which is a different check
    expect(rules(verdict)).not.toContain('approver_not_a_recorded_human');
  });

  it('REFUSES everybody when the approver set somehow arrives empty', () => {
    expect(rules(acceptToolGrant(clean({ approvers: [] }))))
      .toContain('approver_not_configured');
  });

  it('REFUSES the proposer, even when they are a configured approver', () => {
    // The whole point of keeping the proposer check independent of the approver set.
    const verdict = acceptToolGrant(clean({ proposedBy: ALI }));
    expect(rules(verdict)).toContain('approver_is_the_proposer');
  });

  it('does not refuse the proposer when nobody is recorded as having proposed it', () => {
    expect(rules(acceptToolGrant(clean({ proposedBy: null }))))
      .not.toContain('approver_is_the_proposer');
  });

  it('compares the proposer case-insensitively, so casing cannot defeat it', () => {
    expect(rules(acceptToolGrant(clean({ proposedBy: 'ALI@Colaberry.com' }))))
      .toContain('approver_is_the_proposer');
  });
});

describe('what is being granted', () => {
  it('REFUSES a tool nothing implements', () => {
    expect(rules(acceptToolGrant(clean({ toolName: 'summon_a_pony' }))))
      .toContain('tool_not_registered');
  });

  it('REFUSES when the registered list could not be read, rather than assuming', () => {
    expect(rules(acceptToolGrant(clean({ registeredToolNames: null }))))
      .toContain('tool_catalog_unreadable');
  });

  it('REFUSES an unnamed tool', () => {
    expect(rules(acceptToolGrant(clean({ toolName: '   ' })))).toContain('tool_name_missing');
  });

  it('REFUSES an agent id that matched nothing', () => {
    expect(rules(acceptToolGrant(clean({ agent: null })))).toContain('agent_not_found');
  });
});

/**
 * Agent Tools Phase 4 — the tie between the tool and the capability it is granted for.
 *
 * Before this rule, `capability_id` on a grant was decoration: a grant could name any confirmed
 * capability while granting a tool that capability never asked for, and nothing noticed. That is
 * the gap that made "every action is tied to a tool" unprovable, because the tie was recorded
 * and never checked.
 */
describe('the tool must be one the capability actually requires', () => {
  it('REFUSES a tool the capability does not list', () => {
    expect(rules(acceptToolGrant(clean({ capabilityRequiredTools: ['read_attachments'] }))))
      .toContain('tool_not_required_by_capability');
  });

  it('REFUSES when the capability requires no tools at all', () => {
    // Distinct from "unreadable": an empty list is a capability that asks for nothing, which
    // cannot justify a tool.
    expect(rules(acceptToolGrant(clean({ capabilityRequiredTools: [] }))))
      .toContain('tool_not_required_by_capability');
  });

  it('FAILS CLOSED when the required tools cannot be read', () => {
    // "I could not check" is not "it is fine" — the same posture as tool_catalog_unreadable.
    const out = rules(acceptToolGrant(clean({ capabilityRequiredTools: null })));
    expect(out).toContain('capability_required_tools_unreadable');
    expect(out).not.toContain('tool_not_required_by_capability');
  });

  it('ACCEPTS when the capability does require it — the positive control for this rule', () => {
    const verdict = acceptToolGrant(clean({ capabilityRequiredTools: ['send_email', 'other'] }));
    expect(verdict.ok).toBe(true);
  });

  it('tells the person what the capability DOES ask for, so the refusal is actionable', () => {
    const verdict = acceptToolGrant(clean({ capabilityRequiredTools: ['read_attachments'] }));
    expect(verdict.ok).toBe(false);
    const detail = (verdict as { issues: Array<{ rule: string; detail: string }> }).issues
      .find((i) => i.rule === 'tool_not_required_by_capability')!.detail;
    expect(detail).toContain('read_attachments');
    expect(detail).toContain('required_tools');
  });

  it('says so plainly when the capability lists nothing', () => {
    const verdict = acceptToolGrant(clean({ capabilityRequiredTools: [] }));
    const detail = (verdict as { issues: Array<{ rule: string; detail: string }> }).issues
      .find((i) => i.rule === 'tool_not_required_by_capability')!.detail;
    expect(detail).toContain('no required tools at all');
  });

  it('does NOT pile this rule on top of a capability that was already refused', () => {
    // Telling somebody their tool is not required by a capability that was rejected is noise on
    // top of the real refusal, and a refusal list that cries wolf gets skimmed.
    const out = rules(acceptToolGrant(clean({
      capabilityState: 'rejected',
      capabilityRequiredTools: ['read_attachments'],
    })));
    expect(out).toContain('capability_rejected');
    expect(out).not.toContain('tool_not_required_by_capability');
  });

  it('does NOT pile this rule on top of a missing capability id', () => {
    const out = rules(acceptToolGrant(clean({ capabilityId: '', capabilityRequiredTools: null })));
    expect(out).toContain('capability_id_missing');
    expect(out).not.toContain('capability_required_tools_unreadable');
  });

  it('does NOT pile this rule on top of an unregistered tool', () => {
    const out = rules(acceptToolGrant(clean({
      toolName: 'not_a_real_tool',
      capabilityRequiredTools: ['send_email'],
    })));
    expect(out).toContain('tool_not_registered');
    expect(out).not.toContain('tool_not_required_by_capability');
  });
});

describe('what it is being granted for', () => {
  it('REFUSES a capability still in draft', () => {
    expect(rules(acceptToolGrant(clean({ capabilityState: 'draft' }))))
      .toContain('capability_not_confirmed');
  });

  it('REFUSES a capability that matched no record at all', () => {
    expect(rules(acceptToolGrant(clean({ capabilityState: null }))))
      .toContain('capability_not_confirmed');
  });

  it('REFUSES a rejected capability by its own name, not as "not confirmed"', () => {
    // Granting on a rejected capability is a REVERSAL, a different decision with a different
    // author. Collapsing it into capability_not_confirmed would hide that.
    const r = rules(acceptToolGrant(clean({ capabilityState: 'rejected' })));
    expect(r).toContain('capability_rejected');
    expect(r).not.toContain('capability_not_confirmed');
  });

  it('REFUSES a grant naming no capability', () => {
    expect(rules(acceptToolGrant(clean({ capabilityId: '' }))))
      .toContain('capability_id_missing');
  });

  it('ACCEPTS once the capability is confirmed — the positive control AF11.0 made possible', () => {
    // Before AF11.0 all 443 capabilities were draft with no way to change that, so the draft
    // refusal refused every grant that could ever be requested and could not be shown to work.
    expect(acceptToolGrant(clean({ capabilityState: 'draft' })).ok).toBe(false);
    expect(acceptToolGrant(clean({ capabilityState: 'confirmed' })).ok).toBe(true);
  });
});

describe('every refusal is returned, not the first', () => {
  it('reports the approver, the tool and the capability problems together', () => {
    const r = rules(acceptToolGrant(clean({
      approvedBy: 'unknown',
      toolName: 'summon_a_pony',
      capabilityState: 'draft',
    })));
    expect(r).toEqual(expect.arrayContaining([
      'approver_not_a_recorded_human', 'tool_not_registered', 'capability_not_confirmed',
    ]));
    expect(r.length).toBeGreaterThanOrEqual(3);
  });
});
