/**
 * The registration instructions a student is handed.
 *
 * The properties worth the most here:
 *   - THE COMMAND IS IDEMPOTENT. Story 000 gets re-run. A bare POST would stack
 *     duplicate hooks and a student with three hooks gets three deliveries per
 *     push.
 *   - IT NEVER LEAKS ANOTHER STUDENT'S SECRET. Ownership is checked before a
 *     secret is even read, let alone minted.
 *   - IT DEGRADES rather than erroring when the platform has no webhook URL —
 *     that is an operator gap, and the student's answer is "press Sync", not a
 *     red box about a feature they never asked for.
 */
const mockProjectFindByPk = jest.fn();
const mockConnectionFindOne = jest.fn();
const mockQuery = jest.fn();
const mockGetOrCreateSecret = jest.fn();

jest.mock('../../../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockProjectFindByPk(...a) },
}));
jest.mock('../../../../models/GitHubConnection', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockConnectionFindOne(...a) },
}));
jest.mock('../../../../config/database', () => ({
  sequelize: { query: (...a: any[]) => mockQuery(...a) },
}));
jest.mock('../webhookSecretService', () => ({
  getOrCreateWebhookSecret: (...a: any[]) => mockGetOrCreateSecret(...a),
}));

import { getWebhookSetup } from '../webhookSetupService';

const ENROLLMENT = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';
const PROJECT = '40a5cea6-ace8-4734-8220-7e62df2111e5';
const URL = 'https://enterprise.colaberry.ai/api/webhook/github';
const OLD_ENV = process.env.GITHUB_WEBHOOK_URL;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GITHUB_WEBHOOK_URL = URL;
  mockProjectFindByPk.mockResolvedValue({ enrollment_id: ENROLLMENT });
  mockConnectionFindOne.mockResolvedValue({
    repo_owner: 'ColaberryIntern', repo_name: 'AcceleratorTesting',
  });
  mockGetOrCreateSecret.mockResolvedValue('s3cr3t');
  mockQuery.mockResolvedValue([]);
});
afterAll(() => { process.env.GITHUB_WEBHOOK_URL = OLD_ENV; });

describe('ownership', () => {
  it("returns null for another student's project, before touching any secret", async () => {
    mockProjectFindByPk.mockResolvedValue({ enrollment_id: 'somebody-else' });
    expect(await getWebhookSetup(ENROLLMENT, PROJECT)).toBeNull();
    expect(mockGetOrCreateSecret).not.toHaveBeenCalled();
  });

  it('returns null for a project that does not exist — same answer', async () => {
    mockProjectFindByPk.mockResolvedValue(null);
    expect(await getWebhookSetup(ENROLLMENT, PROJECT)).toBeNull();
    expect(mockGetOrCreateSecret).not.toHaveBeenCalled();
  });
});

describe('the command', () => {
  it('IS IDEMPOTENT: looks for an existing hook on our URL and patches it', async () => {
    const view = await getWebhookSetup(ENROLLMENT, PROJECT);
    const cmd = view!.gh_command!;

    // Finds first...
    expect(cmd).toContain('gh api repos/ColaberryIntern/AcceleratorTesting/hooks --jq');
    expect(cmd).toContain(`select(.config.url=="${URL}")`);
    // ...patches when found...
    expect(cmd).toContain('--method PATCH');
    // ...and only creates when there is none.
    expect(cmd).toContain('--method POST');
    expect(cmd).toContain('if [ -n "$HOOK_ID" ]; then');
  });

  it('IS ONE LINE, because the student pastes it into a chat', async () => {
    // Story 000 asks the student to paste this to Claude Code. A message box
    // sends on the first newline, so a multi-line block ships truncated and the
    // student gets an unterminated-`if` error instead of a working webhook.
    const cmd = (await getWebhookSetup(ENROLLMENT, PROJECT))!.gh_command!;
    expect(cmd).not.toContain('\n');
  });

  it('registers for push events only, as JSON', async () => {
    const cmd = (await getWebhookSetup(ENROLLMENT, PROJECT))!.gh_command!;
    expect(cmd).toContain("-f 'events[]=push'");
    expect(cmd).toContain("-f 'config[content_type]=json'");
  });

  it('passes the secret as an argument and never writes it to a file', async () => {
    const cmd = (await getWebhookSetup(ENROLLMENT, PROJECT))!.gh_command!;
    expect(cmd).toContain("-f 'config[secret]=s3cr3t'");
    // Nothing that would leave the secret on disk for a `git add .` to find.
    expect(cmd).not.toMatch(/>\s*\S*\.env|tee |echo .*secret.*>/i);
  });

  it('quotes the bracketed fields so a shell cannot glob them', async () => {
    const cmd = (await getWebhookSetup(ENROLLMENT, PROJECT))!.gh_command!;
    expect(cmd).toContain("-f 'config[url]=");
  });
});

describe('the manual fallback', () => {
  it('points at the exact page, with the two values to paste', async () => {
    const view = await getWebhookSetup(ENROLLMENT, PROJECT);
    expect(view!.settings_url).toBe('https://github.com/ColaberryIntern/AcceleratorTesting/settings/hooks/new');
    expect(view!.payload_url).toBe(URL);
    expect(view!.secret).toBe('s3cr3t');
  });
});

describe('degradation', () => {
  it('reports unsupported rather than throwing when no webhook URL is configured', async () => {
    delete process.env.GITHUB_WEBHOOK_URL;
    const view = await getWebhookSetup(ENROLLMENT, PROJECT);
    expect(view).toMatchObject({ supported: false, gh_command: null, secret: null });
  });

  it('reports unsupported when no repo is connected yet', async () => {
    mockConnectionFindOne.mockResolvedValue(null);
    expect((await getWebhookSetup(ENROLLMENT, PROJECT))!.supported).toBe(false);
  });
});

describe('proof the hook works', () => {
  it('reports the last delivery we actually received', async () => {
    mockQuery.mockResolvedValue([{ received_at: new Date('2026-08-15T12:00:00.000Z') }]);
    const view = await getWebhookSetup(ENROLLMENT, PROJECT);
    expect(view!.last_delivery_at).toBe('2026-08-15T12:00:00.000Z');
  });

  it('reports null — never a guess — when we have never heard from the repo', async () => {
    mockQuery.mockResolvedValue([]);
    expect((await getWebhookSetup(ENROLLMENT, PROJECT))!.last_delivery_at).toBeNull();
  });

  it('survives a missing delivery ledger', async () => {
    mockQuery.mockRejectedValue(new Error('relation does not exist'));
    const view = await getWebhookSetup(ENROLLMENT, PROJECT);
    expect(view!.last_delivery_at).toBeNull();
    expect(view!.gh_command).toBeTruthy();
  });
});
