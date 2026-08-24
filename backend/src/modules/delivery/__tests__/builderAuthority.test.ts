/**
 * Contract tests for Builder Authority resolution.
 *
 * The rule under test throughout: **a profile caps, it never grants**, and absence is the
 * most restrictive case rather than an exemption.
 */
jest.mock('../../../models/BuilderAuthorityProfile', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

import BuilderAuthorityProfile from '../../../models/BuilderAuthorityProfile';
import {
  NO_AUTHORITY,
  checkCapacity,
  mayWorkInProjectClass,
  resolveBuilderAuthority,
} from '../builderAuthority';

const mockFindOne = (BuilderAuthorityProfile as unknown as { findOne: jest.Mock }).findOne;

const EVALUATED = new Date('2026-08-01T00:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('absence is the most restrictive case', () => {
  it('no identity → no authority', async () => {
    const authority = await resolveBuilderAuthority(null);
    expect(authority.maxRiskWithoutReview).toBe('R0');
    expect(authority.releaseAuthority).toBe(false);
    expect(authority.isUnevaluated).toBe(true);
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('no profile row → R0, one project, no client contact, no release authority', async () => {
    mockFindOne.mockResolvedValue(null);
    const authority = await resolveBuilderAuthority('id-1');

    expect(authority).toMatchObject({
      platformIdentityId: 'id-1',
      maxRiskWithoutReview: 'R0',
      maxParallelProjects: 1,
      clientInteractionAllowed: false,
      releaseAuthority: false,
      allowedProjectClasses: [],
      isUnevaluated: true,
    });
  });

  it('an unreadable profile fails CLOSED, not open', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFindOne.mockRejectedValue(new Error('db down'));

    const authority = await resolveBuilderAuthority('id-1');

    expect(authority.maxRiskWithoutReview).toBe('R0');
    expect(authority.releaseAuthority).toBe(false);
    // The failure must be visible rather than silent.
    expect(consoleError).toHaveBeenCalled();
    const logged = JSON.parse(String(consoleError.mock.calls[0][0]));
    expect(logged.event).toBe('builder_authority_lookup_failed');
    expect(logged.outcome).toBe('failure');
    consoleError.mockRestore();
  });
});

describe('an unevaluated profile confers nothing, whatever its columns say', () => {
  it('a generous row with no last_evaluated_at is still the floor', async () => {
    // A row created by a fixture or a partial import must not confer authority nobody
    // reviewed. last_evaluated_at is the signal a human stood behind these values.
    mockFindOne.mockResolvedValue({
      builder_level: 'senior',
      allowed_project_classes: ['commercial_client'],
      max_parallel_projects: 9,
      max_risk_without_review: 'R4',
      client_interaction_allowed: true,
      release_authority: true,
      last_evaluated_at: null,
    });

    const authority = await resolveBuilderAuthority('id-1');

    expect(authority.maxRiskWithoutReview).toBe('R0');
    expect(authority.maxParallelProjects).toBe(1);
    expect(authority.releaseAuthority).toBe(false);
    expect(authority.clientInteractionAllowed).toBe(false);
    expect(authority.allowedProjectClasses).toEqual([]);
    expect(authority.isUnevaluated).toBe(true);
    // The label still surfaces, so the UI can show "senior (unevaluated)".
    expect(authority.builderLevel).toBe('senior');
  });
});

describe('an evaluated profile is honoured', () => {
  it('returns the stored caps', async () => {
    mockFindOne.mockResolvedValue({
      builder_level: 'senior',
      allowed_project_classes: ['commercial_client', 'internal'],
      max_parallel_projects: 3,
      max_risk_without_review: 'R3',
      client_interaction_allowed: true,
      release_authority: true,
      last_evaluated_at: EVALUATED,
    });

    const authority = await resolveBuilderAuthority('id-1');

    expect(authority).toMatchObject({
      maxRiskWithoutReview: 'R3',
      maxParallelProjects: 3,
      clientInteractionAllowed: true,
      releaseAuthority: true,
      isUnevaluated: false,
      lastEvaluatedAt: EVALUATED,
    });
  });

  it('a malformed risk level in the database falls back to R0, never to “everything”', async () => {
    // A typo in an authority column must not widen authority. It must also not make every
    // action appear to exceed the ceiling, which is what leaving it in place would do.
    mockFindOne.mockResolvedValue({
      max_risk_without_review: 'R99',
      last_evaluated_at: EVALUATED,
      max_parallel_projects: 2,
    });

    const authority = await resolveBuilderAuthority('id-1');
    expect(authority.maxRiskWithoutReview).toBe('R0');
  });

  it('missing numeric columns fall back to the least-privileged default', async () => {
    mockFindOne.mockResolvedValue({
      max_risk_without_review: 'R2',
      last_evaluated_at: EVALUATED,
      max_parallel_projects: null,
      allowed_project_classes: null,
    });

    const authority = await resolveBuilderAuthority('id-1');
    expect(authority.maxParallelProjects).toBe(1);
    expect(authority.allowedProjectClasses).toEqual([]);
  });
});

describe('project class allow-list', () => {
  it('an empty allow-list permits nothing', () => {
    expect(mayWorkInProjectClass(NO_AUTHORITY, 'sandbox')).toBe(false);
    expect(mayWorkInProjectClass(NO_AUTHORITY, 'commercial_client')).toBe(false);
  });

  it('only listed classes are permitted', () => {
    const authority = { ...NO_AUTHORITY, allowedProjectClasses: ['sandbox', 'internal'] };
    expect(mayWorkInProjectClass(authority, 'sandbox')).toBe(true);
    expect(mayWorkInProjectClass(authority, 'government_public_sector')).toBe(false);
  });
});

describe('capacity returns a decision, not an exception', () => {
  it('under the cap is within capacity', () => {
    const authority = { ...NO_AUTHORITY, maxParallelProjects: 3 };
    expect(checkCapacity(authority, 2)).toEqual({
      withinCapacity: true,
      activeProjects: 2,
      maxParallelProjects: 3,
    });
  });

  it('at the cap is NOT within capacity — the guard fires on equality', () => {
    const authority = { ...NO_AUTHORITY, maxParallelProjects: 3 };
    expect(checkCapacity(authority, 3).withinCapacity).toBe(false);
  });

  it('over the cap reports the real numbers so a lead can override with a reason', () => {
    // Master plan §Gate 12: a delivery lead may override, so the caller needs the
    // numbers rather than a thrown error.
    const authority = { ...NO_AUTHORITY, maxParallelProjects: 1 };
    expect(checkCapacity(authority, 5)).toEqual({
      withinCapacity: false,
      activeProjects: 5,
      maxParallelProjects: 1,
    });
  });
});
