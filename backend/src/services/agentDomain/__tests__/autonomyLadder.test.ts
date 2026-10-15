import * as fs from 'fs';
import * as path from 'path';
import {
  AUTONOMY_LEVELS,
  AUTONOMY_STAGES,
  AUTONOMY_MEANINGS,
  AUTONOMY_NAMESPACE,
  RISK_TIER_BEARING_MODELS,
  autonomyIndex,
  effectiveAuthority,
  effectiveAuthorityForDomain,
  isAutonomyStage,
  isBareAutonomyLevel,
  isValidCapabilityAutonomy,
  type CapabilityAuthorityInput,
} from '../autonomyLadder';

const base = (over: Partial<CapabilityAuthorityInput> = {}): CapabilityAuthorityInput => ({
  capability_id: 'marketing.example',
  approved_autonomy: 'autonomy:R2',
  max_permitted_autonomy: 'autonomy:R7',
  granted_tools: ['read_records'],
  environment: 'sandbox',
  human_decision: false,
  ...over,
});

describe('the ladder is ten levels with the owner labels kept verbatim', () => {
  it('has R0 through R9', () => {
    expect(AUTONOMY_LEVELS).toHaveLength(10);
    expect(AUTONOMY_LEVELS[0]).toBe('R0');
    expect(AUTONOMY_LEVELS[9]).toBe('R9');
  });

  it('every level has a meaning, and the meanings are the owner words', () => {
    for (const l of AUTONOMY_LEVELS) {
      expect(AUTONOMY_MEANINGS[l]).toBeTruthy();
    }
    expect(AUTONOMY_MEANINGS.R3).toContain('sandbox tool operations');
    expect(AUTONOMY_MEANINGS.R6).toContain('supervised production pilot');
    expect(AUTONOMY_MEANINGS.R8).toContain('handoffs');
  });

  it('stages are ordered, so an index comparison is meaningful', () => {
    expect(autonomyIndex('autonomy:R0')).toBe(0);
    expect(autonomyIndex('autonomy:R9')).toBe(9);
    expect(autonomyIndex('autonomy:R3')).toBeLessThan(autonomyIndex('autonomy:R7'));
  });
});

describe('stored values are namespaced, because a bare R3 means something dangerous elsewhere', () => {
  it('every stage carries the namespace', () => {
    for (const s of AUTONOMY_STAGES) expect(s.startsWith(AUTONOMY_NAMESPACE)).toBe(true);
  });

  it('a bare R3 is NOT a valid stage', () => {
    expect(isAutonomyStage('R3')).toBe(false);
    expect(isAutonomyStage('autonomy:R3')).toBe(true);
  });

  it('bare levels are detectable, which is what lets a writer reject one', () => {
    expect(isBareAutonomyLevel('R3')).toBe(true);
    expect(isBareAutonomyLevel('R9')).toBe(true);
    expect(isBareAutonomyLevel('autonomy:R3')).toBe(false);
    expect(isBareAutonomyLevel('R10')).toBe(false);
  });

  it('POSITIVE CONTROL: the detector fires on the exact collision value', () => {
    // R3 in the platform risk vocabulary means schema_security_or_external_side_effect.
    expect(isBareAutonomyLevel('R3')).toBe(true);
  });
});

describe('the risk-tier sinks are DISCOVERED from the models, not hardcoded', () => {
  const modelsDir = path.join(__dirname, '..', '..', '..', 'models');

  const discovered = fs.readdirSync(modelsDir)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => /\brisk_tier\b/.test(fs.readFileSync(path.join(modelsDir, f), 'utf8')))
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();

  it('the sweep found models, so a zero would be a broken sweep rather than a clean result', () => {
    // A zero count proves nothing unless the sweep demonstrably works.
    expect(fs.readdirSync(modelsDir).length).toBeGreaterThan(20);
    expect(discovered.length).toBeGreaterThan(0);
  });

  it('the documented sink list matches what the models actually declare', () => {
    // If someone adds risk_tier to a seventh model, this fails and the guard gets extended.
    // Hardcoding alone is how the enumeration went stale the first time.
    expect(discovered).toEqual([...RISK_TIER_BEARING_MODELS].sort());
  });

  it('both FAIL-OPEN readers still exist, so the hazard this guard covers is real', () => {
    const svc = path.join(__dirname, '..', '..');
    const autonomy = fs.readFileSync(path.join(svc, 'agentAutonomy.ts'), 'utf8');
    const router = fs.readFileSync(path.join(svc, 'workGraph', 'capabilityRouter.ts'), 'utf8');

    // agentAutonomy: unrecognized tier -> NOT high risk -> skips the approval requirement.
    expect(autonomy).toMatch(/idx === -1\)\s*return false/);
    // capabilityRouter: unrecognized tier -> 0 -> clears every maxRiskTier ceiling.
    expect(router).toMatch(/riskTierIndex/);
  });

  it('the fail-CLOSED reader still fails closed, which is why it was never the hazard', () => {
    const closed = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'modules', 'delivery', 'deliveryRiskLevels.ts'), 'utf8',
    );
    expect(closed).toMatch(/DELIVERY_RISK_ORDER\.length - 1/);
  });

  it('no autonomy stage collides with a platform risk-tier value', () => {
    const riskValues = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5'];
    for (const stage of AUTONOMY_STAGES) {
      expect(riskValues).not.toContain(stage);
    }
  });
});

describe('not_applicable is permitted only with a recorded reason', () => {
  it('accepts a reasoned not_applicable', () => {
    expect(isValidCapabilityAutonomy({ not_applicable: true, reason: 'no sandbox exists for this surface' })).toBe(true);
  });

  it('REJECTS a reasonless not_applicable — and that pair is its own control', () => {
    expect(isValidCapabilityAutonomy({ not_applicable: true, reason: '' })).toBe(false);
    expect(isValidCapabilityAutonomy({ not_applicable: true })).toBe(false);
    expect(isValidCapabilityAutonomy({ not_applicable: true, reason: '   ' })).toBe(false);
  });

  it('rejects a bare level and accepts a namespaced one', () => {
    expect(isValidCapabilityAutonomy('R3')).toBe(false);
    expect(isValidCapabilityAutonomy('autonomy:R3')).toBe(true);
  });
});

describe('ONE capability passing does not raise the agent authority', () => {
  // The most important test in this module.
  const domain: CapabilityAuthorityInput[] = [
    base({ capability_id: 'marketing.high', approved_autonomy: 'autonomy:R7', granted_tools: ['a', 'b'] }),
    base({ capability_id: 'marketing.low_a', approved_autonomy: 'autonomy:R0' }),
    base({ capability_id: 'marketing.low_b', approved_autonomy: 'autonomy:R0' }),
  ];

  it('each capability resolves from ITS OWN approved level', () => {
    const out = effectiveAuthorityForDomain(domain);
    const byId = Object.fromEntries(out.map((o) => [o.capability_id, o.effective_autonomy]));
    expect(byId['marketing.high']).toBe('autonomy:R7');
    expect(byId['marketing.low_a']).toBe('autonomy:R0');
    expect(byId['marketing.low_b']).toBe('autonomy:R0');
  });

  it('the R7 capability does NOT lift the other two', () => {
    const out = effectiveAuthorityForDomain(domain);
    const lifted = out.filter((o) => o.capability_id !== 'marketing.high'
      && o.effective_autonomy !== 'autonomy:R0');
    expect(lifted).toEqual([]);
  });

  it('POSITIVE CONTROL: a Math.max-over-domain implementation would fail the test above', () => {
    // Demonstrates the test can distinguish the correct implementation from the defect.
    const wrong = (caps: CapabilityAuthorityInput[]) => {
      const max = Math.max(...caps.map((c) => autonomyIndex(c.approved_autonomy as any)));
      return caps.map((c) => ({ capability_id: c.capability_id, effective_autonomy: AUTONOMY_STAGES[max] }));
    };
    const bad = wrong(domain);
    expect(bad.every((b) => b.effective_autonomy === 'autonomy:R7')).toBe(true); // the defect
    const good = effectiveAuthorityForDomain(domain);
    expect(good.every((g) => g.effective_autonomy === 'autonomy:R7')).toBe(false); // the fix
  });

  it('effectiveAuthority takes ONE capability and cannot see a sibling', () => {
    // Structural: the signature admits no collection, so cross-contamination is impossible.
    expect(effectiveAuthority.length).toBe(1);
  });
});

describe('authority is bounded by grants, environment and the human-decision flag', () => {
  it('no tool grants caps at R2, whatever was approved', () => {
    const r = effectiveAuthority(base({ approved_autonomy: 'autonomy:R7', granted_tools: [] }));
    expect(r.effective_autonomy).toBe('autonomy:R2');
    expect(r.reasons).toContain('no_tool_grants');
  });

  it('a max_permitted ceiling lowers but never raises', () => {
    const lowered = effectiveAuthority(base({ approved_autonomy: 'autonomy:R7', max_permitted_autonomy: 'autonomy:R3' }));
    expect(lowered.effective_autonomy).toBe('autonomy:R3');

    const notRaised = effectiveAuthority(base({ approved_autonomy: 'autonomy:R1', max_permitted_autonomy: 'autonomy:R9' }));
    expect(notRaised.effective_autonomy).toBe('autonomy:R1');
  });

  it('a human-required decision is capped below automation at EVERY level', () => {
    const r = effectiveAuthority(base({
      approved_autonomy: 'autonomy:R9', granted_tools: ['a'], human_decision: true,
    }));
    expect(autonomyIndex(r.effective_autonomy!)).toBeLessThanOrEqual(autonomyIndex('autonomy:R5'));
    expect(r.reasons).toContain('human_decision_required_at_every_level');
    expect(r.reasons).toContain('capped_below_automation_because_human_decision');
  });

  it('production at R6 or above still flags the separate pilot approval', () => {
    const r = effectiveAuthority(base({
      approved_autonomy: 'autonomy:R6', granted_tools: ['a'], environment: 'production',
    }));
    expect(r.reasons).toContain('production_requires_separate_pilot_approval');
  });

  it('an unapproved capability has NO effective authority — never a default', () => {
    const r = effectiveAuthority(base({ approved_autonomy: { not_applicable: true, reason: 'n/a' } as any }));
    expect(r.effective_autonomy).toBeNull();
    expect(r.reasons).toContain('no_approved_autonomy');
  });

  it('POSITIVE CONTROL: a fully approved sandbox capability DOES reach its level', () => {
    // So the caps above are real constraints rather than a function that always refuses.
    const r = effectiveAuthority(base({ approved_autonomy: 'autonomy:R4', granted_tools: ['a'] }));
    expect(r.effective_autonomy).toBe('autonomy:R4');
  });
});
