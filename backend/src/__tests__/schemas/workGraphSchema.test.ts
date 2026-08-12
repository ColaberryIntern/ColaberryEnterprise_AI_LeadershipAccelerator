import {
  createWorkUnitInputSchema,
  createWorkUnitDependencySchema,
  acquireLeaseInputSchema,
} from '../../schemas/workGraphSchema';

describe('createWorkUnitInputSchema', () => {
  it('accepts valid minimal input', () => {
    const result = createWorkUnitInputSchema.safeParse({
      title: 'Design the onboarding schema',
      requiredCapability: 'curriculum.design_module',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid full input', () => {
    const result = createWorkUnitInputSchema.safeParse({
      title: 'Generate artifact',
      requiredCapability: 'curriculum.generate_artifact',
      riskTier: 'R2',
      status: 'ready',
      eligibleParallelism: 3,
      expectedOutputRefs: [{ type: 'file', ref: 'x.md' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing title', () => {
    const result = createWorkUnitInputSchema.safeParse({
      requiredCapability: 'curriculum.design_module',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing requiredCapability', () => {
    const result = createWorkUnitInputSchema.safeParse({ title: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid riskTier', () => {
    const result = createWorkUnitInputSchema.safeParse({
      title: 'x',
      requiredCapability: 'y',
      riskTier: 'R9',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid status', () => {
    const result = createWorkUnitInputSchema.safeParse({
      title: 'x',
      requiredCapability: 'y',
      status: 'not_a_real_status',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive eligibleParallelism', () => {
    const result = createWorkUnitInputSchema.safeParse({
      title: 'x',
      requiredCapability: 'y',
      eligibleParallelism: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('createWorkUnitDependencySchema', () => {
  it('accepts a valid dependency edge', () => {
    const result = createWorkUnitDependencySchema.safeParse({
      dependsOnWorkUnitId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid dependsOnWorkUnitId', () => {
    const result = createWorkUnitDependencySchema.safeParse({
      dependsOnWorkUnitId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown extra fields (strict schema)', () => {
    const result = createWorkUnitDependencySchema.safeParse({
      dependsOnWorkUnitId: '11111111-1111-4111-8111-111111111111',
      somethingElse: 'x',
    });
    expect(result.success).toBe(false);
  });
});

describe('acquireLeaseInputSchema', () => {
  const base = {
    resourceKey: 'file:backend/src/services/x.ts',
    leaseOwner: 'PlatformFixAgent',
    idempotencyKey: 'lease:ticket-1:x.ts',
  };

  it('accepts valid minimal input', () => {
    expect(acquireLeaseInputSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a missing resourceKey', () => {
    const { resourceKey, ...rest } = base;
    expect(acquireLeaseInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing idempotencyKey', () => {
    const { idempotencyKey, ...rest } = base;
    expect(acquireLeaseInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty resourceKey', () => {
    expect(acquireLeaseInputSchema.safeParse({ ...base, resourceKey: '' }).success).toBe(false);
  });

  it('rejects a ttlMs beyond the 24h cap', () => {
    expect(
      acquireLeaseInputSchema.safeParse({ ...base, ttlMs: 25 * 60 * 60 * 1000 }).success
    ).toBe(false);
  });

  it('accepts a ttlMs within the cap', () => {
    expect(acquireLeaseInputSchema.safeParse({ ...base, ttlMs: 60000 }).success).toBe(true);
  });
});
