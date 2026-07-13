/**
 * Public shareable portfolio service tests (BC #9985689951).
 * No DB I/O — Project and generatePortfolio are both mocked.
 */

const mockProjectFindOne = jest.fn();
const mockGeneratePortfolio = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { authenticate: jest.fn(), close: jest.fn(), query: jest.fn(), define: jest.fn() },
  connectDatabase: jest.fn(),
}));

jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: { findOne: mockProjectFindOne },
}));

jest.mock('../../services/portfolioGenerationService', () => ({
  generatePortfolio: mockGeneratePortfolio,
}));

import { getPortfolioSharing, setPortfolioSharing, getPortfolioByShareToken } from '../../services/portfolioShareService';

beforeEach(() => jest.clearAllMocks());

describe('getPortfolioSharing', () => {
  it('returns the current token + enabled state (happy path)', async () => {
    mockProjectFindOne.mockResolvedValue({ share_token: 'tok-1', share_enabled: true });

    const result = await getPortfolioSharing('enr-1');

    expect(result).toEqual({ share_token: 'tok-1', share_enabled: true });
  });

  it('throws NotFoundError for a missing project (failure path)', async () => {
    mockProjectFindOne.mockResolvedValue(null);

    await expect(getPortfolioSharing('bad-enrollment')).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });
});

describe('setPortfolioSharing', () => {
  it('mints a new token on first enable (happy path)', async () => {
    const update = jest.fn().mockImplementation(function (this: any, patch: any) {
      Object.assign(this, patch);
      return Promise.resolve();
    });
    const project: any = { share_token: null, share_enabled: false, update };
    mockProjectFindOne.mockResolvedValue(project);

    const result = await setPortfolioSharing('enr-1', true);

    expect(update).toHaveBeenCalledTimes(1);
    expect(result.share_enabled).toBe(true);
    expect(result.share_token).toEqual(expect.any(String));
  });

  it('is idempotent — re-enabling does not rotate an existing token', async () => {
    const update = jest.fn().mockImplementation(function (this: any, patch: any) {
      Object.assign(this, patch);
      return Promise.resolve();
    });
    const project: any = { share_token: 'existing-token', share_enabled: false, update };
    mockProjectFindOne.mockResolvedValue(project);

    const result = await setPortfolioSharing('enr-1', true);

    expect(update).toHaveBeenCalledWith({ share_enabled: true });
    expect(result.share_token).toBe('existing-token');
  });

  it('disabling keeps the token but flips share_enabled off (boundary)', async () => {
    const update = jest.fn().mockImplementation(function (this: any, patch: any) {
      Object.assign(this, patch);
      return Promise.resolve();
    });
    const project: any = { share_token: 'existing-token', share_enabled: true, update };
    mockProjectFindOne.mockResolvedValue(project);

    const result = await setPortfolioSharing('enr-1', false);

    expect(update).toHaveBeenCalledWith({ share_enabled: false });
    expect(result.share_token).toBe('existing-token');
    expect(result.share_enabled).toBe(false);
  });

  it('throws NotFoundError for a missing project (failure path)', async () => {
    mockProjectFindOne.mockResolvedValue(null);

    await expect(setPortfolioSharing('bad-enrollment', true)).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });
});

describe('getPortfolioByShareToken', () => {
  it('generates the portfolio for a valid, enabled token (happy path)', async () => {
    mockProjectFindOne.mockResolvedValue({ id: 'proj-1', enrollment_id: 'enr-1', share_token: 'tok-1', share_enabled: true });
    mockGeneratePortfolio.mockResolvedValue({ portfolio_structure: {} });

    const result = await getPortfolioByShareToken('tok-1');

    expect(mockGeneratePortfolio).toHaveBeenCalledWith('enr-1');
    expect(result).toEqual({ portfolio_structure: {} });
  });

  it('throws NotFoundError for an unknown token (failure path)', async () => {
    mockProjectFindOne.mockResolvedValue(null);

    await expect(getPortfolioByShareToken('bad-token')).rejects.toMatchObject({ error_class: 'NotFoundError' });
    expect(mockGeneratePortfolio).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for a disabled share (boundary — same as no token)', async () => {
    mockProjectFindOne.mockResolvedValue(null); // WHERE share_enabled:true excludes disabled rows at the query level

    await expect(getPortfolioByShareToken('disabled-token')).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });
});
