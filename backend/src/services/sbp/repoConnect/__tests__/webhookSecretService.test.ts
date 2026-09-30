/**
 * Per-repo webhook secrets.
 *
 * The properties worth the most here:
 *   - A SECRET IS STABLE. Minting a new one on the second read would leave a
 *     correctly-registered hook signing with a secret we no longer accept, and
 *     the student's symptom would be "my pushes silently stopped".
 *   - TWO REPOS NEVER SHARE ONE. That is the entire reason this exists: the
 *     secret is shown to the student who registers it, and one shared secret
 *     shown to thirty students lets any of them forge pushes for all of them.
 *   - LEGACY HOOKS KEEP WORKING. Every hook the platform installed through the
 *     old OAuth flow signs with the shared env secret. Dropping that fallback
 *     looks clean in a diff and takes a cohort offline.
 */
const mockFindOne = jest.fn();
const mockFindByPk = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../../../models/GitHubConnection', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockFindOne(...a),
    findByPk: (...a: any[]) => mockFindByPk(...a),
    update: (...a: any[]) => mockUpdate(...a),
  },
}));

import {
  generateWebhookSecret,
  getOrCreateWebhookSecret,
  resolveWebhookSecret,
} from '../webhookSecretService';

const PROJECT = '40a5cea6-ace8-4734-8220-7e62df2111e5';
const OLD_ENV = process.env.GITHUB_WEBHOOK_SECRET;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GITHUB_WEBHOOK_SECRET = 'shared-legacy-secret';
  mockUpdate.mockResolvedValue([1]);
});
afterAll(() => { process.env.GITHUB_WEBHOOK_SECRET = OLD_ENV; });

describe('generateWebhookSecret', () => {
  it('is long, hex, and never repeats', () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe('getOrCreateWebhookSecret', () => {
  it('mints one on first request and persists it', async () => {
    mockFindOne.mockResolvedValue({ id: 'c1', webhook_secret: null });
    const secret = await getOrCreateWebhookSecret(PROJECT);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(mockUpdate).toHaveBeenCalledWith(
      { webhook_secret: secret },
      expect.objectContaining({ where: expect.objectContaining({ id: 'c1' }) }),
    );
  });

  it('IS STABLE: returns the existing secret and writes nothing', async () => {
    mockFindOne.mockResolvedValue({ id: 'c1', webhook_secret: 'already-minted' });
    expect(await getOrCreateWebhookSecret(PROJECT)).toBe('already-minted');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('loses the mint race gracefully rather than overwriting the winner', async () => {
    // Two tabs open the panel at once. The conditional UPDATE matches no row for
    // the loser, who must re-read and return what the winner wrote — the student
    // may already have registered a hook with it.
    mockFindOne.mockResolvedValue({ id: 'c1', webhook_secret: null });
    mockUpdate.mockResolvedValue([0]);
    mockFindByPk.mockResolvedValue({ webhook_secret: 'winner-secret' });

    expect(await getOrCreateWebhookSecret(PROJECT)).toBe('winner-secret');
  });

  it('refuses to mint a secret for a project with no connected repo', async () => {
    mockFindOne.mockResolvedValue(null);
    expect(await getOrCreateWebhookSecret(PROJECT)).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('treats a blank stored secret as absent', async () => {
    mockFindOne.mockResolvedValue({ id: 'c1', webhook_secret: '   ' });
    const secret = await getOrCreateWebhookSecret(PROJECT);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('resolveWebhookSecret', () => {
  it('prefers the per-repo secret', async () => {
    mockFindOne.mockResolvedValue({ id: 'c1', webhook_secret: 'per-repo' });
    expect(await resolveWebhookSecret('ColaberryIntern', 'AcceleratorTesting')).toBe('per-repo');
  });

  it('falls back to the shared secret for a legacy OAuth-registered hook', async () => {
    mockFindOne.mockResolvedValue({ id: 'c1', webhook_secret: null });
    expect(await resolveWebhookSecret('ColaberryIntern', 'Old')).toBe('shared-legacy-secret');
  });

  it('falls back to the shared secret for a repo we do not know at all', async () => {
    mockFindOne.mockResolvedValue(null);
    expect(await resolveWebhookSecret('someone', 'else')).toBe('shared-legacy-secret');
  });

  it('does not turn a database blip into "verify against nothing"', async () => {
    mockFindOne.mockRejectedValue(new Error('connection terminated'));
    expect(await resolveWebhookSecret('ColaberryIntern', 'AcceleratorTesting')).toBe('shared-legacy-secret');
  });

  it('returns null when neither secret exists, so the caller can reject', async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    mockFindOne.mockResolvedValue({ id: 'c1', webhook_secret: null });
    // Null must read as "reject", never as "skip the check" — that is the
    // caller's contract and it is asserted in the route test.
    expect(await resolveWebhookSecret('ColaberryIntern', 'AcceleratorTesting')).toBeNull();
  });

  it('two different repos never resolve to the same per-repo secret', async () => {
    mockFindOne.mockResolvedValueOnce({ id: 'c1', webhook_secret: 'secret-a' });
    const a = await resolveWebhookSecret('student', 'repo-a');
    mockFindOne.mockResolvedValueOnce({ id: 'c2', webhook_secret: 'secret-b' });
    const b = await resolveWebhookSecret('student', 'repo-b');
    expect(a).not.toBe(b);
  });
});
