import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  checkRunnerClaims, verifyRunnerToken, resetRunnerKeyCache, RunnerIdentityError,
  GITHUB_OIDC_ISSUER, PLATFORM_BUILD_AUDIENCE,
} from '../runnerIdentity';

const EXP = { repository: 'ColaberryIntern/Repo', workflowFile: 'platform-build-runner.yml' };
const GOOD = {
  repository: 'ColaberryIntern/Repo',
  workflow_ref: 'ColaberryIntern/Repo/.github/workflows/platform-build-runner.yml@refs/heads/main',
  ref: 'refs/heads/main',
  event_name: 'workflow_dispatch',
  runner_environment: 'github-hosted',
};

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as object), kid: 'k1', kty: 'RSA' };
const fetchKeys = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ keys: [jwk] }) }));

const sign = (claims: object, opts: jwt.SignOptions = {}) => jwt.sign(claims, privateKey, {
  algorithm: 'RS256', keyid: 'k1', issuer: GITHUB_OIDC_ISSUER, audience: PLATFORM_BUILD_AUDIENCE, expiresIn: 300, ...opts,
});

beforeEach(() => { resetRunnerKeyCache(); fetchKeys.mockClear(); });

describe('checkRunnerClaims', () => {
  it('accepts our workflow on main', () => {
    expect(checkRunnerClaims(GOOD, EXP)).toEqual([]);
  });
  it.each([
    ['a fork', { repository: 'someone/Repo' }, 'repository'],
    ['a branch edit', { workflow_ref: 'ColaberryIntern/Repo/.github/workflows/platform-build-runner.yml@refs/heads/evil' }, 'workflow_ref'],
    ['another workflow', { workflow_ref: 'ColaberryIntern/Repo/.github/workflows/ci.yml@refs/heads/main' }, 'workflow_ref'],
    ['a push event', { event_name: 'push' }, 'event_name'],
    ['a self-hosted runner', { runner_environment: 'self-hosted' }, 'runner_environment'],
  ])('refuses %s', (_label, patch, field) => {
    expect(checkRunnerClaims({ ...GOOD, ...patch }, EXP)).toContain(field);
  });
});

describe('verifyRunnerToken', () => {
  it('accepts a correctly signed token from our workflow', async () => {
    const claims = await verifyRunnerToken(sign(GOOD), EXP, fetchKeys as any);
    expect(claims.repository).toBe(GOOD.repository);
  });

  it('refuses the wrong audience, an expired token, and a foreign key', async () => {
    await expect(verifyRunnerToken(sign(GOOD, { audience: 'sts.amazonaws.com' }), EXP, fetchKeys as any)).rejects.toBeInstanceOf(RunnerIdentityError);
    await expect(verifyRunnerToken(sign(GOOD, { expiresIn: -10 }), EXP, fetchKeys as any)).rejects.toBeInstanceOf(RunnerIdentityError);
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const forged = jwt.sign(GOOD, other, { algorithm: 'RS256', keyid: 'k1', issuer: GITHUB_OIDC_ISSUER, audience: PLATFORM_BUILD_AUDIENCE, expiresIn: 300 });
    await expect(verifyRunnerToken(forged, EXP, fetchKeys as any)).rejects.toBeInstanceOf(RunnerIdentityError);
  });

  it('refuses a valid signature whose claims are not our workflow on main', async () => {
    await expect(verifyRunnerToken(sign({ ...GOOD, ref: 'refs/heads/x' }), EXP, fetchKeys as any)).rejects.toThrow(/ref/);
  });

  it('refuses a missing token and an HS256 token', async () => {
    await expect(verifyRunnerToken('', EXP, fetchKeys as any)).rejects.toBeInstanceOf(RunnerIdentityError);
    const hs = jwt.sign(GOOD, 'shared', { algorithm: 'HS256', keyid: 'k1', issuer: GITHUB_OIDC_ISSUER, audience: PLATFORM_BUILD_AUDIENCE });
    await expect(verifyRunnerToken(hs, EXP, fetchKeys as any)).rejects.toBeInstanceOf(RunnerIdentityError);
  });

  it('caches the keys, and fails closed when GitHub is unreachable', async () => {
    await verifyRunnerToken(sign(GOOD), EXP, fetchKeys as any);
    await verifyRunnerToken(sign(GOOD), EXP, fetchKeys as any);
    expect(fetchKeys).toHaveBeenCalledTimes(1);
    resetRunnerKeyCache();
    const down = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(verifyRunnerToken(sign(GOOD), EXP, down as any)).rejects.toBeInstanceOf(RunnerIdentityError);
  });
});
