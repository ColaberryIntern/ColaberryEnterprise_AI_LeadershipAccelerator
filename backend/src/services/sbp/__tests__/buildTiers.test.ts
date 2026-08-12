/**
 * buildTiers — FR-002's acceptance bar, asserted directly.
 *
 * "Given the three tiers are run on the same idea; Then requirement counts
 * differ by at least 40% between adjacent tiers." Before this module every
 * tier shared one DEFAULT_TARGETS set, so the wizard's choice changed nothing.
 */
import {
  TIER_DEPTH, TIER_ORDER, asTier, tierDepth, tierTargets, midRequirements, BuildTier,
} from '../buildTiers';
import { buildDecomposeUserPrompt } from '../decomposePrompt';

describe('FR-002 — adjacent tiers differ by at least 40%', () => {
  it('holds on the midpoint of each requirement range', () => {
    for (let i = 1; i < TIER_ORDER.length; i += 1) {
      const lower = midRequirements(TIER_ORDER[i - 1]);
      const upper = midRequirements(TIER_ORDER[i]);
      const growth = (upper - lower) / lower;
      expect(growth).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('holds on the range bounds too, not just the midpoint', () => {
    for (let i = 1; i < TIER_ORDER.length; i += 1) {
      const lo = TIER_DEPTH[TIER_ORDER[i - 1]].requirements;
      const hi = TIER_DEPTH[TIER_ORDER[i]].requirements;
      expect((hi[0] - lo[0]) / lo[0]).toBeGreaterThanOrEqual(0.4);
      expect((hi[1] - lo[1]) / lo[1]).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('escalates releases and stories with the tier, so a bigger tier is a bigger plan', () => {
    for (let i = 1; i < TIER_ORDER.length; i += 1) {
      const lo = TIER_DEPTH[TIER_ORDER[i - 1]];
      const hi = TIER_DEPTH[TIER_ORDER[i]];
      expect(hi.releases).toBeGreaterThan(lo.releases);
      expect(hi.stories[0]).toBeGreaterThan(lo.stories[0]);
      expect(hi.wordFloor).toBeGreaterThan(lo.wordFloor);
    }
  });
});

describe('FR-003 word floors', () => {
  it('are exactly the floors the requirement names', () => {
    expect(TIER_DEPTH.workflow.wordFloor).toBe(2_500);
    expect(TIER_DEPTH.project.wordFloor).toBe(6_000);
    expect(TIER_DEPTH.autonomous.wordFloor).toBe(12_000);
  });
});

describe('tier resolution', () => {
  it('accepts the three real tiers', () => {
    (['workflow', 'project', 'autonomous'] as BuildTier[]).forEach((t) => expect(asTier(t)).toBe(t));
  });

  it('falls back to project for anything unrecognised', () => {
    [undefined, null, '', 'enormous', 'PROJECT'].forEach((v) => expect(asTier(v as any)).toBe('project'));
  });

  it('maps autonomous — and only autonomous — to the Architect autonomous mode', () => {
    expect(tierDepth('autonomous').architectMode).toBe('autonomous');
    expect(tierDepth('workflow').architectMode).toBe('professional');
    expect(tierDepth('project').architectMode).toBe('professional');
  });
});

describe('the decomposer actually receives different targets per tier', () => {
  const inputs = { brief: 'A warehouse pallet sorter.', document: '' };

  it('produces a different prompt for each tier', () => {
    const prompts = TIER_ORDER.map((t) =>
      buildDecomposeUserPrompt({ ...inputs, targets: tierTargets(t) }));
    expect(new Set(prompts).size).toBe(TIER_ORDER.length);
  });

  it('states each tier\'s own requirement range and release count in the prompt', () => {
    TIER_ORDER.forEach((t) => {
      const d = TIER_DEPTH[t];
      const prompt = buildDecomposeUserPrompt({ ...inputs, targets: tierTargets(t) });
      expect(prompt).toContain(`${d.requirements[0]}-${d.requirements[1]} requirements`);
      expect(prompt).toContain(`${d.releases} releases`);
      expect(prompt).toContain(`${d.stories[0]}-${d.stories[1]} vertical-slice stories`);
    });
  });

  it('keeps the per-release spread cap finite and positive for every tier', () => {
    // The prompt computes 2 * (stories.min / releases); a zero or NaN release
    // count would emit a nonsense instruction.
    TIER_ORDER.forEach((t) => {
      const d = TIER_DEPTH[t];
      const cap = 2 * (d.stories[0] / d.releases);
      expect(Number.isFinite(cap)).toBe(true);
      expect(cap).toBeGreaterThan(1);
    });
  });
});
