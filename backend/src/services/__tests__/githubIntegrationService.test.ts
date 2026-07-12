// ─── Stubs ────────────────────────────────────────────────────────────────────

jest.mock('../../models', () => ({
  GitHubConnection: { findOrCreate: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  StudentGithubActivity: { findOne: jest.fn(), create: jest.fn() },
  Enrollment: { findAll: jest.fn() },
}));

import crypto from 'crypto';
import {
  buildOAuthUrl,
  validateWebhookSignature,
  findEnrollmentByRepo,
  syncAllActiveStudentGitHubActivity,
} from '../githubIntegrationService';

// ─── buildOAuthUrl ────────────────────────────────────────────────────────────

describe('buildOAuthUrl', () => {
  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_OAUTH_REDIRECT_URI = 'https://example.com/api/portal/github/oauth/callback';
  });

  it('returns a GitHub authorize URL containing client_id, scope=repo, and state=enrollmentId', () => {
    const url = buildOAuthUrl('enrollment-abc');
    expect(url).toContain('github.com/login/oauth/authorize');
    expect(url).toContain('client_id=test-client-id');
    expect(url).toContain('scope=repo');
    expect(url).toContain('state=enrollment-abc');
  });
});

// ─── validateWebhookSignature ─────────────────────────────────────────────────

describe('validateWebhookSignature', () => {
  const secret = 'webhook-secret';
  const body = Buffer.from('{"action":"push"}');

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = secret;
  });

  it('returns true for a valid signature', () => {
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(validateWebhookSignature(body, sig)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(validateWebhookSignature(body, 'sha256=badhash')).toBe(false);
  });

  it('returns false when GITHUB_WEBHOOK_SECRET is not set', () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(validateWebhookSignature(body, sig)).toBe(false);
  });

  it('returns false when signature is empty string', () => {
    expect(validateWebhookSignature(body, '')).toBe(false);
  });
});

// ─── findEnrollmentByRepo ─────────────────────────────────────────────────────

describe('findEnrollmentByRepo', () => {
  it('returns enrollment_id when a matching connection exists', async () => {
    const { GitHubConnection } = require('../../models');
    GitHubConnection.findOne.mockResolvedValue({ enrollment_id: 'enroll-xyz' });
    const result = await findEnrollmentByRepo('owner', 'repo');
    expect(result).toBe('enroll-xyz');
    expect(GitHubConnection.findOne).toHaveBeenCalledWith({
      where: { repo_owner: 'owner', repo_name: 'repo' },
    });
  });

  it('returns null when no connection matches', async () => {
    const { GitHubConnection } = require('../../models');
    GitHubConnection.findOne.mockResolvedValue(null);
    const result = await findEnrollmentByRepo('unknown', 'repo');
    expect(result).toBeNull();
  });
});

// ─── syncAllActiveStudentGitHubActivity ───────────────────────────────────────

describe('syncAllActiveStudentGitHubActivity', () => {
  beforeEach(() => {
    const { GitHubConnection } = require('../../models');
    jest.clearAllMocks();
    // syncStudentActivity calls GitHubConnection.findOne internally;
    // returning null causes an early return (no API calls, no throw).
    GitHubConnection.findOne.mockResolvedValue(null);
  });

  it('syncs 2 students with repos and skips 1 without a connected repo', async () => {
    const { Enrollment, GitHubConnection } = require('../../models');
    Enrollment.findAll.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }]);
    // Only e1 and e2 have repos connected
    GitHubConnection.findAll.mockResolvedValue([
      { enrollment_id: 'e1', repo_owner: 'org', repo_name: 'repo1' },
      { enrollment_id: 'e2', repo_owner: 'org', repo_name: 'repo2' },
    ]);

    const result = await syncAllActiveStudentGitHubActivity();

    expect(result).toEqual({ synced: 2, skipped: 1, failed: 0 });
  });

  it('isolates a per-student failure: one error does not abort the remaining syncs', async () => {
    const { Enrollment, GitHubConnection } = require('../../models');
    Enrollment.findAll.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }]);
    GitHubConnection.findAll.mockResolvedValue([
      { enrollment_id: 'e1', repo_owner: 'org', repo_name: 'repo1' },
      { enrollment_id: 'e2', repo_owner: 'org', repo_name: 'repo2' },
      { enrollment_id: 'e3', repo_owner: 'org', repo_name: 'repo3' },
    ]);
    // e2's sync throws; e1 and e3 return normally via the null-findOne early exit
    GitHubConnection.findOne
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce(null);

    const result = await syncAllActiveStudentGitHubActivity();

    expect(result).toEqual({ synced: 2, skipped: 0, failed: 1 });
  });

  it('returns zeros immediately when there are no active enrollments', async () => {
    const { Enrollment, GitHubConnection } = require('../../models');
    Enrollment.findAll.mockResolvedValue([]);

    const result = await syncAllActiveStudentGitHubActivity();

    expect(result).toEqual({ synced: 0, skipped: 0, failed: 0 });
    expect(GitHubConnection.findAll).not.toHaveBeenCalled();
  });
});
