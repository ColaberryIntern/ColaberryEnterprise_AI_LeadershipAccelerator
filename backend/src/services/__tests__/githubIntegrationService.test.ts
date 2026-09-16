// ─── Stubs ────────────────────────────────────────────────────────────────────

jest.mock('../projectService', () => ({ getProjectByEnrollment: jest.fn() }));

jest.mock('../../models', () => ({
  GitHubConnection: { findOrCreate: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  Project: { findByPk: jest.fn() },
  StudentGithubActivity: { findOne: jest.fn(), create: jest.fn() },
  Enrollment: { findAll: jest.fn() },
}));

import crypto from 'crypto';
import {
  buildOAuthUrl,
  validateWebhookSignature,
  findEnrollmentByRepo,
  findRepoBinding,
  resolveProjectForPush,
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

// ─── findRepoBinding / resolveProjectForPush ──────────────────────────────────
//
// A student with two projects has two repos and ONE active pointer. The push
// webhook used to credit every push to the active project, so a push to the
// other repo matched its commits against the wrong requirements. Found
// 2026-09-15 on a learner with exactly that layout.

describe('findRepoBinding', () => {
  it('returns the enrollment AND the project the repo is bound to', async () => {
    const { GitHubConnection } = require('../../models');
    GitHubConnection.findOne.mockResolvedValue({ enrollment_id: 'enroll-f', project_id: 'proj-first' });
    expect(await findRepoBinding('fbeig2020-cloud', 'ai-support-workflow-assistant'))
      .toEqual({ enrollmentId: 'enroll-f', projectId: 'proj-first' });
  });
  it('carries a null project for a legacy, pre-project-scoped connection', async () => {
    const { GitHubConnection } = require('../../models');
    GitHubConnection.findOne.mockResolvedValue({ enrollment_id: 'enroll-old', project_id: null });
    expect(await findRepoBinding('o', 'r')).toEqual({ enrollmentId: 'enroll-old', projectId: null });
  });
  it('returns null for an unknown repo', async () => {
    const { GitHubConnection } = require('../../models');
    GitHubConnection.findOne.mockResolvedValue(null);
    expect(await findRepoBinding('nobody', 'nothing')).toBeNull();
  });
});

describe('resolveProjectForPush', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('credits the BOUND project even when a different project is active', async () => {
    const { Project } = require('../../models');
    const { getProjectByEnrollment } = require('../projectService');
    Project.findByPk.mockResolvedValue({ id: 'proj-first', archived_at: null });
    getProjectByEnrollment.mockResolvedValue({ id: 'proj-second-and-active' });
    expect(await resolveProjectForPush({ enrollmentId: 'enroll-f', projectId: 'proj-first' })).toEqual({ id: 'proj-first' });
    expect(getProjectByEnrollment).not.toHaveBeenCalled();
  });

  it('falls back to the active project ONLY for a connection with no binding', async () => {
    const { Project } = require('../../models');
    const { getProjectByEnrollment } = require('../projectService');
    getProjectByEnrollment.mockResolvedValue({ id: 'proj-active' });
    expect(await resolveProjectForPush({ enrollmentId: 'enroll-old', projectId: null })).toEqual({ id: 'proj-active' });
    expect(Project.findByPk).not.toHaveBeenCalled();
  });

  it('credits nothing when the bound project was archived, rather than the active one', async () => {
    const { Project } = require('../../models');
    const { getProjectByEnrollment } = require('../projectService');
    Project.findByPk.mockResolvedValue({ id: 'proj-gone', archived_at: '2026-09-01T00:00:00Z' });
    getProjectByEnrollment.mockResolvedValue({ id: 'proj-active' });
    expect(await resolveProjectForPush({ enrollmentId: 'enroll-f', projectId: 'proj-gone' })).toBeNull();
    expect(getProjectByEnrollment).not.toHaveBeenCalled();
  });

  it('credits nothing when the bound project row no longer exists', async () => {
    const { Project } = require('../../models');
    Project.findByPk.mockResolvedValue(null);
    expect(await resolveProjectForPush({ enrollmentId: 'enroll-f', projectId: 'proj-missing' })).toBeNull();
  });
});
