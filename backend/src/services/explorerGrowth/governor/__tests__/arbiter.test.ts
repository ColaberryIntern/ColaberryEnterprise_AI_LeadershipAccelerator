import * as fs from 'fs';
import * as path from 'path';
import { arbitrate, SORT_KEYS } from '../arbiter';
import type { Candidate, GovernorContext, PriorityTier } from '../types';

const NOW = new Date('2026-08-23T12:00:00Z');

function ctx(days = 5): GovernorContext {
  return {
    enrollment_id: 'e1',
    primary_state: 'ACTIVATING',
    overlays: [],
    scores: { e: 20, i: 0, f: 0 },
    affinities: [],
    readout: {} as any,
    days_in_current_state: days,
    contactability: { email: { eligible: true } },
    hardStop: {
      converted: false, unsubscribed: false, dnc: false,
      consentRevoked: false, killSwitch: false, campaignInactive: false,
    },
    asOf: NOW,
  };
}

function cand(tier: PriorityTier, score = 50, key = `c${tier}`): Candidate {
  return {
    action_type: 'SEND_EMAIL',
    campaign_key: key,
    priority_tier: tier,
    intra_tier_score: score,
    channel: 'email',
    required_assets: [],
    rationale: [`tier ${tier}`],
  };
}

describe('the lowest tier wins', () => {
  it('prefers tier 2 over tier 9 regardless of score', () => {
    const r = arbitrate([cand(9, 100), cand(2, 1)], ctx());
    expect(r.winner!.priority_tier).toBe(2);
  });

  it('FRICTION RECOVERY (tier 2) beats a REPLY (tier 3) — §9.1', () => {
    // The rule with a stated reason: a learner who replied because their
    // payment failed needs recovery, not a sales reply.
    const friction = { ...cand(2, 50), action_type: 'RECOVER_FRICTION' as const };
    const reply = { ...cand(3, 99), action_type: 'CREATE_HUMAN_TASK' as const };
    expect(arbitrate([reply, friction], ctx()).winner!.action_type).toBe('RECOVER_FRICTION');
  });

  it('is unaffected by the order candidates arrive in', () => {
    const a = arbitrate([cand(6), cand(2), cand(9)], ctx()).winner!;
    const b = arbitrate([cand(9), cand(6), cand(2)], ctx()).winner!;
    expect(a.priority_tier).toBe(b.priority_tier);
  });
});

describe('ties break by score, then deterministically', () => {
  it('prefers the higher intra_tier_score inside a tier', () => {
    const r = arbitrate([cand(6, 40, 'low'), cand(6, 80, 'high')], ctx());
    expect(r.winner!.campaign_key).toBe('high');
  });

  it('is TOTAL — identical tier and score still produce a stable winner', () => {
    // Without a final key the sort is implementation-defined, which would
    // quietly destroy reproducibility and with it the idempotency property the
    // whole system rests on.
    const first = arbitrate([cand(6, 50, 'bbb'), cand(6, 50, 'aaa')], ctx()).winner!;
    const second = arbitrate([cand(6, 50, 'aaa'), cand(6, 50, 'bbb')], ctx()).winner!;
    expect(first.campaign_key).toBe(second.campaign_key);
  });

  it('documents §9.4’s four sort keys, including the enrollment_id tiebreak', () => {
    expect(SORT_KEYS).toEqual([
      'priority_tier ASC',
      'intra_tier_score DESC',
      'days_in_current_state DESC',
      'enrollment_id ASC',
    ]);
  });
});

describe('every loser is recorded with a reason', () => {
  it('returns all non-winners as suppressed', () => {
    const r = arbitrate([cand(2), cand(6), cand(9)], ctx());
    expect(r.suppressed).toHaveLength(2);
    for (const s of r.suppressed) expect(s.reason).toBeTruthy();
  });

  it('distinguishes losing on tier from losing within a tier', () => {
    const r = arbitrate([cand(2, 90, 'win'), cand(2, 10, 'same-tier'), cand(9, 99, 'lower')], ctx());
    const sameTier = r.suppressed.find((s) => s.campaign_key === 'same-tier')!;
    const lower = r.suppressed.find((s) => s.campaign_key === 'lower')!;
    expect(sameTier.reason).toContain('outranked within tier');
    expect(lower.reason).toContain('lower priority');
  });

  it('carries the action type and campaign onto the suppression record', () => {
    const r = arbitrate([cand(2, 90, 'win'), cand(9, 10, 'dropped')], ctx());
    expect(r.suppressed[0]).toMatchObject({ action_type: 'SEND_EMAIL', campaign_key: 'dropped' });
  });
});

describe('empty and null handling', () => {
  it('treats no candidates as a legitimate outcome, not an error', () => {
    // The Governor having nothing to say is normal; T004 records it as WAIT.
    expect(arbitrate([], ctx())).toEqual({ winner: null, suppressed: [] });
  });

  it('ignores nulls from generators that declined', () => {
    const r = arbitrate([null, cand(6), null], ctx());
    expect(r.winner!.priority_tier).toBe(6);
    expect(r.suppressed).toEqual([]);
  });
});

describe('purity and the AI constraint (§9.4)', () => {
  it('is pure — same candidates, same winner', () => {
    const cands = [cand(6, 70), cand(2, 30), cand(9, 90)];
    expect(arbitrate(cands, ctx())).toEqual(arbitrate(cands, ctx()));
  });

  it('does not mutate the candidates it is given', () => {
    const cands = [cand(9, 10), cand(2, 20)];
    const before = JSON.stringify(cands);
    arbitrate(cands, ctx());
    expect(JSON.stringify(cands)).toBe(before);
  });

  it('imports NO model client — AI is never authoritative here', () => {
    // Structural, not a policy promise: §9.4 permits AI to reorder within a
    // tier but never to decide consent, price, dates, seats or enrolment state.
    const src = fs.readFileSync(path.join(__dirname, '..', 'arbiter.ts'), 'utf8');
    for (const forbidden of ['openai', 'anthropic', 'Anthropic', 'OpenAI', 'llm', 'gpt']) {
      expect(src.toLowerCase()).not.toContain(`from '${forbidden.toLowerCase()}`);
    }
    const imports = Array.from(src.matchAll(/from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
    expect(imports).toEqual(['./types']);
  });
});
