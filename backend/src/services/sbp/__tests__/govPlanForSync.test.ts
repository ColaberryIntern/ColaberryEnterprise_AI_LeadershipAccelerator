import { isGovBuildProjectVariables } from '../govPlanForSync';

/**
 * Gov sync-recovery: the sync path publishes a gov build's plan before reading it, but ONLY for a
 * gov build. The gate is `project_variables.kind === 'gov'`; a regular SBP build also has STORY
 * tasks, so a loose check would fabricate a gov plan for a non-gov project. This pins the gate.
 */
describe('isGovBuildProjectVariables', () => {
  it('is true only when kind is exactly "gov"', () => {
    expect(isGovBuildProjectVariables({ kind: 'gov' })).toBe(true);
    expect(isGovBuildProjectVariables({ kind: 'gov', gov_canonical_id: 'gws:abc' })).toBe(true);
  });

  it('is false for a non-gov kind', () => {
    expect(isGovBuildProjectVariables({ kind: 'sbp' })).toBe(false);
    expect(isGovBuildProjectVariables({ kind: 'GOV' })).toBe(false); // exact match, case matters
    expect(isGovBuildProjectVariables({ kind: '' })).toBe(false);
  });

  it('is false for missing / malformed variables', () => {
    expect(isGovBuildProjectVariables({})).toBe(false);
    expect(isGovBuildProjectVariables(null)).toBe(false);
    expect(isGovBuildProjectVariables(undefined)).toBe(false);
    expect(isGovBuildProjectVariables('gov')).toBe(false);
    expect(isGovBuildProjectVariables(42)).toBe(false);
  });
});
