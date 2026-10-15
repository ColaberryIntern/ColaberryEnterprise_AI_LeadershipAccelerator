import * as factoryGate from '../../factory/buildAuthorization';
import {
  assertBuildAuthorized,
  BuildNotAuthorizedError,
  resolveAllFromRows,
  type BuildAuthorizationLike,
} from '../agentDomainBuildAuthorization';
import { AGENT_DOMAINS } from '../agentDomainRegistry';

const VALID: BuildAuthorizationLike = {
  approver_identity_id: 'f179c222-284e-4180-a335-cca9e4918b2e',
  scope: 'documented',
  resource_limit: '1 sandbox, no production write',
  revoked_at: null,
};

describe('one gate, not two', () => {
  it('this module re-exports the SAME function object as the factory path', () => {
    // The whole "one gate, two storage locations" claim reduces to this identity. If it ever
    // becomes a copy, a change to the refusal would apply to one path and not the other.
    expect(assertBuildAuthorized).toBe(factoryGate.assertBuildAuthorized);
  });

  it('re-exports the same error class, so callers can catch across both paths', () => {
    expect(BuildNotAuthorizedError).toBe(factoryGate.BuildNotAuthorizedError);
  });

  it('POSITIVE CONTROL: a local re-implementation would NOT satisfy that identity', () => {
    const copy = (a: BuildAuthorizationLike | null) => { if (!a) throw new Error('no'); };
    expect(copy).not.toBe(factoryGate.assertBuildAuthorized);
  });
});

describe('all five refusal reasons are reachable through this path', () => {
  const cases: Array<[string, BuildAuthorizationLike | null, string]> = [
    ['no_authorization', null, 'no_authorization'],
    ['revoked', { ...VALID, revoked_at: new Date() }, 'revoked'],
    ['missing_approver', { ...VALID, approver_identity_id: '' }, 'missing_approver'],
    ['missing_scope', { ...VALID, scope: '   ' }, 'missing_scope'],
    ['missing_resource_limit', { ...VALID, resource_limit: null }, 'missing_resource_limit'],
  ];

  for (const [label, auth, expected] of cases) {
    it(`refuses with ${label}`, () => {
      try {
        assertBuildAuthorized(auth);
        throw new Error('expected a refusal');
      } catch (err) {
        expect(err).toBeInstanceOf(BuildNotAuthorizedError);
        expect((err as any).reason).toBe(expected);
      }
    });
  }

  it('POSITIVE CONTROL: a complete authorization is NOT refused, so the gate is not refuse-always', () => {
    expect(() => assertBuildAuthorized(VALID)).not.toThrow();
  });
});

describe('with the table empty, every one of the ten domains refuses', () => {
  it('all ten report no_authorization — tested across the registry, not one entry', () => {
    const states = resolveAllFromRows({});
    expect(states).toHaveLength(10);
    expect(states.every((s) => s.authorized === false)).toBe(true);
    expect(new Set(states.map((s) => s.reason))).toEqual(new Set(['no_authorization']));
  });

  it('covers every registry domain key, so none is silently skipped', () => {
    const keys = resolveAllFromRows({}).map((s) => s.domain_key).sort();
    expect(keys).toEqual(AGENT_DOMAINS.map((d) => d.domain_key).sort());
  });

  it('a domain with a complete authorization is the ONLY one that flips', () => {
    const states = resolveAllFromRows({ marketing: VALID });
    const authorized = states.filter((s) => s.authorized).map((s) => s.domain_key);
    expect(authorized).toEqual(['marketing']);
    expect(states.filter((s) => !s.authorized)).toHaveLength(9);
  });

  it('an EMPTY row does not authorize — the three fields are all required', () => {
    // "a build was authorized" must be a deliberate, attributable act, never an empty row.
    const states = resolveAllFromRows({ marketing: {} as BuildAuthorizationLike });
    expect(states.find((s) => s.domain_key === 'marketing')!.authorized).toBe(false);
  });

  it('a revoked authorization does not authorize', () => {
    const states = resolveAllFromRows({ marketing: { ...VALID, revoked_at: new Date() } });
    expect(states.find((s) => s.domain_key === 'marketing')!.reason).toBe('revoked');
  });
});

describe('this module enables no autonomous build path', () => {
  const source = (() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    return fs.readFileSync(path.join(__dirname, '..', 'agentDomainBuildAuthorization.ts'), 'utf8');
  })();

  /** Strip block and line comments, so prose about a term is not counted as using it. */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('grants nothing: no allowed:true, no risk tier, no autonomy, no DM, no autobuild flag', () => {
    expect(/allowed\s*:\s*true/.test(code)).toBe(false);
    expect(/risk_tier|maxRiskTier/.test(code)).toBe(false);
    expect(/autonomy/i.test(code)).toBe(false);
    expect(/initiateDm|sendDm/.test(code)).toBe(false);
    expect(/isAutonomousExecutionEnabled/.test(code)).toBe(false);
  });

  it('POSITIVE CONTROL: the sweep is pointed at real content, so a zero is meaningful', () => {
    // A zero count proves nothing unless the haystack is demonstrably non-empty and the pattern
    // demonstrably matches something in it.
    expect(code.length).toBeGreaterThan(500);
    expect(/assertBuildAuthorized/.test(code)).toBe(true);
    expect(/allowed\s*:\s*true/.test('const x = { allowed: true };')).toBe(true);
  });

  it('issues no INSERT, UPDATE or DELETE — it is a read-and-refuse module', () => {
    expect(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(code)).toBe(false);
  });

  it('reads its own table schema-qualified, since three schemas exist in this database', () => {
    expect(/public\.agent_domain_build_authorizations/.test(code)).toBe(true);
  });

  it('never touches the gov table', () => {
    expect(/\bbuild_authorizations\b(?!_)/.test(code.replace(/agent_domain_build_authorizations/g, ''))).toBe(false);
  });
});
